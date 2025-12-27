const express = require("express");
const pool = require("./db");
const verifyToken = require("./middleware/verifyToken");
const QRCode = require("qrcode");
const logAudit = require("./utils/auditLogger");
const isYearClosed = require("./utils/isYearClosed");

const router = express.Router();

/* =========================
   1️⃣ FUND LIST
========================= */
router.get("/list", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM funds WHERE status='ACTIVE' ORDER BY created_at DESC"
    );
    res.json({ funds: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   2️⃣ CREATE CONTRIBUTION
========================= */
router.post("/contribute", verifyToken, async (req, res) => {
  try {
    if (!["MEMBER", "TREASURER"].includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { fund_id, amount, payment_mode, reference_no } = req.body;
    if (!fund_id || !amount || !payment_mode) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO contributions
       (fund_id, member_id, amount, payment_mode, reference_no, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'PENDING',$2)
       RETURNING *`,
      [fund_id, req.user.id, amount, payment_mode, reference_no || null]
    );

    await logAudit("CREATE", "CONTRIBUTION", result.rows[0].id, req.user.id, { amount });
    const year = new Date().getFullYear();

if (await isYearClosed(year)) {
  return res.status(400).json({
    error: `Financial year ${year} is closed. New entries not allowed`
  });
}


    res.json({ contribution: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   3️⃣ PENDING CONTRIBUTIONS
========================= */
router.get("/pending", verifyToken, async (req, res) => {
  try {
    if (!["SUPER_ADMIN", "ADMIN", "TREASURER"].includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await pool.query(
      `SELECT c.id, c.amount, c.payment_mode, c.reference_no,
              u.name AS member_name,
              f.fund_name
       FROM contributions c
       JOIN users u ON c.member_id=u.id
       JOIN funds f ON c.fund_id=f.id
       WHERE c.status='PENDING'
       ORDER BY c.created_at DESC`
    );

    res.json({ pending: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   4️⃣ APPROVE CONTRIBUTION
========================= */
router.post("/approve/:id", verifyToken, async (req, res) => {
  const year = new Date().getFullYear();

  if (!["SUPER_ADMIN", "ADMIN"].includes(req.user.role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (await isYearClosed(year)) {
    return res.status(400).json({ error: "Financial year closed" });
  }

  try {
    const { id } = req.params;

    const check = await pool.query(
      "SELECT fund_id, amount FROM contributions WHERE id=$1 AND status='PENDING'",
      [id]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: "Contribution not found" });
    }

    const { fund_id, amount } = check.rows[0];

    const last = await pool.query(
      "SELECT receipt_no FROM contributions WHERE receipt_no IS NOT NULL ORDER BY id DESC LIMIT 1"
    );

    const nextNo = last.rows.length
      ? parseInt(last.rows[0].receipt_no.split("-")[2]) + 1
      : 1;

    const receiptNo = `REC-${year}-${String(nextNo).padStart(3, "0")}`;
    const verifyUrl = `${process.env.BASE_URL}/verify-receipt/${receiptNo}`;
    const qrCode = await QRCode.toDataURL(verifyUrl);

    await pool.query("BEGIN");

    await pool.query(
      `UPDATE contributions
       SET status='APPROVED',
           receipt_no=$2,
           receipt_date=NOW(),
           qr_code=$3
       WHERE id=$1`,
      [id, receiptNo, qrCode]
    );

    await pool.query(
      "UPDATE funds SET balance = balance + $1 WHERE id=$2",
      [amount, fund_id]
    );

    await pool.query("COMMIT");

    await logAudit("APPROVE", "CONTRIBUTION", id, req.user.id, {
      receipt_no: receiptNo,
      amount
    });
const year = new Date().getFullYear();

if (await isYearClosed(year)) {
  return res.status(400).json({
    error: `Financial year ${year} is closed. Approval not allowed`
  });
}

    res.json({ message: "Approved", receipt_no: receiptNo, verify_url: verifyUrl });

  } catch (err) {
    await pool.query("ROLLBACK");
    res.status(500).json({ error: "Server error" });
    const year = new Date().getFullYear();
    


  }
});

/* =========================
   5️⃣ CANCEL CONTRIBUTION
========================= */
router.post("/cancel/:id", verifyToken, async (req, res) => {
  const year = new Date().getFullYear();

  if (!["SUPER_ADMIN", "ADMIN"].includes(req.user.role)) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (await isYearClosed(year)) {
    return res.status(400).json({ error: "Financial year closed" });
  }

  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ error: "Cancel reason required" });

  try {
    const { id } = req.params;

    const check = await pool.query(
      "SELECT fund_id, amount FROM contributions WHERE id=$1 AND status='APPROVED'",
      [id]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: "Approved contribution not found" });
    }

    const { fund_id, amount } = check.rows[0];

    await pool.query("BEGIN");

    await pool.query(
      `UPDATE contributions
       SET status='CANCELLED',
           cancel_reason=$2,
           cancelled_at=NOW()
       WHERE id=$1`,
      [id, reason]
    );

    await pool.query(
      "UPDATE funds SET balance = balance - $1 WHERE id=$2",
      [amount, fund_id]
    );

    await pool.query("COMMIT");

    await logAudit("CANCEL", "CONTRIBUTION", id, req.user.id, { reason });

    res.json({ message: "Cancelled successfully" });
    const year = new Date().getFullYear();

if (await isYearClosed(year)) {
  return res.status(400).json({
    error: `Financial year ${year} is closed. Cancellation not allowed`
  });
}


  } catch (err) {
    await pool.query("ROLLBACK");
    res.status(500).json({ error: "Server error" });
    
  }
});

/* =========================
   6️⃣ AUDIT LOGS
========================= */
router.get("/audit-logs", verifyToken, async (req, res) => {
  try {
    if (!["SUPER_ADMIN", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await pool.query(
      `SELECT a.action, a.entity, a.entity_id,
              a.metadata, a.created_at,
              u.name AS performed_by
       FROM audit_logs a
       LEFT JOIN users u ON a.performed_by = u.id
       ORDER BY a.created_at DESC`
    );

    res.json({ logs: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   7️⃣ YEAR SUMMARY
========================= */
router.get("/year-summary/:year", verifyToken, async (req, res) => {
  try {
    const { year } = req.params;

    const result = await pool.query(
      `SELECT COUNT(*) AS total_receipts,
              COALESCE(SUM(amount),0) AS total_amount
       FROM contributions
       WHERE status='APPROVED'
       AND EXTRACT(YEAR FROM receipt_date)=$1`,
      [year]
    );

    res.json({ year, summary: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
