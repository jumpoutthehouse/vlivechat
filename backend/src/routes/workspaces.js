const express = require("express");
const { pool } = require("../db");
const { auth, adminOnly, superadminOnly } = require("../middleware/auth");
const defaultFlowConfig = require("../config/defaultFlowConfig");

const { recordAuditLog } = require("../utils/auditLogger");

const router = express.Router();

// ── GET /api/v1/workspaces — list (superadmin only) ────────────
router.get("/", auth, superadminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let where = [];
    const params = [];
    let pi = 1;

    if (search) {
      where.push(`(name ILIKE $${pi} OR code ILIKE $${pi} OR owner_email ILIKE $${pi})`);
      params.push(`%${search}%`);
      pi++;
    }

    const whereStr = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT w.*,
         (SELECT COUNT(*) FROM agents WHERE workspace_id=w.id AND is_active=TRUE) AS agent_count,
         (SELECT COUNT(*) FROM conversations WHERE workspace_id=w.id) AS total_conversations,
         (SELECT COUNT(*) FROM conversations WHERE workspace_id=w.id AND status='open') AS open_conversations
       FROM workspaces w
       ${whereStr}
       ORDER BY w.created_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM workspaces ${whereStr}`,
      params
    );

    res.json({
      workspaces: rows,
      total: parseInt(countRows[0].count),
      page: parseInt(page),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/workspaces/mine — current workspace ───────────
router.get("/mine", auth, async (req, res) => {
  try {
    if (!req.workspaceId) return res.status(404).json({ error: "No workspace" });
    const { rows } = await pool.query(
      "SELECT * FROM workspaces WHERE id=$1",
      [req.workspaceId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Workspace tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/workspaces/:id ─────────────────────────────────
router.get("/:id", auth, async (req, res) => {
  try {
    const isSuperadmin = req.agentRole === "superadmin";
    const isOwnWorkspace = req.workspaceId === req.params.id;
    if (!isSuperadmin && !isOwnWorkspace) {
      return res.status(403).json({ error: "Akses ditolak" });
    }

    const { rows } = await pool.query(
      "SELECT * FROM workspaces WHERE id=$1",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Workspace tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/workspaces — create workspace ─────────────────
router.post("/", auth, superadminOnly, async (req, res) => {
  try {
    const {
      name, code, owner_email, brand_name, brand_color, brand_secondary,
      welcome_title, welcome_subtitle, offline_message,
      sla_first_response, sla_resolution,
      prechat_enabled, prechat_fields, postchat_enabled,
      widget_position, widget_theme, auto_open, auto_open_delay,
      use_template,
    } = req.body;

    if (!name || !code) return res.status(400).json({ error: "name dan code wajib diisi" });

    const { rows } = await pool.query(
      `INSERT INTO workspaces (
         name, code, owner_email, brand_name, brand_color, brand_secondary,
         welcome_title, welcome_subtitle, offline_message,
         sla_first_response, sla_resolution,
         prechat_enabled, prechat_fields, postchat_enabled,
         widget_position, widget_theme, auto_open, auto_open_delay,
         flow_config
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        name, code.toLowerCase().replace(/\s+/g, "_"), owner_email || null,
        brand_name || name, brand_color || "#1e3a5f", brand_secondary || "#e53e3e",
        welcome_title || "Halo! Ada yang bisa kami bantu?",
        welcome_subtitle || "Tim kami siap membantu Anda 24/7.",
        offline_message || "Saat ini kami sedang offline.",
        sla_first_response || 5, sla_resolution || 60,
        prechat_enabled !== false, JSON.stringify(prechat_fields || [{ key: "username", label: "Username / ID", required: true }]),
        postchat_enabled !== false,
        widget_position || "right", widget_theme || "dark",
        auto_open || false, auto_open_delay || 3000,
        // chatbot_enabled defaults to FALSE — brand owners prepare settings first, then activate
        use_template ? JSON.stringify(defaultFlowConfig()) : JSON.stringify({ nodes: [] }),
      ]
    );
    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "superadmin",
      action: "create_workspace",
      workspaceId: rows[0].id,
      targetTable: "workspaces",
      note: `Dibuat Brand "${rows[0].brand_name || rows[0].name}" (${rows[0].code})`,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Code workspace sudah digunakan" });
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/v1/workspaces/:id — update workspace ───────────
router.patch("/:id", auth, adminOnly, async (req, res) => {
  try {
    const isSuperadmin = req.agentRole === "superadmin";
    const isOwnWorkspace = req.workspaceId === req.params.id;
    if (!isSuperadmin && !isOwnWorkspace) {
      return res.status(403).json({ error: "Akses ditolak" });
    }

    const allowed = [
      "name", "brand_name", "brand_color", "brand_secondary", "brand_logo_url",
      "welcome_title", "welcome_subtitle", "offline_message", "agent_display_name",
      "widget_position", "widget_theme", "auto_open", "auto_open_delay",
      "prechat_enabled", "prechat_fields", "postchat_enabled",
      "sla_first_response", "sla_resolution", "sla_resolution_enabled", "flow_config", "chatbot_enabled",
      "announcement_config", "auto_greeting_enabled", "auto_greeting_text",
      "offline_reply_enabled", "offline_reply_text", "vps_expires_at", "domain_expires_at",
    ];
    if (isSuperadmin) allowed.push("is_active", "owner_email", "code");

    const sets = [];
    const vals = [];
    let i = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "vps_expires_at" || key === "domain_expires_at") {
          if (!val || val === "" || val === "null") val = null;
        }
        if (typeof val === "object" && val !== null) {
          val = JSON.stringify(val);
        }
        sets.push(`${key}=$${i++}`);
        vals.push(val);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada data yang diupdate" });

    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE workspaces SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${i} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: "Workspace tidak ditemukan" });
    // Notify dashboard & visitors of branding update
    const io = req.app.get("io");
    if (io) {
      io.of("/dashboard").to(`workspace:${req.params.id}`).emit("workspace:updated", rows[0]);

      // Fetch agents to include in realtime branding update (so avatar bar stays correct)
      const { rows: agentRows } = await pool.query(
        `SELECT id, display_name, name, avatar_url, avatar_bg, is_online
         FROM agents WHERE workspace_id=$1 AND role != 'superadmin'
         ORDER BY is_online DESC, created_at ASC`,
        [rows[0].id]
      );

      // If chatbot is turned OFF, migrate all ongoing flow conversations to human agent mode
      if (rows[0].chatbot_enabled === false) {
        const { rows: updatedConvs } = await pool.query(
          `UPDATE conversations 
           SET flow_mode = 'agent', 
               cs_handoff_at = COALESCE(cs_handoff_at, NOW()),
               status = CASE WHEN assigned_agent_id IS NOT NULL THEN 'active' ELSE 'queued' END, 
               updated_at = NOW()
           WHERE workspace_id = $1 AND status != 'resolved' AND flow_mode = 'flow'
           RETURNING *`,
          [rows[0].id]
        );

        for (const c of updatedConvs) {
          // Real-time update to admin dashboards so list & active chat panel immediately switch to agent mode
          io.of("/dashboard").to(`workspace:${req.params.id}`).emit("conversation:update", c);
          io.of("/dashboard").to(`workspace:${req.params.id}`).emit("conversation:flow_update", {
            conversationId: c.id,
            visitor_id: c.visitor_id,
            mode: "agent",
            flow_mode: "agent",
            status: c.status
          });
          // Real-time update to visitor widget
          io.of("/livechat").to(`visitor:${c.visitor_id}`).emit("conversation:flow_update", { mode: "agent", flow_mode: "agent" });
        }
      }

      // Notify all visitors on this workspace in real-time
      io.of("/livechat").to(`ws:${req.params.id}`).emit("flow:config_updated", {
        chatbotEnabled: rows[0].chatbot_enabled !== false,
        flow_config: rows[0].flow_config,
        branding: {
          brandName: rows[0].brand_name,
          brandColor: rows[0].brand_color,
          brandSecondary: rows[0].brand_secondary,
          brandLogoUrl: rows[0].brand_logo_url,
          welcomeTitle: rows[0].welcome_title,
          welcomeSubtitle: rows[0].welcome_subtitle,
          prechatEnabled: rows[0].prechat_enabled,
          prechatFields: rows[0].prechat_fields,
          chatbotEnabled: rows[0].chatbot_enabled !== false,
          announcementConfig: rows[0].announcement_config,
          autoGreetingEnabled: rows[0].auto_greeting_enabled === true,
          autoGreetingText: rows[0].auto_greeting_text,
          offlineReplyEnabled: rows[0].offline_reply_enabled === true,
          offlineReplyText: rows[0].offline_reply_text,
          agents: agentRows,
        }
      });
    }

    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "admin",
      action: "update_workspace",
      workspaceId: rows[0].id,
      targetTable: "workspaces",
      note: `Diubah konfigurasi Brand "${rows[0].brand_name || rows[0].name}"`,
    });

    res.json(rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── DELETE /api/v1/workspaces/:id/deactivate — soft disable ────
router.patch("/:id/deactivate", auth, superadminOnly, async (req, res) => {
  try {
    await pool.query(
      "UPDATE workspaces SET is_active=FALSE, updated_at=NOW() WHERE id=$1",
      [req.params.id]
    );
    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "superadmin",
      action: "deactivate_workspace",
      workspaceId: req.params.id,
      targetTable: "workspaces",
      note: `Dinonaktifkan Brand ID "${req.params.id}"`,
    });
    res.json({ message: "Workspace dinonaktifkan" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/v1/workspaces/:id — permanent hard delete ───────
router.delete("/:id", auth, superadminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query; // ?force=true to skip active check

    // Safety: check if workspace exists
    const wsCheck = await pool.query("SELECT id, name, code FROM workspaces WHERE id=$1", [id]);
    if (wsCheck.rows.length === 0) {
      return res.status(404).json({ error: "Workspace tidak ditemukan" });
    }

    // Safety: block if there are active (open/assigned) conversations, unless force=true
    if (force !== "true") {
      const activeCheck = await pool.query(
        "SELECT COUNT(*) FROM conversations WHERE workspace_id=$1 AND status IN ('open','assigned')",
        [id]
      );
      const activeCount = parseInt(activeCheck.rows[0].count, 10);
      if (activeCount > 0) {
        return res.status(409).json({
          error: `Tidak bisa menghapus — ada ${activeCount} percakapan aktif. Selesaikan dulu atau gunakan force=true.`,
          active_count: activeCount,
        });
      }
    }

    // Hard delete — CASCADE will handle agents, conversations, messages, canned_responses, etc.
    recordAuditLog({
      actorId: req.agentId,
      actorEmail: req.agentName || "superadmin",
      action: "delete_workspace",
      workspaceId: id,
      targetTable: "workspaces",
      note: `Dihapus permanen Brand "${wsCheck.rows[0].name}" (${wsCheck.rows[0].code})`,
    });

    await pool.query("DELETE FROM workspaces WHERE id=$1", [id]);
    res.json({ message: `Brand "${wsCheck.rows[0].name}" (${wsCheck.rows[0].code}) berhasil dihapus permanen.` });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
