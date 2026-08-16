const express = require("express");
const bcrypt  = require("bcryptjs");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { pool } = require("../db");
const { auth, adminOnly, superadminOnly } = require("../middleware/auth");

const { recordAuditLog } = require("../utils/auditLogger");

const router = express.Router();

// ── Avatar upload config ─────────────────────────────────────────
const avatarDir = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, "avatars")
  : path.join(__dirname, "../../uploads/avatars");
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (req, _file, cb) => {
    const ext = ".jpg";
    cb(null, `agent_${req.params.id || req.agentId}_${Date.now()}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Hanya file gambar yang diizinkan"));
  },
});

// ── GET /api/v1/agents — list agents in workspace ──────────────
router.get("/", auth, async (req, res) => {
  try {
    const wsId = req.query.workspace_id || req.workspaceId;
    
    let query = `SELECT id, workspace_id, name, email, role, avatar_url, avatar_bg, display_name, title,
                        status, is_online, last_seen_at, notification_sound, max_conversations,
                        permissions, is_active, created_at
                 FROM agents`;
    let params = [];

    if (wsId) {
      query += ` WHERE workspace_id = $1`;
      params.push(wsId);
    } else if (req.agentRole !== "superadmin") {
      return res.status(400).json({ error: "workspace_id required" });
    }

    query += ` ORDER BY role DESC, name ASC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/agents/:id ─────────────────────────────────────
router.get("/:id", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, avatar_url, avatar_bg, display_name, title,
              status, is_online, last_seen_at, notification_sound, max_conversations,
              permissions, is_active, created_at
       FROM agents WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Agent tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/agents — create agent ────────────────────────
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, display_name, title, max_conversations, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, dan password wajib diisi" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter" });
    }

    let wsId = req.body.workspace_id || req.workspaceId;
    // Superadmin has no workspace_id in token — they MUST explicitly provide one
    if (!wsId && req.agentRole === "superadmin") {
      return res.status(400).json({ error: "workspace_id wajib diisi saat membuat agent sebagai superadmin" });
    }
    const allowedRoles = req.agentRole === "superadmin"
      ? ["superadmin", "admin", "supervisor", "agent"]
      : ["supervisor", "agent"];

    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ error: "Role tidak diizinkan" });
    }

    const agentPerms = Array.isArray(permissions) && permissions.length > 0 ? permissions : ["livechat", "archives"];

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO agents (workspace_id, email, password_hash, name, role, display_name, title, max_conversations, permissions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, email, role, display_name, title, permissions, is_active, created_at`,
      [wsId, email.trim().toLowerCase(), hash, name.trim(), role || "agent", display_name || name, title || null, max_conversations || 5, agentPerms]
    );

    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "admin",
      action: "create_agent",
      workspaceId: wsId,
      targetTable: "agents",
      note: `Ditambahkan Agent "${rows[0].display_name || rows[0].name}" (${rows[0].email}) role=${rows[0].role}`,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email sudah terdaftar" });
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/v1/agents/:id — update agent info ──────────────
router.patch("/:id", auth, async (req, res) => {
  try {
    // Only self-edit OR admin/superadmin can edit others
    const isSelf = req.params.id === req.agentId;
    const isAdmin = ["admin", "superadmin"].includes(req.agentRole);
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "Tidak boleh mengedit agent lain" });
    }

    const { name, display_name, title, notification_sound, max_conversations, status, role, permissions, is_active, password } = req.body;
    const sets = [];
    const vals = [];
    let i = 1;

    if (password && password.trim().length > 0) {
      if (password.trim().length < 8) {
        return res.status(400).json({ error: "Password minimal 8 karakter" });
      }
      const hash = await bcrypt.hash(password.trim(), 12);
      sets.push(`password_hash=$${i++}`);
      vals.push(hash);
    }

    if (name          !== undefined) { sets.push(`name=$${i++}`);                vals.push(name); }
    if (display_name  !== undefined) { sets.push(`display_name=$${i++}`);        vals.push(display_name); }
    if (title         !== undefined) { sets.push(`title=$${i++}`);               vals.push(title); }
    if (notification_sound !== undefined) { sets.push(`notification_sound=$${i++}`); vals.push(notification_sound); }
    if (status        !== undefined) { sets.push(`status=$${i++}`);              vals.push(status); }

    // Admin only
    if (isAdmin) {
      if (max_conversations !== undefined) { sets.push(`max_conversations=$${i++}`); vals.push(max_conversations); }
      if (role !== undefined && req.agentRole === "superadmin") { sets.push(`role=$${i++}`); vals.push(role); }
      if (permissions !== undefined && Array.isArray(permissions)) { sets.push(`permissions=$${i++}`); vals.push(permissions); }
      if (is_active !== undefined) { sets.push(`is_active=$${i++}`); vals.push(is_active); }
    }

    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada data yang diupdate" });

    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE agents SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${i}
       RETURNING id, name, email, role, avatar_url, display_name, title, status, notification_sound, max_conversations, permissions, is_active`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: "Agent tidak ditemukan" });

    // Emit socket event to notify the updated agent in real-time
    try {
      const io = req.app.get("io");
      if (io && rows[0].permissions !== undefined) {
        // Emit to the specific agent's socket rooms
        io.of("/dashboard").emit("agent:permissions_updated", {
          agentId: rows[0].id,
          permissions: rows[0].permissions,
          role: rows[0].role,
          is_active: rows[0].is_active,
        });
      }
    } catch (socketErr) {
      // Non-blocking: socket emit failure doesn't break the response
      console.error("Socket emit error:", socketErr.message);
    }

    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "user",
      action: "update_agent",
      workspaceId: rows[0].workspace_id || null,
      targetTable: "agents",
      note: `Diubah data Agent "${rows[0].display_name || rows[0].name}" (${rows[0].email})`,
    });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/agents/:id/avatar — upload avatar ────────────
router.post(
  "/:id/avatar",
  auth,
  avatarUpload.single("avatar"),
  async (req, res) => {
    try {
      const isSelf = req.params.id === req.agentId;
      const isAdmin = ["admin", "superadmin"].includes(req.agentRole);
      if (!isSelf && !isAdmin) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: "Tidak diizinkan" });
      }

      if (!req.file) return res.status(400).json({ error: "File avatar tidak ditemukan" });

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      // Delete old avatar
      const { rows: old } = await pool.query("SELECT avatar_url FROM agents WHERE id=$1", [req.params.id]);
      if (old[0]?.avatar_url) {
        const oldPath = path.join(process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads"), old[0].avatar_url.replace("/uploads/", ""));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const { rows } = await pool.query(
        "UPDATE agents SET avatar_url=$1, updated_at=NOW() WHERE id=$2 RETURNING id, avatar_url",
        [avatarUrl, req.params.id]
      );

      // Notify dashboard via socket
      const io = req.app.get("io");
      io.of("/dashboard").emit("agent:avatar_updated", {
        agentId: req.params.id,
        avatarUrl,
      });

      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ── DELETE /api/v1/agents/:id/avatar — remove avatar ──────────
router.delete("/:id/avatar", auth, async (req, res) => {
  try {
    const isSelf = req.params.id === req.agentId;
    const isAdmin = ["admin", "superadmin"].includes(req.agentRole);
    if (!isSelf && !isAdmin) return res.status(403).json({ error: "Tidak diizinkan" });

    const { rows } = await pool.query("SELECT avatar_url FROM agents WHERE id=$1", [req.params.id]);
    if (rows[0]?.avatar_url) {
      const filePath = path.join(process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads"), rows[0].avatar_url.replace("/uploads/", ""));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query("UPDATE agents SET avatar_url=NULL, updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.json({ message: "Avatar dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/v1/agents/:id — deactivate (soft) agent ───────
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.agentId) {
      return res.status(400).json({ error: "Tidak bisa menonaktifkan diri sendiri" });
    }
    await pool.query(
      "UPDATE agents SET is_active=FALSE, is_online=FALSE, updated_at=NOW() WHERE id=$1",
      [req.params.id]
    );

    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "admin",
      action: "deactivate_agent",
      targetTable: "agents",
      note: `Dinonaktifkan Agent ID "${req.params.id}"`,
    });

    res.json({ message: "Agent dinonaktifkan" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/v1/agents/:id/permanent — permanently delete agent ──
router.delete("/:id/permanent", auth, adminOnly, async (req, res) => {
  try {
    const targetId = req.params.id;

    // Cannot delete yourself
    if (targetId === req.agentId) {
      return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri" });
    }

    // Fetch the target agent
    const { rows: target } = await pool.query(
      "SELECT id, role, workspace_id FROM agents WHERE id=$1",
      [targetId]
    );
    if (!target[0]) return res.status(404).json({ error: "Agent tidak ditemukan" });

    // Non-superadmin can only delete agents in their own workspace
    const isSuperadmin = req.agentRole === "superadmin";
    if (!isSuperadmin && target[0].workspace_id !== req.workspaceId) {
      return res.status(403).json({ error: "Tidak bisa menghapus agent dari workspace lain" });
    }

    // Prevent deleting a superadmin unless you are superadmin
    if (target[0].role === "superadmin" && !isSuperadmin) {
      return res.status(403).json({ error: "Hanya superadmin yang bisa menghapus akun superadmin" });
    }

    // Guard: ensure there remains at least one active admin in the workspace
    if (["admin", "superadmin"].includes(target[0].role) && target[0].workspace_id) {
      const { rows: adminCheck } = await pool.query(
        `SELECT COUNT(*) FROM agents
         WHERE workspace_id=$1 AND role IN ('admin','superadmin') AND is_active=TRUE AND id!=$2`,
        [target[0].workspace_id, targetId]
      );
      if (parseInt(adminCheck[0].count) === 0) {
        return res.status(400).json({
          error: "Tidak bisa menghapus admin terakhir yang aktif di workspace ini. Buat admin lain dulu.",
        });
      }
    }

    // Nullify assigned conversations before delete (unassign, set back to open)
    await pool.query(
      `UPDATE conversations
       SET assigned_agent_id=NULL, status='open', updated_at=NOW()
       WHERE assigned_agent_id=$1 AND status NOT IN ('resolved','missed')`,
      [targetId]
    );

    // Delete the agent (CASCADE will remove related cursors via FK if configured, else manual clean)
    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "admin",
      action: "delete_agent",
      workspaceId: target[0].workspace_id || null,
      targetTable: "agents",
      note: `Dihapus permanen Agent ID "${targetId}" role=${target[0].role}`,
    });

    await pool.query("DELETE FROM agent_read_cursors WHERE agent_id=$1", [targetId]);
    await pool.query("DELETE FROM agents WHERE id=$1", [targetId]);

    res.json({ message: "Agent berhasil dihapus permanen" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/agents/:id/reset-password — Superadmin/Admin password reset ──
router.post("/:id/reset-password", auth, adminOnly, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.trim().length < 8) {
      return res.status(400).json({ error: "Password baru minimal 8 karakter" });
    }

    const targetId = req.params.id;
    const isSuperadmin = req.agentRole === "superadmin";

    // Fetch target agent
    const { rows: target } = await pool.query("SELECT id, role, workspace_id, name, email FROM agents WHERE id=$1", [targetId]);
    if (!target[0]) return res.status(404).json({ error: "Agent tidak ditemukan" });

    // Non-superadmin can only reset agents in their own workspace
    if (!isSuperadmin && target[0].workspace_id !== req.workspaceId) {
      return res.status(403).json({ error: "Tidak memiliki hak akses ke workspace ini" });
    }

    // Only superadmin can reset another superadmin's password
    if (target[0].role === "superadmin" && !isSuperadmin) {
      return res.status(403).json({ error: "Hanya superadmin yang bisa mereset password superadmin lain" });
    }

    const hash = await bcrypt.hash(new_password.trim(), 12);
    await pool.query("UPDATE agents SET password_hash=$1, updated_at=NOW() WHERE id=$2", [hash, targetId]);

    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "admin",
      action: "reset_agent_password",
      workspaceId: target[0].workspace_id || null,
      targetTable: "agents",
      note: `Diganti password Agent "${target[0].name}" (${target[0].email})`,
    });

    res.json({ message: `Password ${target[0].name} berhasil diperbarui!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

