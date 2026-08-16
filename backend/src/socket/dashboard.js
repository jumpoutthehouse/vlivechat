const { pool } = require("../db");
const {
  setAgentSocket,
  delAgentSocket,
  addOnlineAgent,
  removeOnlineAgent,
  saveFlowState,
  delFlowState,
} = require("../redis");
const logger = require("../utils/logger");
const { sendFacebookMessage } = require("../services/facebook.service");

/**
 * Socket.io namespace: /dashboard
 * Digunakan oleh agent di admin panel
 * Read receipts: dua arah
 */
function registerDashboardSocket(dashboardNsp, visitorNsp) {
  // ── JWT Auth middleware ──────────────────────────────────────
  dashboardNsp.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");

      // Fetch fresh workspace_id, role, and name from DB to prevent stale JWT token workspace mismatch
      const { rows } = await pool.query(
        "SELECT id, workspace_id, role, name, is_active FROM agents WHERE id = $1",
        [decoded.agentId]
      );

      if (!rows[0] || rows[0].is_active === false) {
        return next(new Error("Agent inactive or not found"));
      }

      socket.agentId      = rows[0].id;
      socket.workspaceId  = rows[0].workspace_id;
      socket.agentName    = rows[0].name;
      socket.agentRole    = rows[0].role;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  dashboardNsp.on("connection", async (socket) => {
    const { agentId, workspaceId, agentName, agentRole } = socket;
    logger.info(`Agent connected: ${agentName} (${agentId}) role=${agentRole}`);

    // Save socket & mark online
    await setAgentSocket(agentId, socket.id);

    if (workspaceId) {
      await addOnlineAgent(workspaceId, agentId);
      await pool.query(
        "UPDATE agents SET is_online=TRUE, status='online', last_seen_at=NOW() WHERE id=$1",
        [agentId]
      );

      // Join workspace room
      socket.join(`workspace:${workspaceId}`);

      // Notify peers, superadmin & visitor widgets
      dashboardNsp.to(`workspace:${workspaceId}`).emit("agent:online", {
        agentId, agentName, status: "online", workspaceId,
      });
      dashboardNsp.to("superadmin").emit("agent:online", {
        agentId, agentName, status: "online", workspaceId,
      });
      broadcastAgentsToWidget(visitorNsp, workspaceId);
    }

    if (agentRole === "superadmin") {
      socket.join("superadmin");
      await pool.query(
        "UPDATE agents SET is_online=TRUE, status='online', last_seen_at=NOW() WHERE id=$1",
        [agentId]
      );
      try {
        const { rows: wsList } = await pool.query("SELECT id FROM workspaces");
        wsList.forEach(w => {
          socket.join(`workspace:${w.id}`);
          broadcastAgentsToWidget(visitorNsp, w.id);
        });
      } catch (e) {}
    }

    // ── Join conversation room ───────────────────────────────────
    socket.on("agent:join_conversation", async ({ conversationId }) => {
      socket.join(`conv:${conversationId}`);

      // Mark visitor messages as delivered
      try {
        await pool.query(
          `UPDATE messages SET delivered_at=COALESCE(delivered_at,NOW())
           WHERE conversation_id=$1 AND sender_type='visitor' AND delivered_at IS NULL`,
          [conversationId]
        );
        visitorNsp.to(`conv:${conversationId}`).emit("message:delivered", { conversationId });
      } catch (err) {
        logger.error("agent:join_conversation error:", err);
      }
    });

    // ── Leave conversation room ──────────────────────────────────
    socket.on("agent:leave_conversation", ({ conversationId }) => {
      socket.leave(`conv:${conversationId}`);
    });

    // ── Agent message ────────────────────────────────────────────
    socket.on("agent:message", async ({ conversationId, text, isInternal, clientId }) => {
      if (!text?.trim()) return;
      try {
        // Dedup
        if (clientId) {
          const { rows: dup } = await pool.query(
            "SELECT id FROM messages WHERE client_id=$1 AND conversation_id=$2",
            [clientId, conversationId]
          );
          if (dup.length > 0) {
            socket.emit("message:sent", { messageId: dup[0].id, clientId });
            return;
          }
        }

        // Get agent avatar for display
        const { rows: agentRows } = await pool.query(
          "SELECT avatar_url, display_name FROM agents WHERE id=$1",
          [agentId]
        );
        const agentAvatar = agentRows[0]?.avatar_url || null;
        const displayName = agentRows[0]?.display_name || agentName;

        const { rows } = await pool.query(
          `INSERT INTO messages
             (conversation_id, sender_type, sender_id, sender_name, text, is_internal, client_id)
           VALUES ($1, 'agent', $2, $3, $4, $5, $6)
           RETURNING *`,
          [conversationId, agentId, agentName, text.trim(), isInternal || false, clientId || null]
        );
        const msg = { ...rows[0], sender_avatar: agentAvatar, sender_display_name: displayName };

        // SLA & Re-open archived conversations on agent outbound message
        if (!isInternal) {
          const { rows: updatedConv } = await pool.query(
            `UPDATE conversations SET
               first_response_at=COALESCE(first_response_at,NOW()),
               cs_handoff_at=COALESCE(cs_handoff_at,NOW()),
               assigned_agent_id=COALESCE(assigned_agent_id,$1),
               status=CASE WHEN status IN ('open','queued','missed') THEN 'assigned' ELSE status END,
               missed_at=NULL,
               flow_mode='agent',
               updated_at=NOW()
             WHERE id=$2
             RETURNING *`,
            [agentId, conversationId]
          );

          if (updatedConv[0]) {
            const targetWs = updatedConv[0].workspace_id || workspaceId;
            dashboardNsp.to(`workspace:${targetWs}`).emit("conversation:update", {
              conversationId, status: "assigned", assigned_agent_id: agentId, flow_mode: "agent",
            });
            dashboardNsp.to(`workspace:${targetWs}`).emit("conversation:assigned", {
              conversationId, agentId,
            });
            dashboardNsp.to("superadmin").emit("conversation:update", {
              conversationId, status: "assigned", assigned_agent_id: agentId, flow_mode: "agent",
            });
            dashboardNsp.to("superadmin").emit("conversation:assigned", {
              conversationId, agentId,
            });
          }
        }

        // Broadcast to dashboard (all agents in conversation)
        const msgPayload = {
          ...msg,
          sender_avatar: agentAvatar,
        };
        dashboardNsp.to(`conv:${conversationId}`).emit("agent:message", {
          conversationId, message: msgPayload,
        });

        // Send to visitor (unless internal note)
        if (!isInternal) {
          const { rows: cRows } = await pool.query("SELECT visitor_id FROM conversations WHERE id=$1", [conversationId]);
          const visId = cRows[0]?.visitor_id;

          const outPayload = {
            text: msg.text,
            senderType: "agent",
            messageId: msg.id,
            senderName: displayName,
            senderAvatar: agentAvatar,
            createdAt: msg.created_at,
            conversationId,
          };

          visitorNsp.to(`conv:${conversationId}`).emit("agent:message", outPayload);
          if (visId) {
            visitorNsp.to(`visitor:${visId}`).emit("agent:message", outPayload);
          }
          visitorNsp.to(`conv:${conversationId}`).emit("conversation:flow_update", {
            conversationId,
            mode: "agent",
          });
          if (visId) {
            visitorNsp.to(`visitor:${visId}`).emit("conversation:flow_update", {
              conversationId,
              mode: "agent",
            });
          }

          // Trigger Facebook Messenger outbound if source is facebook
          sendFacebookMessage({ conversationId, text: msg.text }).catch(err => {
            logger.error("[FB Outbound Trigger Error]:", err.message);
          });
        }

        socket.emit("message:sent", { messageId: msg.id, clientId });
      } catch (err) {
        logger.error("agent:message error:", err);
      }
    });

    // ── Agent typing ─────────────────────────────────────────────
    socket.on("agent:typing", ({ conversationId, typing }) => {
      visitorNsp.to(`conv:${conversationId}`).emit("agent:typing-indicator", { typing });
    });

    // ── Agent read receipt (agent read visitor messages) ─────────
    socket.on("agent:read", async ({ conversationId, upToMessageId }) => {
      try {
        if (!upToMessageId) return;

        // Update read cursor table
        await pool.query(
          `INSERT INTO agent_read_cursors (agent_id, conversation_id, last_read_at, last_read_msg_id)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (agent_id, conversation_id)
           DO UPDATE SET last_read_at=NOW(), last_read_msg_id=$3`,
          [agentId, conversationId, upToMessageId]
        );

        // Mark visitor messages as read
        await pool.query(
          `UPDATE messages SET read_at=COALESCE(read_at,NOW())
           WHERE conversation_id=$1 AND sender_type='visitor' AND read_at IS NULL
             AND created_at <= (SELECT created_at FROM messages WHERE id=$2)`,
          [conversationId, upToMessageId]
        );

        // Notify visitor: agent has read their messages ✓✓
        visitorNsp.to(`conv:${conversationId}`).emit("message:read_by_agent", {
          conversationId,
          upToMessageId,
          readAt: new Date().toISOString(),
          agentName: agentName,
        });

        // Also broadcast to other agents in conversation
        dashboardNsp.to(`conv:${conversationId}`).emit("agent:read_update", {
          conversationId,
          agentId,
          upToMessageId,
        });
      } catch (err) {
        logger.error("agent:read error:", err);
      }
    });

    // ── Resolve conversation ─────────────────────────────────────
    socket.on("agent:resolve", async ({ conversationId }) => {
      try {
        const { rows: convRows } = await pool.query(
          "SELECT visitor_id, workspace_id FROM conversations WHERE id=$1",
          [conversationId]
        );
        const targetWs = convRows[0]?.workspace_id || workspaceId;

        await pool.query(
          "UPDATE conversations SET status='resolved', resolved_at=NOW(), updated_at=NOW() WHERE id=$1",
          [conversationId]
        );
        await delFlowState(convRows[0]?.visitor_id);

        // Insert system resolution message into messages table
        try {
          const { rows: agentRows } = await pool.query("SELECT name, display_name, role FROM agents WHERE id=$1", [agentId]);
          const aName = agentRows[0]?.display_name || agentRows[0]?.name || agentName || "CS";
          const roleLabel = (agentRole === "admin" || agentRole === "superadmin" || agentRows[0]?.role === "admin") ? "Admin" : "CS";
          const sysMsgText = `🔒 Sesi diakhiri oleh ${roleLabel} (${aName})`;
          
          const { rows: existingSys } = await pool.query(
            "SELECT id FROM messages WHERE conversation_id=$1 AND sender_type='system' AND text LIKE '🔒 Sesi diakhiri oleh%'",
            [conversationId]
          );
          if (existingSys.length === 0) {
            await pool.query(
              `INSERT INTO messages (conversation_id, sender_type, text, is_internal) VALUES ($1, 'system', $2, FALSE)`,
              [conversationId, sysMsgText]
            );
          }
        } catch (e) {}

        // Notify visitor: chat ended
        visitorNsp.to(`conv:${conversationId}`).emit("chat:resolved", {
          message: "Sesi chat telah diakhiri oleh agent.",
        });
        if (convRows[0]?.visitor_id) {
          visitorNsp.to(`visitor:${convRows[0].visitor_id}`).emit("chat:resolved", {
            message: "Sesi chat telah diakhiri oleh agent.",
          });
        }

        dashboardNsp.to(`workspace:${targetWs}`).emit("conversation:resolved", {
          conversationId, resolvedBy: agentId,
        });
        dashboardNsp.to("superadmin").emit("conversation:resolved", {
          conversationId, resolvedBy: agentId,
        });
      } catch (err) {
        logger.error("agent:resolve error:", err);
      }
    });

    // ── Transfer conversation ────────────────────────────────────
    socket.on("agent:transfer", async ({ conversationId, toAgentId, note }) => {
      try {
        const { rows: toAgent } = await pool.query(
          "SELECT name, display_name FROM agents WHERE id=$1",
          [toAgentId]
        );
        const toName = toAgent[0]?.display_name || toAgent[0]?.name || "agent lain";

        await pool.query(
          "UPDATE conversations SET assigned_agent_id=$1, flow_mode='agent', cs_handoff_at=COALESCE(cs_handoff_at,NOW()), updated_at=NOW() WHERE id=$2",
          [toAgentId, conversationId]
        );

        // System message to visitor
        const sysText = `Chat telah dipindahkan kepada ${toName}${note ? `: ${note}` : ""}.`;
        const { rows: sysMsg } = await pool.query(
          "INSERT INTO messages (conversation_id, sender_type, text) VALUES ($1,'system',$2) RETURNING *",
          [conversationId, sysText]
        );

        visitorNsp.to(`conv:${conversationId}`).emit("agent:message", {
          text: sysText, senderType: "system", messageId: sysMsg[0].id,
          createdAt: sysMsg[0].created_at,
        });

        dashboardNsp.to(`workspace:${workspaceId}`).emit("conversation:transferred", {
          conversationId, fromAgentId: agentId, toAgentId,
          message: sysMsg[0],
        });
      } catch (err) {
        logger.error("agent:transfer error:", err);
      }
    });

    // ── Canned response search ───────────────────────────────────
    socket.on("agent:canned_search", async ({ query }) => {
      try {
        const { rows } = await pool.query(
          `SELECT id, shortcut, title, content FROM canned_responses
           WHERE workspace_id=$1 AND (shortcut ILIKE $2 OR title ILIKE $2)
           LIMIT 8`,
          [workspaceId, `%${query}%`]
        );
        socket.emit("canned:results", { results: rows });
      } catch (err) {
        logger.error("agent:canned_search error:", err);
      }
    });

    // ── Agent status change ──────────────────────────────────────
    socket.on("agent:status", async ({ status }) => {
      const allowed = ["online", "away", "busy", "offline"];
      if (!allowed.includes(status)) return;
      try {
        await pool.query(
          "UPDATE agents SET status=$1, is_online=$2, updated_at=NOW() WHERE id=$3",
          [status, status !== "offline", agentId]
        );
        if (workspaceId) {
          dashboardNsp.to(`workspace:${workspaceId}`).emit("agent:status_changed", {
            agentId, status,
          });
          broadcastAgentsToWidget(visitorNsp, workspaceId);
        }
      } catch (err) {
        logger.error("agent:status error:", err);
      }
    });

    // ── Disconnect ───────────────────────────────────────────────
    socket.on("disconnect", async () => {
      logger.info(`Agent disconnected: ${agentName}`);
      await delAgentSocket(agentId);
      try {
        await pool.query(
          "UPDATE agents SET is_online=FALSE, status='offline', last_seen_at=NOW() WHERE id=$1",
          [agentId]
        );
        if (workspaceId) {
          await removeOnlineAgent(workspaceId, agentId);
          dashboardNsp.to(`workspace:${workspaceId}`).emit("agent:offline", { agentId, agentName, workspaceId });
          dashboardNsp.to("superadmin").emit("agent:offline", { agentId, agentName, workspaceId });
          broadcastAgentsToWidget(visitorNsp, workspaceId);
        }
      } catch (err) {
        logger.error("disconnect cleanup error:", err);
      }
    });
  });
}

async function broadcastAgentsToWidget(visitorNsp, workspaceId) {
  if (!workspaceId || !visitorNsp) return;
  try {
    const { getOnlineAgents } = require("../redis");
    const onlineIds = await getOnlineAgents(workspaceId);
    const activeDashboardAgents = new Set(onlineIds);

    try {
      const dashboardNsp = visitorNsp.server?.of("/dashboard");
      if (dashboardNsp && dashboardNsp.sockets) {
        for (const [_, s] of dashboardNsp.sockets) {
          if (s.agentId && s.workspaceId === workspaceId) {
            activeDashboardAgents.add(s.agentId);
          }
        }
      }
    } catch (e) {}

    const { rows: agentRows } = await pool.query(
      `SELECT id, display_name, name, avatar_url, avatar_bg, is_online, last_seen_at FROM agents WHERE workspace_id=$1 AND role != 'superadmin' ORDER BY created_at ASC`,
      [workspaceId]
    );

    const formattedAgents = agentRows.map(a => {
      const isRecentlyActive = a.last_seen_at && (Date.now() - new Date(a.last_seen_at).getTime() < 5 * 60 * 1000);
      const isOnline = a.is_online || activeDashboardAgents.has(a.id) || isRecentlyActive;
      return { ...a, is_online: !!isOnline };
    });

    const onlineCount = formattedAgents.filter(a => a.is_online).length;
    visitorNsp.to(`ws:${workspaceId}`).emit("agents:update", {
      agents: formattedAgents,
      is_online: onlineCount > 0,
    });
  } catch (err) {
    logger.error("broadcastAgentsToWidget error:", err);
  }
}

module.exports = { registerDashboardSocket };

