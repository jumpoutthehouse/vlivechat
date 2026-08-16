require("dotenv").config();
const { pool } = require("../db");

async function testInsert() {
  const wsRes = await pool.query("SELECT id FROM workspaces WHERE code = 'sewu88slot_workspace'");
  const wsId = wsRes.rows[0].id;

  const convRes = await pool.query(
    `INSERT INTO conversations (workspace_id, visitor_id, visitor_name, status, flow_mode, is_blocked)
     VALUES ($1, 'visitor_test_demo_123', 'Visitor Kang Slot', 'open', 'agent', FALSE)
     ON CONFLICT (visitor_id, workspace_id) WHERE status != 'resolved' DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [wsId]
  );
  console.log("✅ CONVERSATION CREATED IN SUPABASE DB:", convRes.rows[0]?.id);

  if (convRes.rows[0]) {
    const msgRes = await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, sender_name, text)
       VALUES ($1, 'visitor', 'Visitor Kang Slot', 'Halo CS, butuh link alternatif terbaru')
       RETURNING *`,
      [convRes.rows[0].id]
    );
    console.log("✅ MESSAGE CREATED IN SUPABASE DB:", msgRes.rows[0]?.text);
  }

  process.exit(0);
}
testInsert().catch(e => { console.error(e); process.exit(1); });
