const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

/**
 * Auth middleware — validates JWT and fetches current agent permissions from DB
 * Supports: superadmin (no workspace), admin/supervisor/agent (workspace-scoped)
 */
async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch fresh agent data from DB to guarantee current role, status, and permissions
    const { rows } = await pool.query(
      "SELECT id, role, permissions, workspace_id, is_active, name FROM agents WHERE id = $1",
      [decoded.agentId]
    );

    if (!rows[0] || rows[0].is_active === false) {
      return res.status(401).json({ error: "Agent tidak aktif atau tidak ditemukan" });
    }

    req.agentId      = rows[0].id;
    req.agentRole    = rows[0].role;
    req.workspaceId  = rows[0].workspace_id || null;
    req.agentName    = rows[0].name;

    // Parse permissions array
    let perms = rows[0].permissions;
    if (typeof perms === "string") {
      perms = perms.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean);
    }
    req.agentPermissions = Array.isArray(perms) ? perms : ["livechat"];

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Superadmin-only middleware
 */
function superadminOnly(req, res, next) {
  if (req.agentRole !== "superadmin") {
    return res.status(403).json({ error: "Superadmin access required" });
  }
  next();
}

/**
 * Admin or higher middleware (or agents with specific permission)
 */
function adminOnly(req, res, next) {
  const allowed = ["superadmin", "admin"];
  if (allowed.includes(req.agentRole) || (req.agentPermissions && req.agentPermissions.includes("agents"))) {
    return next();
  }
  return res.status(403).json({ error: "Admin access required" });
}

/**
 * Dynamic permission middleware
 */
function hasPermission(perm) {
  return (req, res, next) => {
    if (["superadmin", "admin"].includes(req.agentRole)) {
      return next();
    }
    const perms = req.agentPermissions || ["livechat"];
    if (perms.includes(perm)) {
      return next();
    }
    return res.status(403).json({ error: "Hak akses tidak diizinkan" });
  };
}

module.exports = {
  auth,
  superadminOnly,
  adminOnly,
  supervisorOrHigher: hasPermission("reports"),
  hasPermission,
};

