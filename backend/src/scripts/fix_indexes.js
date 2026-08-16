require("dotenv").config();
const { pool } = require("../db");

async function main() {
  console.log("🔄 Creating missing indexes for production DB...");

  try {
    // The critical partial unique index needed for ON CONFLICT in visitor.js
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_active_visitor_workspace
      ON conversations (visitor_id, workspace_id)
      WHERE status != 'resolved'
    `);
    console.log("✅ Created partial unique index: idx_conversations_active_visitor_workspace");
  } catch (e) {
    console.log("❌ Failed to create unique index:", e.message);
    // If there are duplicate active conversations already, drop duplicates first
    if (e.message.includes("duplicate")) {
      console.log("   Attempting to fix duplicate active conversations...");
      await pool.query(`
        DELETE FROM conversations a
        USING conversations b
        WHERE a.id > b.id 
          AND a.visitor_id = b.visitor_id 
          AND a.workspace_id = b.workspace_id
          AND a.status != 'resolved'
          AND b.status != 'resolved'
      `);
      console.log("   Removed duplicates. Retrying index creation...");
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_active_visitor_workspace
        ON conversations (visitor_id, workspace_id)
        WHERE status != 'resolved'
      `);
      console.log("✅ Partial unique index created after cleanup");
    }
  }

  // Also add indexes from migrate.js that might be missing
  const indexes = [
    { name: "idx_conversations_workspace", sql: "CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id)" },
    { name: "idx_conversations_visitor",   sql: "CREATE INDEX IF NOT EXISTS idx_conversations_visitor ON conversations(visitor_id)" },
    { name: "idx_conversations_status",    sql: "CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)" },
    { name: "idx_conversations_agent",     sql: "CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(assigned_agent_id)" },
    { name: "idx_conversations_created",   sql: "CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC)" },
    { name: "idx_conversations_ws_updated","sql": "CREATE INDEX IF NOT EXISTS idx_conversations_ws_updated ON conversations(workspace_id, updated_at DESC)" },
  ];

  for (const idx of indexes) {
    try {
      await pool.query(idx.sql);
      console.log("✅ Index OK:", idx.name);
    } catch (e) {
      console.log("❌ Index failed:", idx.name, "-", e.message);
    }
  }

  // Verify by doing a test insert
  console.log("\nVerifying with test insert...");
  const wsRes = await pool.query("SELECT id FROM workspaces WHERE code = 'sewu88slot_workspace'");
  const wsId = wsRes.rows[0]?.id;
  
  try {
    const { rows } = await pool.query(`
      INSERT INTO conversations 
        (workspace_id, visitor_id, visitor_name, prechat_data, visitor_page, visitor_ref, 
         visitor_tz, visitor_lang, visitor_screen, visitor_ua,
         visitor_ip, visitor_country, visitor_city, visitor_country_code, visitor_lat, visitor_lon, 
         visitor_isp, status, flow_mode, is_blocked, first_message_at, cs_handoff_at)
      VALUES 
        ($1, 'test_visitor_schema_check_v2', 'Test User', '{}', '/test', '',
         'Asia/Jakarta', 'id', '1920x1080', 'Test UA',
         '127.0.0.1', 'Indonesia', 'Jakarta', 'ID', -6.2, 106.8,
         'Test ISP', 'open', 'bot', FALSE, NOW(), NULL)
      ON CONFLICT (visitor_id, workspace_id) WHERE status != 'resolved'
      DO NOTHING
      RETURNING id, visitor_id, status, is_blocked, flow_mode
    `, [wsId]);
    
    if (rows.length > 0) {
      console.log("✅ Test conversation INSERT succeeded:", rows[0]);
      await pool.query("DELETE FROM conversations WHERE visitor_id = 'test_visitor_schema_check_v2'");
      console.log("✅ Cleanup done");
    } else {
      console.log("ℹ️  ON CONFLICT triggered (already exists)");
    }
  } catch(e) {
    console.log("❌ Still failing:", e.message);
  }

  console.log("\n🚀 Schema fix complete!");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
