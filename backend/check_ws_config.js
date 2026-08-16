const { pool } = require('./src/db');
(async () => {
  try {
    const ws = await pool.query("SELECT code, chatbot_enabled, auto_greeting_enabled, auto_greeting_text, offline_reply_enabled, offline_reply_text, flow_config FROM workspaces WHERE code='lawu88slot'");
    console.log("WORKSPACE CONFIG:", JSON.stringify(ws.rows[0], null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
