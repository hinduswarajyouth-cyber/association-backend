const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const notifyUsers = require("../utils/notify");
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

const ALL_USERS = Object.values(ROLES);

const OFFICE_ROLES = [
  ROLES.VICE_PRESIDENT,
  ROLES.GENERAL_SECRETARY,
  ROLES.JOINT_SECRETARY,
  ROLES.EC_MEMBER,
];

const ADMIN_ROLES = [ROLES.PRESIDENT, ROLES.SUPER_ADMIN];

const STATUS = {
  OPEN: "OPEN",
  FORWARDED: "FORWARDED",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
};

/* =====================================================
   1️⃣ CREATE COMPLAINT (ALL USERS) ✅ UPDATED
===================================================== */
router.post(
  "/create",
  verifyToken,
  checkRole(...ALL_USERS),
  async (req, res) => {
    const { subject, description, priority = "NORMAL" } = req.body;

    if (!subject || !description) {
      return res.status(400).json({
        error: "Subject & description required",
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO complaints
        (member_id, subject, description, priority, status)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [req.user.id, subject, description, priority, STATUS.OPEN]
    );

    await logAudit(
      "CREATE",
      "COMPLAINT",
      rows[0].id,
      req.user.id,
      { created_by_role: req.user.role },
      req
    );

    res.status(201).json(rows[0]);
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
    const { rows } = await pool.query(
      `
      SELECT
        c.*,
        u.name AS member_name,
        u.role AS member_role
      FROM complaints c
      JOIN users u ON u.id = c.member_id
      ORDER BY c.created_at DESC
      `
    );
    res.json(rows);
  }
);

/* =====================================================
   4️⃣ ADMIN → ASSIGN + INSTRUCTION
===================================================== */
router.put(
  "/assign/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { assigned_role, instruction } = req.body;

    if (!OFFICE_ROLES.includes(assigned_role)) {
      return res.status(400).json({ error: "Invalid office role" });
    }

    await pool.query(
      `
      UPDATE complaints
      SET
        assigned_role=$1,
        assigned_by=$2,
        status=$3,
        updated_at=NOW()
      WHERE id=$4 AND status=$5
      `,
      [
        assigned_role,
        req.user.id,
        STATUS.FORWARDED,
        req.params.id,
        STATUS.OPEN,
      ]
    );

    if (instruction) {
      await pool.query(
        `
        INSERT INTO complaint_comments
          (complaint_id, comment, commented_by, comment_type)
        VALUES ($1,$2,$3,'INSTRUCTION')
        `,
        [req.params.id, instruction, req.user.id]
      );
    }

    await notifyUsers(
      [],
      "📌 Complaint Assigned",
      "A complaint has been forwarded to your role",
      "/complaints"
    );

    res.json({ success: true });
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
  }
);

/* =====================================================
   6️⃣ OFFICE → UPDATE / RESOLVE
===================================================== */
router.put(
  "/progress/:id",
  verifyToken,
  checkRole(...OFFICE_ROLES),
  async (req, res) => {
    const { status, comment } = req.body;

    if (![STATUS.IN_PROGRESS, STATUS.RESOLVED].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await pool.query(
      `
      UPDATE complaints
      SET status=$1, updated_at=NOW()
      WHERE id=$2 AND assigned_role=$3
      `,
      [status, req.params.id, req.user.role]
    );

    if (comment) {
      await pool.query(
        `
        INSERT INTO complaint_comments
          (complaint_id, comment, commented_by, comment_type)
        VALUES ($1,$2,$3,'UPDATE')
        `,
        [req.params.id, comment, req.user.id]
      );
    }

    res.json({ success: true });
  }
);

/* =====================================================
   7️⃣ VIEW COMMENTS (CREATOR + HANDLERS + ADMIN)
===================================================== */
router.get("/comments/:id", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT
      cc.comment,
      cc.comment_type,
      cc.created_at,
      u.name AS commented_by,
      u.role AS role
    FROM complaint_comments cc
    JOIN users u ON u.id = cc.commented_by
    WHERE cc.complaint_id=$1
    ORDER BY cc.created_at ASC
    `,
    [req.params.id]
  );
  res.json(rows);
});

/* =====================================================
   8️⃣ ADMIN → CLOSE COMPLAINT
===================================================== */
router.put(
  "/close/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    await pool.query(
      `
      UPDATE complaints
      SET status=$1, closed_by=$2, updated_at=NOW()
      WHERE id=$3 AND status=$4
      `,
      [STATUS.CLOSED, req.user.id, req.params.id, STATUS.RESOLVED]
    );

    await logAudit(
      "CLOSE",
      "COMPLAINT",
      req.params.id,
      req.user.id,
      null,
      req
    );

    res.json({ success: true });
  }
);

/* =====================================================
   9️⃣ ADMIN DASHBOARD STATS
===================================================== */
router.get(
  "/stats",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='OPEN') open,
        COUNT(*) FILTER (WHERE status='FORWARDED') forwarded,
        COUNT(*) FILTER (WHERE status='IN_PROGRESS') in_progress,
        COUNT(*) FILTER (WHERE status='RESOLVED') resolved,
        COUNT(*) FILTER (WHERE status='CLOSED') closed
      FROM complaints
    `);
    res.json(rows[0]);
  }
);

module.exports = router;
