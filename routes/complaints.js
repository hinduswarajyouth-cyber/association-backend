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
const ALL_USERS = Object.values(ROLES);

const OFFICE_ROLES = [
  ROLES.EC_MEMBER,
  ROLES.VICE_PRESIDENT,
  ROLES.GENERAL_SECRETARY,
  ROLES.JOINT_SECRETARY,
];

const PRESIDENT_ONLY = [
  ROLES.PRESIDENT,
  ROLES.SUPER_ADMIN,
];

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
        return res.status(400).json({
          error: "Subject and description required",
        });
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
        req.user.id,
        null,
        req
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
   2️⃣ VIEW OWN COMPLAINTS (ALL USERS)
===================================================== */
router.get(
  "/my",
  verifyToken,
  checkRole(...ALL_USERS),
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
   4️⃣ ASSIGN / FORWARD (PRESIDENT ONLY)
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
        WHERE id=$3 AND status='OPEN'
        `,
        [assigned_role, req.user.id, req.params.id]
      );

      await logAudit(
        "ASSIGN",
        "COMPLAINT",
        req.params.id,
        req.user.id,
        { assigned_role },
        req
      );

      res.json({ message: "Complaint forwarded successfully" });
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
        return res.status(403).json({
          error: "Only President can close complaints",
        });
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
        "UPDATE_STATUS",
        "COMPLAINT",
        req.params.id,
        req.user.id,
        { status },
        req
      );

      res.json({ message: "Status updated successfully" });
    } catch (err) {
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* =====================================================
   7️⃣ ADD COMMENT (OFFICE ROLES)
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

      await logAudit(
        "COMMENT",
        "COMPLAINT",
        req.params.id,
        req.user.id,
        { comment },
        req
      );

      res.json({ message: "Comment added" });
    } catch (err) {
      console.error("ADD COMMENT ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to add comment" });
    }
  }
);

/* =====================================================
   7️⃣b VIEW COMMENTS (ALL USERS) ✅ FIXED
===================================================== */
router.get(
  "/comment/:id",
  verifyToken,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT
          cc.comment,
          cc.created_at,
          u.name AS commented_by
        FROM complaint_comments cc
        JOIN users u ON u.id = cc.commented_by
        WHERE cc.complaint_id=$1
        ORDER BY cc.created_at ASC
        `,
        [req.params.id]
      );

      res.json(rows);
    } catch (err) {
      console.error("LOAD COMMENTS ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to load comments" });
    }
  }
);

/* =====================================================
   8️⃣ PRESIDENT → CLOSE COMPLAINT
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

      await logAudit(
        "CLOSE",
        "COMPLAINT",
        req.params.id,
        req.user.id,
        null,
        req
      );

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
