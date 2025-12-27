const express = require("express");
const router = express.Router();
const pool = require("./db");
const verifyToken = require("./middleware/verifyToken");
const PDFDocument = require("pdfkit");

/* =========================
   🔐 ROLE CHECK HELPER
========================= */
function allowReports(req, res) {
  if (!["SUPER_ADMIN", "ADMIN", "TREASURER"].includes(req.user.role)) {
    res.status(403).json({ error: "Access denied" });
    return false;
  }
  return true;
}

/* =========================
   📆 MONTHLY REPORT (JSON)
   /reports/monthly
========================= */
router.get("/monthly", verifyToken, async (req, res) => {
  try {
    if (!allowReports(req, res)) return;

    const result = await pool.query(
      `SELECT TO_CHAR(receipt_date, 'YYYY-MM') AS month,
              SUM(amount) AS total_amount,
              COUNT(*) AS count
       FROM contributions
       WHERE status='APPROVED'
       GROUP BY month
       ORDER BY month DESC`
    );

    res.json({ report: result.rows });
  } catch (err) {
    console.error("MONTHLY JSON ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   📆 MONTHLY REPORT (FILTER JSON)
   /reports/monthly/filter?month=12&year=2025
========================= */
router.get("/monthly/filter", verifyToken, async (req, res) => {
  try {
    if (!allowReports(req, res)) return;

    const { month, year } = req.query;

    const result = await pool.query(
      `SELECT SUM(amount) AS total_amount,
              COUNT(*) AS count
       FROM contributions
       WHERE status='APPROVED'
       AND EXTRACT(MONTH FROM receipt_date)=$1
       AND EXTRACT(YEAR FROM receipt_date)=$2`,
      [month, year]
    );

    res.json({ report: result.rows[0] });
  } catch (err) {
    console.error("MONTH FILTER JSON ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   📊 FUND-WISE REPORT (JSON)
   /reports/fund-wise
========================= */
router.get("/fund-wise", verifyToken, async (req, res) => {
  try {
    if (!allowReports(req, res)) return;

    const result = await pool.query(
      `SELECT f.fund_name,
              COALESCE(SUM(c.amount), 0) AS total_amount
       FROM funds f
       LEFT JOIN contributions c
         ON c.fund_id = f.id
        AND c.status='APPROVED'
       GROUP BY f.fund_name
       ORDER BY total_amount DESC`
    );

    res.json({ report: result.rows });
  } catch (err) {
    console.error("FUND JSON ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   👤 MEMBER-WISE REPORT (JSON)
   /reports/member-wise
========================= */
router.get("/member-wise", verifyToken, async (req, res) => {
  try {
    if (!allowReports(req, res)) return;

    const result = await pool.query(
      `SELECT u.name AS member_name,
              COALESCE(SUM(c.amount), 0) AS total_amount
       FROM users u
       LEFT JOIN contributions c
         ON c.member_id = u.id
        AND c.status='APPROVED'
       GROUP BY u.name
       ORDER BY total_amount DESC`
    );

    res.json({ report: result.rows });
  } catch (err) {
    console.error("MEMBER JSON ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =====================================================
   📄 MONTHLY REPORT PDF
   /reports/pdf/monthly?month=12&year=2025
===================================================== */
router.get("/pdf/monthly", verifyToken, async (req, res) => {
  try {
    if (!allowReports(req, res)) return;

    const { month, year } = req.query;

    const result = await pool.query(
      `SELECT f.fund_name, SUM(c.amount) AS total
       FROM contributions c
       JOIN funds f ON c.fund_id=f.id
       WHERE c.status='APPROVED'
       AND EXTRACT(MONTH FROM c.receipt_date)=$1
       AND EXTRACT(YEAR FROM c.receipt_date)=$2
       GROUP BY f.fund_name`,
      [month, year]
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=monthly-report-${month}-${year}.pdf`
    );

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text("Monthly Collection Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Month: ${month}/${year}`);
    doc.moveDown();

    result.rows.forEach(r => {
      doc.text(`${r.fund_name} : ₹${r.total}`);
    });

    doc.end();
  } catch (err) {
    console.error("MONTHLY PDF ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   📄 FUND-WISE REPORT PDF
   /reports/pdf/fund-wise
========================= */
router.get("/pdf/fund-wise", verifyToken, async (req, res) => {
  try {
    if (!allowReports(req, res)) return;

    const result = await pool.query(
      `SELECT f.fund_name, SUM(c.amount) AS total
       FROM contributions c
       JOIN funds f ON c.fund_id=f.id
       WHERE c.status='APPROVED'
       GROUP BY f.fund_name`
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "inline; filename=fund-wise-report.pdf"
    );

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text("Fund-wise Collection Report", { align: "center" });
    doc.moveDown();

    result.rows.forEach(r => {
      doc.text(`${r.fund_name} : ₹${r.total}`);
    });

    doc.end();
  } catch (err) {
    console.error("FUND PDF ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   📄 MEMBER-WISE REPORT PDF
   /reports/pdf/member-wise
========================= */
router.get("/pdf/member-wise", verifyToken, async (req, res) => {
  try {
    if (!allowReports(req, res)) return;

    const result = await pool.query(
      `SELECT u.name, SUM(c.amount) AS total
       FROM contributions c
       JOIN users u ON c.member_id=u.id
       WHERE c.status='APPROVED'
       GROUP BY u.name`
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "inline; filename=member-wise-report.pdf"
    );

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text("Member-wise Contribution Report", { align: "center" });
    doc.moveDown();

    result.rows.forEach(r => {
      doc.text(`${r.name} : ₹${r.total}`);
    });

    doc.end();
  } catch (err) {
    console.error("MEMBER PDF ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
