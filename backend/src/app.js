require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const logger = require("./utils/logger");
const { initDB } = require("./db");
const { initRedis } = require("./redis");
const { registerVisitorSocket } = require("./socket/visitor");
const { registerDashboardSocket } = require("./socket/dashboard");

// ── Routes ─────────────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const agentRoutes = require("./routes/agents");
const workspaceRoutes = require("./routes/workspaces");
const conversationRoutes = require("./routes/conversations");
const messageRoutes = require("./routes/messages");
const reportRoutes = require("./routes/reports");
const uploadRoutes = require("./routes/uploads");
const publicRoutes = require("./routes/public");
const cannedRoutes = require("./routes/canned");
const superadminRoutes = require("./routes/superadmin");
const facebookRoutes = require("./routes/facebook");
const homeRoutes = require("./routes/home");

const { startSLACron } = require("./services/sla.service");

const app = express();
app.set("trust proxy", true);
const server = http.createServer(app);

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
  "http://[::1]:5173",
  "http://localhost:4173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  ...(process.env.WIDGET_ORIGINS || "").split(",").filter(Boolean),
  "null", // file:// origin for dev
];

const corsOptions = {
  origin: (origin, cb) => {
    return cb(null, true);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Root & Healthcheck ─────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "vlivechat Backend Server running", version: "1.0.0" });
});

app.get("/api/v1", (req, res) => {
  res.json({ status: "ok", message: "vlivechat API v1 running", version: "1.0.0" });
});

// ── Static uploads ─────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// ── Socket.io ──────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set("io", io);

// ── API Routes ─────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/agents", agentRoutes);
app.use("/api/v1/workspaces", workspaceRoutes);
app.use("/api/v1/conversations", conversationRoutes);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/uploads", uploadRoutes);
app.use("/api/v1/canned", cannedRoutes);
app.use("/api/v1/superadmin", superadminRoutes);
app.use("/api/v1/integrations/facebook", facebookRoutes);
app.use("/api/v1/home", homeRoutes);

// Public endpoints (no auth) — for widget
app.use("/public", publicRoutes);

// ── Serve widget files ─────────────────────────────────────────
const widgetDir = path.join(__dirname, "../../widget");
if (fs.existsSync(widgetDir)) {
  app.use("/widget", express.static(widgetDir, {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
    },
  }));
  logger.info(`Widget served at /widget`);
}

// ── Health check ───────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "vlivechat", ts: Date.now() })
);

// ── 404 & Error handler ────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// ── Socket namespaces ─────────────────────────────────────────
const visitorNsp = io.of("/livechat");
const dashboardNsp = io.of("/dashboard");
registerVisitorSocket(visitorNsp, dashboardNsp);
registerDashboardSocket(dashboardNsp, visitorNsp);

// ── Boot ──────────────────────────────────────────────────────
async function boot() {
  await initDB();
  await initRedis();

  // Reset stale online statuses left behind by server crashes or restarts
  try {
    const { pool } = require("./db");
    const { getRedis } = require("./redis");
    await pool.query("UPDATE agents SET is_online = FALSE, status = 'offline' WHERE is_online = TRUE");

    // Clean stale Redis online keys
    const r = getRedis();
    const keys = await r.keys("vlc:online:*");
    if (keys.length > 0) await r.del(...keys);

    logger.info("✅ Reset stale agent online statuses on startup");
  } catch (err) {
    logger.error("Failed to reset stale agent statuses:", err.message);
  }

  startSLACron(io);

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    logger.info(`🚀 vlivechat backend running on port ${PORT}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(`   API: http://localhost:${PORT}/api/v1`);
  });
}

boot().catch((err) => {
  logger.error("Boot failed:", err);
  process.exit(1);
});

module.exports = { app, server, io };
