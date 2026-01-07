const express = require("express");
const router = express.Router();
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");
const isYearClosed = require("../utils/isYearClosed");

/* =====================================================
   📋 GET PENDING CONTRIBUTIONS
   GET /treasurer/pending
===================================================== */
router.get(
  "/pending",
  verifyToken,
  checkRole("TREASURER", "SUPER_ADMIN", "PRESIDENT"),
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
        JOIN users u ON u.id = c.member_id
        JOIN funds f ON f.id = c.fund_id
        WHERE c.status = 'PENDING'
        ORDER BY c.created_at DESC
      `);

      res.json({ pending: result.rows });
    } catch (err) {
      console.error("PENDING ERROR 👉", err.message);
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
  checkRole("TREASURER", "SUPER_ADMIN", "PRESIDENT"),
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
        JOIN users u ON u.id = c.member_id
        JOIN funds f ON f.id = c.fund_id
        WHERE c.status = 'APPROVED'
        ORDER BY c.receipt_date DESC NULLS LAST
      `);

      res.json({ approved: result.rows });
    } catch (err) {
      console.error("APPROVED ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   ✅ APPROVE CONTRIBUTION
   PATCH /treasurer/approve/:id
===================================================== */
router.patch(
  "/approve/:id",
  verifyToken,
  checkRole("TREASURER", "SUPER_ADMIN"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const contributionId = Number(req.params.id);
      const approvedBy = req.user.id;

      await client.query("BEGIN");

      const contribRes = await client.query(
        `SELECT * FROM contributions WHERE id=$1 FOR UPDATE`,
        [contributionId]
      );

      if (!contribRes.rowCount) throw new Error("Contribution not found");
      const contribution = contribRes.rows[0];

      if (contribution.status !== "PENDING")
        throw new Error("Already processed");

      const year = new Date(contribution.created_at).getFullYear();
      if (await isYearClosed(year))
        throw new Error("Financial year closed");

      /* Receipt sequence */
      const seqRes = await client.query(
        `
        INSERT INTO receipt_sequence (year, last_number)
        VALUES ($1, 1)
        ON CONFLICT (year)
        DO UPDATE SET last_number = receipt_sequence.last_number + 1
        RETURNING last_number
        `,
        [year]
      );

      const receiptNo = `REC-${year}-${String(
        seqRes.rows[0].last_number
      ).padStart(6, "0")}`;

      /* Ledger balance */
      const balRes = await client.query(
        `
        SELECT COALESCE(balance_after,0) AS balance
        FROM ledger
        WHERE fund_id=$1
        ORDER BY id DESC
        LIMIT 1
        `,
        [contribution.fund_id]
      );

      const newBalance =
        Number(balRes.rows[0].balance) + Number(contribution.amount);

      await client.query(
        `
        UPDATE contributions
        SET
          status='APPROVED',
          approved_by=$1,
          approved_at=NOW(),
          receipt_no=$2,
          receipt_date=NOW()
        WHERE id=$3
        `,
        [approvedBy, receiptNo, contributionId]
      );

      await client.query(
        `
        INSERT INTO ledger
          (entry_type, source, source_id, fund_id, amount, balance_after, created_by)
        VALUES
          ('CREDIT','CONTRIBUTION',$1,$2,$3,$4,$5)
        `,
        [
          contributionId,
          contribution.fund_id,
          contribution.amount,
          newBalance,
          approvedBy,
        ]
      );

      await logAudit(
        "APPROVE",
        "CONTRIBUTION",
        contributionId,
        approvedBy,
        { receipt_no: receiptNo }
      );

      await client.query("COMMIT");

      res.json({ message: "Approved", receipt_no: receiptNo });
    } catch (err) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: err.message });
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
  checkRole("TREASURER", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason)
        return res.status(400).json({ error: "Reason required" });

      const result = await pool.query(
        `
        UPDATE contributions
        SET
          status='REJECTED',
          cancel_reason=$2,
          cancelled_by=$3,
          cancelled_at=NOW()
        WHERE id=$1 AND status='PENDING'
        RETURNING id
        `,
        [req.params.id, reason, req.user.id]
      );

      if (!result.rowCount)
        return res.status(404).json({ error: "Not found" });

      await logAudit(
        "REJECT",
        "CONTRIBUTION",
        req.params.id,
        req.user.id,
        { reason }
      );

      res.json({ message: "Rejected" });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
