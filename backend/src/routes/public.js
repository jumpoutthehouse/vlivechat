const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /public/settings/:code — widget settings (no auth, for widget embed)
router.get("/settings/:code", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id, code, brand_name, brand_logo_url, brand_color, brand_secondary,
         welcome_title, welcome_subtitle, offline_message, agent_display_name,
         widget_position, widget_theme, auto_open, auto_open_delay,
         prechat_enabled, prechat_fields, postchat_enabled,
         flow_config, announcement_config, auto_greeting_enabled, auto_greeting_text,
         offline_reply_enabled, offline_reply_text
       FROM workspaces
       WHERE code=$1 AND is_active=TRUE`,
      [req.params.code]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Workspace tidak ditemukan" });
    }

    // Check if any agent is online and list CS agents
    const { rows: agentRows } = await pool.query(
      `SELECT id, display_name, name, avatar_url, avatar_bg, is_online FROM agents WHERE workspace_id=$1 AND role != 'superadmin' ORDER BY is_online DESC, created_at ASC`,
      [rows[0].id]
    );

    const onlineCount = agentRows.filter(a => a.is_online).length;

    res.json({
      ...rows[0],
      agents: agentRows,
      is_online: onlineCount > 0,
      server_time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /public/status/:code — quick online status check
router.get("/status/:code", async (req, res) => {
  try {
    const { rows: ws } = await pool.query(
      "SELECT id FROM workspaces WHERE code=$1 AND is_active=TRUE",
      [req.params.code]
    );
    if (!ws[0]) return res.json({ is_online: false });

    const { rows } = await pool.query(
      "SELECT COUNT(*) AS count FROM agents WHERE workspace_id=$1 AND is_online=TRUE",
      [ws[0].id]
    );
    res.json({ is_online: parseInt(rows[0].count) > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
