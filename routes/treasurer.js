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
      const { rows } = await pool.query(`
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

      res.json({ pending: rows });
    } catch (err) {
      console.error("PENDING ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   📊 TREASURER DASHBOARD SUMMARY
   GET /treasurer/summary
===================================================== */
router.get(
  "/summary",
  verifyToken,
  checkRole("TREASURER", "SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='PENDING') AS pending_count,
          COUNT(*) FILTER (WHERE status='APPROVED') AS approved_count,
          COALESCE(SUM(amount) FILTER (WHERE status='APPROVED'),0) AS total_collection
        FROM contributions
      `);

      res.json(rows[0]);
    } catch (err) {
      console.error("SUMMARY ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   ✅ APPROVE CONTRIBUTION (100% SAFE)
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

      /* 1️⃣ Lock contribution */
      const { rows, rowCount } = await client.query(
        `SELECT * FROM contributions WHERE id=$1 FOR UPDATE`,
        [contributionId]
      );

      if (!rowCount) throw new Error("Contribution not found");

      const c = rows[0];

      if (c.status !== "PENDING")
        throw new Error("Already processed");

      /* 2️⃣ Financial year check */
      const year = new Date(c.created_at).getFullYear();
      if (await isYearClosed(year))
        throw new Error("Financial year closed");

      /* 3️⃣ Receipt number */
      const seq = await client.query(
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
        seq.rows[0].last_number
      ).padStart(6, "0")}`;

      /* 4️⃣ Ledger balance (SAFE – NO UNDEFINED) */
      const balRes = await client.query(
        `
        SELECT balance_after
        FROM ledger
        WHERE fund_id=$1
        ORDER BY id DESC
        LIMIT 1
        `,
        [c.fund_id]
      );

      const previousBalance =
        balRes.rows.length > 0
          ? Number(balRes.rows[0].balance_after)
          : 0;

      const newBalance = previousBalance + Number(c.amount);

      /* 5️⃣ Update contribution */
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

      /* 6️⃣ Ledger entry */
      await client.query(
        `
        INSERT INTO ledger
          (entry_type, source, source_id, fund_id, amount, balance_after, created_by)
        VALUES
          ('CREDIT','CONTRIBUTION',$1,$2,$3,$4,$5)
        `,
        [
          contributionId,
          c.fund_id,
          c.amount,
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

      res.json({
        message: "Contribution approved",
        receipt_no: receiptNo,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("APPROVE ERROR 👉", err.message);
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

      const { rowCount } = await pool.query(
        `
        UPDATE contributions
        SET
          status='REJECTED',
          cancel_reason=$2,
          cancelled_by=$3,
          cancelled_at=NOW()
        WHERE id=$1 AND status='PENDING'
        `,
        [req.params.id, reason, req.user.id]
      );

      if (!rowCount)
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
      console.error("REJECT ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
