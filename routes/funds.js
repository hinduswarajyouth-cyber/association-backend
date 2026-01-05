const express = require("express");
const router = express.Router();
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");
const isYearClosed = require("../utils/isYearClosed");

/* =====================================================
   🔹 GET ALL FUNDS (ADMIN / DASHBOARD)
   ✔ Ledger-driven balance
   ✔ Auditor-safe
===================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        f.id,
        f.fund_name,
        f.fund_type,
        f.status,

        -- Current balance (ledger = source of truth)
        COALESCE((
          SELECT l.balance_after
          FROM ledger l
          WHERE l.fund_id = f.id
          ORDER BY l.created_at DESC
          LIMIT 1
        ), 0) AS balance,

        -- Total income (credits only)
        COALESCE((
          SELECT SUM(l.amount)
          FROM ledger l
          WHERE l.fund_id = f.id
            AND l.entry_type = 'CREDIT'
        ), 0) AS total_collection

      FROM funds f
      ORDER BY f.id DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET FUNDS ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =====================================================
   ➕ ADD FUND (SUPER_ADMIN / PRESIDENT)
   ⚠️ No balance stored here
===================================================== */
router.post(
  "/",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const { fund_name, fund_type, description } = req.body;

      if (!fund_name || !fund_type) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const result = await pool.query(
        `
        INSERT INTO funds (fund_name, fund_type, description, status)
        VALUES ($1, $2, $3, 'ACTIVE')
        RETURNING *
        `,
        [fund_name, fund_type, description || null]
      );

      await logAudit("CREATE", "FUND", result.rows[0].id, req.user.id);

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("ADD FUND ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   ✏️ UPDATE FUND (NAME / TYPE / DESCRIPTION)
   ❌ No balance updates allowed
===================================================== */
router.put(
  "/:id",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const fundId = Number(req.params.id);
      const { fund_name, fund_type, description } = req.body;

      const result = await pool.query(
        `
        UPDATE funds
        SET
          fund_name = $1,
          fund_type = $2,
          description = $3
        WHERE id = $4
        RETURNING *
        `,
        [fund_name, fund_type, description || null, fundId]
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Fund not found" });
      }

      await logAudit("UPDATE", "FUND", fundId, req.user.id);

      res.json(result.rows[0]);
    } catch (err) {
      console.error("UPDATE FUND ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   🔄 ENABLE / DISABLE FUND
===================================================== */
router.patch(
  "/:id/toggle",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const fundId = Number(req.params.id);

      const result = await pool.query(
        `
        UPDATE funds
        SET status = CASE
          WHEN status = 'ACTIVE' THEN 'INACTIVE'
          ELSE 'ACTIVE'
        END
        WHERE id = $1
        RETURNING *
        `,
        [fundId]
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Fund not found" });
      }

      await logAudit("UPDATE", "FUND_STATUS", fundId, req.user.id);

      res.json(result.rows[0]);
    } catch (err) {
      console.error("TOGGLE FUND ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   📋 ACTIVE FUNDS (MEMBER VIEW)
   ✔ Ledger-driven balance
===================================================== */
router.get("/list", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        f.id,
        f.fund_name,

        COALESCE((
          SELECT l.balance_after
          FROM ledger l
          WHERE l.fund_id = f.id
          ORDER BY l.created_at DESC
          LIMIT 1
        ), 0) AS balance

      FROM funds f
      WHERE f.status = 'ACTIVE'
      ORDER BY f.fund_name
    `);

    res.json({ funds: result.rows });
  } catch (err) {
    console.error("FUND LIST ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =====================================================
   💰 MEMBER CONTRIBUTION (PENDING)
   ✔ No ledger write here
===================================================== */
router.post("/contribute", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "MEMBER") {
      return res.status(403).json({ error: "Only members can contribute" });
    }

    const year = new Date().getFullYear();
    if (await isYearClosed(year)) {
      return res.status(400).json({ error: "Financial year closed" });
    }

    const { fund_id, amount, payment_mode, reference_no } = req.body;

    if (!fund_id || !amount || !payment_mode) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `
      INSERT INTO contributions
      (fund_id, member_id, amount, payment_mode, reference_no, status)
      VALUES ($1, $2, $3, $4, $5, 'PENDING')
      RETURNING *
      `,
      [fund_id, req.user.id, amount, payment_mode, reference_no || null]
    );

    await logAudit(
      "CREATE",
      "CONTRIBUTION",
      result.rows[0].id,
      req.user.id,
      { amount }
    );

    res.status(201).json({
      message: "Contribution submitted successfully",
      contribution: result.rows[0],
    });
  } catch (err) {
    console.error("CONTRIBUTION ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
