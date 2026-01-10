const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

/* ROLES */
const ADMIN = ["SUPER_ADMIN", "PRESIDENT"];
const OFFICE = [
  "VICE_PRESIDENT",
  "GENERAL_SECRETARY",
  "JOINT_SECRETARY",
  "EC_MEMBER",
];

/* ================= CREATE ================= */
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { subject, description, priority } = req.body;
    if (!subject || !description)
      return res.status(400).json({ error: "Required fields missing" });

    const { rows } = await pool.query(
      `INSERT INTO complaints (member_id, subject, description, priority)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [req.user.id, subject, description, priority || "NORMAL"]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Create failed" });
  }
});

/* ================= VIEW ================= */
router.get("/my", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM complaints
     WHERE member_id=$1
     ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.get("/all", verifyToken, checkRole(...ADMIN), async (_, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM complaints ORDER BY created_at DESC`
  );
  res.json(rows);
});

router.get("/assigned", verifyToken, checkRole(...OFFICE), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM complaints
     WHERE assigned_role=$1
     ORDER BY updated_at DESC`,
    [req.user.role]
  );
  res.json(rows);
});

/* ================= ASSIGN ================= */
router.put("/assign/:id", verifyToken, checkRole(...ADMIN), async (req, res) => {
  const { assigned_role, instruction } = req.body;
  if (!OFFICE.includes(assigned_role))
    return res.status(400).json({ error: "Invalid role" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `UPDATE complaints
       SET assigned_role=$1,
           assigned_by=$2,
           status='FORWARDED'
       WHERE id=$3`,
      [assigned_role, req.user.id, req.params.id]
    );

    if (!r.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }

    if (instruction) {
      await client.query(
        `INSERT INTO complaint_comments
         (complaint_id, comment, commented_by, comment_type)
         VALUES ($1,$2,$3,'INSTRUCTION')`,
        [req.params.id, instruction, req.user.id]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Assign failed" });
  } finally {
    client.release();
  }
});

/* ================= PROGRESS ================= */
router.put("/progress/:id", verifyToken, checkRole(...OFFICE), async (req, res) => {
  const { status, comment } = req.body;
  if (!["IN_PROGRESS", "RESOLVED"].includes(status))
    return res.status(400).json({ error: "Invalid status" });

  const r = await pool.query(
    `UPDATE complaints
     SET status=$1
     WHERE id=$2 AND assigned_role=$3`,
    [status, req.params.id, req.user.role]
  );

  if (!r.rowCount)
    return res.status(403).json({ error: "Unauthorized" });

  if (comment) {
    await pool.query(
      `INSERT INTO complaint_comments
       (complaint_id, comment, commented_by, comment_type)
       VALUES ($1,$2,$3,'UPDATE')`,
      [req.params.id, comment, req.user.id]
    );
  }

  res.json({ success: true });
});

/* ================= CLOSE ================= */
router.put("/close/:id", verifyToken, checkRole(...ADMIN), async (req, res) => {
  const r = await pool.query(
    `UPDATE complaints
     SET status='CLOSED',
         closed_by=$1
     WHERE id=$2 AND status='RESOLVED'`,
    [req.user.id, req.params.id]
  );

  if (!r.rowCount)
    return res.status(400).json({ error: "Resolve first" });

  res.json({ success: true });
});

/* ================= COMMENTS ================= */
router.get("/comments/:id", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cc.comment, cc.comment_type, cc.created_at,
            u.name AS commented_by, u.role
     FROM complaint_comments cc
     JOIN users u ON u.id=cc.commented_by
     WHERE complaint_id=$1
     ORDER BY created_at`,
    [req.params.id]
  );
  res.json(rows);
});

/* ================= STATS ================= */
router.get("/stats", verifyToken, checkRole(...ADMIN), async (_, res) => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status='OPEN') open,
      COUNT(*) FILTER (WHERE status='FORWARDED') forwarded,
      COUNT(*) FILTER (WHERE status='IN_PROGRESS') in_progress,
      COUNT(*) FILTER (WHERE status='RESOLVED') resolved,
      COUNT(*) FILTER (WHERE status='CLOSED') closed
    FROM complaints
  `);
  res.json(rows[0]);
});

module.exports = router;
