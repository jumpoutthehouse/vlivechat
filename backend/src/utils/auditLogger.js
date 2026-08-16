const { pool } = require("../db");
const logger = require("./logger");

/**
 * Record an activity in audit_logs table
 */
async function recordAuditLog({
  actorId,
  actorEmail,
  action,
  workspaceId = null,
  targetTable = null,
  affectedRows = 1,
  filterParams = null,
  note = "",
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_email, action, workspace_id, target_table, affected_rows, filter_params, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorId || null,
        actorEmail || "system",
        action,
        workspaceId || null,
        targetTable || null,
        affectedRows,
        filterParams ? JSON.stringify(filterParams) : null,
        note,
      ]
    );
  } catch (err) {
    logger.error("recordAuditLog error:", err.message);
  }
}

module.exports = { recordAuditLog };
