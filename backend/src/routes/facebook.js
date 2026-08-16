/**
 * vlivechat — Facebook Messenger Webhook Integration
 * GET  /api/v1/integrations/facebook/webhook  → Verify token challenge
 * POST /api/v1/integrations/facebook/webhook  → Receive messages from Facebook
 * GET  /api/v1/integrations/facebook          → Get integration config
 * PUT  /api/v1/integrations/facebook          → Save/update integration config
 * POST /api/v1/integrations/facebook/send     → Send reply to Facebook user
 */

const express = require("express");
const crypto  = require("crypto");
const axios   = require("axios");
const { pool } = require("../db");
const { auth } = require("../middleware/auth");
const logger  = require("../utils/logger");

const router = express.Router();
const FB_GRAPH_URL = "https://graph.facebook.com/v19.0";

// ── Helper: Get integration config by page_id ────────────────────
async function getIntegrationByPageId(pageId) {
  const { rows } = await pool.query(
    `SELECT i.*, w.id AS workspace_id
     FROM integrations i
     JOIN workspaces w ON i.workspace_id = w.id
     WHERE i.channel = 'facebook'
       AND i.is_active = TRUE
       AND i.config->>'page_id' = $1`,
    [pageId]
  );
  return rows[0] || null;
}

// ── Helper: Ensure conversation for FB user ───────────────────────
async function ensureConversation(workspaceId, psid, senderName) {
  const visitorId = `fb_${psid}`;
  const { rows } = await pool.query(
    `SELECT * FROM conversations
     WHERE workspace_id = $1 AND visitor_id = $2 AND status != 'resolved'
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, visitorId]
  );
  if (rows[0]) return rows[0];

  const { rows: newRows } = await pool.query(
    `INSERT INTO conversations
       (workspace_id, visitor_id, visitor_name, source, external_sender_id, external_id, status, flow_mode)
     VALUES ($1, $2, $3, 'facebook', $4, $4, 'open', 'agent')
     RETURNING *`,
    [workspaceId, visitorId, senderName || psid, psid]
  );
  return newRows[0];
}

// ──────────────────────────────────────────────────────────────────
// GET /webhook  — Facebook verification challenge
// ──────────────────────────────────────────────────────────────────
router.get("/webhook", async (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode !== "subscribe") return res.status(400).send("Invalid mode");

  try {
    const { rows } = await pool.query(
      `SELECT * FROM integrations WHERE channel='facebook' AND is_active=TRUE AND config->>'verify_token'=$1`,
      [token]
    );
    if (!rows[0]) {
      logger.warn(`[FB] Verify failed — unknown token: ${token}`);
      return res.status(403).send("Forbidden");
    }
    logger.info(`[FB] Webhook verified for workspace: ${rows[0].workspace_id}`);
    res.status(200).send(challenge);
  } catch (err) {
    logger.error("[FB] Verify error:", err);
    res.status(500).send("Server error");
  }
});

// ──────────────────────────────────────────────────────────────────
// POST /webhook  — Receive incoming messages from Facebook
// Must use raw body for signature verification
// ──────────────────────────────────────────────────────────────────
router.post("/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  res.status(200).send("EVENT_RECEIVED");

  let body;
  try {
    body = JSON.parse(req.body.toString());
  } catch { return; }

  if (body.object !== "page") return;

  const io = req.app.get("io");

  for (const entry of body.entry || []) {
    const pageId = String(entry.id);
    const integration = await getIntegrationByPageId(pageId).catch(() => null);
    if (!integration) { logger.warn(`[FB] No integration for page ${pageId}`); continue; }

    // Validate signature
    const sig = req.headers["x-hub-signature-256"];
    const appSecret = integration.config?.app_secret;
    if (appSecret && sig) {
      const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(req.body).digest("hex");
      if (sig !== expected) { logger.warn(`[FB] Bad signature for page ${pageId}`); continue; }
    }

    const { workspace_id: workspaceId, config: fbConfig } = integration;

    for (const event of entry.messaging || []) {
      const senderPsid = String(event.sender?.id || "");
      if (!senderPsid || senderPsid === pageId) continue;
      if (!event.message || event.message.is_echo) continue;

      const fbMsg = event.message;

      // Fetch sender name
      let senderName = senderPsid;
      if (fbConfig?.page_access_token) {
        try {
          const r = await axios.get(`${FB_GRAPH_URL}/${senderPsid}`, {
            params: { fields: "name", access_token: fbConfig.page_access_token },
            timeout: 5000,
          });
          senderName = r.data?.name || senderPsid;
        } catch {}
      }

      const conv = await ensureConversation(workspaceId, senderPsid, senderName).catch(e => {
        logger.error("[FB] ensureConversation error:", e); return null;
      });
      if (!conv) continue;

      // Parse message content
      let text = fbMsg.text || null;
      let messageType = "text";
      let fileUrl = null;
      let fileName = null;
      if (fbMsg.attachments?.length > 0) {
        const att = fbMsg.attachments[0];
        if (att.type === "image") { messageType = "image"; fileUrl = att.payload?.url; }
        else { messageType = "file"; fileUrl = att.payload?.url; fileName = att.payload?.name || att.type; }
        if (!text) text = `[${att.type}]`;
      }

      // Save message
      const { rows: msgRows } = await pool.query(
        `INSERT INTO messages (conversation_id, sender_type, sender_name, text, message_type, file_url, file_name, external_id)
         VALUES ($1, 'visitor', $2, $3, $4, $5, $6, $7) RETURNING *`,
        [conv.id, senderName, text, messageType, fileUrl, fileName, fbMsg.mid]
      ).catch(e => { logger.error("[FB] insert message error:", e); return { rows: [] }; });

      if (!msgRows[0]) continue;

      await pool.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`, [conv.id]).catch(() => {});

      // Emit to dashboard
      const dash = io.of("/dashboard");
      const { rows: convRows } = await pool.query(
        `SELECT c.*, w.name AS workspace_name, w.brand_name, w.brand_color FROM conversations c
         LEFT JOIN workspaces w ON c.workspace_id=w.id WHERE c.id=$1`,
        [conv.id]
      ).catch(() => ({ rows: [] }));

      if (convRows[0]) {
        dash.to(`ws:${workspaceId}`).emit("conversation:new", { conversation: convRows[0] });
      }
      dash.to(`conv:${conv.id}`).emit("message:new", msgRows[0]);
      dash.to(`ws:${workspaceId}`).emit("conversation:activity", {
        conversationId: conv.id,
        preview: text || "[lampiran]",
        visitorName: senderName,
      });

      logger.info(`[FB] Message from ${senderName} (${senderPsid}) → conv ${conv.id}`);
    }
  }
});

// ──────────────────────────────────────────────────────────────────
// GET /  — Get integration config (admin)
// ──────────────────────────────────────────────────────────────────
router.get("/", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM integrations WHERE workspace_id=$1 AND channel='facebook'`,
      [req.workspaceId]
    );
    if (!rows[0]) return res.json({ integration: null });
    // Mask token
    const cfg = { ...rows[0].config };
    if (cfg.page_access_token) {
      cfg.page_access_token_masked = cfg.page_access_token.slice(0, 12) + "••••••••••••••••";
      delete cfg.page_access_token;
    }
    res.json({ integration: { ...rows[0], config: cfg } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────
// PUT /  — Save/update integration config (admin)
// ──────────────────────────────────────────────────────────────────
router.put("/", auth, async (req, res) => {
  const { page_id, page_access_token, app_secret, verify_token, is_active } = req.body;
  if (!page_id || !verify_token) {
    return res.status(400).json({ error: "page_id dan verify_token wajib diisi" });
  }

  try {
    const { rows: existing } = await pool.query(
      `SELECT config FROM integrations WHERE workspace_id=$1 AND channel='facebook'`,
      [req.workspaceId]
    );
    const old = existing[0]?.config || {};
    const newConfig = {
      page_id,
      verify_token,
      app_secret: app_secret || old.app_secret || "",
      page_access_token: page_access_token || old.page_access_token || "",
    };

    const { rows } = await pool.query(
      `INSERT INTO integrations (workspace_id, channel, config, is_active)
       VALUES ($1, 'facebook', $2, $3)
       ON CONFLICT (workspace_id, channel)
       DO UPDATE SET config=$2, is_active=$3, updated_at=NOW()
       RETURNING *`,
      [req.workspaceId, JSON.stringify(newConfig), is_active !== false]
    );
    res.json({ integration: rows[0], message: "Konfigurasi Facebook berhasil disimpan" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────
// POST /send  — Send reply to FB user (called from dashboard)
// Body: { conversationId, text, agentName, agentId }
// ──────────────────────────────────────────────────────────────────
router.post("/send", auth, async (req, res) => {
  const { conversationId, text, agentName, agentId } = req.body;
  if (!conversationId || !text) {
    return res.status(400).json({ error: "conversationId dan text wajib diisi" });
  }

  try {
    const { rows: convRows } = await pool.query(
      `SELECT c.*, i.config AS fb_config
       FROM conversations c
       JOIN integrations i ON i.workspace_id=c.workspace_id AND i.channel='facebook'
       WHERE c.id=$1`,
      [conversationId]
    );
    const conv = convRows[0];
    if (!conv) return res.status(404).json({ error: "Percakapan tidak ditemukan" });
    if (conv.source !== "facebook") return res.status(400).json({ error: "Percakapan bukan dari Facebook" });

    const psid = conv.external_sender_id;
    const token = conv.fb_config?.page_access_token;
    if (!psid || !token) return res.status(400).json({ error: "Konfigurasi Facebook tidak lengkap" });

    const fbRes = await axios.post(
      `${FB_GRAPH_URL}/me/messages`,
      { recipient: { id: psid }, message: { text }, messaging_type: "RESPONSE" },
      { params: { access_token: token } }
    );
    const fbMid = fbRes.data?.message_id;

    const { rows: msgRows } = await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, text, message_type, external_id)
       VALUES ($1, 'agent', $2, $3, $4, 'text', $5) RETURNING *`,
      [conversationId, agentId || req.agentId, agentName || "CS Agent", text, fbMid]
    );

    const io = req.app.get("io");
    io.of("/dashboard").to(`conv:${conversationId}`).emit("message:new", msgRows[0]);

    res.json({ message: "Pesan berhasil terkirim ke Facebook", mid: fbMid });
  } catch (err) {
    logger.error("[FB Send] Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "Gagal mengirim ke Facebook: " + (err.response?.data?.error?.message || err.message)
    });
  }
});

module.exports = router;

