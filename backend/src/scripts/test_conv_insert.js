require("dotenv").config();
const { pool } = require("../db");

async function main() {
  // Check unique constraints on conversations
  const constraints = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(c.oid) AS def 
    FROM pg_constraint c
    WHERE conrelid = 'conversations'::regclass
  `);
  console.log("CONVERSATIONS CONSTRAINTS:");
  constraints.rows.forEach(r => console.log(" ", r.conname, ":", r.def));

  // Try a test insert manually to see if schema is correct now
  console.log("\nTesting manual insert...");
  try {
    const wsRes = await pool.query("SELECT id FROM workspaces WHERE code = 'sewu88slot_workspace'");
    const wsId = wsRes.rows[0]?.id;
    
    const { rows } = await pool.query(`
      INSERT INTO conversations 
        (workspace_id, visitor_id, visitor_name, prechat_data, visitor_page, visitor_ref, 
         visitor_tz, visitor_lang, visitor_screen, visitor_ua,
         visitor_ip, visitor_country, visitor_city, visitor_country_code, visitor_lat, visitor_lon, 
         visitor_isp, status, flow_mode, is_blocked, first_message_at, cs_handoff_at)
      VALUES 
        ($1, 'test_visitor_schema_check', 'Test User', '{}', '/test', '',
         'Asia/Jakarta', 'id', '1920x1080', 'Test UA',
         '127.0.0.1', 'Indonesia', 'Jakarta', 'ID', -6.2, 106.8,
         'Test ISP', 'open', 'bot', FALSE, NOW(), NULL)
      ON CONFLICT (visitor_id, workspace_id) WHERE status != 'resolved'
      DO NOTHING
      RETURNING id, visitor_id, status, is_blocked, flow_mode, created_at
    `, [wsId]);
    
    if (rows.length > 0) {
      console.log("✅ Test conversation created:", rows[0]);
      // Clean up
      await pool.query("DELETE FROM conversations WHERE visitor_id = 'test_visitor_schema_check'");
      console.log("✅ Test conversation deleted (cleanup)");
    } else {
      console.log("ℹ️  Conversation already exists (ON CONFLICT DO NOTHING)");
    }
  } catch(e) {
    console.log("❌ INSERT FAILED:", e.message);
    console.log("   DETAIL:", e.detail);
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
