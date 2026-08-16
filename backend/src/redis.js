const Redis = require("ioredis");
const logger = require("./utils/logger");

let redis = null;
let redisAvailable = false;
const memStore = new Map();

function isRedisConnected() {
  return redisAvailable && redis && redis.status === "ready";
}

function getRedis() {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        if (times > 2) {
          redisAvailable = false;
          logger.warn("⚠️ Redis not reachable on 127.0.0.1:6379 — Seamlessly using In-Memory Fallback Cache.");
          return null; // Stop reconnecting spam
        }
        return 1000;
      },
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    redis.on("connect", () => {
      redisAvailable = true;
      logger.info("✅ Redis connected");
    });
    redis.on("ready", () => {
      redisAvailable = true;
    });
    redis.on("error", (err) => {
      redisAvailable = false;
      // Log warning once without crashing
    });
    redis.on("close", () => {
      redisAvailable = false;
    });
  }
  return redis;
}

async function initRedis() {
  try {
    const r = getRedis();
    await r.connect();
  } catch (err) {
    redisAvailable = false;
    logger.warn("⚠️ Redis offline — Livechat operating with zero-lag In-Memory Fallback Cache.");
  }
}

// ── Visitor ↔ Conversation mapping ──────────────────────────────
const VISITOR_KEY = (vid) => `vlc:visitor:${vid}:conv`;

async function setVisitorConversation(visitorId, convId, ttlSec = 86400 * 7) {
  if (isRedisConnected()) {
    try { return await getRedis().setex(VISITOR_KEY(visitorId), ttlSec, convId); } catch (e) {}
  }
  memStore.set(VISITOR_KEY(visitorId), convId);
}

async function getVisitorConversation(visitorId) {
  if (isRedisConnected()) {
    try {
      const val = await getRedis().get(VISITOR_KEY(visitorId));
      if (val) return val;
    } catch (e) {}
  }
  return memStore.get(VISITOR_KEY(visitorId)) || null;
}

async function delVisitorConversation(visitorId) {
  if (isRedisConnected()) {
    try { await getRedis().del(VISITOR_KEY(visitorId)); } catch (e) {}
  }
  memStore.delete(VISITOR_KEY(visitorId));
}

// ── Flow state ───────────────────────────────────────────────────
const FLOW_KEY = (vid) => `vlc:flow:${vid}`;

async function saveFlowState(visitorId, state, ttlSec = 86400 * 7) {
  if (isRedisConnected()) {
    try { return await getRedis().setex(FLOW_KEY(visitorId), ttlSec, JSON.stringify(state)); } catch (e) {}
  }
  memStore.set(FLOW_KEY(visitorId), JSON.stringify(state));
}

async function getFlowState(visitorId) {
  if (isRedisConnected()) {
    try {
      const raw = await getRedis().get(FLOW_KEY(visitorId));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
  }
  const raw = memStore.get(FLOW_KEY(visitorId));
  return raw ? JSON.parse(raw) : null;
}

async function delFlowState(visitorId) {
  if (isRedisConnected()) {
    try { if (visitorId) await getRedis().del(FLOW_KEY(visitorId)); } catch (e) {}
  }
  if (visitorId) memStore.delete(FLOW_KEY(visitorId));
}

// ── Online agents (set per workspace) ───────────────────────────
const ONLINE_KEY = (wsId) => `vlc:online:${wsId}`;

async function addOnlineAgent(workspaceId, agentId) {
  if (isRedisConnected()) {
    try {
      await getRedis().sadd(ONLINE_KEY(workspaceId), agentId);
      await getRedis().expire(ONLINE_KEY(workspaceId), 86400);
    } catch (e) {}
  }
  const current = memStore.get(ONLINE_KEY(workspaceId)) || new Set();
  current.add(agentId);
  memStore.set(ONLINE_KEY(workspaceId), current);
}

async function removeOnlineAgent(workspaceId, agentId) {
  if (isRedisConnected()) {
    try { await getRedis().srem(ONLINE_KEY(workspaceId), agentId); } catch (e) {}
  }
  const current = memStore.get(ONLINE_KEY(workspaceId));
  if (current && current.delete) {
    current.delete(agentId);
  }
}

async function getOnlineAgents(workspaceId) {
  if (isRedisConnected()) {
    try {
      const members = await getRedis().smembers(ONLINE_KEY(workspaceId));
      if (members && members.length > 0) return members;
    } catch (e) {}
  }
  const current = memStore.get(ONLINE_KEY(workspaceId));
  return current ? Array.from(current) : [];
}

// ── Agent socket mapping ─────────────────────────────────────────
const AGENT_SOCKET_KEY = (agentId) => `vlc:agent:${agentId}:socket`;

async function setAgentSocket(agentId, socketId) {
  if (isRedisConnected()) {
    try { return await getRedis().setex(AGENT_SOCKET_KEY(agentId), 3600, socketId); } catch (e) {}
  }
  memStore.set(AGENT_SOCKET_KEY(agentId), socketId);
}

async function getAgentSocket(agentId) {
  if (isRedisConnected()) {
    try {
      const sId = await getRedis().get(AGENT_SOCKET_KEY(agentId));
      if (sId) return sId;
    } catch (e) {}
  }
  return memStore.get(AGENT_SOCKET_KEY(agentId)) || null;
}

async function delAgentSocket(agentId) {
  if (isRedisConnected()) {
    try { await getRedis().del(AGENT_SOCKET_KEY(agentId)); } catch (e) {}
  }
  memStore.delete(AGENT_SOCKET_KEY(agentId));
}

// ── Typing indicator (ephemeral TTL) ────────────────────────────
async function setTyping(conversationId, role, ttlMs = 3000) {
  if (isRedisConnected()) {
    try { await getRedis().psetex(`vlc:typing:${conversationId}:${role}`, ttlMs, "1"); } catch (e) {}
  }
  memStore.set(`vlc:typing:${conversationId}:${role}`, "1");
}

module.exports = {
  getRedis,
  initRedis,
  setVisitorConversation,
  getVisitorConversation,
  delVisitorConversation,
  saveFlowState,
  getFlowState,
  delFlowState,
  addOnlineAgent,
  removeOnlineAgent,
  getOnlineAgents,
  setAgentSocket,
  getAgentSocket,
  delAgentSocket,
  setTyping,
};
