const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");
const isYearClosed = require("../utils/isYearClosed");

/* =====================================================
   📊 TREASURER SUMMARY (LEDGER BASED)
===================================================== */
router.get(
  "/summary",
  verifyToken,
  checkRole("TREASURER", "SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE source='MEMBER') AS member_count,
          COUNT(*) FILTER (WHERE source='PUBLIC') AS public_count,
          COALESCE(SUM(amount),0) AS total_collection
        FROM ledger
        WHERE entry_type='CREDIT'
      `);
      res.json(rows[0]);
    } catch (err) {
      console.error("SUMMARY ERROR:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   📋 PENDING MEMBER DONATIONS
===================================================== */
router.get(
  "/pending-members",
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
          f.fund_name,
          c.fund_id
        FROM contributions c
        JOIN users u ON u.id = c.member_id
        JOIN funds f ON f.id = c.fund_id
        WHERE c.status='PENDING'
          AND c.source='MEMBER'
        ORDER BY c.created_at DESC
      `);
      res.json(rows);
    } catch (err) {
      console.error("PENDING MEMBERS:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   🌍 PENDING PUBLIC DONATIONS
===================================================== */
router.get(
  "/pending-public",
  verifyToken,
  checkRole("TREASURER", "SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          id,
          donor_name,
          donor_email,
          amount,
          payment_mode,
          reference_no,
          created_at,
          fund_id
        FROM contributions
        WHERE status='PENDING'
          AND source='PUBLIC'
        ORDER BY created_at DESC
      `);
      res.json(rows);
    } catch (err) {
      console.error("PENDING PUBLIC:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   ❌ REJECT (MEMBER OR PUBLIC)
===================================================== */
router.patch(
  "/reject/:id",
  verifyToken,
  checkRole("TREASURER", "SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { reason } = req.body;

      if (!reason || reason.length < 5)
        return res.status(400).json({ error: "Reject reason required" });

      const { rowCount } = await pool.query(`
        UPDATE contributions
        SET
          status='REJECTED',
          rejected_by=$1,
          rejected_at=NOW(),
          reject_reason=$2
        WHERE id=$3
          AND status='PENDING'
      `, [req.user.id, reason, req.params.id]);

      if (!rowCount)
        return res.status(400).json({ error: "Already processed" });

      await logAudit("REJECT", "CONTRIBUTION", req.params.id, req.user.id, { reason });

      res.json({ message: "Donation rejected" });
    } catch (err) {
      console.error("REJECT ERROR:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   ✅ APPROVE (MEMBER OR PUBLIC) – LEDGER SAFE
===================================================== */
router.patch(
  "/approve/:id",
  verifyToken,
  checkRole("TREASURER", "SUPER_ADMIN"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const id = Number(req.params.id);
      const approvedBy = req.user.id;

      await client.query("BEGIN");

      /* Lock row */
      const { rows, rowCount } = await client.query(
        `SELECT * FROM contributions WHERE id=$1 FOR UPDATE`,
        [id]
      );

      if (!rowCount) throw new Error("Donation not found");

      const c = rows[0];
      if (c.status !== "PENDING") throw new Error("Already processed");

      const year = new Date(c.created_at).getFullYear();
      if (await isYearClosed(year)) throw new Error("Financial year closed");

      /* Generate receipt number */
      const seq = await client.query(`
        INSERT INTO receipt_sequence (year,last_number)
        VALUES ($1,1)
        ON CONFLICT (year)
        DO UPDATE SET last_number = receipt_sequence.last_number + 1
        RETURNING last_number
      `, [year]);

      const receipt = `REC-${year}-${String(seq.rows[0].last_number).padStart(6,"0")}`;

      /* Previous balance */
      const balRes = await client.query(`
        SELECT balance_after
        FROM ledger
        WHERE fund_id=$1
        ORDER BY id DESC
        LIMIT 1
      `, [c.fund_id]);

      const prev = balRes.rows.length ? Number(balRes.rows[0].balance_after) : 0;
      const newBal = prev + Number(c.amount);

      /* Update contribution */
      await client.query(`
        UPDATE contributions
        SET
          status='APPROVED',
          receipt_no=$1,
          approved_by=$2,
          approved_at=NOW(),
          receipt_date=NOW(),
          qr_locked=true
        WHERE id=$3
      `, [receipt, approvedBy, id]);

      /* Ledger entry */
      await client.query(`
        INSERT INTO ledger
          (entry_type,source,source_id,fund_id,amount,balance_after,created_by)
        VALUES
          ('CREDIT',$1,$2,$3,$4,$5,$6)
      `, [
        c.source,
        id,
        c.fund_id,
        c.amount,
        newBal,
        approvedBy
      ]);

      await logAudit("APPROVE", "CONTRIBUTION", id, approvedBy, { receipt });

      await client.query("COMMIT");

      res.json({ message: "Approved", receipt });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("APPROVE ERROR:", err.message);
      res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  }
);
// Only PUBLIC donors get email
if (c.source === "PUBLIC" && c.donor_email) {

  const fundRes = await client.query(
    "SELECT fund_name FROM funds WHERE id=$1",
    [c.fund_id]
  );

  const fundName = fundRes.rows[0].fund_name;

  const verifyUrl = `${process.env.BASE_URL}/receipts/verify/${receipt}`;

  // Generate receipt PDF (already in memory or file)
  const receiptPdf = await generateReceiptPdf({
    receipt,
    name: c.donor_name,
    amount: c.amount,
    fund: fundName,
    date: new Date().toDateString(),
    verifyUrl
  });

  await sendMail({
    to: c.donor_email,
    subject: `Donation Receipt – ${receipt}`,
    html: publicDonationReceiptTemplate({
      name: c.donor_name,
      receiptNo: receipt,
      amount: c.amount,
      fund: fundName,
      date: new Date().toDateString(),
      verifyUrl
    }),
    attachments: [
      {
        filename: `${receipt}.pdf`,
        content: receiptPdf
      }
    ]
  });
}
module.exports = router;
