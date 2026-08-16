const { pool } = require("./src/db");

async function addBlockColumn() {
  await pool.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE");
  console.log("✅ Column is_blocked added to conversations table!");
  await pool.end();
}

addBlockColumn().catch(console.error);
