const axios = require("axios");
const { pool } = require("../db");
const logger = require("../utils/logger");

const FB_GRAPH_URL = "https://graph.facebook.com/v19.0";

/**
 * Send an outbound message or attachment to Facebook Messenger Graph API
 */
async function sendFacebookMessage({ workspaceId, conversationId, psid, text, fileUrl, messageType }) {
  try {
    let targetPsid = psid;
    let targetWsId = workspaceId;

    // If PSID or workspaceId missing, lookup from database
    if (!targetPsid || !targetWsId) {
      const { rows: convRows } = await pool.query(
        `SELECT workspace_id, external_sender_id, source FROM conversations WHERE id=$1`,
        [conversationId]
      );
      if (!convRows[0] || convRows[0].source !== "facebook") return;
      targetWsId = targetWsId || convRows[0].workspace_id;
      targetPsid = targetPsid || convRows[0].external_sender_id;
    }

    if (!targetPsid || !targetWsId) return;

    // Get active Facebook integration config for workspace
    const { rows: intRows } = await pool.query(
      `SELECT config FROM integrations WHERE workspace_id=$1 AND channel='facebook' AND is_active=TRUE`,
      [targetWsId]
    );

    const token = intRows[0]?.config?.page_access_token;
    if (!token) {
      logger.warn(`[FB Outbound] Missing page_access_token for workspace ${targetWsId}`);
      return;
    }

    // Build payload: text or attachment
    let messagePayload = {};
    if (fileUrl) {
      const fullUrl = fileUrl.startsWith("http")
        ? fileUrl
        : `${process.env.BACKEND_URL || "http://localhost:3001"}${fileUrl}`;
      const attType = messageType === "image" ? "image" : "file";
      messagePayload = {
        attachment: {
          type: attType,
          payload: { url: fullUrl, is_reusable: true },
        },
      };
    } else if (text) {
      messagePayload = { text };
    } else {
      return;
    }

    const res = await axios.post(
      `${FB_GRAPH_URL}/me/messages`,
      {
        recipient: { id: targetPsid },
        message: messagePayload,
        messaging_type: "RESPONSE",
      },
      { params: { access_token: token }, timeout: 10000 }
    );

    logger.info(`[FB Outbound] Sent to PSID ${targetPsid} (MID: ${res.data?.message_id})`);
    return res.data;
  } catch (err) {
    logger.error("[FB Outbound Error]:", err.response?.data?.error || err.message);
  }
}

module.exports = { sendFacebookMessage };
