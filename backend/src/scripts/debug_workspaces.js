require("dotenv").config();
const { pool } = require("../db");

async function main() {
  // Cek workspace sewu88slot detail + agents
  const ws = await pool.query("SELECT id, code, brand_name, flow_config FROM workspaces WHERE code = 'sewu88slot_workspace'");
  const w = ws.rows[0];
  console.log("SEWU88SLOT WS ID:", w?.id);
  console.log("SEWU88SLOT flow_config snippet:", JSON.stringify(w?.flow_config)?.substring(0, 500));

  // Cek agents di sewu88slot_workspace
  const agents = await pool.query("SELECT id, email, name, role, is_active FROM agents WHERE workspace_id = $1", [w?.id]);
  console.log("\nAGENTS in sewu88slot_workspace:", agents.rows.length);
  agents.rows.forEach(r => console.log(JSON.stringify(r)));

  // Cek agents di demo_workspace
  const demoWs = await pool.query("SELECT id FROM workspaces WHERE code = 'demo_workspace'");
  const demoId = demoWs.rows[0]?.id;
  const demoAgents = await pool.query("SELECT id, email, name, role, is_active FROM agents WHERE workspace_id = $1", [demoId]);
  console.log("\nAGENTS in demo_workspace:", demoAgents.rows.length);
  demoAgents.rows.forEach(r => console.log(JSON.stringify(r)));

  // Cek semua conversations (termasuk yang mungkin di flow mode)
  const convs = await pool.query("SELECT id, workspace_id, visitor_name, status, flow_mode, created_at FROM conversations ORDER BY created_at DESC LIMIT 20");
  console.log("\nALL CONVERSATIONS (last 20):", convs.rows.length);
  convs.rows.forEach(r => console.log(JSON.stringify(r)));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
