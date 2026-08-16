/**
 * vlivechat — Database Migration
 * Full schema: workspaces, agents, conversations, messages, canned_responses, etc.
 * Run: node src/db/migrate.js
 */

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "vlivechat",
  user: process.env.DB_USER || "vlcuser",
  password: process.env.DB_PASSWORD || "vlcpassword123",
});

const SCHEMA = `

-- =============================================
-- EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================
-- WORKSPACES (multi-tenant: brands using vlivechat)
-- =============================================
CREATE TABLE IF NOT EXISTS workspaces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(120) NOT NULL,
  code            VARCHAR(40)  UNIQUE NOT NULL,         -- unique widget code (e.g. w_abc123)
  owner_email     VARCHAR(255),
  plan            VARCHAR(30)  DEFAULT 'free',          -- free | pro | enterprise
  is_active       BOOLEAN      DEFAULT TRUE,

  -- Branding
  brand_name      VARCHAR(120),
  brand_logo_url  TEXT,
  brand_color     VARCHAR(7)   DEFAULT '#1e3a5f',       -- HEX primary color
  brand_secondary VARCHAR(7)   DEFAULT '#e53e3e',
  welcome_title   VARCHAR(255) DEFAULT 'Halo! Ada yang bisa kami bantu?',
  welcome_subtitle TEXT        DEFAULT 'Tim kami siap membantu Anda 24/7.',
  offline_message TEXT         DEFAULT 'Saat ini kami sedang offline. Tinggalkan pesan Anda.',
  
  -- Agent display
  agent_display_name VARCHAR(80) DEFAULT 'Customer Service',

  -- Widget settings
  widget_position VARCHAR(10)  DEFAULT 'right',         -- right | left
  widget_theme    VARCHAR(10)  DEFAULT 'dark',          -- dark | light
  auto_open       BOOLEAN      DEFAULT FALSE,
  auto_open_delay INTEGER      DEFAULT 3000,

  -- Flow config (decision tree JSON)
  flow_config     JSONB,

  -- SLA settings (minutes)
  sla_first_response INTEGER   DEFAULT 5,
  sla_resolution     INTEGER   DEFAULT 60,

  -- Pre-chat form
  prechat_enabled     BOOLEAN  DEFAULT TRUE,
  prechat_fields      JSONB    DEFAULT '[{"key":"username","label":"Username / ID","required":true}]',

  -- Post-chat survey
  postchat_enabled    BOOLEAN  DEFAULT TRUE,

  -- Timestamps
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- =============================================
-- AGENTS (platform users: superadmin, admin, supervisor, agent)
-- =============================================
CREATE TABLE IF NOT EXISTS agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,  -- NULL = superadmin
  
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  role            VARCHAR(20)  NOT NULL DEFAULT 'agent', -- superadmin | admin | supervisor | agent
  
  -- Profile
  avatar_url      TEXT,
  avatar_bg       VARCHAR(7)   DEFAULT '#4F46E5',        -- fallback color if no avatar
  display_name    VARCHAR(120),                          -- shown to visitors (defaults to name)
  title           VARCHAR(80),                           -- e.g. "Senior CS", "Technical Support"
  
  -- Status
  status          VARCHAR(15)  DEFAULT 'offline',        -- online | away | busy | offline
  is_online       BOOLEAN      DEFAULT FALSE,
  last_seen_at    TIMESTAMPTZ,
  
  -- Settings
  notification_sound  BOOLEAN  DEFAULT TRUE,
  max_conversations   INTEGER  DEFAULT 5,                -- concurrent chats limit
  permissions         TEXT[]   DEFAULT ARRAY['livechat'], -- Granular permissions: livechat, reports, agents, settings
  
  is_active       BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_workspace  ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_email      ON agents(email);
CREATE INDEX IF NOT EXISTS idx_agents_role       ON agents(role);

-- =============================================
-- CONVERSATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Visitor info
  visitor_id      VARCHAR(120) NOT NULL,
  visitor_name    VARCHAR(120),
  visitor_email   VARCHAR(255),
  visitor_page    TEXT,
  visitor_ref     TEXT,
  visitor_tz      VARCHAR(60),
  visitor_lang    VARCHAR(10),
  visitor_screen  VARCHAR(20),
  visitor_ip      VARCHAR(45),
  visitor_country VARCHAR(100),
  visitor_city    VARCHAR(100),
  visitor_country_code VARCHAR(10),
  visitor_lat     NUMERIC(10, 6),
  visitor_lon     NUMERIC(10, 6),
  visitor_isp     VARCHAR(150),
  visitor_ua      TEXT,
  
  -- Pre-chat form data
  prechat_data    JSONB,

  -- Assignment
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- Status: open | assigned | resolved | missed
  status          VARCHAR(20)  DEFAULT 'open',
  
  -- Flow
  flow_data       JSONB,
  flow_log        JSONB,
  flow_mode       VARCHAR(20)  DEFAULT 'menu',           -- menu | agent
  
  -- Tags
  tags            TEXT[]       DEFAULT '{}',
  
  -- SLA timestamps
  first_message_at    TIMESTAMPTZ,
  first_response_at   TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  missed_at           TIMESTAMPTZ,
  
  -- Post-chat rating
  rating_satisfaction VARCHAR(5),                        -- yes | no
  rating_resolved     VARCHAR(5),                        -- yes | no
  rating_score        INTEGER,                          -- 1-5
  rating_comment      TEXT,
  rated_at            TIMESTAMPTZ,
  
  -- Metadata
  source          VARCHAR(30)  DEFAULT 'widget',         -- widget | direct
  notes           TEXT,                                  -- internal notes
  
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_visitor   ON conversations(visitor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status    ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_agent     ON conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created   ON conversations(created_at DESC);

-- =============================================
-- MESSAGES
-- =============================================
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Sender
  sender_type     VARCHAR(15)  NOT NULL,                 -- visitor | agent | system | bot
  sender_id       UUID,                                  -- agent id if sender_type=agent
  sender_name     VARCHAR(120),
  
  -- Content
  text            TEXT,
  message_type    VARCHAR(20)  DEFAULT 'text',           -- text | image | file | audio | system | flow_button
  
  -- File attachment
  file_url        TEXT,
  file_name       VARCHAR(255),
  file_size       INTEGER,
  file_mime       VARCHAR(100),
  
  -- Flow button data (when visitor clicks a menu option)
  button_data     JSONB,
  
  -- Internal note (only visible to agents)
  is_internal     BOOLEAN      DEFAULT FALSE,
  
  -- Delivery / Read receipts
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  
  -- Metadata
  client_id       VARCHAR(60),                           -- temp id from client for dedup
  
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created      ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_type  ON messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_messages_unread_partial ON messages(conversation_id, sender_type) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_ws_updated ON conversations(workspace_id, updated_at DESC);

-- Ensure IP Geolocation columns exist on conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_country VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_city VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_country_code VARCHAR(10);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_lat NUMERIC(10, 6);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_lon NUMERIC(10, 6);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS visitor_isp VARCHAR(150);

-- Reset Password & Expiration / Announcement / Greeting columns
ALTER TABLE agents ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS announcement_config JSONB DEFAULT '{"enabled":false,"title":"","text":"","link_url":"","button_text":""}';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_greeting_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_greeting_text TEXT DEFAULT 'Halo! Selamat datang di platform kami, ada yang bisa kami bantu? 😊';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS offline_reply_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS offline_reply_text TEXT DEFAULT 'Saat ini tim Customer Service kami sedang offline. Silakan tinggalkan pesan Anda.';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS vps_expires_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS domain_expires_at TIMESTAMPTZ;
-- Resolution SLA toggle (default OFF — agents can chat as long as needed)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS sla_resolution_enabled BOOLEAN DEFAULT FALSE;
-- cs_handoff_at: timestamp when conversation was handed over from bot to CS agent
-- SLA first-response timer should start from THIS moment, not from first_message_at
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cs_handoff_at TIMESTAMPTZ;

-- =============================================
-- INTEGRATIONS (per-workspace channel configs)
-- =============================================
CREATE TABLE IF NOT EXISTS integrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel         VARCHAR(30)  NOT NULL,                   -- facebook | instagram | whatsapp
  is_active       BOOLEAN      DEFAULT TRUE,
  config          JSONB        NOT NULL DEFAULT '{}',      -- page_id, page_access_token, app_secret, verify_token, etc.
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(workspace_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integrations_channel   ON integrations(channel);

-- =============================================
-- CANNED RESPONSES
-- =============================================
CREATE TABLE IF NOT EXISTS canned_responses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  shortcut        VARCHAR(50)  NOT NULL,                 -- e.g. /hello
  title           VARCHAR(120) NOT NULL,
  content         TEXT         NOT NULL,
  category        VARCHAR(60),
  
  created_by      UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  
  UNIQUE(workspace_id, shortcut)
);

CREATE INDEX IF NOT EXISTS idx_canned_workspace ON canned_responses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canned_shortcut  ON canned_responses(workspace_id, shortcut);

-- =============================================
-- AUDIT LOG (untuk superadmin — clear operations)
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id        UUID REFERENCES agents(id) ON DELETE SET NULL,
  actor_email     VARCHAR(255),
  action          VARCHAR(80)  NOT NULL,                 -- e.g. "clear_conversations"
  workspace_id    UUID,
  target_table    VARCHAR(60),
  affected_rows   INTEGER,
  filter_params   JSONB,
  note            TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_workspace  ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_logs(created_at DESC);

-- =============================================
-- AGENT READ CURSORS (for read receipts per conversation)
-- =============================================
CREATE TABLE IF NOT EXISTS agent_read_cursors (
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ DEFAULT NOW(),
  last_read_msg_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  PRIMARY KEY (agent_id, conversation_id)
);

-- =============================================
-- VISITOR READ CURSORS (track when visitor last read)
-- =============================================
CREATE TABLE IF NOT EXISTS visitor_read_cursors (
  visitor_id      VARCHAR(120) NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ DEFAULT NOW(),
  last_read_msg_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  PRIMARY KEY (visitor_id, conversation_id)
);

-- =============================================
-- TRIGGERS: updated_at auto-update
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS \$\$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspaces_updated_at  ON workspaces;
DROP TRIGGER IF EXISTS trg_agents_updated_at       ON agents;
DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
DROP TRIGGER IF EXISTS trg_canned_updated_at        ON canned_responses;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_canned_updated_at
  BEFORE UPDATE ON canned_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔄 Running vlivechat database migration...");
    await client.query(SCHEMA);
    console.log("✅ Schema created successfully!\n");

    // ── Seed Superadmin ──────────────────────────────────────────
    const bcrypt = require("bcryptjs");
    const { v4: uuidv4 } = require("uuid");
    const defaultFlowConfig = require("../config/defaultFlowConfig");

    const superEmail = process.env.SUPERADMIN_EMAIL || "superadmin@vlivechat.com";
    const superPass  = process.env.SUPERADMIN_PASSWORD || "SuperAdmin@2024!";
    const hash = await bcrypt.hash(superPass, 12);

    const existing = await client.query(
      "SELECT id FROM agents WHERE email = $1 AND role = 'superadmin'",
      [superEmail]
    );

    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO agents (email, password_hash, name, role, workspace_id, status)
         VALUES ($1, $2, 'Super Admin', 'superadmin', NULL, 'online')`,
        [superEmail, hash]
      );
      console.log(`✅ Superadmin created: ${superEmail}`);
      console.log(`   Password: ${superPass}`);
    } else {
      console.log(`ℹ️  Superadmin already exists: ${superEmail}`);
    }

    // ── Seed demo workspace ──────────────────────────────────────
    const wsExisting = await client.query(
      "SELECT id FROM workspaces WHERE code = 'demo_workspace'"
    );

    if (wsExisting.rows.length === 0) {
      const wsId = uuidv4();
      await client.query(
        `INSERT INTO workspaces (id, name, code, brand_name, brand_color, flow_config)
         VALUES ($1, 'Demo Workspace', 'demo_workspace', 'Demo Brand', '#1e3a5f', $2)`,
        [wsId, JSON.stringify(defaultFlowConfig())]
      );

      // Seed demo admin agent
      const adminHash = await bcrypt.hash("Admin@2024!", 12);
      await client.query(
        `INSERT INTO agents (workspace_id, email, password_hash, name, role, status)
         VALUES ($1, 'admin@demo.com', $2, 'Demo Admin', 'admin', 'online')`,
        [wsId, adminHash]
      );

      // Seed demo canned responses
      const cannedItems = [
        { shortcut: "/halo", title: "Salam Pembuka", content: "Halo! Selamat datang di layanan customer service kami. Ada yang bisa kami bantu?" },
        { shortcut: "/tunggu", title: "Minta Tunggu", content: "Mohon maaf, kami sedang mengecek data Anda. Harap menunggu sebentar ya 🙏" },
        { shortcut: "/terima", title: "Terima Kasih", content: "Terima kasih telah menghubungi kami! Semoga masalah Anda sudah terselesaikan. Jika ada pertanyaan lain, jangan sungkan untuk menghubungi kami kembali 😊" },
        { shortcut: "/selesai", title: "Penutup Chat", content: "Baik, terima kasih sudah menghubungi kami. Apakah ada yang ingin ditanyakan lagi?" },
        { shortcut: "/maaf", title: "Permintaan Maaf", content: "Kami mohon maaf atas ketidaknyamanan yang Anda alami. Kami akan segera menindaklanjuti hal ini." },
      ];

      for (const c of cannedItems) {
        await client.query(
          `INSERT INTO canned_responses (workspace_id, shortcut, title, content)
           VALUES ($1, $2, $3, $4) ON CONFLICT (workspace_id, shortcut) DO NOTHING`,
          [wsId, c.shortcut, c.title, c.content]
        );
      }

      console.log(`✅ Demo workspace created (code: demo_workspace)`);
      console.log(`   Admin: admin@demo.com / Admin@2024!`);
    } else {
      console.log(`ℹ️  Demo workspace already exists`);
    }

    console.log("\n🚀 Migration complete! You can now start the server.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
// defaultFlowConfig is now in src/config/defaultFlowConfig.js

migrate();
