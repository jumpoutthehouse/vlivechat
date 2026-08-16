const { pool } = require('./db');

async function testBackendWhere() {
  const targetWs = 'ffaa7d79-1f25-45ef-b86b-c863f2cd7b98';
  const status = 'archived';
  const limit = 30;
  const offset = 0;
  const visitor_id = undefined;

  let where = [];
  const params = [];
  let pi = 1;

  if (targetWs) {
    where.push(`c.workspace_id = $${pi++}`);
    params.push(targetWs);
  }

  if (status) {
    if (status === "archived") {
      where.push(`c.status IN ('resolved','missed')`);
    } else {
      where.push(`c.status = $${pi++}`);
      params.push(status);
    }
  }
  if (visitor_id) {
    where.push(`(c.visitor_id = $${pi} OR c.visitor_name = $${pi} OR c.visitor_id ILIKE $${pi} OR c.visitor_name ILIKE $${pi})`);
    params.push(visitor_id);
    pi++;
  }

  const whereStr = where.length > 0 ? where.join(" AND ") : "1=1";
  console.log("WHERE SQL:", whereStr);
  console.log("PARAMS:", params);

  const resQuery = await pool.query(
    `SELECT c.id, c.visitor_id, c.visitor_name, c.created_at, c.updated_at
     FROM conversations c
     WHERE ${whereStr}
     ORDER BY c.updated_at DESC
     LIMIT $${pi} OFFSET $${pi + 1}`,
    [...params, parseInt(limit), parseInt(offset)]
  );

  console.log("Query returned count:", resQuery.rows.length);
  console.log(resQuery.rows.slice(0, 10));
  process.exit(0);
}

testBackendWhere().catch(err => {
  console.error(err);
  process.exit(1);
});
