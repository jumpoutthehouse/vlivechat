const { pool } = require('./db');

async function inspectAllConversations() {
  const { rows } = await pool.query(
    "SELECT c.id, c.workspace_id, w.name AS ws_name, c.visitor_id, c.visitor_name, c.status, c.created_at, c.updated_at FROM conversations c LEFT JOIN workspaces w ON c.workspace_id=w.id ORDER BY c.updated_at DESC"
  );
  console.log("Total conversations in entire database:", rows.length);
  console.log(rows);
  process.exit(0);
}

inspectAllConversations().catch(err => {
  console.error(err);
  process.exit(1);
});
