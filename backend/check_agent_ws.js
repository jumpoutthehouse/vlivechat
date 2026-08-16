const { pool } = require('./src/db');
(async () => {
  try {
    const agents = await pool.query(
      `SELECT a.id, a.name, a.display_name, a.email, a.role, a.workspace_id, a.is_online, a.status, w.code AS ws_code, w.name AS ws_name
       FROM agents a
       LEFT JOIN workspaces w ON a.workspace_id = w.id`
    );
    console.log("AGENTS IN DB:", JSON.stringify(agents.rows, null, 2));

    const ws = await pool.query("SELECT id, code, name FROM workspaces");
    console.log("WORKSPACES IN DB:", JSON.stringify(ws.rows, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
