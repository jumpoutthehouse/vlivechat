/**
 * Migration: Update bank node in flow_config to text input format
 * Run: node backend/update-bank-flow.js
 */
require("dotenv").config({ path: __dirname + "/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "vlivechat",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

async function migrate() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT id, flow_config FROM workspaces");
    for (const ws of rows) {
      let flow = ws.flow_config || {};
      let nodes = flow.nodes || [];

      // Update bank node or add if missing
      let bankNode = nodes.find(n => n.id === "bank_selection" || n.id === "pilih_bank");
      if (bankNode) {
        bankNode.type = "input";
        bankNode.message = "Ketik Jenis Rekening. Contoh : BCA, BRI, Dana, dll 👇";
        bankNode.field = "jenis_rekening";
        delete bankNode.options;
      } else {
        nodes.push({
          id: "bank_selection",
          type: "input",
          message: "Ketik Jenis Rekening. Contoh : BCA, BRI, Dana, dll 👇",
          field: "jenis_rekening",
          next: "connect_agent",
        });
      }

      await client.query(
        "UPDATE workspaces SET flow_config=$1 WHERE id=$2",
        [JSON.stringify({ ...flow, nodes }), ws.id]
      );
    }
    console.log("✅ Bank selection node updated to text input format across workspaces!");
  } catch (err) {
    console.error("❌ Error updating bank flow:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
