const { pool } = require('./db');

async function inspectWorkspacesTable() {
  const { rows } = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'workspaces'
  `);
  console.log("Workspaces columns:", rows);
  process.exit(0);
}

inspectWorkspacesTable().catch(err => {
  console.error(err);
  process.exit(1);
});
