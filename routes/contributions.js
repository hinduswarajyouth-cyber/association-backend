const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

/* =====================================================
   ROLES
===================================================== */
const ADMIN_ROLES = ["SUPER_ADMIN", "PRESIDENT"];
const FINANCE_ROLES = ["TREASURER", ...ADMIN_ROLES];

/* =====================================================
   1️⃣ MEMBER → SUBMIT CONTRIBUTION
===================================================== */
router.post("/submit", verifyToken, async (req, res) => {
  try {
    const { amount, fund_name, note, payment_method = "CASH" } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    await pool.query(
      `
      INSERT INTO contributions
      (member_id, amount, fund_name, payment_method, payment_status, payment_note)
      VALUES ($1,$2,$3,$4,'PENDING',$5)
      `,
      [
        req.user.id,
        amount,
        fund_name || "GENERAL",
        payment_method,
        note || null,
      ]
    );

    res.status(201).json({ message: "Contribution submitted successfully" });
  } catch (err) {
    console.error("SUBMIT CONTRIBUTION ERROR 👉", err.message);
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
        id,
        amount,
        fund_name,
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

    res.json(rows);
  } catch (err) {
    console.error("MY CONTRIBUTIONS ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load contributions" });
  }
});

/* =====================================================
   3️⃣ ADMIN / TREASURER → VIEW ALL
===================================================== */
router.get(
  "/all",
  verifyToken,
  checkRole(...FINANCE_ROLES),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT
          c.id,
          c.amount,
          c.fund_name,
          c.payment_method,
          c.payment_status,
          c.payment_note,
          c.created_at,
          u.name AS member_name
        FROM contributions c
        JOIN users u ON u.id = c.member_id
        ORDER BY c.created_at DESC
        `
      );

      res.json(rows);
    } catch (err) {
      console.error("ALL CONTRIBUTIONS ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to load contributions" });
    }
  }
);

/* =====================================================
   4️⃣ TREASURER / ADMIN → APPROVE
===================================================== */
router.put(
  "/approve/:id",
  verifyToken,
  checkRole(...FINANCE_ROLES),
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

module.exports = router;
