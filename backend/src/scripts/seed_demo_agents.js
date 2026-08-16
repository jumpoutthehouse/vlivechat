require("dotenv").config();
const { pool } = require("../db");
const bcrypt = require("bcryptjs");

async function seedAgents() {
  const wsRes = await pool.query("SELECT id FROM workspaces WHERE code = 'demo_workspace'");
  if (wsRes.rows.length === 0) {
    console.log("No demo workspace found");
    process.exit(1);
  }
  const wsId = wsRes.rows[0].id;

  const adminHash = await bcrypt.hash("Admin@2024!", 12);
  const passHash  = await bcrypt.hash("Password123!", 12);

  const demoAgents = [
    { email: "admin@demo.com",  name: "Rose",   display_name: "Cs Rose",   role: "admin",      pass: adminHash, perms: ["livechat", "archives", "reports", "agents", "settings"] },
    { email: "jennie@demo.com", name: "Jennie", display_name: "Cs Jennie", role: "agent",      pass: passHash,  perms: ["livechat", "archives", "reports"] },
    { email: "lisa@demo.com",   name: "Lisa",   display_name: "Cs Lisa",   role: "supervisor", pass: passHash,  perms: ["livechat", "archives", "reports", "agents"] },
    { email: "jisoo@demo.com",  name: "Jisoo",  display_name: "Cs Jisoo",  role: "agent",      pass: passHash,  perms: ["livechat", "archives"] },
  ];

  for (const ag of demoAgents) {
    await pool.query(
      `INSERT INTO agents (workspace_id, email, password_hash, name, display_name, role, status, permissions)
       VALUES ($1, $2, $3, $4, $5, $6, 'online', $7)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, display_name = EXCLUDED.display_name, role = EXCLUDED.role, permissions = EXCLUDED.permissions`,
      [wsId, ag.email, ag.pass, ag.name, ag.display_name, ag.role, ag.perms]
    );
  }
  console.log("✅ Full CS Team (Rose, Jennie, Lisa, Jisoo) seeded in Supabase DB!");
  process.exit(0);
}

seedAgents().catch(e => { console.error(e); process.exit(1); });
