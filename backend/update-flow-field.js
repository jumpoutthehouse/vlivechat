const { pool } = require("./src/db");

async function updateDemoFlow() {
  const { rows } = await pool.query("SELECT id, flow_config FROM workspaces WHERE code='demo_workspace'");
  if (rows.length === 0) return;
  const cfg = rows[0].flow_config;
  if (cfg && cfg.nodes) {
    const node = cfg.nodes.find(n => n.id === "collect_bank");
    if (node) node.field = "jenis_bank";
    await pool.query("UPDATE workspaces SET flow_config=$1 WHERE id=$2", [JSON.stringify(cfg), rows[0].id]);
    console.log("✅ Updated demo_workspace flow_config with jenis_bank field!");
  }
  await pool.end();
}

updateDemoFlow().catch(console.error);
