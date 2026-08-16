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

    // Check if any agent is online and list CS agents with live socket & 5m window cross-check
    const { getOnlineAgents } = require("../redis");
    const onlineIds = await getOnlineAgents(rows[0].id);
    const activeDashboardAgents = new Set(onlineIds);

    try {
      const io = req.app.get("io");
      const dashboardNsp = io ? io.of("/dashboard") : null;
      if (dashboardNsp && dashboardNsp.sockets) {
        for (const [_, s] of dashboardNsp.sockets) {
          if (s.agentId && s.workspaceId === rows[0].id) {
            activeDashboardAgents.add(s.agentId);
          }
        }
      }
    } catch (e) {}

    const { rows: agentRows } = await pool.query(
      `SELECT id, display_name, name, avatar_url, avatar_bg, is_online, last_seen_at FROM agents WHERE workspace_id=$1 AND role != 'superadmin' ORDER BY created_at ASC`,
      [rows[0].id]
    );

    const formattedAgents = agentRows.map(a => {
      const isRecentlyActive = a.last_seen_at && (Date.now() - new Date(a.last_seen_at).getTime() < 5 * 60 * 1000);
      const isOnline = a.is_online || activeDashboardAgents.has(a.id) || isRecentlyActive;
      return { ...a, is_online: !!isOnline };
    });

    const onlineCount = formattedAgents.filter(a => a.is_online).length;

    res.json({
      ...rows[0],
      agents: formattedAgents,
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

    const { getOnlineAgents } = require("../redis");
    const onlineIds = await getOnlineAgents(ws[0].id);
    const activeDashboardAgents = new Set(onlineIds);

    try {
      const io = req.app.get("io");
      const dashboardNsp = io ? io.of("/dashboard") : null;
      if (dashboardNsp && dashboardNsp.sockets) {
        for (const [_, s] of dashboardNsp.sockets) {
          if (s.agentId && s.workspaceId === ws[0].id) {
            activeDashboardAgents.add(s.agentId);
          }
        }
      }
    } catch (e) {}

    const { rows } = await pool.query(
      "SELECT id, is_online, last_seen_at FROM agents WHERE workspace_id=$1 AND is_active=TRUE",
      [ws[0].id]
    );

    const isOnline = rows.some(a => a.is_online || activeDashboardAgents.has(a.id) || (a.last_seen_at && Date.now() - new Date(a.last_seen_at).getTime() < 5 * 60 * 1000));
    res.json({ is_online: isOnline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
