const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");
const verifyToken = require("./middleware/verifyToken");
const checkRole = require("./middleware/checkRole");
const generateYearClosingPDF = require("./utils/yearClosingPdf");

const router = express.Router();

/* =========================
   📊 ADMIN DASHBOARD STATS
========================= */
router.get(
  "/dashboard",
  verifyToken,
  checkRole(["SUPER_ADMIN", "ADMIN"]),
  async (req, res) => {
    try {
      // Total members
      const members = await pool.query(
        "SELECT COUNT(*) FROM members"
      );

      // Approved contributions
      const contributions = await pool.query(
        `SELECT 
           COUNT(*) AS total_count,
           COALESCE(SUM(amount),0) AS total_amount
         FROM contributions
         WHERE status = 'APPROVED'`
      );

      // Cancelled contributions
      const cancelled = await pool.query(
        "SELECT COUNT(*) FROM contributions WHERE status='CANCELLED'"
      );

      // Recent 5 contributions
      const recent = await pool.query(
        `SELECT 
           c.receipt_no,
           c.amount,
           c.status,
           c.receipt_date,
           u.name AS member_name,
           f.fund_name
         FROM contributions c
         JOIN users u ON c.member_id = u.id
         JOIN funds f ON c.fund_id = f.id
         ORDER BY c.created_at DESC
         LIMIT 5`
      );

      res.json({
        members: members.rows[0].count,
        contributions: contributions.rows[0],
        cancelled: cancelled.rows[0].count,
        recent: recent.rows
      });

    } catch (err) {
      console.error("ADMIN DASHBOARD ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =========================
   📜 AUDIT LOGS (ADMIN)
========================= */
router.get(
  "/audit-logs",
  verifyToken,
  checkRole(["SUPER_ADMIN", "ADMIN"]),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT 
           a.id,
           a.action,
           a.entity,
           a.entity_id,
           a.metadata,
           a.created_at,
           u.name AS performed_by
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.performed_by
         ORDER BY a.created_at DESC
         LIMIT 100`
      );

      res.json({ logs: result.rows });
    } catch (err) {
      console.error("AUDIT LOG ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =========================
   👑 CREATE USER (SUPER ADMIN)
========================= */
router.post(
  "/create-user",
  verifyToken,
  checkRole(["SUPER_ADMIN"]),
  async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      if (!name || !email || !password || !role) {
        return res.status(400).json({ error: "All fields required" });
      }

      const existing = await pool.query(
        "SELECT id FROM users WHERE email=$1",
        [email]
      );
      if (existing.rows.length) {
        return res.status(400).json({ error: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (name,email,password,role)
         VALUES ($1,$2,$3,$4)
         RETURNING id,name,email,role`,
        [name, email, hashedPassword, role]
      );

      res.status(201).json({ user: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* =========================
   📅 CLOSE FINANCIAL YEAR
========================= */
router.post(
  "/close-year/:year",
  verifyToken,
  checkRole(["SUPER_ADMIN", "ADMIN"]),
  async (req, res) => {
    try {
      const { year } = req.params;
      const { remarks } = req.body || {};

      const exists = await pool.query(
        "SELECT id FROM year_closings WHERE year=$1",
        [year]
      );
      if (exists.rows.length) {
        return res.status(400).json({ error: "Year already closed" });
      }

      await pool.query(
        `INSERT INTO year_closings (year, closed_by, remarks)
         VALUES ($1,$2,$3)`,
        [year, req.user.id, remarks || null]
      );

      res.json({ message: `Financial year ${year} closed successfully` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* =========================
   🧾 YEAR CLOSING PDF
========================= */
router.get(
  "/year-closing-pdf/:year",
  verifyToken,
  checkRole(["SUPER_ADMIN", "ADMIN"]),
  async (req, res) => {
    try {
      const { year } = req.params;

      const closed = await pool.query(
        "SELECT id FROM year_closings WHERE year=$1",
        [year]
      );
      if (!closed.rows.length) {
        return res.status(400).json({ error: "Year not closed yet" });
      }

      const totals = await pool.query(
        `SELECT
           SUM(CASE WHEN status='APPROVED' THEN amount ELSE 0 END) AS total_receipts,
           SUM(CASE WHEN status='CANCELLED' THEN amount ELSE 0 END) AS total_cancelled
         FROM contributions
         WHERE EXTRACT(YEAR FROM receipt_date)=$1`,
        [year]
      );

      const fundWise = await pool.query(
        `SELECT f.fund_name, SUM(c.amount) AS total
         FROM contributions c
         JOIN funds f ON f.id=c.fund_id
         WHERE c.status='APPROVED'
         AND EXTRACT(YEAR FROM c.receipt_date)=$1
         GROUP BY f.fund_name`,
        [year]
      );

      const totalReceipts = totals.rows[0].total_receipts || 0;
      const totalCancelled = totals.rows[0].total_cancelled || 0;

      await generateYearClosingPDF(res, {
        year,
        association_name: "HinduSwaraj Youth Welfare Association",
        registration_no: "784/25",
        address: "4-1-140 Vani Nagar-Jagtial.505327",

        opening_balance: 0,
        total_receipts: totalReceipts,
        total_cancelled: totalCancelled,
        closing_balance: totalReceipts - totalCancelled,

        funds: fundWise.rows,
        prepared_by: req.user.name || "Treasurer",
        approved_by: "President"
      });

    } catch (err) {
      console.error("YEAR PDF ERROR 👉", err.message);
      res.status(500).json({ error: "PDF generation failed" });
    }
  }
);

module.exports = router;
