/**
 * Migration: Add chatbot_enabled column to workspaces
 * Run: node backend/add-chatbot-enabled.js
 */
require("dotenv").config({ path: __dirname + "/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "vlivechat",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN DEFAULT TRUE;
    `);
    console.log("✅ chatbot_enabled column added to workspaces");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
