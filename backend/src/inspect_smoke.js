const { pool } = require('./db');

async function inspectSmoke() {
  const { rows } = await pool.query("SELECT id, visitor_id, visitor_name, status, created_at, updated_at FROM conversations WHERE visitor_name ILIKE '%smoke%' OR visitor_id ILIKE '%smoke%' OR visitor_id ILIKE '%v_p09rn4rkh1smsisrb6j%'");
  console.log("Found conversations count:", rows.length);
  console.log(rows);
  process.exit(0);
}

inspectSmoke().catch(err => {
  console.error(err);
  process.exit(1);
});
