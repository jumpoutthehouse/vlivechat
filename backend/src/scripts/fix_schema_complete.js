require("dotenv").config();
const { pool } = require("../db");

async function main() {
  // Check conversations table for ALL columns needed by visitor.js INSERT
  const convCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'conversations' ORDER BY ordinal_position"
  );
  const cols = convCols.rows.map(r => r.column_name);
  console.log("ALL CONVERSATIONS COLS:", cols.join(", "));
  console.log("\n");

  // These are the columns used in visitor.js INSERT statement at line 216-224:
  const requiredCols = [
    "workspace_id", "visitor_id", "visitor_name", "prechat_data",
    "visitor_page", "visitor_ref", "visitor_tz", "visitor_lang",
    "visitor_screen", "visitor_ua", "visitor_ip", "visitor_country",
    "visitor_city", "visitor_country_code", "visitor_lat", "visitor_lon",
    "visitor_isp", "status", "flow_mode", "is_blocked", "first_message_at",
    "cs_handoff_at",
    // Also used in UPDATE at line 113:
    "previous_names",
    // Also used in various queries
    "assigned_agent_id", "created_at", "updated_at"
  ];

  console.log("=== CHECKING REQUIRED COLUMNS ===");
  let missingCols = [];
  for (const col of requiredCols) {
    if (!cols.includes(col)) {
      console.log("❌ MISSING:", col);
      missingCols.push(col);
    } else {
      console.log("✅ OK:", col);
    }
  }

  if (missingCols.length > 0) {
    console.log("\n⚠️  MISSING COLUMNS:", missingCols.join(", "));
    // Try to add them
    for (const col of missingCols) {
      try {
        if (col === "previous_names") {
          await pool.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS previous_names TEXT[] DEFAULT '{}'");
        } else if (col === "is_blocked") {
          await pool.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE");
        }
        console.log("✅ Added:", col);
      } catch (e) {
        console.log("❌ Failed to add", col, ":", e.message);
      }
    }
  } else {
    console.log("\n✅ All required columns exist!");
  }

  // Also check visitor_read_cursors table (used in visitor.js read receipts)
  try {
    const cursorCheck = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'visitor_read_cursors'"
    );
    if (cursorCheck.rows.length === 0) {
      console.log("\n❌ TABLE MISSING: visitor_read_cursors - creating...");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visitor_read_cursors (
          visitor_id TEXT NOT NULL,
          conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          last_read_at TIMESTAMPTZ DEFAULT NOW(),
          last_read_msg_id UUID,
          PRIMARY KEY (visitor_id, conversation_id)
        )
      `);
      console.log("✅ Created visitor_read_cursors table");
    } else {
      console.log("\n✅ visitor_read_cursors table exists with cols:", cursorCheck.rows.map(r => r.column_name).join(", "));
    }
  } catch (e) {
    console.log("Error checking visitor_read_cursors:", e.message);
  }

  // Also check messages table columns
  const msgCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'messages' ORDER BY ordinal_position"
  );
  console.log("\nMESSAGES COLS:", msgCols.rows.map(r => r.column_name).join(", "));

  // Check for 'message_type' column (used in visitor.js line 602-604)
  if (!msgCols.rows.some(r => r.column_name === "message_type")) {
    console.log("❌ messages.message_type MISSING - adding...");
    await pool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text'");
    console.log("✅ Added messages.message_type");
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
