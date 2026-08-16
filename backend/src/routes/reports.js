const express = require("express");
const { pool } = require("../db");
const { auth, supervisorOrHigher } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/v1/reports/overview — daily/weekly/monthly stats ──
router.get("/overview", auth, supervisorOrHigher, async (req, res) => {
  try {
    const { period = "week", date_from, date_to, workspace_id } = req.query;
    const wsId = workspace_id || req.workspaceId;

    let dateFilter = "";
    let wsCond = "";
    let wsCondC = "";
    let wsCondA = "";
    const params = [];
    let pi = 1;

    if (wsId) {
      wsCond = `WHERE workspace_id = $${pi}`;
      wsCondC = `WHERE c.workspace_id = $${pi}`;
      wsCondA = `WHERE a.workspace_id = $${pi}`;
      params.push(wsId);
      pi++;
    } else {
      wsCond = "WHERE 1=1";
      wsCondC = "WHERE 1=1";
      wsCondA = "WHERE 1=1";
    }

    if (date_from && date_to) {
      dateFilter = `AND created_at BETWEEN $${pi++} AND $${pi++}`;
      params.push(date_from, date_to);
    } else {
      if (period === "day") {
        dateFilter = `AND created_at >= DATE_TRUNC('day', NOW())`;
      } else if (period === "week") {
        dateFilter = `AND created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days'`;
      } else if (period === "month") {
        dateFilter = `AND created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '29 days'`;
      } else if (period === "year") {
        dateFilter = `AND created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '364 days'`;
      } else {
        dateFilter = `AND created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days'`;
      }
    }

    let slaFrt = parseInt(req.query.sla_frt);
    let slaRes = parseInt(req.query.sla_resolution);

    if (wsId && (!slaFrt || !slaRes)) {
      const wsRes = await pool.query("SELECT sla_first_response, sla_resolution FROM workspaces WHERE id=$1", [wsId]);
      if (wsRes.rows[0]) {
        if (!slaFrt) slaFrt = wsRes.rows[0].sla_first_response || 5;
        if (!slaRes) slaRes = wsRes.rows[0].sla_resolution || 60;
      }
    }
    if (!slaFrt) slaFrt = 5;
    if (!slaRes) slaRes = 60;

    const [totals, byDay, byAgent, sla] = await Promise.all([
      // Totals (summing total session counts per visitor conversation)
      pool.query(
        `SELECT
           COALESCE(SUM(COALESCE(c.session_count, 1)), 0)::int AS total,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.status='resolved'), 0)::int AS resolved,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.first_response_at IS NULL AND (c.status='missed' OR c.missed_at IS NOT NULL)), 0)::int AS missed_pure,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)), 0)::int AS delay_count,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.status='missed' OR c.missed_at IS NOT NULL OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)) OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND c.first_response_at IS NULL AND c.resolved_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.resolved_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5))), 0)::int AS missed,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.status IN ('open','assigned')), 0)::int AS active,
           ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60)::numeric, 1) AS avg_frt_min,
           ROUND(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60)::numeric, 1) AS avg_resolution_min,
           ROUND(AVG(c.rating_score)::numeric, 2) AS avg_rating,
           COUNT(*) FILTER (WHERE c.rating_score IS NOT NULL) AS rated_count
         FROM conversations c
         LEFT JOIN workspaces w ON c.workspace_id = w.id
         ${wsCond.replace("WHERE ", "WHERE ").replace("workspace_id", "c.workspace_id").replace("created_at", "c.created_at")} ${dateFilter.replace("AND created_at", "AND c.created_at")}`,
        params
      ),

      // By day
      pool.query(
        `SELECT
           TO_CHAR(c.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS date,
           COALESCE(SUM(COALESCE(c.session_count, 1)), 0)::int AS total,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.status='resolved'), 0)::int AS resolved,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.status='missed' OR c.missed_at IS NOT NULL OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)) OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND c.first_response_at IS NULL AND c.resolved_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.resolved_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5))), 0)::int AS missed
         FROM conversations c
         LEFT JOIN workspaces w ON c.workspace_id = w.id
         ${wsCond.replace("workspace_id", "c.workspace_id").replace("created_at", "c.created_at")} ${dateFilter.replace("AND created_at", "AND c.created_at")}
         GROUP BY TO_CHAR(c.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')
         ORDER BY date ASC`,
        params
      ),

      // By agent
      pool.query(
        `SELECT
           a.id, a.name, a.avatar_url, a.display_name,
           COALESCE(SUM(COALESCE(c.session_count, 1)), 0)::int AS total_handled,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.status='resolved'), 0)::int AS resolved,
           ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60)::numeric, 1) AS avg_frt_min,
           ROUND(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60)::numeric, 1) AS avg_resolution_min,
           ROUND(AVG(c.rating_score)::numeric, 2) AS avg_rating
         FROM agents a
         LEFT JOIN conversations c ON c.assigned_agent_id = a.id
           ${dateFilter.replace("AND created_at", "AND c.created_at")}
         ${wsCondA} AND a.is_active=TRUE
         GROUP BY a.id, a.name, a.avatar_url, a.display_name
         ORDER BY total_handled DESC`,
        params
      ),

      // SLA compliance (includes Agent FRT <= SLA threshold, Bot self-served resolved chats, and active Bot chats)
      pool.query(
        `SELECT
           COALESCE(SUM(COALESCE(c.session_count, 1)), 0)::int AS total,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (
             WHERE c.status != 'missed' AND c.missed_at IS NULL
               AND (
                 ((c.flow_mode = 'bot' OR c.flow_mode IS NULL) AND c.assigned_agent_id IS NULL)
                 OR (c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 <= COALESCE(w.sla_first_response, $${params.length + 1}))
                 OR (c.first_response_at IS NULL AND c.resolved_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND (c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND EXTRACT(EPOCH FROM (c.resolved_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 <= COALESCE(w.sla_first_response, $${params.length + 1}))
                 OR (c.first_response_at IS NULL AND c.resolved_at IS NULL AND (c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 <= COALESCE(w.sla_first_response, $${params.length + 1}))
               )
           ), 0)::int AS within_frt_sla,
           COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (
             WHERE c.resolved_at IS NOT NULL
               AND (w.sla_resolution_enabled IS NOT TRUE OR EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60 <= COALESCE(w.sla_resolution, $${params.length + 2}))
           ), 0)::int AS within_resolution_sla
         FROM conversations c
         LEFT JOIN workspaces w ON c.workspace_id = w.id
         ${wsCond.replace("workspace_id", "c.workspace_id").replace("created_at", "c.created_at")} ${dateFilter.replace("AND created_at", "AND c.created_at")}`,
        [...params, slaFrt, slaRes]
      ),
    ]);

    res.json({
      period,
      totals: totals.rows[0],
      byDay: byDay.rows,
      byAgent: byAgent.rows,
      sla: sla.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/reports/response-times ────────────────────────
router.get("/response-times", auth, supervisorOrHigher, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const wsId = req.workspaceId;

    let dateFilter = "AND c.created_at >= NOW() - INTERVAL '30 days'";
    const params = [wsId];
    if (date_from && date_to) {
      dateFilter = `AND c.created_at BETWEEN $2 AND $3`;
      params.push(date_from, date_to);
    }

    const { rows } = await pool.query(
      `SELECT
         DATE(c.created_at) AS date,
         ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.first_message_at))/60)::numeric,1) AS avg_frt_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60)::numeric,1) AS avg_resolution_min,
         MIN(EXTRACT(EPOCH FROM (c.first_response_at - c.first_message_at))/60)::integer AS min_frt,
         MAX(EXTRACT(EPOCH FROM (c.first_response_at - c.first_message_at))/60)::integer AS max_frt,
         COUNT(*) AS total
       FROM conversations c
       WHERE c.workspace_id=$1 AND c.first_response_at IS NOT NULL
       ${dateFilter}
       GROUP BY DATE(c.created_at)
       ORDER BY date ASC`,
      params
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/reports/ratings ───────────────────────────────
router.get("/ratings", auth, supervisorOrHigher, async (req, res) => {
  try {
    const { period = "week", workspace_id } = req.query;
    const wsId = workspace_id || req.workspaceId;
    let rateCond = "";
    if (period === "day") {
      rateCond = "rated_at >= DATE_TRUNC('day', NOW())";
    } else if (period === "week") {
      rateCond = "rated_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days'";
    } else if (period === "month") {
      rateCond = "rated_at >= DATE_TRUNC('day', NOW()) - INTERVAL '29 days'";
    } else if (period === "year") {
      rateCond = "rated_at >= DATE_TRUNC('day', NOW()) - INTERVAL '364 days'";
    } else {
      rateCond = "rated_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days'";
    }

    let wsCond = wsId ? "workspace_id = $1 AND" : "";
    const params = wsId ? [wsId] : [];

    const { rows } = await pool.query(
      `SELECT
         rating_score, rating_satisfaction, rating_resolved,
         COUNT(*) AS count
       FROM conversations
       WHERE ${wsCond} rated_at IS NOT NULL AND ${rateCond}
       GROUP BY rating_score, rating_satisfaction, rating_resolved
       ORDER BY rating_score DESC`,
      params
    );

    const summary = await pool.query(
      `SELECT
         ROUND(AVG(rating_score)::numeric, 2) AS avg_score,
         COUNT(*) AS total_rated,
         COUNT(*) FILTER (WHERE rating_satisfaction='yes') AS satisfied,
         COUNT(*) FILTER (WHERE rating_resolved='yes') AS resolved_ok
       FROM conversations
       WHERE ${wsCond} rated_at IS NOT NULL AND ${rateCond}`,
      params
    );

    res.json({ breakdown: rows, summary: summary.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/reports/missed — list missed conversations with pagination ────────
router.get("/missed", auth, supervisorOrHigher, async (req, res) => {
  try {
    const { period = "week", page = 1, limit = 20, workspace_id, date_from, date_to } = req.query;
    const wsId = workspace_id || req.workspaceId;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let timeCondition = "";
    const params = [];
    let pi = 1;

    if (wsId) {
      params.push(wsId);
      timeCondition = `c.workspace_id = $${pi++} AND `;
    }

    if (date_from && date_to) {
      params.push(date_from, date_to);
      timeCondition += `c.created_at BETWEEN $${pi++} AND $${pi++} AND `;
    } else {
      if (period === "day") {
        timeCondition += `c.created_at >= DATE_TRUNC('day', NOW()) AND `;
      } else if (period === "week") {
        timeCondition += `c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days' AND `;
      } else if (period === "month") {
        timeCondition += `c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '29 days' AND `;
      } else if (period === "year") {
        timeCondition += `c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '364 days' AND `;
      } else {
        timeCondition += `c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days' AND `;
      }
    }

    const whereClause = `WHERE ${timeCondition} (c.status='missed' OR c.missed_at IS NOT NULL OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)) OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND c.first_response_at IS NULL AND c.resolved_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.resolved_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)))`;

    // 1. Total Count Query
    const countQuery = `
      SELECT COUNT(*)::integer AS total 
      FROM conversations c
      LEFT JOIN workspaces w ON c.workspace_id = w.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || countResult.rows[0]?.count || 0);

    // 2. Paginated Data Query
    const dataParams = [...params, limitNum, offset];
    const limitParamIdx = `$${pi++}`;
    const offsetParamIdx = `$${pi++}`;

    const dataQuery = `
      SELECT
         c.id, c.visitor_name, c.visitor_id, c.status, c.missed_at,
         c.created_at, c.first_message_at, c.resolved_at,
         CASE WHEN (c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)) OR c.status = 'missed' THEN true ELSE false END AS sla_first_response_exceeded,
         CASE WHEN w.sla_resolution_enabled = TRUE AND c.resolved_at IS NOT NULL AND c.first_message_at IS NOT NULL AND EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60 > COALESCE(w.sla_resolution, 60) THEN true ELSE false END AS sla_resolution_exceeded,
         (SELECT text FROM messages WHERE conversation_id=c.id AND sender_type='visitor' ORDER BY created_at ASC LIMIT 1) AS first_message,
         (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id) AS message_count,
         a.name AS agent_name, a.display_name AS agent_display_name,
         w.brand_name, w.brand_color, w.name AS workspace_name
       FROM conversations c
       LEFT JOIN agents a ON c.assigned_agent_id = a.id
       LEFT JOIN workspaces w ON c.workspace_id = w.id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ${limitParamIdx} OFFSET ${offsetParamIdx}
    `;

    const { rows } = await pool.query(dataQuery, dataParams);

    res.json({
      missed: rows,
      conversations: rows,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/reports/export — download Excel report with custom date range ──
router.get("/export", auth, supervisorOrHigher, async (req, res) => {
  try {
    const XLSX = require("xlsx");
    const { period = "week", workspace_id, date_from, date_to, export_type = "all" } = req.query;
    const wsId = workspace_id || req.workspaceId;

    let exportWsCond = wsId ? "WHERE c.workspace_id = $1 AND" : "WHERE";
    let exportAgentWsCond = wsId ? "WHERE a.workspace_id = $1 AND" : "WHERE";
    const exportParams = wsId ? [wsId] : [];

    let dateCond = "";
    if (date_from && date_to) {
      const pIdx1 = exportParams.length + 1;
      const pIdx2 = exportParams.length + 2;
      exportParams.push(date_from, date_to);
      dateCond = `c.created_at BETWEEN $${pIdx1} AND $${pIdx2}`;
    } else {
      if (period === "day") {
        dateCond = `c.created_at >= DATE_TRUNC('day', NOW())`;
      } else if (period === "week") {
        dateCond = `c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days'`;
      } else if (period === "month") {
        dateCond = `c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '29 days'`;
      } else if (period === "year") {
        dateCond = `c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '364 days'`;
      } else {
        dateCond = `c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days'`;
      }
    }

    const [convRows, agentRows, missedRows] = await Promise.all([
      pool.query(
        `SELECT
           c.id, c.visitor_name, c.visitor_id, c.status,
           c.created_at, c.first_message_at, c.first_response_at, c.resolved_at,
           ROUND(EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60::numeric, 1) AS frt_min,
           ROUND(EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60::numeric, 1) AS resolution_min,
           c.rating_score, c.rating_satisfaction, c.rating_resolved, c.rating_comment,
           CASE WHEN (c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)) OR c.status = 'missed' THEN true ELSE false END AS sla_first_response_exceeded,
           CASE WHEN w.sla_resolution_enabled = TRUE AND c.resolved_at IS NOT NULL AND c.first_message_at IS NOT NULL AND EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60 > COALESCE(w.sla_resolution, 60) THEN true ELSE false END AS sla_resolution_exceeded,
           c.visitor_ip, c.visitor_country, c.visitor_city, c.visitor_page,
           a.name AS agent_name, w.brand_name
         FROM conversations c
         LEFT JOIN agents a ON c.assigned_agent_id = a.id
         LEFT JOIN workspaces w ON c.workspace_id = w.id
         ${exportWsCond} ${dateCond}
         ORDER BY c.created_at DESC`,
        exportParams
      ),
      pool.query(
        `SELECT
           a.name, a.display_name,
           COUNT(c.id) AS total_handled,
           COUNT(c.id) FILTER (WHERE c.status='resolved') AS resolved,
           COUNT(c.id) FILTER (WHERE c.status='missed') AS missed,
           ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60)::numeric, 1) AS avg_frt_min,
           ROUND(AVG(c.rating_score)::numeric, 2) AS avg_rating
         FROM agents a
         LEFT JOIN conversations c ON c.assigned_agent_id=a.id AND ${dateCond}
         ${exportAgentWsCond} a.is_active=TRUE
         GROUP BY a.id, a.name, a.display_name ORDER BY total_handled DESC`,
        exportParams
      ),
      pool.query(
        `SELECT c.id, c.visitor_name, c.visitor_id, c.created_at, c.status, c.missed_at,
           CASE WHEN (c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)) OR c.status = 'missed' OR c.missed_at IS NOT NULL THEN true ELSE false END AS sla_first_response_exceeded,
           CASE WHEN w.sla_resolution_enabled = TRUE AND c.resolved_at IS NOT NULL AND c.first_message_at IS NOT NULL AND EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60 > COALESCE(w.sla_resolution, 60) THEN true ELSE false END AS sla_resolution_exceeded,
           (SELECT text FROM messages WHERE conversation_id=c.id ORDER BY created_at ASC LIMIT 1) AS first_message,
           w.brand_name
         FROM conversations c
         LEFT JOIN workspaces w ON c.workspace_id = w.id
         ${exportWsCond} ${dateCond}
           AND (c.status='missed' OR c.missed_at IS NOT NULL OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND c.first_response_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)) OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) AND c.first_response_at IS NULL AND c.resolved_at IS NOT NULL AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL AND EXTRACT(EPOCH FROM (c.resolved_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5)))
         ORDER BY c.created_at DESC`,
        exportParams
      ),
    ]);

    const wb = XLSX.utils.book_new();

    if (export_type === "all" || export_type === "overview") {
      const convData = convRows.rows.map(c => ({
        "ID Percakapan": c.id,
        "Brand": c.brand_name || "-",
        "Nama Visitor": c.visitor_name || c.visitor_id,
        "Status": c.status,
        "Agen": c.agent_name || "-",
        "Dibuat": c.created_at ? new Date(c.created_at).toLocaleString("id-ID") : "",
        "Pesan Pertama": c.first_message_at ? new Date(c.first_message_at).toLocaleString("id-ID") : "",
        "Respons Pertama": c.first_response_at ? new Date(c.first_response_at).toLocaleString("id-ID") : "",
        "Diselesaikan": c.resolved_at ? new Date(c.resolved_at).toLocaleString("id-ID") : "",
        "FRT (menit)": c.frt_min || "",
        "Resolusi (menit)": c.resolution_min || "",
        "Rating": c.rating_score || "-",
        "Negara": c.visitor_country || "-",
        "Kota": c.visitor_city || "-",
      }));
      const ws1 = XLSX.utils.json_to_sheet(convData);
      XLSX.utils.book_append_sheet(wb, ws1, "Semua Percakapan");
    }

    if (export_type === "all" || export_type === "agents") {
      const agentData = agentRows.rows.map(a => ({
        "Nama Agen": a.display_name || a.name,
        "Total Ditangani": parseInt(a.total_handled) || 0,
        "Diselesaikan": parseInt(a.resolved) || 0,
        "Terlewat (Missed)": parseInt(a.missed) || 0,
        "Rata-rata FRT (menit)": a.avg_frt_min || "-",
        "Rata-rata Rating": a.avg_rating || "-",
      }));
      const ws2 = XLSX.utils.json_to_sheet(agentData);
      XLSX.utils.book_append_sheet(wb, ws2, "Performa Agen");
    }

    if (export_type === "all" || export_type === "missed") {
      const missedData = missedRows.rows.map(m => ({
        "ID Percakapan": m.id,
        "Brand": m.brand_name || "-",
        "Nama Visitor": m.visitor_name || m.visitor_id,
        "Pesan Pertama": m.first_message || "-",
        "Dibuat": m.created_at ? new Date(m.created_at).toLocaleString("id-ID") : "",
        "Terlewat Pada": m.missed_at ? new Date(m.missed_at).toLocaleString("id-ID") : "-",
        "SLA FRT Terlewati": m.sla_first_response_exceeded ? "Ya" : "Tidak",
      }));
      const ws3 = XLSX.utils.json_to_sheet(missedData);
      XLSX.utils.book_append_sheet(wb, ws3, "Missed Chat & Delay");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `laporan-vlivechat-${export_type}-${date_from || period}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/reports/brands — Superadmin Multi-Brand Breakdown ─────────
router.get("/brands", auth, async (req, res) => {
  try {
    if (req.agentRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    const { period = "week", date_from, date_to } = req.query;
    let dateFilterC = "";
    const params = [];
    let pi = 1;

    if (date_from && date_to) {
      dateFilterC = `AND c.created_at BETWEEN $${pi++} AND $${pi++}`;
      params.push(date_from, date_to);
    } else {
      if (period === "day") {
        dateFilterC = `AND c.created_at >= DATE_TRUNC('day', NOW())`;
      } else if (period === "week") {
        dateFilterC = `AND c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days'`;
      } else if (period === "month") {
        dateFilterC = `AND c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '29 days'`;
      } else if (period === "year") {
        dateFilterC = `AND c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '364 days'`;
      } else {
        dateFilterC = `AND c.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 days'`;
      }
    }

    const { rows } = await pool.query(
      `SELECT
         w.id AS workspace_id,
         w.name AS workspace_name,
         w.code AS workspace_code,
         w.brand_name,
         w.brand_color,
         COUNT(c.id) AS total_chats,
         COUNT(c.id) FILTER (WHERE c.status='resolved') AS resolved_chats,
         COUNT(c.id) FILTER (
           WHERE c.status='missed' OR c.missed_at IS NOT NULL
              OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) 
                  AND c.first_response_at IS NOT NULL 
                  AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL 
                  AND EXTRACT(EPOCH FROM (c.first_response_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5))
              OR ((c.flow_mode = 'agent' OR c.assigned_agent_id IS NOT NULL) 
                  AND c.first_response_at IS NULL 
                  AND c.resolved_at IS NOT NULL 
                  AND COALESCE(c.cs_handoff_at, c.first_message_at) IS NOT NULL 
                  AND EXTRACT(EPOCH FROM (c.resolved_at - COALESCE(c.cs_handoff_at, c.first_message_at)))/60 > COALESCE(w.sla_first_response, 5))
         ) AS missed_chats,
         COUNT(c.id) FILTER (WHERE c.status IN ('open','assigned')) AS active_chats,
         (SELECT COUNT(*) FROM agents WHERE workspace_id=w.id AND is_active=TRUE) AS total_agents,
         (SELECT COUNT(*) FROM agents WHERE workspace_id=w.id AND is_online=TRUE AND is_active=TRUE) AS online_agents,
         ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.first_message_at))/60)::numeric, 1) AS avg_frt_min
       FROM workspaces w
       LEFT JOIN conversations c ON c.workspace_id = w.id ${dateFilterC}
       GROUP BY w.id, w.name, w.code, w.brand_name, w.brand_color
       ORDER BY total_chats DESC, w.name ASC`,
      params
    );

    res.json({ brands: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

