const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

/* =========================
   ROLES
========================= */
const ADMIN_ROLES = ["SUPER_ADMIN", "PRESIDENT", "TREASURER"];

/* =====================================================
   1️⃣ MEMBER → SUBMIT CONTRIBUTION (CASH / GENERAL)
===================================================== */
router.post("/submit", verifyToken, async (req, res) => {
  try {
    const { amount, fund_id = null, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    await pool.query(
      `
      INSERT INTO contributions
      (member_id, fund_id, amount, payment_mode, status, payment_note)
      VALUES ($1, $2, $3, 'CASH', 'PENDING', $4)
      `,
      [req.user.id, fund_id, amount, note || null]
    );

    res.json({ message: "Contribution submitted successfully" });
  } catch (err) {
    console.error("SUBMIT ERROR 👉", err.message);
    res.status(500).json({ error: "Contribution failed" });
  }
});

/* =====================================================
   2️⃣ MEMBER → VIEW OWN CONTRIBUTIONS
===================================================== */
router.get("/my", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        c.id,
        f.fund_name,
        c.amount,
        c.payment_mode,
        c.status,
        c.receipt_no,
        c.receipt_date,
        c.created_at
      FROM contributions c
      LEFT JOIN funds f ON f.id = c.fund_id
      WHERE c.member_id = $1
      ORDER BY c.created_at DESC
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("MY CONTRIBUTIONS ERROR 👉", err.message);
    res.status(500).json([]);
  }
});

/* =====================================================
   3️⃣ ADMIN / TREASURER → VIEW ALL CONTRIBUTIONS
===================================================== */
router.get(
  "/all",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT
          c.id,
          u.name AS member_name,
          f.fund_name,
          c.amount,
          c.payment_mode,
          c.status,
          c.receipt_no,
          c.receipt_date,
          c.created_at
        FROM contributions c
        JOIN users u ON u.id = c.member_id
        LEFT JOIN funds f ON f.id = c.fund_id
        ORDER BY c.created_at DESC
        `
      );

      res.json(rows);
    } catch (err) {
      console.error("ALL CONTRIBUTIONS ERROR 👉", err.message);
      res.status(500).json([]);
    }
  }
);

/* =====================================================
   4️⃣ ADMIN / TREASURER → APPROVE CONTRIBUTION
===================================================== */
router.put(
  "/approve/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      await pool.query(
        `
        UPDATE contributions
        SET status='APPROVED',
            receipt_date = NOW()
        WHERE id=$1
        `,
        [req.params.id]
      );

      res.json({ message: "Contribution approved" });
    } catch (err) {
      console.error("APPROVE ERROR 👉", err.message);
      res.status(500).json({ error: "Approval failed" });
    }
  }
);

/* =====================================================
   5️⃣ ADMIN / TREASURER → DASHBOARD STATS
===================================================== */
router.get(
  "/stats",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS total_count,
          COALESCE(SUM(amount),0)::int AS total_amount,
          COUNT(*) FILTER (WHERE status='PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE status='APPROVED')::int AS approved
        FROM contributions
      `);

      res.json(rows[0]);
    } catch (err) {
      console.error("STATS ERROR 👉", err.message);
      res.status(500).json({
        total_count: 0,
        total_amount: 0,
        pending: 0,
        approved: 0,
      });
    }
  }
);

module.exports = router;
