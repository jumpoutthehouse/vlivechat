/**
 * Migration: Add partial unique index on conversations
 * Prevents duplicate active conversations per visitor per workspace
 * Run once: node backend/add-unique-constraint.js
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
    console.log("🔧 Running migration: partial unique index on conversations...");

    // First, clean up any existing duplicate active conversations
    await client.query(`
      DELETE FROM conversations
      WHERE status != 'resolved'
        AND id NOT IN (
          SELECT DISTINCT ON (visitor_id, workspace_id) id
          FROM conversations
          WHERE status != 'resolved'
          ORDER BY visitor_id, workspace_id, created_at DESC
        )
    `);
    console.log("✅ Cleaned up duplicate active conversations");

    // Drop existing index if any
    await client.query(`DROP INDEX IF EXISTS idx_unique_active_visitor_conv;`);

    // Create partial unique index
    await client.query(`
      CREATE UNIQUE INDEX idx_unique_active_visitor_conv
        ON conversations (visitor_id, workspace_id)
        WHERE status != 'resolved';
    `);
    console.log("✅ Unique partial index created: idx_unique_active_visitor_conv");
    console.log("🎉 Migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
