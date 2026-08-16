const cron = require("node-cron");
const { pool } = require("../db");
const logger = require("../utils/logger");

/**
 * SLA Service — Cronjob untuk marking missed chats
 * Berjalan setiap menit
 */
function startSLACron(io) {
  // Setiap menit: cek conversation open yang sudah melewati SLA
  cron.schedule("* * * * *", async () => {
    try {
      // Get all active workspaces with their SLA settings
      const { rows: workspaces } = await pool.query(
        "SELECT id, sla_first_response FROM workspaces WHERE is_active=TRUE"
      );

      for (const ws of workspaces) {
        const slaMinutes = ws.sla_first_response || 5;

        // Mark conversations as "missed" if:
        // - status is 'open' (not yet handled by agent)
        // - flow_mode = 'agent' (CS is expected to respond, not bot)
        // - no first_response_at (agent hasn't replied yet)
        // - time since HANDOFF exceeds SLA threshold
        //   → use cs_handoff_at if set (bot→CS transition moment)
        //   → fall back to first_message_at for direct-to-agent conversations
        //   This is critical: a visitor may spend time in bot menus before requesting CS.
        //   SLA timer must NOT start from conversation creation — only from CS request.
        const { rows: missed } = await pool.query(
          `UPDATE conversations SET
             status='missed',
             missed_at=NOW(),
             updated_at=NOW()
           WHERE workspace_id=$1
             AND status IN ('open', 'assigned')
             AND flow_mode='agent'
             AND COALESCE(cs_handoff_at, first_message_at) IS NOT NULL
             AND first_response_at IS NULL
             AND COALESCE(cs_handoff_at, first_message_at) < NOW() - ($2 || ' minutes')::INTERVAL
           RETURNING id, workspace_id, visitor_name, visitor_id`,
          [ws.id, slaMinutes]
        );

        if (missed.length > 0) {
          logger.warn(`⚠️  SLA missed: ${missed.length} conversations in workspace ${ws.id}`);

          // Notify dashboard
          io.of("/dashboard").to(`workspace:${ws.id}`).emit("sla:missed", {
            conversations: missed,
            workspaceId: ws.id,
          });

          // Insert system message in each missed conversation
          for (const conv of missed) {
            await pool.query(
              `INSERT INTO messages (conversation_id, sender_type, text)
               VALUES ($1, 'system', 'Chat ini ditandai sebagai terlewat (SLA exceeded).')
               ON CONFLICT DO NOTHING`,
              [conv.id]
            );
          }
        }

        // Auto-archive inactive conversations (no activity for > 15 minutes)
        const { rows: autoArchived } = await pool.query(
          `UPDATE conversations SET status='resolved', resolved_at=NOW(), updated_at=NOW()
           WHERE workspace_id=$1
             AND status IN ('open','assigned','missed')
             AND updated_at < NOW() - INTERVAL '15 minutes'
           RETURNING id, visitor_id`,
          [ws.id]
        );

        if (autoArchived.length > 0) {
          logger.info(`📦 Auto-archived ${autoArchived.length} inactive conversations in workspace ${ws.id}`);
          const livechatNsp = io.of("/livechat");
          const dashboardNsp = io.of("/dashboard");

          for (const c of autoArchived) {
            // Insert system message into conversation
            await pool.query(
              `INSERT INTO messages (conversation_id, sender_type, text)
               VALUES ($1, 'system', 'Percakapan telah diakhiri otomatis oleh sistem karena tidak ada aktivitas selama 15 menit.')
               ON CONFLICT DO NOTHING`,
              [c.id]
            );

            // Notify Admin Dashboard
            dashboardNsp.to(`workspace:${ws.id}`).emit("conversation:resolved", { conversationId: c.id });

            // Notify Visitor Widget real-time
            if (c.visitor_id) {
              livechatNsp.to(`visitor:${c.visitor_id}`).emit("conversation:resolved", { conversationId: c.id });
              livechatNsp.to(`visitor:${c.visitor_id}`).emit("chat:resolved", { conversationId: c.id });
            }
            livechatNsp.to(`conv:${c.id}`).emit("conversation:resolved", { conversationId: c.id });
            livechatNsp.to(`conv:${c.id}`).emit("chat:resolved", { conversationId: c.id });
          }
        }
      }
    } catch (err) {
      logger.error("SLA cron error:", err);
    }
  });

  logger.info("✅ SLA cron job started (runs every minute)");
}

module.exports = { startSLACron };
