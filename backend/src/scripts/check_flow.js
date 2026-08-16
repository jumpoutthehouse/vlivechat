require("dotenv").config();
const { pool } = require("../db");

async function main() {
  const ws = await pool.query("SELECT flow_config FROM workspaces WHERE code = 'sewu88slot_workspace'");
  const flowConfig = ws.rows[0]?.flow_config;
  
  console.log("=== FULL FLOW CONFIG ===");
  console.log(JSON.stringify(flowConfig, null, 2));
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
