const express = require("express");
const { pool } = require("../db");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /api/v1/home/stats
router.get("/stats", auth, async (req, res) => {
  try {
    const { mode = "all", workspace_id } = req.query;

    // Determine target workspace:
    // If superadmin: workspace_id query param if present (or null for global / all brands)
    // If non-superadmin: strictly forced to req.workspaceId
    let targetWs = null;
    if (req.agentRole === "superadmin") {
      targetWs = workspace_id && workspace_id !== "all" ? workspace_id : null;
    } else {
      targetWs = req.workspaceId;
    }

    let wsWhere = targetWs ? "c.workspace_id = $1" : "1=1";
    let wsParams = targetWs ? [targetWs] : [];

    // Mode 'my' filter condition for conversations
    let agentCond = "";
    let myParams = [...wsParams];
    if (mode === "my") {
      let pi = myParams.length + 1;
      agentCond = `AND c.assigned_agent_id = $${pi}`;
      myParams.push(req.agentId);
    }

    // 1. Ongoing chats (open or assigned)
    let ongoingQuery = `SELECT COUNT(*) FROM conversations c WHERE ${wsWhere} AND c.status IN ('open','assigned') ${agentCond}`;
    const { rows: ongoingRows } = await pool.query(ongoingQuery, myParams);
    const ongoingChats = parseInt(ongoingRows[0]?.count || 0, 10);

    // 2. Customers Online (100% Real-time connected sockets from /livechat namespace)
    const io = req.app.get("io");
    const livechatNsp = io ? io.of("/livechat") : null;
    const connectedVisitors = new Set();

    if (livechatNsp && livechatNsp.sockets) {
      for (const [_, s] of livechatNsp.sockets) {
        if (s.visitorId && s.workspaceId) {
          if (!targetWs || s.workspaceId === targetWs) {
            connectedVisitors.add(s.visitorId);
          }
        }
      }
    }
    const customersOnline = connectedVisitors.size;

    // 3. Logged in Agents & Total Agents (Realtime socket connection + DB fallback)
    const dashboardNsp = io ? io.of("/dashboard") : null;
    const connectedOnlineAgents = new Set();

    if (dashboardNsp && dashboardNsp.sockets) {
      for (const [_, s] of dashboardNsp.sockets) {
        if (s.agentId) {
          if (!targetWs || s.workspaceId === targetWs) {
            connectedOnlineAgents.add(s.agentId);
          }
        }
      }
    }

    const agentWsWhere = targetWs ? "workspace_id = $1 AND is_active = TRUE" : "is_active = TRUE";
    const { rows: agentRows } = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE is_online = TRUE) AS online_count,
         COUNT(*) AS total_count
       FROM agents WHERE ${agentWsWhere}`,
      wsParams
    );
    const dbOnlineCount = parseInt(agentRows[0]?.online_count || 0, 10);
    const loggedInAgents = Math.max(connectedOnlineAgents.size, dbOnlineCount);
    const totalAgents = parseInt(agentRows[0]?.total_count || 0, 10);

    // 4. Queued Visitors (open conversations without assigned agent)
    const { rows: queueRows } = await pool.query(
      `SELECT COUNT(*) FROM conversations WHERE ${targetWs ? "workspace_id = $1 AND" : ""} status = 'open' AND assigned_agent_id IS NULL`,
      wsParams
    );
    const queuedVisitors = parseInt(queueRows[0]?.count || 0, 10);

    // 5. Real Chat Satisfaction Rate (average rating_score)
    const { rows: ratingRows } = await pool.query(
      `SELECT AVG(c.rating_score) AS avg_score, COUNT(c.rating_score) AS total_ratings FROM conversations c WHERE ${wsWhere} AND c.rating_score > 0 ${agentCond}`,
      myParams
    );
    const totalRatings = parseInt(ratingRows[0]?.total_ratings || 0, 10);
    const avgScore = ratingRows[0]?.avg_score ? parseFloat(ratingRows[0].avg_score) : null;
    const satisfactionRate = (totalRatings > 0 && avgScore !== null) ? Math.round((avgScore / 5) * 100) : 0;

    // 6. Last 7 Days Chart Data (Current 7 days)
    let chartWsCond = targetWs ? "AND c.workspace_id = $1" : "";
    let chartParams = [...wsParams];
    if (mode === "my") {
      let pi = chartParams.length + 1;
      chartWsCond += ` AND c.assigned_agent_id = $${pi}`;
      chartParams.push(req.agentId);
    }

    const { rows: dailyRows } = await pool.query(
      `SELECT 
         TO_CHAR(d.day, 'Dy') AS day_name,
         TO_CHAR(d.day, 'YYYY-MM-DD') AS date_str,
         COALESCE(COUNT(c.id), 0) AS chat_count
       FROM GENERATE_SERIES(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d(day)
       LEFT JOIN conversations c ON DATE(c.created_at) = DATE(d.day) ${chartWsCond}
       GROUP BY d.day
       ORDER BY d.day ASC`,
      chartParams
    );

    const chartData = dailyRows.map(r => ({
      day: r.day_name,
      date: r.date_str,
      count: parseInt(r.chat_count || 0, 10),
    }));

    const total7Days = chartData.reduce((acc, d) => acc + d.count, 0);

    // 7. Previous 7 Days Total (for REAL comparison without gimmick)
    const { rows: prev7Rows } = await pool.query(
      `SELECT COUNT(c.id) AS prev_count
       FROM conversations c
       WHERE c.created_at >= CURRENT_DATE - INTERVAL '13 days'
         AND c.created_at < CURRENT_DATE - INTERVAL '6 days'
         ${chartWsCond}`,
      chartParams
    );
    const totalPrev7Days = parseInt(prev7Rows[0]?.prev_count || 0, 10);
    const diff7Days = total7Days - totalPrev7Days;

    res.json({
      greetingName: req.workspaceId ? "Team" : "Admin",
      customersOnline,
      ongoingChats,
      loggedInAgents,
      totalAgents,
      queuedVisitors,
      satisfactionRate,
      totalRatings,
      total7Days,
      totalPrev7Days,
      diff7Days,
      chartData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
