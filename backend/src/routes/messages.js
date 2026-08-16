const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { auth } = require("../middleware/auth");
const { sendFacebookMessage } = require("../services/facebook.service");

const router = express.Router();

// ── File upload storage ──────────────────────────────────────────
const chatUploadDir = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, "chat")
  : path.join(__dirname, "../../uploads/chat");
if (!fs.existsSync(chatUploadDir)) fs.mkdirSync(chatUploadDir, { recursive: true });

const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatUploadDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg","image/png","image/gif","image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "video/mp4",
      "audio/mpeg","audio/ogg","audio/webm",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipe file tidak diizinkan"));
  },
});

// ── POST /api/v1/messages/upload — upload file from agent ──────
router.post("/upload", auth, chatUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File tidak ditemukan" });

    const fileUrl  = `/uploads/chat/${req.file.filename}`;
    const isImage  = req.file.mimetype.startsWith("image/");
    const msgType  = isImage ? "image" : "file";

    const { conversationId } = req.body;
    if (!conversationId) return res.status(400).json({ error: "conversationId wajib diisi" });

    const { rows } = await pool.query(
      `INSERT INTO messages
         (conversation_id, sender_type, sender_id, sender_name, message_type, file_url, file_name, file_size, file_mime)
       VALUES ($1, 'agent', $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        conversationId,
        req.agentId, req.agentName,
        msgType, fileUrl,
        req.file.originalname, req.file.size, req.file.mimetype,
      ]
    );

    const msg = rows[0];

    // Broadcast to visitor on /livechat namespace (conversation room only)
    const io = req.app.get("io");
    if (io) {
      io.of("/livechat").to(`conv:${conversationId}`).emit("agent:message", {
        text: null,
        senderType: "agent",
        messageId: msg.id,
        messageType: msgType,
        fileUrl, fileName: req.file.originalname, fileMime: req.file.mimetype,
        createdAt: msg.created_at,
        senderName: req.agentName,
      });

      // Broadcast to dashboard
      io.of("/dashboard").to(`conv:${conversationId}`).emit("agent:message", {
        conversationId,
        message: msg,
      });

      const { rows: convRows } = await pool.query("SELECT workspace_id FROM conversations WHERE id=$1", [conversationId]);
      if (convRows[0]) {
        io.of("/dashboard").to(`workspace:${convRows[0].workspace_id}`).emit("conversation:activity", {
          conversationId,
          preview: isImage ? "📷 [Gambar]" : `📎 [File] ${req.file.originalname}`,
        });
      }
    }

    // Trigger Facebook Messenger outbound attachment if conversation is from Facebook
    sendFacebookMessage({ conversationId, fileUrl, messageType: msgType }).catch(() => {});

    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/messages/upload-visitor — upload from widget ──
// Called via REST from widget (Socket.io doesn't handle binary well)
router.post("/upload-visitor", chatUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File tidak ditemukan" });

    let { conversationId, visitorId } = req.body;

    if (!conversationId && visitorId) {
      const { rows: existing } = await pool.query(
        "SELECT id FROM conversations WHERE visitor_id=$1 ORDER BY created_at DESC LIMIT 1",
        [visitorId]
      );
      if (existing.length > 0) {
        conversationId = existing[0].id;
      }
    }

    if (!conversationId) return res.status(400).json({ error: "conversationId atau visitorId wajib" });

    const fileUrl = `/uploads/chat/${req.file.filename}`;
    const isImage = req.file.mimetype.startsWith("image/");
    const msgType = isImage ? "image" : "file";

    const { rows } = await pool.query(
      `INSERT INTO messages
         (conversation_id, sender_type, message_type, file_url, file_name, file_size, file_mime)
       VALUES ($1, 'visitor', $2, $3, $4, $5, $6)
       RETURNING *`,
      [conversationId, msgType, fileUrl, req.file.originalname, req.file.size, req.file.mimetype]
    );

    const msg = rows[0];

    // SLA: first message
    await pool.query(
      `UPDATE conversations SET first_message_at=COALESCE(first_message_at,NOW()), updated_at=NOW() WHERE id=$1`,
      [conversationId]
    );

    // Notify dashboard and visitor
    const io = req.app.get("io");
    if (io) {
      // Notify admin dashboard (realtime render in admin chat)
      io.of("/dashboard").to(`conv:${conversationId}`).emit("visitor:message", {
        conversationId,
        message: msg,
      });

      // Notify the visitor's own socket (confirmation + dedup support)
      io.of("/livechat").to(`visitor:${msg.visitor_id || visitorId}`).emit("visitor:file_sent", {
        messageId: msg.id,
        fileUrl, fileName: req.file.originalname, fileMime: req.file.mimetype,
        msgType,
      });

      const { rows: convRows } = await pool.query("SELECT workspace_id FROM conversations WHERE id=$1", [conversationId]);
      if (convRows[0]) {
        io.of("/dashboard").to(`workspace:${convRows[0].workspace_id}`).emit("conversation:activity", {
          conversationId,
          preview: isImage ? "📷 [Gambar]" : `📎 [File] ${req.file.originalname}`,
        });
      }
    }

    res.json({ messageId: msg.id, fileUrl, fileName: req.file.originalname, msgType, conversationId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
