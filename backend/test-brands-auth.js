const jwt = require('jsonwebtoken');
const { pool } = require('./src/db');

async function run() {
  try {
    // Get superadmin agent
    const { rows } = await pool.query("SELECT * FROM agents WHERE role='superadmin' LIMIT 1");
    const agent = rows[0];
    if (!agent) { console.log('No superadmin found'); return process.exit(1); }
    
    const token = jwt.sign(
      { agentId: agent.id, workspaceId: agent.workspace_id, role: agent.role, name: agent.name },
      process.env.JWT_SECRET || 'change_this_secret',
      { expiresIn: '1h' }
    );
    
    console.log('Token generated for:', agent.name, '(', agent.role, ')');
    console.log('Token role decoded:', jwt.decode(token).role);
    
    // Simulate the brands query directly
    const brandsResult = await pool.query(`
      SELECT
        w.id AS workspace_id, w.name AS workspace_name, w.code AS workspace_code,
        w.brand_name, w.brand_color,
        COUNT(c.id) AS total_chats,
        COUNT(c.id) FILTER (WHERE c.status='resolved') AS resolved_chats
      FROM workspaces w
      LEFT JOIN conversations c ON c.workspace_id = w.id
      GROUP BY w.id, w.name, w.code, w.brand_name, w.brand_color
    `);
    
    console.log('Brands query result:', JSON.stringify(brandsResult.rows, null, 2));
    console.log('Token for manual test:', token.substring(0, 50) + '...');
  } catch(e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
run();
