const { pool } = require('./src/db');

async function run() {
  try {
    // Test brands query
    const { rows } = await pool.query(`
      SELECT
        w.id AS workspace_id,
        w.name AS workspace_name,
        w.code AS workspace_code,
        w.brand_name,
        w.brand_color,
        COUNT(c.id) AS total_chats,
        COUNT(c.id) FILTER (WHERE c.status='resolved') AS resolved_chats,
        COUNT(c.id) FILTER (WHERE c.status='missed') AS missed_chats,
        COUNT(c.id) FILTER (WHERE c.status IN ('open','assigned')) AS active_chats,
        (SELECT COUNT(*) FROM agents WHERE workspace_id=w.id AND is_active=TRUE) AS total_agents,
        (SELECT COUNT(*) FROM agents WHERE workspace_id=w.id AND is_online=TRUE AND is_active=TRUE) AS online_agents,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.first_message_at))/60)::numeric, 1) AS avg_frt_min
      FROM workspaces w
      LEFT JOIN conversations c ON c.workspace_id = w.id
      GROUP BY w.id, w.name, w.code, w.brand_name, w.brand_color
      ORDER BY total_chats DESC, w.name ASC
    `);
    console.log('Brands result:', JSON.stringify(rows, null, 2));
  } catch(e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
run();
