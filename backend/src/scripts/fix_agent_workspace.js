require("dotenv").config();
const { pool } = require("../db");
const bcrypt = require("bcryptjs");

async function main() {
  // Cek dimana admin@demo.com berada
  const adminAgent = await pool.query("SELECT id, email, workspace_id FROM agents WHERE email = 'admin@demo.com'");
  const rose = adminAgent.rows[0];
  console.log("Rose workspace_id:", rose?.workspace_id);

  // Cek workspace dari Rose
  const roseWs = await pool.query("SELECT id, code, brand_name FROM workspaces WHERE id = $1", [rose?.workspace_id]);
  const wsInfo = roseWs.rows[0];
  console.log("Rose is in workspace:", wsInfo?.code, "(brand:", wsInfo?.brand_name + ")");

  // Ini adalah workspace UTAMA yang harus digunakan untuk demo agents
  const mainWsId = rose?.workspace_id;

  // Pindahkan Jennie, Lisa, Jisoo ke workspace yang sama dengan Rose
  const passHash = await bcrypt.hash("Password123!", 12);

  const demoAgents = [
    { email: "jennie@demo.com", name: "Jennie", display_name: "Cs Jennie", role: "agent",      perms: ["livechat", "archives", "reports"] },
    { email: "lisa@demo.com",   name: "Lisa",   display_name: "Cs Lisa",   role: "supervisor", perms: ["livechat", "archives", "reports", "agents"] },
    { email: "jisoo@demo.com",  name: "Jisoo",  display_name: "Cs Jisoo",  role: "agent",      perms: ["livechat", "archives"] },
  ];

  for (const ag of demoAgents) {
    // Cek apakah sudah ada
    const existing = await pool.query("SELECT id, workspace_id FROM agents WHERE email = $1", [ag.email]);
    if (existing.rows.length > 0) {
      // Update workspace_id ke workspace Rose
      await pool.query(
        "UPDATE agents SET workspace_id = $1, role = $2, permissions = $3, display_name = $4 WHERE email = $5",
        [mainWsId, ag.role, ag.perms, ag.display_name, ag.email]
      );
      console.log(`✅ Moved ${ag.email} to ${wsInfo?.code} (${wsInfo?.brand_name})`);
    } else {
      // Insert baru
      await pool.query(
        `INSERT INTO agents (workspace_id, email, password_hash, name, display_name, role, status, permissions)
         VALUES ($1, $2, $3, $4, $5, $6, 'online', $7)`,
        [mainWsId, ag.email, passHash, ag.name, ag.display_name, ag.role, ag.perms]
      );
      console.log(`✅ Created ${ag.email} in ${wsInfo?.code} (${wsInfo?.brand_name})`);
    }
  }

  // Verify
  const allAgents = await pool.query(
    "SELECT email, name, role, workspace_id FROM agents WHERE workspace_id = $1 ORDER BY created_at",
    [mainWsId]
  );
  console.log("\n=== ALL AGENTS IN", wsInfo?.brand_name, "===");
  allAgents.rows.forEach(r => console.log(`  ${r.email} - ${r.name} (${r.role})`));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
