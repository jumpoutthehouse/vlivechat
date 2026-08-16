const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { pool } = require("../db");

const router = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET || "change_this_secret";
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "7d";

// POST /api/v1/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email dan password wajib diisi" });
    }

    const { rows } = await pool.query(
      `SELECT a.*, w.name AS workspace_name, w.brand_name, w.brand_color, w.brand_logo_url
       FROM agents a
       LEFT JOIN workspaces w ON a.workspace_id = w.id
       WHERE a.email = $1 AND a.is_active = TRUE`,
      [email.trim().toLowerCase()]
    );

    const agent = rows[0];
    if (!agent) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    const valid = await bcrypt.compare(password, agent.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    const payload = {
      agentId:     agent.id,
      workspaceId: agent.workspace_id,
      role:        agent.role,
      name:        agent.name,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    // Update last_seen_at (is_online will be managed by active WebSocket connection)
    await pool.query(
      "UPDATE agents SET last_seen_at=NOW() WHERE id=$1",
      [agent.id]
    );

    // Remove sensitive data
    const { password_hash, ...safeAgent } = agent;

    res.json({
      token,
      agent: safeAgent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/auth/logout
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.slice(7);
      const decoded = jwt.decode(token);
      if (decoded?.agentId) {
        await pool.query(
          "UPDATE agents SET is_online=FALSE, last_seen_at=NOW() WHERE id=$1",
          [decoded.agentId]
        );
      }
    }
    res.json({ message: "Logged out" });
  } catch {
    res.json({ message: "Logged out" });
  }
});

// GET /api/v1/auth/me
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const { rows } = await pool.query(
      `SELECT a.*, w.name AS workspace_name, w.brand_name, w.brand_color, w.brand_logo_url,
              w.flow_config, w.sla_first_response, w.sla_resolution, w.widget_position, w.widget_theme
       FROM agents a
       LEFT JOIN workspaces w ON a.workspace_id = w.id
       WHERE a.id = $1 AND a.is_active = TRUE`,
      [decoded.agentId]
    );

    if (!rows[0]) return res.status(404).json({ error: "Agent not found" });
    const { password_hash, ...safeAgent } = rows[0];
    res.json(safeAgent);
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// POST /api/v1/auth/change-password
router.post("/change-password", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Semua field wajib diisi" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter" });
    }

    const { rows } = await pool.query("SELECT password_hash FROM agents WHERE id=$1", [decoded.agentId]);
    if (!rows[0]) return res.status(404).json({ error: "Agent not found" });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: "Password lama salah" });

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE agents SET password_hash=$1, updated_at=NOW() WHERE id=$2", [newHash, decoded.agentId]);

    res.json({ message: "Password berhasil diubah" });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// POST /api/v1/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email wajib diisi" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const { rows } = await pool.query("SELECT id, name, email FROM agents WHERE email=$1 AND is_active=TRUE", [cleanEmail]);
    
    // Always respond with success to prevent user enumeration
    if (!rows[0]) {
      return res.json({ message: "Jika email terdaftar, instruksi reset password telah dikirim." });
    }

    const agent = rows[0];
    const crypto = require("crypto");
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await pool.query(
      "UPDATE agents SET reset_token=$1, reset_token_expires=$2 WHERE id=$3",
      [resetToken, expiresAt, agent.id]
    );

    const resetLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${resetToken}`;
    console.log(`[vlc-auth] Password Reset Link for ${agent.email}: ${resetLink}`);

    res.json({
      message: "Instruksi reset password telah dikirim ke email Anda.",
      resetLink: process.env.NODE_ENV === "production" ? undefined : resetLink
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token dan password baru wajib diisi" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter" });
    }

    const { rows } = await pool.query(
      "SELECT id FROM agents WHERE reset_token=$1 AND reset_token_expires > NOW()",
      [token]
    );

    if (!rows[0]) {
      return res.status(400).json({ error: "Token reset password tidak valid atau telah kadaluarsa" });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      "UPDATE agents SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL, updated_at=NOW() WHERE id=$2",
      [newHash, rows[0].id]
    );

    res.json({ message: "Password berhasil diperbarui! Silakan login dengan password baru Anda." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
