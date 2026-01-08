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
   1️⃣ MEMBER → SUBMIT CASH CONTRIBUTION
===================================================== */
router.post("/submit", verifyToken, async (req, res) => {
  try {
    const { amount, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    await pool.query(
      `
      INSERT INTO contributions
      (member_id, amount, payment_method, payment_status, payment_note)
      VALUES ($1,$2,'CASH','PENDING',$3)
      `,
      [req.user.id, amount, note || null]
    );

    res.json({ message: "Contribution submitted (Cash)" });
  } catch (err) {
    console.error("CASH SUBMIT ERROR 👉", err.message);
    res.status(500).json({ error: "Contribution failed" });
  }
});

/* =====================================================
   2️⃣ MEMBER → INITIATE UPI PAYMENT
===================================================== */
router.post("/upi-init", verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const result = await pool.query(
      `
      INSERT INTO contributions
      (member_id, amount, payment_method, payment_status)
      VALUES ($1,$2,'UPI','PENDING')
      RETURNING id
      `,
      [req.user.id, amount]
    );

    res.json({
      contribution_id: result.rows[0].id,
    });
  } catch (err) {
    console.error("UPI INIT ERROR 👉", err.message);
    res.status(500).json({ error: "UPI init failed" });
  }
});

/* =====================================================
   3️⃣ MEMBER → VIEW OWN CONTRIBUTIONS
===================================================== */
router.get("/my", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        amount,
        payment_method,
        payment_status,
        payment_note,
        created_at
      FROM contributions
      WHERE member_id=$1
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    res.json(rows); // ✅ always array
  } catch (err) {
    console.error("MY CONTRIBUTIONS ERROR 👉", err.message);
    res.status(500).json([]);
  }
});

/* =====================================================
   4️⃣ ADMIN / TREASURER → VIEW ALL CONTRIBUTIONS
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
          c.amount,
          c.payment_method,
          c.payment_status,
          c.payment_note,
          c.created_at
        FROM contributions c
        JOIN users u ON u.id = c.member_id
        ORDER BY c.created_at DESC
        `
      );

      res.json(rows); // ✅ always array
    } catch (err) {
      console.error("ALL CONTRIBUTIONS ERROR 👉", err.message);
      res.status(500).json([]);
    }
  }
);

/* =====================================================
   5️⃣ ADMIN / TREASURER → APPROVE CONTRIBUTION
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
        SET payment_status='APPROVED'
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
   6️⃣ ADMIN / TREASURER → DASHBOARD STATS
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
          COUNT(*) FILTER (WHERE payment_status='PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE payment_status='APPROVED')::int AS approved
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
