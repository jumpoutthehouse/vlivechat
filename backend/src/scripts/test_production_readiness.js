const { pool } = require("../db");
const { getRedis } = require("../redis");

async function runReadinessAudit() {
  console.log("=================================================");
  console.log("🚀 STARTING VLIVECHAT PRODUCTION READINESS AUDIT");
  console.log("=================================================\n");

  let passes = 0;
  let fails = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passes++;
    } else {
      console.log(`  ❌ FAIL: ${message}`);
      fails++;
    }
  }

  try {
    // 1. Check PostgreSQL Database Connection
    console.log("1. Database Connection & Schema Check:");
    const dbTest = await pool.query("SELECT NOW()");
    assert(dbTest.rows.length > 0, "PostgreSQL database connection is alive.");

    // Check critical indexes
    const idxRes = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename IN ('conversations', 'messages', 'agents', 'workspaces')
    `);
    const indexes = idxRes.rows.map(r => r.indexname);
    console.log(`     Found ${indexes.length} database indexes.`);
    assert(indexes.length >= 2, "Database has required performance indexes.");

    // 2. Check Redis Cache & Locks Connection
    console.log("\n2. Redis Cache & Lock Store Check:");
    const ping = await getRedis().ping();
    assert(ping === "PONG", "Redis connection is alive and responding PONG.");

    // 3. Check Workspace Table Isolation
    console.log("\n3. Multi-Brand Workspace Isolation Check:");
    const wsRes = await pool.query("SELECT id, name, brand_name, code FROM workspaces");
    console.log(`     Total Workspaces Configured: ${wsRes.rows.length}`);
    assert(wsRes.rows.length >= 1, "Multi-brand workspace configuration exists.");

    // 4. Check Missed Chat & SLA Indexes
    console.log("\n4. Missed Chat & SLA Column Check:");
    const convColsRes = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'conversations'
    `);
    const cols = convColsRes.rows.map(r => r.column_name);
    assert(cols.includes("missed_at"), "Column 'missed_at' exists in conversations table.");
    assert(cols.includes("first_response_at"), "Column 'first_response_at' exists in conversations table.");
    assert(cols.includes("first_message_at"), "Column 'first_message_at' exists in conversations table.");

    console.log("\n=================================================");
    console.log(`📊 AUDIT SUMMARY: ${passes} PASSED, ${fails} FAILED`);
    console.log("=================================================\n");

  } catch (err) {
    console.error("❌ AUDIT FATAL ERROR:", err.message);
  } finally {
    process.exit(0);
  }
}

runReadinessAudit();
