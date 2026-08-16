require("dotenv").config();
const { pool } = require("../db");

async function main() {
  // Check conversations table columns
  const convCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'conversations' ORDER BY ordinal_position"
  );
  console.log("CONVERSATIONS COLS:", convCols.rows.map(r => r.column_name).join(", "));
  
  // Check workspaces table columns  
  const wsCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'workspaces' ORDER BY ordinal_position"
  );
  console.log("WORKSPACES COLS:", wsCols.rows.map(r => r.column_name).join(", "));

  // Check agents table columns
  const agentCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'agents' ORDER BY ordinal_position"
  );
  console.log("AGENTS COLS:", agentCols.rows.map(r => r.column_name).join(", "));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
