require("dotenv").config();
const { pool } = require("../db");

async function addMissingColumns() {
  const client = await pool.connect();
  try {
    console.log("🔄 Adding missing columns to Supabase schema...");

    // 1. conversations.session_count (used in reports queries)
    await client.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS session_count INTEGER DEFAULT 1
    `);
    console.log("✅ conversations.session_count added");

    // 2. workspaces.chatbot_enabled (used in conversations queries)
    await client.query(`
      ALTER TABLE workspaces
      ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN DEFAULT TRUE
    `);
    console.log("✅ workspaces.chatbot_enabled added");

    // 3. Check for any other potentially missing columns based on migrate.js
    // workspaces extra columns
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS facebook_enabled BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS facebook_page_id TEXT`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS facebook_access_token TEXT`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS facebook_verify_token TEXT`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS chatbot_model TEXT DEFAULT 'gpt-3.5-turbo'`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS chatbot_system_prompt TEXT`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS chatbot_api_key TEXT`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS chatbot_fallback_message TEXT`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS chatbot_enabled_hours JSONB`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS operating_hours JSONB`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_assign BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS assign_strategy TEXT DEFAULT 'round_robin'`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS blacklist TEXT[] DEFAULT '{}'`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tag_list TEXT[] DEFAULT '{}'`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS postchat_fields JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS max_queue_size INTEGER DEFAULT 50`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS queue_timeout_minutes INTEGER DEFAULT 30`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS sla_first_response_enabled BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS widget_allow_file_upload BOOLEAN DEFAULT TRUE`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS widget_allowed_file_types TEXT DEFAULT 'image/*,application/pdf'`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS widget_max_file_size_mb INTEGER DEFAULT 5`);
    console.log("✅ workspaces extra columns added/verified");

    // conversations extra columns  
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_device TEXT`);
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_browser TEXT`);
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_os TEXT`);
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_text TEXT`);
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sla_first_response_breach BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sla_resolution_breach BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sla_first_response_at TIMESTAMPTZ`);
    console.log("✅ conversations extra columns added/verified");

    console.log("\n🚀 Schema update complete! All missing columns added.");
    process.exit(0);
  } catch (e) {
    console.error("❌ Error:", e.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

addMissingColumns();
