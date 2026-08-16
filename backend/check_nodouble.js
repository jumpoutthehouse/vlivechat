const { pool } = require('./src/db');
(async () => {
  try {
    const convs = await pool.query("SELECT id, visitor_id, visitor_name, created_at FROM conversations WHERE visitor_name ILIKE '%NoDouble%' ORDER BY created_at DESC LIMIT 5");
    console.log("NODOUBLE CONVS:", convs.rows);

    for (const c of convs.rows) {
      const msgs = await pool.query("SELECT id, sender_type, text, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC", [c.id]);
      console.log(`\n--- MESSAGES FOR ${c.id} (${c.visitor_name}) ---`);
      console.log(msgs.rows);
    }
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
