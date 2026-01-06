const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

/* =====================================================
   💡 SUBMIT SUGGESTION (ALL LOGGED USERS)
===================================================== */
router.post("/", verifyToken, async (req, res) => {
  try {
    const { title, message, type = "GENERAL" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    await pool.query(
      `
      INSERT INTO suggestions (member_id, title, message, type)
      VALUES ($1, $2, $3, $4)
      `,
      [req.user.id, title || null, message, type]
    );

    res.json({ message: "Suggestion submitted successfully" });
  } catch (err) {
    console.error("SUBMIT SUGGESTION ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to submit suggestion" });
  }
});

/* =====================================================
   📊 DASHBOARD SUGGESTIONS (ALL USERS)
   👉 Shows latest 5
===================================================== */
router.get("/dashboard", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.id,
        s.title,
        s.message,
        s.type,
        s.created_at,
        u.name AS member_name
      FROM suggestions s
      JOIN users u ON u.id = s.member_id
      ORDER BY s.created_at DESC
      LIMIT 5
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("DASHBOARD SUGGESTIONS ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load suggestions" });
  }
});

/* =====================================================
   📋 ALL SUGGESTIONS (ADMIN / PRESIDENT)
===================================================== */
router.get(
  "/",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          s.id,
          s.title,
          s.message,
          s.type,
          s.created_at,
          u.name AS member_name
        FROM suggestions s
        JOIN users u ON u.id = s.member_id
        ORDER BY s.created_at DESC
      `);

      res.json(result.rows);
    } catch (err) {
      console.error("GET ALL SUGGESTIONS ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to load suggestions" });
    }
  }
);

/* =====================================================
   🗑️ DELETE SUGGESTION (SUPER_ADMIN ONLY) – OPTIONAL
===================================================== */
router.delete(
  "/:id",
  verifyToken,
  checkRole("SUPER_ADMIN"),
  async (req, res) => {
    try {
      await pool.query(
        `DELETE FROM suggestions WHERE id = $1`,
        [req.params.id]
      );

      res.json({ message: "Suggestion deleted successfully" });
    } catch (err) {
      console.error("DELETE SUGGESTION ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to delete suggestion" });
    }
  }
);

module.exports = router;
