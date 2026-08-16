const express = require("express");
const { pool } = require("../db");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /api/v1/conversations
router.get("/", auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 30, search, tag, agent_id, visitor_id, date_from, date_to, sort = "newest" } = req.query;
    const offset = (page - 1) * limit;
    const targetWs = req.query.workspace_id || (req.agentRole === "superadmin" ? null : req.workspaceId);

    let where = [];
    const params = [];
    let pi = 1;

    if (targetWs) {
      where.push(`c.workspace_id = $${pi++}`);
      params.push(targetWs);
    }

    if (status) {
      if (status === "archived") {
        where.push(`c.status IN ('resolved','missed')`);
      } else {
        where.push(`c.status = $${pi++}`);
        params.push(status);
      }
    }
    if (visitor_id) {
      where.push(`(c.visitor_id = $${pi} OR c.visitor_name = $${pi} OR c.visitor_id ILIKE $${pi} OR c.visitor_name ILIKE $${pi})`);
      params.push(visitor_id);
      pi++;
    }
    if (search) {
      where.push(`(c.visitor_name ILIKE $${pi} OR c.visitor_id ILIKE $${pi} OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.text ILIKE $${pi}))`);
      params.push(`%${search}%`);
      pi++;
    }
    if (agent_id) {
      where.push(`c.assigned_agent_id = $${pi++}`);
      params.push(agent_id);
    }
    if (tag) {
      where.push(`$${pi++} = ANY(c.tags)`);
      params.push(tag);
    }
    if (date_from) {
      where.push(`c.created_at >= $${pi++}`);
      params.push(date_from);
    }
    if (date_to) {
      where.push(`c.created_at <= $${pi++}`);
      params.push(date_to);
    }

    const whereStr = where.length > 0 ? where.join(" AND ") : "1=1";
    const sortDir = sort === "oldest" ? "ASC" : "DESC";

    let rows, countRows;
    const isArchived = status === "archived";

    if (visitor_id || isArchived) {
      // Return ALL individual session cards (no DISTINCT ON grouping) for archives or specific visitor
      const resQuery = await pool.query(
        `SELECT c.id, c.workspace_id, c.visitor_id, c.visitor_name, c.visitor_email, c.visitor_page, c.visitor_ref,
                c.visitor_tz, c.visitor_lang, c.visitor_screen, c.visitor_ip, c.visitor_country, c.visitor_city,
                c.visitor_country_code, c.visitor_lat, c.visitor_lon, c.visitor_isp, c.visitor_ua, c.prechat_data,
                c.assigned_agent_id, c.status, c.flow_data, c.flow_log, c.flow_mode, c.tags, c.first_message_at,
                c.first_response_at, c.resolved_at, c.missed_at, c.rating_satisfaction, c.rating_resolved,
                c.rating_score, c.rating_comment, c.rated_at, c.source, c.notes, c.is_blocked, c.previous_names,
                c.created_at, c.updated_at,
           w.name AS workspace_name, w.brand_name, w.brand_color, w.chatbot_enabled,
           a.name AS agent_name, a.avatar_url AS agent_avatar, a.display_name AS agent_display_name,
           (SELECT text FROM messages WHERE conversation_id=c.id AND is_internal=FALSE ORDER BY created_at DESC LIMIT 1) AS last_message,
           (SELECT created_at FROM messages WHERE conversation_id=c.id AND is_internal=FALSE ORDER BY created_at DESC LIMIT 1) AS last_message_at,
           (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id AND sender_type='visitor' AND read_at IS NULL) AS unread_count
         FROM conversations c
         LEFT JOIN workspaces w ON c.workspace_id = w.id
         LEFT JOIN agents a ON c.assigned_agent_id = a.id
         WHERE ${whereStr}
         ORDER BY COALESCE(c.resolved_at, c.created_at) ${sortDir}, c.id ${sortDir}
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, parseInt(limit), parseInt(offset)]
      );
      rows = resQuery.rows;

      const cQuery = await pool.query(`SELECT COUNT(*) FROM conversations c WHERE ${whereStr}`, params);
      countRows = cQuery.rows;
    } else {
      // Default: Distinct per visitor for normal active chats list
      const resQuery = await pool.query(
        `SELECT * FROM (
           SELECT DISTINCT ON (c.visitor_id)
             c.id, c.workspace_id, c.visitor_id, c.visitor_name, c.visitor_email, c.visitor_page, c.visitor_ref,
             c.visitor_tz, c.visitor_lang, c.visitor_screen, c.visitor_ip, c.visitor_country, c.visitor_city,
             c.visitor_country_code, c.visitor_lat, c.visitor_lon, c.visitor_isp, c.visitor_ua, c.prechat_data,
             c.assigned_agent_id, c.status, c.flow_data, c.flow_log, c.flow_mode, c.tags, c.first_message_at,
             c.first_response_at, c.resolved_at, c.missed_at, c.rating_satisfaction, c.rating_resolved,
             c.rating_score, c.rating_comment, c.rated_at, c.source, c.notes, c.is_blocked, c.previous_names,
             c.created_at, c.updated_at,
             w.name AS workspace_name, w.brand_name, w.brand_color, w.chatbot_enabled,
             a.name AS agent_name, a.avatar_url AS agent_avatar, a.display_name AS agent_display_name,
             (SELECT text FROM messages WHERE conversation_id=c.id AND is_internal=FALSE ORDER BY created_at DESC LIMIT 1) AS last_message,
             (SELECT created_at FROM messages WHERE conversation_id=c.id AND is_internal=FALSE ORDER BY created_at DESC LIMIT 1) AS last_message_at,
             (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id AND sender_type='visitor' AND read_at IS NULL) AS unread_count
           FROM conversations c
           LEFT JOIN workspaces w ON c.workspace_id = w.id
           LEFT JOIN agents a ON c.assigned_agent_id = a.id
           WHERE ${whereStr}
           ORDER BY c.visitor_id, c.updated_at ${sortDir}
         ) sub
         ORDER BY COALESCE(sub.last_message_at, sub.updated_at) ${sortDir}
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, parseInt(limit), parseInt(offset)]
      );
      rows = resQuery.rows;

      const cQuery = await pool.query(`SELECT COUNT(DISTINCT c.visitor_id) FROM conversations c WHERE ${whereStr}`, params);
      countRows = cQuery.rows;
    }

    rows = rows.map(r => ({
      ...r,
      flow_mode: r.chatbot_enabled === false ? "agent" : r.flow_mode
    }));

    const totalCount = parseInt(countRows[0]?.count || 0);
    const parsedOffset = parseInt(offset);
    const parsedLimit = parseInt(limit);

    res.json({
      conversations: rows,
      meta: {
        total: totalCount,
        page: Math.floor(parsedOffset / parsedLimit) + 1,
        limit: parsedLimit,
        totalPages: Math.ceil(totalCount / parsedLimit),
        hasMore: (parsedOffset + rows.length) < totalCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/conversations/blocked — get all blocked visitors (distinct by visitor_id)
router.get("/blocked", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (c.visitor_id) c.id, c.visitor_id, c.visitor_name, c.prechat_data, c.visitor_ip AS ip_address, CONCAT(COALESCE(c.visitor_city, 'Localhost'), ', ', COALESCE(c.visitor_country, 'ID')) AS location, c.is_blocked, c.updated_at, c.created_at,
         (SELECT text FROM messages WHERE conversation_id=c.id AND is_internal=FALSE ORDER BY created_at DESC LIMIT 1) AS last_message
       FROM conversations c
       WHERE c.workspace_id=$1 AND c.is_blocked=TRUE
       ORDER BY c.visitor_id, c.updated_at DESC`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/conversations/visitor/:visitorId/history — get previous conversations for visitor
router.get("/visitor/:visitorId/history", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.visitor_name, c.status, c.created_at, c.resolved_at,
         (SELECT text FROM messages WHERE conversation_id=c.id AND is_internal=FALSE ORDER BY created_at DESC LIMIT 1) AS last_message,
         (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id) AS message_count,
         a.name AS agent_name, a.display_name AS agent_display_name
       FROM conversations c
       LEFT JOIN agents a ON c.assigned_agent_id = a.id
       WHERE c.visitor_id=$1 AND c.workspace_id=$2
       ORDER BY c.created_at DESC`,
      [req.params.visitorId, req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/conversations/archives/count — get total archived chats count
router.get("/archives/count", auth, async (req, res) => {
  try {
    const { visitor_id, search } = req.query;
    const targetWs = req.query.workspace_id || (req.agentRole === "superadmin" ? null : req.workspaceId);
    
    let where = ["c.status IN ('resolved','missed')"];
    const params = [];
    let pi = 1;

    if (targetWs) {
      where.push(`c.workspace_id = $${pi++}`);
      params.push(targetWs);
    }
    if (visitor_id) {
      where.push(`(c.visitor_id = $${pi} OR c.visitor_name = $${pi} OR c.visitor_id ILIKE $${pi} OR c.visitor_name ILIKE $${pi})`);
      params.push(visitor_id);
      pi++;
    }
    if (search) {
      where.push(`(c.visitor_name ILIKE $${pi} OR c.visitor_id ILIKE $${pi} OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.text ILIKE $${pi}))`);
      params.push(`%${search}%`);
      pi++;
    }

    const whereStr = where.join(" AND ");
    const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM conversations c WHERE ${whereStr}`, params);
    res.json({ total: parseInt(rows[0]?.count || 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/conversations/:id
router.get("/:id", auth, async (req, res) => {
  try {
    const isSuperadmin = req.agentRole === "superadmin";
    const wsCond = isSuperadmin ? "" : "AND c.workspace_id = $2";
    const params = isSuperadmin ? [req.params.id] : [req.params.id, req.workspaceId];

    const { rows } = await pool.query(
      `SELECT c.*, a.name AS agent_name, a.avatar_url AS agent_avatar, a.display_name AS agent_display_name,
              w.name AS workspace_name, w.brand_name, w.brand_color, w.chatbot_enabled
       FROM conversations c
       LEFT JOIN agents a ON c.assigned_agent_id = a.id
       LEFT JOIN workspaces w ON c.workspace_id = w.id
       WHERE c.id=$1 ${wsCond}`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });
    const conv = rows[0];

    if (conv.chatbot_enabled === false) {
      conv.flow_mode = "agent";
    }

    // Fetch previous names (aliases) used by this visitor
    const colNames = Array.isArray(conv.previous_names) ? conv.previous_names : [];
    const { rows: aliasRows } = await pool.query(
      `SELECT DISTINCT visitor_name FROM conversations
       WHERE visitor_id = $1 AND workspace_id = $2
         AND visitor_name IS NOT NULL AND visitor_name != ''
         AND visitor_name != $3`,
      [conv.visitor_id, conv.workspace_id, conv.visitor_name || '']
    );
    const dbNames = aliasRows.map(r => r.visitor_name);
    conv.previous_names = Array.from(new Set([...colNames, ...dbNames])).filter(n => n && n !== conv.visitor_name);

    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/conversations/:id/messages
router.get("/:id/messages", auth, async (req, res) => {
  try {
    const showInternal = ["superadmin", "admin", "supervisor"].includes(req.agentRole);

    const { rows } = await pool.query(
      `SELECT m.*, a.name AS sender_agent_name, a.avatar_url AS sender_avatar, a.display_name AS sender_display_name
       FROM messages m
       LEFT JOIN agents a ON m.sender_id = a.id
       WHERE m.conversation_id=$1 ${showInternal ? "" : "AND m.is_internal=FALSE"}
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/assign
router.patch("/:id/assign", auth, async (req, res) => {
  try {
    const { agentId } = req.body;
    const assignTo = agentId || req.agentId;
    const isSuperadmin = req.agentRole === "superadmin";
    const wsCond = isSuperadmin ? "" : "AND workspace_id=$3";
    const params = isSuperadmin
      ? [assignTo, req.params.id]
      : [assignTo, req.params.id, req.workspaceId];

    const { rows } = await pool.query(
      `UPDATE conversations SET assigned_agent_id=$1, status='assigned', flow_mode='agent', cs_handoff_at=COALESCE(cs_handoff_at, NOW()), updated_at=NOW()
       WHERE id=$2 ${wsCond} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });

    const targetWs = rows[0].workspace_id;
    const io = req.app.get("io");
    if (io) {
      io.of("/dashboard").to(`workspace:${targetWs}`).emit("conversation:assigned", {
        conversationId: req.params.id,
        agentId: assignTo,
      });
      io.of("/dashboard").to("superadmin").emit("conversation:assigned", {
        conversationId: req.params.id,
        agentId: assignTo,
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/resolve
router.patch("/:id/resolve", auth, async (req, res) => {
  try {
    const isSuperadmin = req.agentRole === "superadmin";
    const wsCond = isSuperadmin ? "" : "AND workspace_id = $2";
    const params = isSuperadmin ? [req.params.id] : [req.params.id, req.workspaceId];

    const { rows } = await pool.query(
      `UPDATE conversations SET status='resolved', resolved_at=NOW(), updated_at=NOW() WHERE id=$1 ${wsCond} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "Percakapan tidak ditemukan" });

    const io = req.app.get("io");
    if (io) {
      const targetWs = rows[0].workspace_id;
      io.of("/dashboard").to(`workspace:${targetWs}`).emit("conversation:resolved", { conversationId: req.params.id, resolvedBy: req.agentId });
      io.of("/dashboard").to("superadmin").emit("conversation:resolved", { conversationId: req.params.id, resolvedBy: req.agentId });
      io.of("/livechat").to(`conv:${req.params.id}`).emit("chat:resolved", { message: "Percakapan telah diakhiri oleh CS." });
      if (rows[0].visitor_id) {
        io.of("/livechat").to(`visitor:${rows[0].visitor_id}`).emit("chat:resolved", { message: "Percakapan telah diakhiri oleh CS." });
      }
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/takeover (first definition - bot handoff)
router.patch("/:id/takeover", auth, async (req, res) => {
  try {
    const isSuperadmin = req.agentRole === "superadmin";
    const wsCond = isSuperadmin ? "" : "AND workspace_id=$3";
    const params = isSuperadmin
      ? [req.agentId, req.params.id]
      : [req.agentId, req.params.id, req.workspaceId];

    const { rows } = await pool.query(
      `UPDATE conversations SET
         assigned_agent_id=$1,
         status='assigned',
         flow_mode='agent',
         cs_handoff_at=COALESCE(cs_handoff_at,NOW()),
         first_response_at=COALESCE(first_response_at,NOW()),
         updated_at=NOW()
       WHERE id=$2 ${wsCond} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });

    const targetWs = rows[0].workspace_id;
    const io = req.app.get("io");
    if (io) {
      const { rows: agentRows } = await pool.query(
        "SELECT display_name, name FROM agents WHERE id=$1",
        [req.agentId]
      );
      const agentName = agentRows[0]?.display_name || agentRows[0]?.name || "Customer Service";

      io.of("/dashboard").to(`workspace:${targetWs}`).emit("conversation:update", {
        conversationId: req.params.id,
        status: "assigned",
        assigned_agent_id: req.agentId,
        flow_mode: "agent",
      });
      io.of("/dashboard").to(`workspace:${targetWs}`).emit("conversation:assigned", {
        conversationId: req.params.id,
        agentId: req.agentId,
      });
      io.of("/dashboard").to("superadmin").emit("conversation:update", {
        conversationId: req.params.id,
        status: "assigned",
        assigned_agent_id: req.agentId,
        flow_mode: "agent",
      });
      io.of("/livechat").to(`conv:${req.params.id}`).emit("conversation:flow_update", {
        conversationId: req.params.id,
        mode: "agent",
      });
      io.of("/livechat").to(`conv:${req.params.id}`).emit("chat:taken_over", {
        agentName: agentName,
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/resolve", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE conversations SET status='resolved', resolved_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND workspace_id=$2 RETURNING *`,
      [req.params.id, req.workspaceId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });

    // Clear flow state & visitor conversation mapping in Redis
    try {
      const { delFlowState, delVisitorConversation } = require("../redis");
      if (rows[0].visitor_id) {
        await delFlowState(rows[0].visitor_id);
        await delVisitorConversation(rows[0].visitor_id);
      }
    } catch { }

    // Insert system audit log for Chat History
    try {
      const { rows: agentRows } = await pool.query("SELECT name, display_name, role FROM agents WHERE id=$1", [req.agentId]);
      const agentName = agentRows[0]?.display_name || agentRows[0]?.name || "CS";
      const roleLabel = (req.agentRole === "admin" || req.agentRole === "superadmin" || agentRows[0]?.role === "admin") ? "Admin" : "CS";
      const sysMsgText = `🔒 Sesi diakhiri oleh ${roleLabel} (${agentName})`;
      
      const { rows: existingSys } = await pool.query(
        "SELECT id FROM messages WHERE conversation_id=$1 AND sender_type='system' AND text LIKE '🔒 Sesi diakhiri oleh%'",
        [req.params.id]
      );
      if (existingSys.length === 0) {
        const { rows: msgRows } = await pool.query(
          `INSERT INTO messages (conversation_id, sender_type, text, is_internal) VALUES ($1, 'system', $2, FALSE) RETURNING *`,
          [req.params.id, sysMsgText]
        );
        const io = req.app.get("io");
        if (io && msgRows[0]) {
          io.of("/dashboard").to(`conv:${req.params.id}`).emit("agent:message", {
            conversationId: req.params.id, message: msgRows[0],
          });
        }
      }
    } catch (e) { }

    const io = req.app.get("io");
    if (io) {
      io.of("/livechat").to(`conv:${req.params.id}`).emit("conversation:resolved", {
        conversationId: req.params.id,
        message: "Sesi percakapan telah diakhiri oleh CS."
      });
      io.of("/livechat").to(`conv:${req.params.id}`).emit("chat:resolved", {
        message: "Sesi percakapan telah diakhiri oleh CS."
      });
      io.of("/dashboard").to(`workspace:${req.workspaceId}`).emit("conversation:resolved", {
        conversationId: req.params.id,
      });
      io.of("/dashboard").to(`workspace:${req.workspaceId}`).emit("conversation:update", {
        conversationId: req.params.id,
        status: "resolved",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/takeover (second definition - widget handoff)
router.patch("/:id/takeover", auth, async (req, res) => {
  try {
    const { rows: agentRows } = await pool.query(
      "SELECT id, name, display_name, avatar_url FROM agents WHERE id=$1",
      [req.agentId]
    );
    const agent = agentRows[0];
    const isSuperadmin = req.agentRole === "superadmin";
    const wsCond = isSuperadmin ? "" : "AND workspace_id=$3";
    const params = isSuperadmin
      ? [req.agentId, req.params.id]
      : [req.agentId, req.params.id, req.workspaceId];

    const { rows } = await pool.query(
      `UPDATE conversations SET
         assigned_agent_id=$1, status='assigned', flow_mode='agent', cs_handoff_at=COALESCE(cs_handoff_at,NOW()), updated_at=NOW()
       WHERE id=$2 ${wsCond} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });

    const targetWs = rows[0].workspace_id;
    const io = req.app.get("io");
    if (io) {
      // Broadcast takeover to visitor on /livechat namespace
      io.of("/livechat").to(`conv:${req.params.id}`).emit("chat:taken_over", {
        agentName: agent?.display_name || agent?.name || "Customer Service",
        agentAvatar: agent?.avatar_url,
      });
      io.of("/livechat").to(`conv:${req.params.id}`).emit("conversation:flow_update", {
        conversationId: req.params.id, mode: "agent",
      });
      // Broadcast to dashboard
      io.of("/dashboard").to(`workspace:${targetWs}`).emit("conversation:flow_update", {
        conversationId: req.params.id, mode: "agent",
      });
      io.of("/dashboard").to(`workspace:${targetWs}`).emit("conversation:update", {
        conversationId: req.params.id, status: "assigned", assigned_agent_id: req.agentId, flow_mode: "agent",
      });
      io.of("/dashboard").to("superadmin").emit("conversation:update", {
        conversationId: req.params.id, status: "assigned", assigned_agent_id: req.agentId, flow_mode: "agent",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/block
router.patch("/:id/block", auth, async (req, res) => {
  try {
    const { isBlocked } = req.body;

    // First get target conversation's visitor_id and workspace_id
    const { rows: targetConv } = await pool.query(
      "SELECT visitor_id, workspace_id FROM conversations WHERE id=$1",
      [req.params.id]
    );
    if (!targetConv[0]) return res.status(404).json({ error: "Tidak ditemukan" });

    const visitorId = targetConv[0].visitor_id;
    const wsId = targetConv[0].workspace_id;

    // Update ALL conversations for this visitor_id in workspace to reflect blocked state
    const { rows } = await pool.query(
      `UPDATE conversations SET is_blocked=$1, updated_at=NOW()
       WHERE visitor_id=$2 AND workspace_id=$3 RETURNING *`,
      [isBlocked, visitorId, wsId]
    );

    const io = req.app.get("io");
    if (io) {
      const livechatNsp = io.of("/livechat");
      livechatNsp.to(`visitor:${visitorId}`).emit(isBlocked ? "visitor:blocked" : "visitor:unblocked");
      livechatNsp.to(`conv:${req.params.id}`).emit(isBlocked ? "visitor:blocked" : "visitor:unblocked");

      for (const [sId, s] of livechatNsp.sockets) {
        if (s.visitorId === visitorId) {
          s.emit(isBlocked ? "visitor:blocked" : "visitor:unblocked");
        }
      }

      // Broadcast update for ALL conversations of this visitor to dashboard agents
      rows.forEach(c => {
        io.of("/dashboard").to(`workspace:${wsId}`).emit("conversation:update", {
          conversationId: c.id, visitor_id: visitorId, is_blocked: isBlocked,
        });
      });
    }

    res.json(rows[0] || { visitor_id: visitorId, is_blocked: isBlocked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/tags
router.patch("/:id/tags", auth, async (req, res) => {
  try {
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: "tags harus berupa array" });

    const { rows } = await pool.query(
      "UPDATE conversations SET tags=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3 RETURNING *",
      [tags, req.params.id, req.workspaceId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/notes
router.patch("/:id/notes", auth, async (req, res) => {
  try {
    const { notes } = req.body;
    const { rows } = await pool.query(
      "UPDATE conversations SET notes=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3 RETURNING id, notes",
      [notes, req.params.id, req.workspaceId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/conversations/:id/read — mark messages as read by agent
router.post("/:id/read", auth, async (req, res) => {
  try {
    const { lastMessageId } = req.body;

    // Update read cursor
    await pool.query(
      `INSERT INTO agent_read_cursors (agent_id, conversation_id, last_read_at, last_read_msg_id)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (agent_id, conversation_id)
       DO UPDATE SET last_read_at=NOW(), last_read_msg_id=$3`,
      [req.agentId, req.params.id, lastMessageId || null]
    );

    // Mark visitor messages as read
    if (lastMessageId) {
      await pool.query(
        `UPDATE messages SET read_at = COALESCE(read_at, NOW())
         WHERE conversation_id=$1 AND sender_type='visitor' AND read_at IS NULL
           AND created_at <= (SELECT created_at FROM messages WHERE id=$2)`,
        [req.params.id, lastMessageId]
      );

      // Notify visitor: messages read by agent
      const io = req.app.get("io");
      io.of("/livechat").to(`conv:${req.params.id}`).emit("message:read_by_agent", {
        conversationId: req.params.id,
        upToMessageId: lastMessageId,
        readAt: new Date().toISOString(),
        agentName: req.agentName,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/conversations — export (CSV)
router.get("/export/csv", auth, async (req, res) => {
  try {
    const { status, date_from, date_to } = req.query;

    let where = ["c.workspace_id = $1"];
    const params = [req.workspaceId];
    let pi = 2;

    if (status) { where.push(`c.status = $${pi++}`); params.push(status); }
    if (date_from) { where.push(`c.created_at >= $${pi++}`); params.push(date_from); }
    if (date_to) { where.push(`c.created_at <= $${pi++}`); params.push(date_to); }

    const { rows } = await pool.query(
      `SELECT c.id, c.visitor_id, c.visitor_name, c.status,
         a.name AS agent_name,
         c.first_message_at, c.first_response_at, c.resolved_at,
         EXTRACT(EPOCH FROM (c.first_response_at - c.first_message_at))/60 AS frt_minutes,
         EXTRACT(EPOCH FROM (c.resolved_at - c.first_message_at))/60 AS resolution_minutes,
         c.rating_score, c.rating_satisfaction, c.rating_resolved, c.created_at
       FROM conversations c
       LEFT JOIN agents a ON c.assigned_agent_id = a.id
       WHERE ${where.join(" AND ")}
       ORDER BY c.created_at DESC
       LIMIT 10000`,
      params
    );

    const headers = Object.keys(rows[0] || {}).join(",");
    const csvRows = rows.map(r =>
      Object.values(r).map(v => (v === null ? "" : `"${String(v).replace(/"/g, '""')}"`)).join(",")
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="conversations.csv"');
    res.send([headers, ...csvRows].join("\n"));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/tags
router.patch("/:id/tags", auth, async (req, res) => {
  try {
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: "tags harus array" });

    const { rows } = await pool.query(
      `UPDATE conversations SET tags=$1, updated_at=NOW()
       WHERE id=$2 AND workspace_id=$3 RETURNING id, tags`,
      [JSON.stringify(tags), req.params.id, req.workspaceId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });

    // Broadcast to dashboard agents
    const io = req.app.get("io");
    io.of("/dashboard").to(`conv:${req.params.id}`).emit("conversation:tags_updated", {
      conversationId: req.params.id, tags,
    });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/conversations/:id/notes — get internal notes
router.get("/:id/notes", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, a.name AS sender_name, a.display_name AS sender_display_name, a.avatar_url AS sender_avatar
       FROM messages m
       LEFT JOIN agents a ON m.sender_id = a.id
       WHERE m.conversation_id=$1 AND m.is_internal=TRUE
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// GET /api/v1/conversations/:id/adjacent — get previous & next conversations for the same visitor
router.get("/:id/adjacent", auth, async (req, res) => {
  try {
    const { rows: current } = await pool.query(
      "SELECT id, visitor_id, workspace_id FROM conversations WHERE id=$1",
      [req.params.id]
    );
    if (!current[0]) return res.status(404).json({ error: "Percakapan tidak ditemukan" });

    const { visitor_id, workspace_id } = current[0];

    // Fetch all conversations for this visitor chronologically
    const { rows: allConvs } = await pool.query(
      `SELECT id, status, created_at FROM conversations
       WHERE visitor_id=$1 AND workspace_id=$2
       ORDER BY created_at ASC, id ASC`,
      [visitor_id, workspace_id]
    );

    const currentIndex = allConvs.findIndex(c => c.id === req.params.id);
    const previousConv = currentIndex > 0 ? allConvs[currentIndex - 1] : null;
    const nextConv = (currentIndex >= 0 && currentIndex < allConvs.length - 1) ? allConvs[currentIndex + 1] : null;

    res.json({
      previousConv: previousConv || null,
      nextConv: nextConv || null,
      visitorConvCount: allConvs.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/conversations/:id/reopen — reopen an archived conversation
router.patch("/:id/reopen", auth, async (req, res) => {
  try {
    const { rows: current } = await pool.query(
      "SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2",
      [req.params.id, req.workspaceId]
    );
    if (!current[0]) return res.status(404).json({ error: "Percakapan tidak ditemukan" });

    const conv = current[0];

    // Check if visitor has a newer active/queued conversation
    const { rows: newerActive } = await pool.query(
      `SELECT id FROM conversations
       WHERE visitor_id=$1 AND workspace_id=$2 AND status != 'resolved' AND id != $3
       ORDER BY created_at DESC LIMIT 1`,
      [conv.visitor_id, req.workspaceId, req.params.id]
    );

    if (newerActive.length > 0) {
      return res.status(409).json({
        error: "Visitor ini memiliki percakapan aktif yang lebih baru.",
        activeConversationId: newerActive[0].id,
      });
    }

    const agentName = req.agentDisplayName || req.agentName || "CS";

    // Update conversation status to active
    const { rows: updated } = await pool.query(
      `UPDATE conversations
       SET status='active', assigned_agent_id=COALESCE(assigned_agent_id, $1), cs_handoff_at=COALESCE(cs_handoff_at, NOW()), resolved_at=NULL, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [req.agentId, req.params.id]
    );

    // Insert system message
    const sysMsgText = `🔓 CS (${agentName}) telah membuka kembali percakapan ini.`;
    const { rows: msgRows } = await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, text, is_internal)
       VALUES ($1, 'system', $2, FALSE) RETURNING *`,
      [req.params.id, sysMsgText]
    );

    const io = req.app.get("io");
    if (io) {
      // Notify dashboard & visitor sockets
      io.of("/dashboard").to(`workspace:${req.workspaceId}`).emit("conversation:update", {
        conversationId: req.params.id, status: "active", assigned_agent_id: req.agentId,
      });
      io.of("/dashboard").to(`conv:${req.params.id}`).emit("agent:message", {
        conversationId: req.params.id, message: msgRows[0],
      });
      io.of("/livechat").to(`conv:${req.params.id}`).emit("chat:reopened", {
        message: `🔓 Percakapan dibuka kembali oleh CS (${agentName}).`,
      });
      io.of("/livechat").to(`visitor:${conv.visitor_id}`).emit("chat:reopened", {
        message: `🔓 Percakapan dibuka kembali oleh CS (${agentName}).`,
      });
    }

    res.json({ ok: true, conversation: updated[0], message: msgRows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

