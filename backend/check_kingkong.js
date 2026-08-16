const { pool } = require('./src/db');
(async () => {
  try {
    const convs = await pool.query(
      `SELECT c.id, c.visitor_id, c.visitor_name, c.status, c.flow_mode, c.cs_handoff_at, c.first_message_at, c.first_response_at, c.missed_at, c.resolved_at, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_type = 'agent') AS agent_msg_count
       FROM conversations c
       WHERE c.visitor_name ILIKE '%kingkong%' OR c.id = '9a2d0cc6-e1e5-43ec-a384-e0292fb3dc05' OR c.id = 'fd9049c9-28cf-4e10-a044-9121fc6e0d68'
       ORDER BY c.created_at DESC`
    );
    console.log("KINGKONG CONVERSATIONS IN DB:", JSON.stringify(convs.rows, null, 2));

    // Also check ALL missed conversations in DB
    const missedAll = await pool.query(
      `SELECT id, visitor_name, status, flow_mode, cs_handoff_at, first_message_at, first_response_at, missed_at, resolved_at, created_at
       FROM conversations
       WHERE status = 'missed' OR missed_at IS NOT NULL
       ORDER BY created_at DESC`
    );
    console.log("\nALL MISSED CONVERSATIONS IN DB:", JSON.stringify(missedAll.rows, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
