const express = require("express");
const { pool } = require("../db");
const { auth, superadminOnly } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/v1/superadmin/workspaces — semua workspace ───────
router.get("/workspaces", auth, superadminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.*,
         (SELECT COUNT(*) FROM agents WHERE workspace_id=w.id AND is_active=TRUE) AS agent_count,
         (SELECT COUNT(*) FROM conversations WHERE workspace_id=w.id) AS total_conversations,
         (SELECT COUNT(*) FROM conversations WHERE workspace_id=w.id AND status IN ('open','assigned')) AS active_conversations
       FROM workspaces w
       ORDER BY w.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/superadmin/stats — platform stats ─────────────
router.get("/stats", auth, superadminOnly, async (req, res) => {
  try {
    const [wsCount, agentCount, convCount, activeConv, todayConv] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM workspaces WHERE is_active=TRUE"),
      pool.query("SELECT COUNT(*) FROM agents WHERE is_active=TRUE AND role != 'superadmin'"),
      pool.query("SELECT COUNT(*) FROM conversations"),
      pool.query("SELECT COUNT(*) FROM conversations WHERE status IN ('open','assigned')"),
      pool.query("SELECT COUNT(*) FROM conversations WHERE created_at >= CURRENT_DATE"),
    ]);

    res.json({
      workspaces:           parseInt(wsCount.rows[0].count),
      agents:               parseInt(agentCount.rows[0].count),
      total_conversations:  parseInt(convCount.rows[0].count),
      active_conversations: parseInt(activeConv.rows[0].count),
      today_conversations:  parseInt(todayConv.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/superadmin/audit-logs ─────────────────────────
router.get("/audit-logs", auth, superadminOnly, async (req, res) => {
  try {
    const pageNum  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 15));
    const offset   = (pageNum - 1) * limitNum;
    const { workspace_id, action } = req.query;

    let where = [];
    const params = [];
    let pi = 1;

    if (workspace_id) { where.push(`al.workspace_id=$${pi++}`); params.push(workspace_id); }
    if (action)       { where.push(`al.action=$${pi++}`);       params.push(action); }

    const whereStr = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) FROM audit_logs al ${whereStr}`;
    const countRes = await pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(total / limitNum) || 1;

    const dataQuery = `
      SELECT al.*, w.name AS workspace_name, w.brand_name
      FROM audit_logs al
      LEFT JOIN workspaces w ON al.workspace_id = w.id
      ${whereStr}
      ORDER BY al.created_at DESC
      LIMIT $${pi} OFFSET $${pi + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...params, limitNum, offset]);

    res.json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// ── CLEAR CHAT / DATABASE ──────────────────────────────────────
// ─────────────────────────────────────────────────────────────────

// POST /api/v1/superadmin/clear — clear conversations with filters
// Body: { workspace_id?, date_from?, date_to?, status?, confirm: true }
router.post("/clear", auth, superadminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { workspace_id, date_from, date_to, status, confirm } = req.body;

    if (!confirm) {
      return res.status(400).json({ error: "Tambahkan confirm:true untuk melanjutkan operasi ini" });
    }

    // Build WHERE clause
    let where = [];
    const params = [];
    let pi = 1;

    if (workspace_id) { where.push(`workspace_id=$${pi++}`); params.push(workspace_id); }
    if (date_from)    { where.push(`created_at>=$${pi++}`);  params.push(date_from); }
    if (date_to)      { where.push(`created_at<=$${pi++}`);  params.push(date_to); }
    if (status)       { where.push(`status=$${pi++}`);       params.push(status); }

    if (where.length === 0) {
      return res.status(400).json({
        error: "Setidaknya satu filter harus diberikan (workspace_id / date_from / date_to / status)"
      });
    }

    const whereStr = `WHERE ${where.join(" AND ")}`;

    await client.query("BEGIN");

    // Count first
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) FROM conversations ${whereStr}`,
      params
    );
    const affectedConvs = parseInt(countRows[0].count);

    if (affectedConvs === 0) {
      await client.query("ROLLBACK");
      return res.json({ message: "Tidak ada conversation yang cocok dengan filter", affected: 0 });
    }

    // Get conversation IDs
    const { rows: convIds } = await client.query(
      `SELECT id FROM conversations ${whereStr}`,
      params
    );
    const ids = convIds.map(r => r.id);

    // Delete messages first (FK constraint)
    const { rowCount: msgDeleted } = await client.query(
      `DELETE FROM messages WHERE conversation_id = ANY($1::uuid[])`,
      [ids]
    );

    // Delete read cursors
    await client.query(`DELETE FROM agent_read_cursors  WHERE conversation_id = ANY($1::uuid[])`, [ids]);
    await client.query(`DELETE FROM visitor_read_cursors WHERE conversation_id = ANY($1::uuid[])`, [ids]);

    // Delete conversations
    await client.query(`DELETE FROM conversations WHERE id = ANY($1::uuid[])`, [ids]);

    // Get actor email from DB
    const { rows: actorRows } = await client.query("SELECT email FROM agents WHERE id=$1", [req.agentId]);
    const actorEmail = actorRows[0]?.email || "superadmin";

    // Log the action
    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_email, action, workspace_id, target_table, affected_rows, filter_params, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        req.agentId, actorEmail,
        "clear_conversations", workspace_id || null,
        "conversations", affectedConvs,
        JSON.stringify({ workspace_id, date_from, date_to, status }),
        `Cleared ${affectedConvs} conversations, ${msgDeleted} messages`,
      ]
    );

    await client.query("COMMIT");

    // Notify dashboards
    const io = req.app.get("io");
    if (workspace_id) {
      io.of("/dashboard").to(`workspace:${workspace_id}`).emit("db:cleared", {
        workspaceId: workspace_id,
        affectedConversations: affectedConvs,
        clearedBy: req.agentName,
      });
    } else {
      io.of("/dashboard").emit("db:cleared", {
        affectedConversations: affectedConvs,
        clearedBy: req.agentName,
      });
    }

    res.json({
      message: `Berhasil menghapus ${affectedConvs} conversation dan ${msgDeleted} pesan`,
      affected_conversations: affectedConvs,
      affected_messages: msgDeleted,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/v1/superadmin/clear/preview — preview count before clearing
router.get("/clear/preview", auth, superadminOnly, async (req, res) => {
  try {
    const { workspace_id, date_from, date_to, status } = req.query;

    let where = [];
    const params = [];
    let pi = 1;

    if (workspace_id) { where.push(`c.workspace_id=$${pi++}`); params.push(workspace_id); }
    if (date_from)    { where.push(`c.created_at>=$${pi++}`);  params.push(date_from); }
    if (date_to)      { where.push(`c.created_at<=$${pi++}`);  params.push(date_to); }
    if (status)       { where.push(`c.status=$${pi++}`);       params.push(status); }

    if (where.length === 0) {
      return res.status(400).json({ error: "Setidaknya satu filter harus diberikan" });
    }

    const whereStr = `WHERE ${where.join(" AND ")}`;

    const { rows } = await pool.query(
      `SELECT
         COUNT(c.id) AS conversation_count,
         COUNT(m.id) AS message_count,
         MIN(c.created_at) AS oldest,
         MAX(c.created_at) AS newest,
         w.name AS workspace_name
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       LEFT JOIN workspaces w ON c.workspace_id = w.id
       ${whereStr}
       GROUP BY w.name`,
      params
    );

    res.json({ preview: rows, filters: { workspace_id, date_from, date_to, status } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
