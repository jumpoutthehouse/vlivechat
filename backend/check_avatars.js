const { pool } = require('./src/db');
(async () => {
  try {
    const agents = await pool.query("SELECT id, name, display_name, avatar_url, avatar_bg FROM agents");
    console.log("AGENTS IN DB:", JSON.stringify(agents.rows, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit();
})();
