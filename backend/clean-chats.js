const { pool, redis } = require("./src/db");

async function cleanAllChats() {
  console.log("🧹 Clearing all messages, conversations, and flow states...");

  try {
    await pool.query("TRUNCATE TABLE messages CASCADE");
    await pool.query("TRUNCATE TABLE visitor_read_cursors CASCADE");
    await pool.query("DELETE FROM conversations");
    console.log("✅ PostgreSQL tables (messages, conversations, visitor_read_cursors) cleaned!");

    if (redis) {
      const keys = await redis.keys("vlc:*");
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`✅ Flushed ${keys.length} Redis flow keys!`);
      } else {
        console.log("✅ Redis flow cache clean!");
      }
    }
  } catch (err) {
    console.error("❌ Cleanup error:", err);
  } finally {
    await pool.end();
    if (redis) redis.quit();
  }
}

cleanAllChats();
