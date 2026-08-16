const { pool } = require("../db");
const {
  setVisitorConversation,
  getVisitorConversation,
  delVisitorConversation,
  saveFlowState,
  getFlowState,
  delFlowState,
} = require("../redis");
const logger = require("../utils/logger");

/**
 * Socket.io namespace: /livechat
 * Digunakan oleh widget visitor
 * Read receipts: dua arah
 */
const activeCreationLocks = new Map();
const flowStepLocks = new Map();

function registerVisitorSocket(visitorNsp, dashboardNsp) {
  visitorNsp.on("connection", async (socket) => {
    const auth = { ...(socket.handshake.query || {}), ...(socket.handshake.auth || {}) };
    const { visitorId, ws: workspaceCode, page, ref, tz, lang, scr } = auth;

    if (!visitorId || !workspaceCode) {
      socket.emit("chat:unavailable", { reason: "invalid_params" });
      return socket.disconnect(true);
    }

    // Cari workspace
    let workspace;
    try {
      const { rows } = await pool.query(
        "SELECT * FROM workspaces WHERE code = $1 AND is_active = TRUE",
        [workspaceCode]
      );
      if (!rows[0]) {
        socket.emit("chat:unavailable", { reason: "workspace_not_found" });
        return socket.disconnect(true);
      }
      workspace = rows[0];
    } catch (err) {
      logger.error("Find workspace error:", err);
      socket.emit("chat:unavailable", { reason: "server_error" });
      return socket.disconnect(true);
    }

    socket.visitorId   = visitorId;
    socket.workspaceId = workspace.id;
    socket.join(`visitor:${visitorId}`);
    socket.join(`ws:${workspace.id}`);

    // Send initial agent list & online status to visitor widget
    try {
      const { rows: agentRows } = await pool.query(
        `SELECT id, display_name, name, avatar_url, avatar_bg, is_online FROM agents WHERE workspace_id=$1 AND role != 'superadmin' ORDER BY is_online DESC, created_at ASC`,
        [workspace.id]
      );
      socket.emit("agents:update", {
        agents: agentRows,
        is_online: agentRows.filter(a => a.is_online).length > 0,
      });
    } catch (e) {}

    // Check if visitor has existing active conversation
    let convId = await getVisitorConversation(visitorId);
    let conversation = null;

    if (convId) {
      const { rows } = await pool.query(
        "SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2",
        [convId, workspace.id]
      );
      conversation = rows[0];
      if (conversation?.status === "resolved") {
        conversation = null;
        convId = null;
      }
    }

    if (!convId) {
      const { rows: dbConvs } = await pool.query(
        "SELECT * FROM conversations WHERE visitor_id=$1 AND workspace_id=$2 AND status != 'resolved' ORDER BY created_at DESC LIMIT 1",
        [visitorId, workspace.id]
      );
      if (dbConvs.length > 0) {
        conversation = dbConvs[0];
        convId = conversation.id;
        await setVisitorConversation(visitorId, convId);
      }
    }

    // Helper to ensure conversation exists in DB only when visitor starts chatting
    async function ensureConversation(extraData = {}) {
      // 0. If creation lock is running for this visitor, wait for it to complete!
      if (activeCreationLocks.has(visitorId)) {
        try { await activeCreationLocks.get(visitorId); } catch {}
      }

      // 1. In-memory check
      // 1. Check if socket's current convId is still active in DB
      if (convId) {
        const { rows: activeCheck } = await pool.query(
          "SELECT * FROM conversations WHERE id=$1 AND status != 'resolved'",
          [convId]
        );
        if (activeCheck.length > 0) {
          conversation = activeCheck[0];
          const newName = (extraData.name && extraData.name.trim()) ? extraData.name.trim() : conversation.visitor_name;
          if (newName && conversation.visitor_name && newName !== conversation.visitor_name) {
            await pool.query(
              `UPDATE conversations SET
                 previous_names=array_append(COALESCE(previous_names, '{}'), visitor_name),
                 visitor_name=$1, prechat_data=$2, updated_at=NOW()
               WHERE id=$3`,
              [newName, JSON.stringify(extraData.data || {}), convId]
            );
            conversation.visitor_name = newName;
            dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:update", {
              conversationId: convId, visitorName: newName, prechatData: extraData.data,
            });
          }
          return convId;
        }
        // Conversation was resolved/auto-archived — reset convId to force creating a new active session
        convId = null;
        conversation = null;
        socket.convId = null;
      }

      // 2. Check Database for ACTIVE (non-resolved) conversation for this visitor in this workspace
      const { rows: existing } = await pool.query(
        "SELECT * FROM conversations WHERE visitor_id=$1 AND workspace_id=$2 AND status != 'resolved' ORDER BY created_at DESC LIMIT 1",
        [visitorId, workspace.id]
      );

      if (existing.length > 0) {
        conversation = existing[0];
        convId = conversation.id;
        socket.convId = convId;
        socket.join(`conv:${convId}`);

        const newName = (extraData.name && extraData.name.trim()) ? extraData.name.trim() : conversation.visitor_name;
        const nameChanged = newName && conversation.visitor_name && newName !== conversation.visitor_name;

        if (nameChanged) {
          await pool.query(
            `UPDATE conversations SET
               previous_names=array_append(COALESCE(previous_names, '{}'), visitor_name),
               visitor_name=$1, prechat_data=$2, updated_at=NOW()
             WHERE id=$3`,
            [newName, JSON.stringify(extraData.data || {}), convId]
          );
          conversation.visitor_name = newName;
          dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:update", {
            conversationId: convId, visitorName: newName, prechatData: extraData.data,
          });
        }
        return convId;
      }

      // 3. Acquire lock & insert new conversation with ON CONFLICT protection
      let resolveLock;
      const lockPromise = new Promise(res => { resolveLock = res; });
      activeCreationLocks.set(visitorId, lockPromise);

      try {
        let clientIp = socket.handshake.headers['x-forwarded-for'] ||
                       socket.handshake.headers['x-real-ip'] ||
                       socket.handshake.address ||
                       socket.request.socket.remoteAddress || "127.0.0.1";
        if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
        if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

        let geo = {
          ip: clientIp, country: "Indonesia", countryCode: "ID", city: "Jakarta",
          lat: -6.2088, lon: 106.8456, isp: "Localhost Network"
        };

        if (clientIp && !clientIp.startsWith("127.") && !clientIp.startsWith("192.168.") && clientIp !== "::1") {
          try {
            const fetchRes = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,countryCode,city,lat,lon,isp`, { signal: AbortSignal.timeout(2500) });
            const ipData = await fetchRes.json();
            if (ipData && ipData.status === "success") {
              geo.country = ipData.country;
              geo.countryCode = ipData.countryCode;
              geo.city = ipData.city;
              geo.lat = ipData.lat;
              geo.lon = ipData.lon;
              geo.isp = ipData.isp;
            }
          } catch (e) {
            logger.warn("IP Geolocation lookup failed:", e.message);
          }
        }

        // Check if ANY conversation for this visitor is blocked in this workspace
        const { rows: blockedCheck } = await pool.query(
          "SELECT is_blocked FROM conversations WHERE visitor_id=$1 AND workspace_id=$2 AND is_blocked=TRUE LIMIT 1",
          [visitorId, workspace.id]
        );
        const isVisitorBlocked = blockedCheck.length > 0;

        if (isVisitorBlocked) {
          socket.emit("chat:unavailable", { reason: "Akses percakapan Anda telah diblokir oleh administrator." });
          socket.emit("visitor:blocked");
          return null;
        }

        const initialFlowMode = (workspace.chatbot_enabled === false) ? "agent" : "bot";

        const userAgent = socket.handshake.headers['user-agent'] || auth.ua || "";

        // ON CONFLICT DO NOTHING: if a concurrent insert already succeeded, rows will be empty
        const { rows } = await pool.query(
          `INSERT INTO conversations
             (workspace_id, visitor_id, visitor_name, prechat_data, visitor_page, visitor_ref, visitor_tz, visitor_lang, visitor_screen, visitor_ua,
              visitor_ip, visitor_country, visitor_city, visitor_country_code, visitor_lat, visitor_lon, visitor_isp, status, flow_mode, is_blocked, first_message_at, cs_handoff_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'open',$18::varchar,$19, NOW(), CASE WHEN $18::varchar = 'agent' THEN NOW() ELSE NULL END)
           ON CONFLICT (visitor_id, workspace_id) WHERE status != 'resolved'
           DO NOTHING
           RETURNING *`,
          [workspace.id, visitorId, extraData.name || null, JSON.stringify(extraData.data || {}), page || null, ref || null, tz || null, lang || null, scr || null, userAgent || null,
           geo.ip, geo.country, geo.city, geo.countryCode, geo.lat, geo.lon, geo.isp, initialFlowMode, isVisitorBlocked]
        );

        if (rows.length > 0) {
          // New conversation created
          conversation = rows[0];
          convId = conversation.id;
          socket.convId = convId;
          socket.join(`conv:${convId}`);
          await setVisitorConversation(visitorId, convId);
          // Notify widget of the new convId
          socket.emit("conv:created", { conversationId: convId });
          dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:new", { conversation });
          dashboardNsp.to("superadmin").emit("conversation:new", { conversation });
          logger.info(`New conversation ${convId} created for visitor ${visitorId} (${extraData.name || 'Anonymous'})`);

          // Reset flow state for visitor to main bot menu
          await delFlowState(visitorId);
          socket.emit("flow:restore", {
            mode: initialFlowMode,
            nodeId: "main",
            data: {}
          });

          // Auto-Greeting Message if enabled in Workspace settings
          if (workspace.auto_greeting_enabled && workspace.auto_greeting_text) {
            try {
              const { rows: autoG } = await pool.query(
                `INSERT INTO messages (conversation_id, sender_type, text, is_internal)
                 VALUES ($1, 'bot', $2, FALSE) RETURNING *`,
                [convId, workspace.auto_greeting_text]
              );
              if (autoG[0]) {
                const payload = {
                  text: autoG[0].text,
                  senderType: "bot",
                  messageId: autoG[0].id,
                  senderName: "Automated Bot",
                  createdAt: autoG[0].created_at,
                  conversationId: convId,
                };
                // Emit to visitor widget real-time
                socket.emit("agent:message", payload);
                visitorNsp.to(`visitor:${visitorId}`).emit("agent:message", payload);
                // Notify admin dashboard
                dashboardNsp.to(`conv:${convId}`).emit("agent:message", { message: autoG[0], conversationId: convId });
              }
            } catch (e) {
              logger.error("Auto greeting error:", e);
            }
          }
        } else {
          // Conflict: another concurrent insert already created the conversation — fetch it
          const { rows: existing2 } = await pool.query(
            "SELECT * FROM conversations WHERE visitor_id=$1 AND workspace_id=$2 AND status != 'resolved' ORDER BY created_at DESC LIMIT 1",
            [visitorId, workspace.id]
          );
          if (existing2.length > 0) {
            conversation = existing2[0];
            convId = conversation.id;
            socket.convId = convId;
            socket.join(`conv:${convId}`);
            await setVisitorConversation(visitorId, convId);
            // Notify widget of the convId
            socket.emit("conv:created", { conversationId: convId });
            // Update visitor_name if provided
            if (extraData.name && conversation.visitor_name !== extraData.name) {
              await pool.query(
                "UPDATE conversations SET visitor_name=$1, prechat_data=$2, updated_at=NOW() WHERE id=$3",
                [extraData.name, JSON.stringify(extraData.data || {}), convId]
              );
              conversation.visitor_name = extraData.name;
              dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:update", {
                conversationId: convId, visitorName: extraData.name, prechatData: extraData.data,
              });
            }
            logger.info(`Reused existing conversation ${convId} for visitor ${visitorId} (conflict resolved)`);
          }
        }
        return convId;
      } finally {
        activeCreationLocks.delete(visitorId);
        resolveLock();
      }
    }

    socket.join(`visitor:${visitorId}`);
    socket.join(`ws:${workspace.id}`);
    if (convId) {
      socket.join(`conv:${convId}`);
      socket.convId = convId;
    }
    socket.visitorId   = visitorId;
    socket.workspaceId = workspace.id;

    // Send chat history: ONLY from the active (non-resolved) conversation
    // If no active conversation, send empty array so widget shows fresh welcome screen
    try {
      let msgs = [];
      if (conversation && conversation.status !== 'resolved') {
        // Active conversation: send its messages only
        const { rows } = await pool.query(
          `SELECT m.*, a.avatar_url AS sender_avatar, a.display_name AS sender_display_name
           FROM messages m
           LEFT JOIN agents a ON m.sender_id = a.id
           WHERE m.conversation_id = $1 AND m.is_internal = FALSE
           ORDER BY m.created_at ASC LIMIT 300`,
          [conversation.id]
        );
        msgs = rows;
      }

      const { rows: blockedCheck } = await pool.query(
        "SELECT is_blocked FROM conversations WHERE visitor_id=$1 AND workspace_id=$2 AND is_blocked=TRUE LIMIT 1",
        [visitorId, workspace.id]
      );
      const isVisitorBlocked = blockedCheck.length > 0;

      if (isVisitorBlocked) {
        socket.emit("visitor:blocked");
      }

      // Fetch list of previous resolved sessions for WhatsApp-style scroll-up lazy load
      const { rows: prevSessions } = await pool.query(
        `SELECT id, created_at, visitor_name FROM conversations
         WHERE visitor_id=$1 AND workspace_id=$2 AND status='resolved'
         ORDER BY created_at DESC LIMIT 20`,
        [visitorId, workspace.id]
      );

      // ALWAYS emit history event so visitor widget receives active state & message history
      socket.emit("history", {
        messages: msgs,
        activeConvId: conversation?.id || null,
        flowMode: conversation?.flow_mode || null,
        // Explicitly send status: if no conversation or resolved, widget knows to show fresh screen
        status: conversation ? conversation.status : "resolved",
        isBlocked: isVisitorBlocked,
        previousSessions: prevSessions  // [{id, created_at}] for scroll-up lazy load
      });
    } catch (err) {
      logger.error("History fetch error:", err);
    }

    // ALWAYS send flow:config (branding, CS avatars, flowConfig)
    const { rows: wsAgents } = await pool.query(
      `SELECT id, display_name, name, avatar_url, avatar_bg, is_online FROM agents WHERE workspace_id=$1 AND role != 'superadmin' ORDER BY is_online DESC, created_at ASC`,
      [workspace.id]
    );

    socket.emit("flow:config", {
      flow: workspace.flow_config,
      branding: {
        brandName:    workspace.brand_name,
        brandColor:   workspace.brand_color,
        brandSecondary: workspace.brand_secondary,
        brandLogoUrl: workspace.brand_logo_url,
        welcomeTitle: workspace.welcome_title,
        welcomeSubtitle: workspace.welcome_subtitle,
        offlineMessage: workspace.offline_message,
        agentDisplayName: workspace.agent_display_name,
        widgetTheme:  workspace.widget_theme,
        prechatEnabled: workspace.prechat_enabled,
        prechatFields:  workspace.prechat_fields,
        postchatEnabled: workspace.postchat_enabled,
        chatbotEnabled: workspace.chatbot_enabled !== false,
        announcementConfig: workspace.announcement_config,
        autoGreetingEnabled: workspace.auto_greeting_enabled,
        autoGreetingText: workspace.auto_greeting_text,
        offlineReplyEnabled: workspace.offline_reply_enabled,
        offlineReplyText: workspace.offline_reply_text,
        agents:       wsAgents,
        is_online:    wsAgents.some(a => a.is_online),
      },
    });

    // If conversation is active (not resolved), restore flow state or agent mode
    if (conversation && conversation.status !== 'resolved') {
      const flowState = await getFlowState(visitorId);
      const isAgent = conversation.flow_mode === 'agent' || !!conversation.assigned_agent_id;
      socket.emit("flow:restore", {
        mode: isAgent ? "agent" : (flowState?.mode || "menu"),
        nodeId: flowState?.nodeId || "main",
        data: flowState?.data || {}
      });
    } else {
      await delFlowState(visitorId);
    }

    // ── Pre-chat form ────────────────────────────────────────────
    socket.on("visitor:prechat", async ({ name, data }) => {
      try {
        // Defensive fallback: if widget sends empty name, try common field keys from prechat data
        const resolvedName = (name && name.trim())
          || (data && (data.username || data.name || data.email || data.id || "").trim())
          || "";

        const activeConvId = await ensureConversation({ name: resolvedName, data });
        if (!activeConvId) return;

        // IMPORTANT: after ensureConversation, `conversation` closure variable is updated to the active one
        const activeConversation = conversation;

        // FIX: Only get messages from THIS conversation (new session = empty or auto-greeting only)
        const { rows: msgs } = await pool.query(
          `SELECT m.*, a.avatar_url AS sender_avatar, a.display_name AS sender_display_name
           FROM messages m
           LEFT JOIN agents a ON m.sender_id = a.id
           WHERE m.conversation_id = $1 AND m.is_internal = FALSE
           ORDER BY m.created_at ASC`,
          [activeConvId]
        );

        // Broadcast to ALL open tabs of this visitor so every tab moves to chat screen
        visitorNsp.to(`visitor:${visitorId}`).emit("visitor:session_started", {
          conversationId: activeConvId,
          name: resolvedName,
        });

        // Send history with fresh (empty or auto-greeted) new session messages
        socket.emit("history", {
          messages: msgs,
          activeConvId: activeConvId,
          flowMode: activeConversation?.flow_mode,
          status: activeConversation?.status,
          previousSessions: [] // already populated on initial connect — don't re-send
        });

        // FIX: Send flow:restore IMMEDIATELY after prechat so bot greeting appears right away
        // without requiring the visitor to refresh the page
        const fState = await getFlowState(visitorId);
        const isAgentMode = activeConversation?.flow_mode === 'agent' || !!activeConversation?.assigned_agent_id;
        socket.emit("flow:restore", {
          mode: isAgentMode ? "agent" : (fState?.mode || "bot"),
          nodeId: fState?.nodeId || "main",
          data: fState?.data || {}
        });

      } catch (err) {
        logger.error("visitor:prechat error:", err);
      }
    });

    // ── Visitor message ──────────────────────────────────────────
    socket.on("visitor:message", async ({ text, clientId }) => {
      if (!text?.trim()) return;
      try {
        const { rows: blockedCheck } = await pool.query(
          "SELECT is_blocked FROM conversations WHERE visitor_id=$1 AND workspace_id=$2 AND is_blocked=TRUE LIMIT 1",
          [visitorId, workspace.id]
        );
        if (blockedCheck.length > 0) {
          socket.emit("chat:unavailable", { reason: "Akses percakapan Anda telah diblokir oleh administrator." });
          socket.emit("visitor:blocked");
          return;
        }

        await ensureConversation();
        // Dedup check
        if (clientId) {
          const { rows: dup } = await pool.query(
            "SELECT id FROM messages WHERE client_id=$1 AND conversation_id=$2",
            [clientId, convId]
          );
          if (dup.length > 0) {
            socket.emit("message:sent", { messageId: dup[0].id, clientId });
            return;
          }
        }

        const { rows } = await pool.query(
          `INSERT INTO messages (conversation_id, sender_type, text, client_id)
           VALUES ($1, 'visitor', $2, $3) RETURNING *`,
          [convId, text.trim(), clientId || null]
        );
        const msg = rows[0];

        await pool.query(
          "UPDATE conversations SET first_message_at=COALESCE(first_message_at,NOW()), updated_at=NOW() WHERE id=$1",
          [convId]
        );

        // Notify dashboard & superadmin
        dashboardNsp.to(`conv:${convId}`).emit("visitor:message", { conversationId: convId, message: msg });
        dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:activity", {
          conversationId: convId,
          preview: text.trim().slice(0, 80),
          visitorName: conversation?.visitor_name || visitorId,
        });
        dashboardNsp.to("superadmin").emit("conversation:activity", {
          conversationId: convId,
          preview: text.trim().slice(0, 80),
          visitorName: conversation?.visitor_name || visitorId,
        });

        // Broadcast echo to other open tabs of the visitor
        visitorNsp.to(`visitor:${visitorId}`).emit("visitor:message_echo", { message: msg, clientId });
        socket.emit("message:sent", { messageId: msg.id, clientId });

        // Offline CS Auto-Reply if enabled in Workspace settings and all agents are offline
        if (workspace.offline_reply_enabled && workspace.offline_reply_text) {
          try {
            // Send at most ONCE per conversation session to prevent spamming
            const { rows: existingOff } = await pool.query(
              `SELECT id FROM messages WHERE conversation_id=$1 AND text=$2 AND sender_type='bot' LIMIT 1`,
              [convId, workspace.offline_reply_text]
            );

            if (existingOff.length === 0) {
              const { rows: onlineCheck } = await pool.query(
                `SELECT COUNT(*) FROM agents WHERE workspace_id=$1 AND is_online=TRUE AND role!='superadmin'`,
                [workspace.id]
              );
              if (parseInt(onlineCheck[0]?.count || 0) === 0) {
                const { rows: offMsgRows } = await pool.query(
                  `INSERT INTO messages (conversation_id, sender_type, text, is_internal)
                   VALUES ($1, 'bot', $2, FALSE) RETURNING *`,
                  [convId, workspace.offline_reply_text]
                );
                if (offMsgRows[0]) {
                  const offMsg = offMsgRows[0];
                  setTimeout(() => {
                    const payload = {
                      text: offMsg.text,
                      senderType: "bot",
                      messageId: offMsg.id,
                      senderName: "Auto Reply",
                      createdAt: offMsg.created_at,
                      conversationId: convId,
                    };
                    socket.emit("agent:message", payload);
                    visitorNsp.to(`visitor:${visitorId}`).emit("agent:message", payload);
                    dashboardNsp.to(`conv:${convId}`).emit("agent:message", { message: offMsg, conversationId: convId });
                  }, 400);
                }
              }
            }
          } catch (e) {
            logger.error("Offline reply error:", e);
          }
        }
      } catch (err) {
        logger.error("visitor:message error:", err);
      }
    });

    // ── Visitor flow step (bot responses & option clicks) ────────
    socket.on("visitor:flow_step", async ({ type, text, messageType }) => {
      if (!text?.trim()) return;
      try {
        await ensureConversation();
        if (!convId) return;

        // In-memory lock per conversation to prevent concurrent duplicate inserts
        if (flowStepLocks.has(convId)) {
          try { await flowStepLocks.get(convId); } catch {}
        }

        let resolveLock;
        const lockPromise = new Promise(res => { resolveLock = res; });
        flowStepLocks.set(convId, lockPromise);

        try {
          const senderType = type === "bot" ? "bot" : "visitor";
          const mType = messageType || (type === "visitor_choice" ? "flow_button" : "text");

          // Deduplication check: do not insert duplicate message if identical message was inserted within last 10s
          const { rows: dupCheck } = await pool.query(
            `SELECT id FROM messages 
             WHERE conversation_id = $1 AND sender_type = $2 AND text = $3 AND created_at > NOW() - INTERVAL '10 seconds'
             LIMIT 1`,
            [convId, senderType, text.trim()]
          );
          if (dupCheck.length > 0) {
            return;
          }

          const { rows } = await pool.query(
            `INSERT INTO messages (conversation_id, sender_type, sender_name, text, message_type)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [convId, senderType, senderType === "bot" ? "Bot" : "Visitor", text.trim(), mType]
          );
          const msg = rows[0];

          // Notify dashboard so CS sees full history real-time
          dashboardNsp.to(`conv:${convId}`).emit("visitor:message", { conversationId: convId, message: msg });
          dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:activity", {
            conversationId: convId,
            preview: text.trim().slice(0, 80),
            visitorName: conversation?.visitor_name || visitorId,
          });
        } finally {
          flowStepLocks.delete(convId);
          resolveLock();
        }
      } catch (err) {
        logger.error("visitor:flow_step error:", err);
      }
    });

    // ── Visitor typing ───────────────────────────────────────────
    socket.on("visitor:typing", ({ typing, preview }) => {
      dashboardNsp.to(`conv:${convId}`).emit("visitor:typing", {
        conversationId: convId, typing, preview,
      });
    });

    // ── Visitor read receipt (visitor has read agent messages) ───
    socket.on("visitor:read", async ({ lastMessageId }) => {
      try {
        if (!lastMessageId) return;

        // Update visitor read cursor
        await pool.query(
          `INSERT INTO visitor_read_cursors (visitor_id, conversation_id, last_read_at, last_read_msg_id)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (visitor_id, conversation_id)
           DO UPDATE SET last_read_at=NOW(), last_read_msg_id=$3`,
          [visitorId, convId, lastMessageId]
        );

        // Mark agent messages as read
        await pool.query(
          `UPDATE messages SET read_at=COALESCE(read_at,NOW())
           WHERE conversation_id=$1 AND sender_type='agent' AND is_internal=FALSE AND read_at IS NULL
             AND created_at <= (SELECT created_at FROM messages WHERE id=$2)`,
          [convId, lastMessageId]
        );

        // Notify dashboard agents: visitor has read up to this message
        dashboardNsp.to(`conv:${convId}`).emit("visitor:read_receipt", {
          conversationId: convId,
          upToMessageId: lastMessageId,
          readAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error("visitor:read error:", err);
      }
    });

    // ── Load past conversation session for visitor (On-Demand Pagination) ──
    socket.on("visitor:load_past_session", async ({ conversationId }) => {
      try {
        if (!conversationId) return;
        const { rows: pMsgs } = await pool.query(
          `SELECT m.*, a.avatar_url AS sender_avatar, a.display_name AS sender_display_name
           FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           LEFT JOIN agents a ON m.sender_id = a.id
           WHERE m.conversation_id = $1 AND c.visitor_id = $2 AND m.is_internal = FALSE
           ORDER BY m.created_at ASC`,
          [conversationId, visitorId]
        );
        const { rows: cMeta } = await pool.query(
          "SELECT created_at FROM conversations WHERE id=$1",
          [conversationId]
        );
        socket.emit("visitor:past_session_loaded", {
          conversationId,
          messages: pMsgs,
          createdAt: cMeta[0]?.created_at,
        });
      } catch (err) {
        logger.error("visitor:load_past_session error:", err);
      }
    });

    // ── Flow progress ────────────────────────────────────────────
    socket.on("flow:progress", async ({ data, log, mode }) => {
      try {
        if (mode === "agent") {
          // Set cs_handoff_at = NOW() when bot hands over to CS agent.
          // This is the TRUE start time for SLA first-response measurement.
          // first_message_at remains the original visitor connect time (unchanged).
          await pool.query(
            `UPDATE conversations
             SET flow_data=$1, flow_log=$2, flow_mode=$3,
                 first_message_at=COALESCE(first_message_at, NOW()),
                 cs_handoff_at=COALESCE(cs_handoff_at, NOW()),
                 updated_at=NOW()
             WHERE id=$4`,
            [JSON.stringify(data || {}), JSON.stringify(log || []), mode, convId]
          );
        } else {
          await pool.query(
            "UPDATE conversations SET flow_data=$1, flow_log=$2, flow_mode=$3, updated_at=NOW() WHERE id=$4",
            [JSON.stringify(data || {}), JSON.stringify(log || []), mode || "menu", convId]
          );
        }
        await saveFlowState(visitorId, { data, log, mode });
        dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:flow_update", {
          conversationId: convId, flowData: data, flowLog: log, mode,
        });
        dashboardNsp.to("superadmin").emit("conversation:flow_update", {
          conversationId: convId, flowData: data, flowLog: log, mode,
        });
        if (mode === "agent") {
          dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:update", {
            conversationId: convId, flow_mode: "agent", status: "open", assigned_agent_id: null,
          });
          dashboardNsp.to("superadmin").emit("conversation:update", {
            conversationId: convId, flow_mode: "agent", status: "open", assigned_agent_id: null,
          });
        }
      } catch (err) {
        logger.error("flow:progress error:", err);
      }
    });

    // ── Post-chat rating ─────────────────────────────────────────
    socket.on("visitor:rating", async ({ satisfaction, resolved, rating, comment }) => {
      try {
        await pool.query(
          `UPDATE conversations SET
             rating_satisfaction=$1, rating_resolved=$2, rating_score=$3,
             rating_comment=$4, rated_at=NOW(), updated_at=NOW()
           WHERE id=$5`,
          [satisfaction, resolved, rating, comment || null, convId]
        );
        dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:rated", {
          conversationId: convId, satisfaction, resolved, rating, comment,
        });
        dashboardNsp.to("superadmin").emit("conversation:rated", {
          conversationId: convId, satisfaction, resolved, rating, comment,
        });
      } catch (err) {
        logger.error("visitor:rating error:", err);
      }
    });

    // ── End chat ─────────────────────────────────────────────────
    socket.on("visitor:end", async () => {
      try {
        let targetConvId = convId || socket.convId;
        if (!targetConvId) {
          const { rows: cRows } = await pool.query(
            "SELECT id FROM conversations WHERE visitor_id=$1 AND workspace_id=$2 AND status != 'resolved' ORDER BY created_at DESC LIMIT 1",
            [visitorId, workspace.id]
          );
          targetConvId = cRows[0]?.id;
        }
        if (!targetConvId) return;

        const vName = conversation?.visitor_name || "Visitor";
        const sysMsgText = `🔒 Sesi diakhiri oleh Visitor (${vName})`;
        const { rows: msgRows } = await pool.query(
          `INSERT INTO messages (conversation_id, sender_type, text, is_internal) VALUES ($1, 'system', $2, FALSE) RETURNING *`,
          [targetConvId, sysMsgText]
        );
        if (msgRows[0]) {
          dashboardNsp.to(`conv:${targetConvId}`).emit("agent:message", {
            conversationId: targetConvId, message: msgRows[0],
          });
        }

        await pool.query(
          "UPDATE conversations SET status='resolved', resolved_at=NOW(), updated_at=NOW() WHERE id=$1",
          [targetConvId]
        );
        await delFlowState(visitorId);
        await delVisitorConversation(visitorId);
        dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:resolved", { conversationId: targetConvId });
        dashboardNsp.to(`workspace:${workspace.id}`).emit("conversation:update", { conversationId: targetConvId, status: "resolved" });
        dashboardNsp.to("superadmin").emit("conversation:resolved", { conversationId: targetConvId });
        dashboardNsp.to("superadmin").emit("conversation:update", { conversationId: targetConvId, status: "resolved" });

        // Broadcast to ALL sockets/tabs of this visitor so all tabs update real-time
        visitorNsp.to(`visitor:${visitorId}`).emit("chat:resolved", { conversationId: targetConvId, message: "Percakapan telah diakhiri." });
        visitorNsp.to(`visitor:${visitorId}`).emit("conversation:resolved", { conversationId: targetConvId });
        if (targetConvId) {
          visitorNsp.to(`conv:${targetConvId}`).emit("chat:resolved", { conversationId: targetConvId, message: "Percakapan telah diakhiri." });
        }
      } catch (err) {
        logger.error("visitor:end error:", err);
      }
    });

    // ── Disconnect ───────────────────────────────────────────────
    socket.on("disconnect", () => {
      logger.info(`Visitor disconnected: ${visitorId}`);
    });
  });
}

module.exports = { registerVisitorSocket };
