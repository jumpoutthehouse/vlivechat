const { pool } = require('./src/db');

async function runTest() {
  console.log("🚀 Starting 4-Chat Empirical Test Simulation...");

  // Get workspace and agent IDs
  const { rows: ws } = await pool.query("SELECT id FROM workspaces LIMIT 1");
  const { rows: ag } = await pool.query("SELECT id FROM agents WHERE role != 'superadmin' LIMIT 1");
  if (!ws[0] || !ag[0]) {
    console.error("Workspace or Agent not found");
    process.exit(1);
  }

  const workspaceId = ws[0].id;
  const agentId = ag[0].id;
  const visitorId = "v_empirical_tester_001";

  // Clean existing
  await pool.query("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE visitor_id=$1)", [visitorId]);
  await pool.query("DELETE FROM conversations WHERE visitor_id=$1", [visitorId]);

  // Session 1: Admin CS handles & resolves
  const { rows: c1 } = await pool.query(
    `INSERT INTO conversations (workspace_id, visitor_id, visitor_name, status, flow_mode, assigned_agent_id, session_count, first_message_at, first_response_at, resolved_at)
     VALUES ($1, $2, 'tester1', 'resolved', 'agent', $3, 1, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '29 minutes', NOW() - INTERVAL '25 minutes')
     RETURNING id`,
    [workspaceId, visitorId, agentId]
  );
  await pool.query(
    `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, text) VALUES
     ($1, 'visitor', NULL, 'tester1', 'Halo CS'),
     ($1, 'agent', $2, 'Demo Admin', 'oke bro')`,
    [c1[0].id, agentId]
  );
  console.log("✅ Session 1 created: CS Handled & Resolved");

  // Re-open/Start Session 2: Admin CS handles & resolves
  await pool.query(
    `UPDATE conversations SET
       session_count = 2,
       status = 'resolved',
       flow_mode = 'agent',
       assigned_agent_id = $1,
       first_message_at = NOW() - INTERVAL '20 minutes',
       first_response_at = NOW() - INTERVAL '19 minutes',
       resolved_at = NOW() - INTERVAL '15 minutes'
     WHERE id = $2`,
    [agentId, c1[0].id]
  );
  await pool.query(
    `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, text) VALUES
     ($1, 'visitor', NULL, 'tester1', 'Tolong dibantu'),
     ($1, 'agent', $2, 'Demo Admin', 'siap bro')`,
    [c1[0].id, agentId]
  );
  console.log("✅ Session 2 created: CS Handled & Resolved (session_count = 2)");

  // Re-open/Start Session 3: Bot Handled & Visitor Ended
  await pool.query(
    `UPDATE conversations SET
       session_count = 3,
       status = 'resolved',
       flow_mode = 'bot',
       first_message_at = NOW() - INTERVAL '10 minutes',
       resolved_at = NOW() - INTERVAL '8 minutes'
     WHERE id = $1`,
    [c1[0].id]
  );
  await pool.query(
    `INSERT INTO messages (conversation_id, sender_type, text) VALUES
     ($1, 'visitor', 'Pilih menu Bot'),
     ($1, 'bot', 'Ini balasan bot')`,
    [c1[0].id]
  );
  console.log("✅ Session 3 created: Bot Handled & Visitor Ended (session_count = 3)");

  // Re-open/Start Session 4: Bot Handled & Visitor Ended
  await pool.query(
    `UPDATE conversations SET
       session_count = 4,
       status = 'resolved',
       flow_mode = 'bot',
       first_message_at = NOW() - INTERVAL '5 minutes',
       resolved_at = NOW() - INTERVAL '3 minutes'
     WHERE id = $1`,
    [c1[0].id]
  );
  await pool.query(
    `INSERT INTO messages (conversation_id, sender_type, text) VALUES
     ($1, 'visitor', 'Pilih info promo'),
     ($1, 'bot', 'Promo 100% bonus')`,
    [c1[0].id]
  );
  console.log("✅ Session 4 created: Bot Handled & Visitor Ended (session_count = 4)");

  // Query Reports endpoint internal logic to inspect results
  const dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
  const [totals, byAgent] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(COALESCE(session_count, 1)), 0)::int AS total, COALESCE(SUM(COALESCE(session_count, 1)) FILTER (WHERE status='resolved'), 0)::int AS resolved FROM conversations WHERE workspace_id=$1 ${dateFilter}`, [workspaceId]),
    pool.query(`SELECT a.name, COALESCE(SUM(COALESCE(c.session_count, 1)), 0)::int AS total_handled, COALESCE(SUM(COALESCE(c.session_count, 1)) FILTER (WHERE c.status='resolved'), 0)::int AS resolved FROM agents a LEFT JOIN conversations c ON c.assigned_agent_id = a.id WHERE a.workspace_id=$1 GROUP BY a.id, a.name`, [workspaceId]),
  ]);

  console.log("\n📊 REPORTS OVERVIEW METRICS RESULT:");
  console.log("Totals:", totals.rows[0]);
  console.log("Agent Stats:", byAgent.rows);

  process.exit(0);
}

runTest().catch(e => { console.error(e); process.exit(1); });
