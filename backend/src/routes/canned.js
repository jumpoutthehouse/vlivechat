const express = require("express");
const { pool } = require("../db");
const { auth } = require("../middleware/auth");

const router = express.Router();

async function getWorkspaceId(req) {
  if (req.workspaceId) return req.workspaceId;
  if (req.agentId) {
    const { rows } = await pool.query("SELECT workspace_id FROM agents WHERE id=$1", [req.agentId]);
    if (rows[0]?.workspace_id) return rows[0].workspace_id;
  }
  const { rows: firstWs } = await pool.query("SELECT id FROM workspaces LIMIT 1");
  return firstWs[0]?.id || null;
}

// ── GET /api/v1/canned — list canned responses ─────────────────
router.get("/", auth, async (req, res) => {
  try {
    const wsId = await getWorkspaceId(req);
    const { search, category } = req.query;

    let where = ["cr.workspace_id = $1"];
    const params = [wsId];
    let pi = 2;

    if (search) {
      where.push(`(cr.shortcut ILIKE $${pi} OR cr.title ILIKE $${pi} OR cr.content ILIKE $${pi})`);
      params.push(`%${search}%`);
      pi++;
    }
    if (category) {
      where.push(`cr.category = $${pi++}`);
      params.push(category);
    }

    const { rows } = await pool.query(
      `SELECT cr.*, a.name AS created_by_name
       FROM canned_responses cr
       LEFT JOIN agents a ON cr.created_by = a.id
       WHERE ${where.join(" AND ")}
       ORDER BY cr.shortcut ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/canned/search?q=... — quick search for typeahead ──
router.get("/search", auth, async (req, res) => {
  try {
    const wsId = await getWorkspaceId(req);
    const { q = "" } = req.query;
    const { rows } = await pool.query(
      `SELECT id, shortcut, title, content, category
       FROM canned_responses
       WHERE workspace_id=$1 AND (shortcut ILIKE $2 OR title ILIKE $2)
       ORDER BY shortcut ASC LIMIT 8`,
      [wsId, `%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/canned — create ───────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const wsId = await getWorkspaceId(req);
    const { shortcut, title, content, category } = req.body;
    if (!shortcut || !title || !content) {
      return res.status(400).json({ error: "shortcut, title, dan content wajib diisi" });
    }

    const cleanShortcut = shortcut.startsWith("/") ? shortcut : `/${shortcut}`;

    const { rows } = await pool.query(
      `INSERT INTO canned_responses (workspace_id, shortcut, title, content, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [wsId, cleanShortcut, title.trim(), content.trim(), category || null, req.agentId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Shortcut sudah digunakan" });
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/v1/canned/:id — update ─────────────────────────
router.patch("/:id", auth, async (req, res) => {
  try {
    const wsId = await getWorkspaceId(req);
    const { shortcut, title, content, category } = req.body;
    const sets = [];
    const vals = [];
    let i = 1;

    if (shortcut !== undefined) {
      const clean = shortcut.startsWith("/") ? shortcut : `/${shortcut}`;
      sets.push(`shortcut=$${i++}`); vals.push(clean);
    }
    if (title   !== undefined) { sets.push(`title=$${i++}`);   vals.push(title); }
    if (content !== undefined) { sets.push(`content=$${i++}`); vals.push(content); }
    if (category!== undefined) { sets.push(`category=$${i++}`);vals.push(category); }

    if (sets.length === 0) return res.status(400).json({ error: "Tidak ada data" });

    vals.push(req.params.id, wsId);
    const { rows } = await pool.query(
      `UPDATE canned_responses SET ${sets.join(", ")}, updated_at=NOW()
       WHERE id=$${i} AND workspace_id=$${i+1}
       RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Shortcut sudah digunakan" });
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/v1/canned/:id ─────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  try {
    const wsId = await getWorkspaceId(req);
    const { rowCount } = await pool.query(
      "DELETE FROM canned_responses WHERE id=$1 AND workspace_id=$2",
      [req.params.id, wsId]
    );
    if (!rowCount) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json({ message: "Canned response dihapus" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
