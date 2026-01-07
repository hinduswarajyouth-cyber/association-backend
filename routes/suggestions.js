const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

/* SUBMIT */
router.post("/", verifyToken, async (req, res) => {
  const { title, message, type = "GENERAL" } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  await pool.query(
    `INSERT INTO suggestions (member_id,title,message,type,status)
     VALUES ($1,$2,$3,$4,'PENDING')`,
    [req.user.id, title || null, message, type]
  );

  res.json({ message: "Suggestion submitted" });
});

/* MY SUGGESTIONS */
router.get("/my", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM suggestions WHERE member_id=$1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

/* ALL (ADMIN / PRESIDENT) */
router.get(
  "/all",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    const { rows } = await pool.query(`
      SELECT s.*, u.name AS member_name
      FROM suggestions s
      JOIN users u ON u.id = s.member_id
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  }
);

/* APPROVE / REJECT */
router.put(
  "/:id/status",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    await pool.query(
      `UPDATE suggestions SET status=$1 WHERE id=$2`,
      [req.body.status, req.params.id]
    );
    res.json({ message: "Status updated" });
  }
);

module.exports = router;
