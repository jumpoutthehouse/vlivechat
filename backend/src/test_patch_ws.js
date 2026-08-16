const { pool } = require('./db');

async function testWorkspacePatch() {
  // Fetch current workspace
  const { rows } = await pool.query("SELECT * FROM workspaces LIMIT 1");
  const ws = rows[0];
  console.log("Current WS ID:", ws.id);

  // Attempt the exact loop in workspaces.js
  const allowed = [
    "name", "brand_name", "brand_color", "brand_secondary", "brand_logo_url",
    "welcome_title", "welcome_subtitle", "offline_message", "agent_display_name",
    "widget_position", "widget_theme", "auto_open", "auto_open_delay",
    "prechat_enabled", "prechat_fields", "postchat_enabled",
    "sla_first_response", "sla_resolution", "flow_config", "chatbot_enabled",
    "announcement_config", "auto_greeting_enabled", "auto_greeting_text",
    "offline_reply_enabled", "offline_reply_text", "vps_expires_at", "domain_expires_at",
  ];

  const sets = [];
  const vals = [];
  let i = 1;

  for (const key of allowed) {
    if (ws[key] !== undefined && ws[key] !== null) {
      // simulate payload from frontend
      const val = typeof ws[key] === "object" ? JSON.stringify(ws[key]) : ws[key];
      sets.push(`${key}=$${i++}`);
      vals.push(val);
    }
  }

  try {
    vals.push(ws.id);
    const { rows: updated } = await pool.query(
      `UPDATE workspaces SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${i} RETURNING *`,
      vals
    );
    console.log("UPDATE SUCCESS:", updated[0].id);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
  }
  process.exit(0);
}

testWorkspacePatch();
