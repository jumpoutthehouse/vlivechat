const { pool } = require('./db');

async function checkAgentsStatus() {
  const { rows } = await pool.query("SELECT id, name, display_name, role, workspace_id, is_online, status, last_seen_at FROM agents");
  console.log(rows);
  process.exit(0);
}

checkAgentsStatus().catch(err => {
  console.error(err);
  process.exit(1);
});
