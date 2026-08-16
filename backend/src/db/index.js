const { Pool } = require("pg");
const logger = require("../utils/logger");

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || "vlivechat",
      user: process.env.DB_USER || "vlcuser",
      password: process.env.DB_PASSWORD || "vlcpassword123",
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  logger.error("Unexpected PostgreSQL pool error:", err);
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    logger.info("✅ PostgreSQL connected");
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
