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
  VICE_PRESIDENT: "VICE_PRESIDENT",
  GENERAL_SECRETARY: "GENERAL_SECRETARY",
  JOINT_SECRETARY: "JOINT_SECRETARY",
  EC_MEMBER: "EC_MEMBER",
  MEMBER: "MEMBER",
};

/* =========================
   ROLE GROUPS
========================= */

// Anyone who can log in
const ALL_USERS = [
  ROLES.MEMBER,
  ROLES.EC_MEMBER,
  ROLES.VICE_PRESIDENT,
  ROLES.GENERAL_SECRETARY,
  ROLES.JOINT_SECRETARY,
  ROLES.PRESIDENT,
  ROLES.SUPER_ADMIN,
];

// Office bearers who work on complaints
const OFFICE_ROLES = [
  ROLES.EC_MEMBER,
  ROLES.VICE_PRESIDENT,
  ROLES.GENERAL_SECRETARY,
  ROLES.JOINT_SECRETARY,
];

// Final authority
const PRESIDENT_ONLY = [
  ROLES.PRESIDENT,
  ROLES.SUPER_ADMIN,
];

// Allowed complaint status flow
const STATUS_FLOW = [
  "OPEN",
  "FORWARDED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

/* =====================================================
   1️⃣ CREATE COMPLAINT (ALL USERS)
===================================================== */
router.post(
  "/create",
  verifyToken,
  checkRole(...ALL_USERS),
  async (req, res) => {
    try {
      const { subject, description, priority = "NORMAL" } = req.body;

      if (!subject || !description) {
        return res
          .status(400)
          .json({ error: "Subject and description required" });
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

      await logAudit("CREATE", "COMPLAINT", rows[0].id, req.user.id);

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
   2️⃣ VIEW OWN COMPLAINTS (ALL USERS)
===================================================== */
router.get(
  "/my",
  verifyToken,
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
   3️⃣ VIEW ALL COMPLAINTS (PRESIDENT ONLY)
===================================================== */
router.get(
  "/all",
  verifyToken,
  checkRole(...PRESIDENT_ONLY),
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
   4️⃣ ASSIGN / FORWARD COMPLAINT (PRESIDENT ONLY)
===================================================== */
router.put(
  "/assign/:id",
  verifyToken,
  checkRole(...PRESIDENT_ONLY),
  async (req, res) => {
    try {
      const { assigned_role } = req.body;

      if (!OFFICE_ROLES.includes(assigned_role)) {
        return res.status(400).json({
          error: "Invalid role for assignment",
        });
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

      await logAudit("ASSIGN", "COMPLAINT", req.params.id, req.user.id);

      res.json({ message: "Complaint assigned successfully" });
    } catch (err) {
      res.status(500).json({ error: "Assignment failed" });
    }
  }
);

/* =====================================================
   5️⃣ OFFICE → VIEW ASSIGNED COMPLAINTS
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

      if (status === "CLOSED") {
        return res
          .status(403)
          .json({ error: "Only President can close complaints" });
      }

      await pool.query(
        `
        UPDATE complaints
        SET status=$1, updated_at=NOW()
        WHERE id=$2
        `,
        [status, req.params.id]
      );

      await logAudit("UPDATE_STATUS", "COMPLAINT", req.params.id, req.user.id);

      res.json({ message: "Status updated" });
    } catch (err) {
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* =====================================================
   7️⃣ OFFICE → ADD COMMENT
===================================================== */
router.post(
  "/comment/:id",
  verifyToken,
  checkRole(...OFFICE_ROLES),
  async (req, res) => {
    try {
      const { comment } = req.body;

      if (!comment) {
        return res.status(400).json({ error: "Comment required" });
      }

      await pool.query(
        `
        INSERT INTO complaint_comments
        (complaint_id, comment, commented_by)
        VALUES ($1,$2,$3)
        `,
        [req.params.id, comment, req.user.id]
      );

      await logAudit("COMMENT", "COMPLAINT", req.params.id, req.user.id);

      res.json({ message: "Comment added" });
    } catch (err) {
      res.status(500).json({ error: "Failed to add comment" });
    }
  }
);

/* =====================================================
   8️⃣ PRESIDENT → FINAL CLOSE COMPLAINT
===================================================== */
router.put(
  "/close/:id",
  verifyToken,
  checkRole(...PRESIDENT_ONLY),
  async (req, res) => {
    try {
      await pool.query(
        `
        UPDATE complaints
        SET status='CLOSED', closed_by=$1, updated_at=NOW()
        WHERE id=$2
        `,
        [req.user.id, req.params.id]
      );

      await logAudit("CLOSE", "COMPLAINT", req.params.id, req.user.id);

      res.json({ message: "Complaint closed successfully" });
    } catch (err) {
      res.status(500).json({ error: "Close failed" });
    }
  }
);

/* =====================================================
   9️⃣ PRESIDENT → DASHBOARD STATS
===================================================== */
router.get(
  "/stats",
  verifyToken,
  checkRole(...PRESIDENT_ONLY),
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
