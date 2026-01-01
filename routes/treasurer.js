const express = require("express");
const router = express.Router();
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");

/* =====================================================
   📋 GET PENDING CONTRIBUTIONS
   GET /treasurer/pending
===================================================== */
router.get(
  "/pending",
  verifyToken,
  checkRole("TREASURER", "PRESIDENT"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          c.id,
          c.amount,
          c.payment_mode,
          c.reference_no,
          c.created_at,
          u.name AS member_name,
          f.fund_name
        FROM contributions c
        JOIN users u ON c.member_id = u.id
        JOIN funds f ON c.fund_id = f.id
        WHERE c.status = 'PENDING'
        ORDER BY c.created_at DESC
      `);

      res.json({ pending: result.rows });
    } catch (err) {
      console.error("PENDING LIST ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   📋 GET APPROVED CONTRIBUTIONS
   GET /treasurer/approved
===================================================== */
router.get(
  "/approved",
  verifyToken,
  checkRole("TREASURER", "PRESIDENT"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          c.id,
          c.amount,
          c.payment_mode,
          c.receipt_no,
          c.receipt_date,
          u.name AS member_name,
          f.fund_name
        FROM contributions c
        JOIN users u ON c.member_id = u.id
        JOIN funds f ON c.fund_id = f.id
        WHERE c.status = 'APPROVED'
        ORDER BY c.receipt_date DESC
      `);

      res.json({ approved: result.rows });
    } catch (err) {
      console.error("APPROVED LIST ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   ✅ APPROVE CONTRIBUTION + RECEIPT GENERATION
   PATCH /treasurer/approve/:id
===================================================== */
router.patch(
  "/approve/:id",
  verifyToken,
  checkRole("TREASURER", "PRESIDENT"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { id } = req.params;

      const contrib = await client.query(
        `SELECT * FROM contributions WHERE id=$1 AND status='PENDING'`,
        [id]
      );

      if (!contrib.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Contribution not found" });
      }

      const { fund_id, amount } = contrib.rows[0];

      // 🔑 RECEIPT NUMBER GENERATION
      const year = new Date().getFullYear();
      const receiptNo = `REC-${year}-${String(id).padStart(3, "0")}`;

      // ✅ UPDATE CONTRIBUTION
      await client.query(
        `
        UPDATE contributions
        SET status='APPROVED',
            receipt_no=$1,
            receipt_date=NOW()
        WHERE id=$2
        `,
        [receiptNo, id]
      );

      // 💰 UPDATE FUND BALANCE
      await client.query(
        `UPDATE funds SET balance = balance + $1 WHERE id=$2`,
        [amount, fund_id]
      );

      await logAudit(
        "APPROVE",
        "CONTRIBUTION",
        id,
        req.user.id,
        { amount, receipt_no: receiptNo }
      );

      await client.query("COMMIT");

      res.json({
        message: "Contribution approved successfully",
        receipt_no: receiptNo,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("APPROVE ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    } finally {
      client.release();
    }
  }
);

/* =====================================================
   ❌ REJECT CONTRIBUTION
   PATCH /treasurer/reject/:id
===================================================== */
router.patch(
  "/reject/:id",
  verifyToken,
  checkRole("TREASURER", "PRESIDENT"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `
        UPDATE contributions
        SET status='REJECTED'
        WHERE id=$1 AND status='PENDING'
        RETURNING *
        `,
        [id]
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Contribution not found" });
      }

      await logAudit(
        "REJECT",
        "CONTRIBUTION",
        id,
        req.user.id
      );

      res.json({ message: "Contribution rejected" });
    } catch (err) {
      console.error("REJECT ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
