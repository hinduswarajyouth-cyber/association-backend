const express = require("express");
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");

const router = express.Router();

/* =========================
   ROLES
========================= */
const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PRESIDENT: "PRESIDENT",
  GENERAL_SECRETARY: "GENERAL_SECRETARY",
  JOINT_SECRETARY: "JOINT_SECRETARY",
  EC_MEMBER: "EC_MEMBER",
  MEMBER: "MEMBER",
};

const ADMIN_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PRESIDENT,
];

const OFFICE_ROLES = [
  ROLES.GENERAL_SECRETARY,
  ROLES.JOINT_SECRETARY,
  ROLES.EC_MEMBER,
];

const STATUS_FLOW = [
  "OPEN",
  "FORWARDED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

/* =====================================================
   1️⃣ MEMBER → CREATE COMPLAINT
===================================================== */
router.post(
  "/create",
  verifyToken,
  checkRole(ROLES.MEMBER),
  async (req, res) => {
    try {
      const { subject, description, priority = "NORMAL" } = req.body;

      if (!subject || !description) {
        return res
          .status(400)
          .json({ error: "Subject & description required" });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO complaints
        (member_id, subject, description, priority, status)
        VALUES ($1,$2,$3,$4,'OPEN')
        RETURNING id
        `,
        [req.user.id, subject, description, priority]
      );

      await logAudit(
        "CREATE",
        "COMPLAINT",
        rows[0].id,
        req.user.id
      );

      res.status(201).json({
        message: "Complaint submitted successfully",
      });
    } catch (err) {
      console.error("CREATE COMPLAINT ERROR 👉", err.message);
      res.status(500).json({ error: "Complaint creation failed" });
    }
  }
);

/* =====================================================
   2️⃣ MEMBER → VIEW OWN COMPLAINTS
===================================================== */
router.get(
  "/my",
  verifyToken,
  checkRole(ROLES.MEMBER),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT *
        FROM complaints
        WHERE member_id=$1
        ORDER BY created_at DESC
        `,
        [req.user.id]
      );

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  }
);

/* =====================================================
   3️⃣ ADMIN → VIEW ALL COMPLAINTS
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
          c.*,
          u.name AS member_name
        FROM complaints c
        JOIN users u ON u.id = c.member_id
        ORDER BY c.created_at DESC
        `
      );

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  }
);

/* =====================================================
   4️⃣ ADMIN → ASSIGN / FORWARD
===================================================== */
router.put(
  "/assign/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { assigned_role } = req.body;

      if (!OFFICE_ROLES.includes(assigned_role)) {
        return res
          .status(400)
          .json({ error: "Invalid assigned role" });
      }

      await pool.query(
        `
        UPDATE complaints
        SET
          assigned_role=$1,
          assigned_by=$2,
          status='FORWARDED',
          updated_at=NOW()
        WHERE id=$3
        `,
        [assigned_role, req.user.id, req.params.id]
      );

      await logAudit(
        "ASSIGN",
        "COMPLAINT",
        req.params.id,
        req.user.id
      );

      res.json({ message: "Complaint forwarded successfully" });
    } catch (err) {
      res.status(500).json({ error: "Assign failed" });
    }
  }
);

/* =====================================================
   5️⃣ OFFICE → VIEW ASSIGNED
===================================================== */
router.get(
  "/assigned",
  verifyToken,
  checkRole(...OFFICE_ROLES),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT *
        FROM complaints
        WHERE assigned_role=$1
        ORDER BY updated_at DESC
        `,
        [req.user.role]
      );

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to load assigned complaints" });
    }
  }
);

/* =====================================================
   6️⃣ OFFICE → UPDATE STATUS
===================================================== */
router.put(
  "/update/:id",
  verifyToken,
  checkRole(...OFFICE_ROLES),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!STATUS_FLOW.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await pool.query(
        `
        UPDATE complaints
        SET status=$1, updated_at=NOW()
        WHERE id=$2
        `,
        [status, req.params.id]
      );

      await logAudit(
        "UPDATE",
        "COMPLAINT",
        req.params.id,
        req.user.id
      );

      res.json({ message: "Status updated" });
    } catch (err) {
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* =====================================================
   7️⃣ ADMIN → DASHBOARD STATS
===================================================== */
router.get(
  "/stats",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='OPEN') AS open,
        COUNT(*) FILTER (WHERE status='FORWARDED') AS forwarded,
        COUNT(*) FILTER (WHERE status='IN_PROGRESS') AS in_progress,
        COUNT(*) FILTER (WHERE status='RESOLVED') AS resolved,
        COUNT(*) FILTER (WHERE status='CLOSED') AS closed
      FROM complaints
    `);

    res.json(rows[0]);
  }
);

module.exports = router;
