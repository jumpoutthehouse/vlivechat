const { pool } = require('./src/db');

async function run() {
  try {
    // Set correct default permissions based on role for ALL existing agents
    await pool.query(`UPDATE agents SET permissions = ARRAY['livechat','reports','agents','settings'] WHERE role IN ('superadmin','admin')`);
    await pool.query(`UPDATE agents SET permissions = ARRAY['livechat','reports'] WHERE role = 'supervisor'`);
    await pool.query(`UPDATE agents SET permissions = ARRAY['livechat'] WHERE role = 'agent'`);
    
    const { rows } = await pool.query('SELECT name, email, role, permissions FROM agents ORDER BY role');
    console.log('=== Updated Permissions ===');
    rows.forEach(r => console.log(`${r.name} (${r.role}): ${JSON.stringify(r.permissions)}`));
    console.log('Migration OK!');
  } catch(e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
run();
