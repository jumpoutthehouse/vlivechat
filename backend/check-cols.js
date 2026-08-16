const { pool } = require('./src/db');
async function run() {
  const { rows } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'conversations'");
  console.log('Columns:', rows.map(r => r.column_name).join(', '));
  process.exit(0);
}
run();
