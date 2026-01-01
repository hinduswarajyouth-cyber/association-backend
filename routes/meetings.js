const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");
const multer = require("multer");
const path = require("path");

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

const CREATE_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PRESIDENT,
  ROLES.GENERAL_SECRETARY,
];

/* =========================
   FILE UPLOAD (MINUTES)
========================= */
const storage = multer.diskStorage({
  destination: "uploads/meeting-minutes",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  },
});
const upload = multer({ storage });

/* =====================================================
   1️⃣ CREATE MEETING / EVENT
===================================================== */
router.post(
  "/create",
  verifyToken,
  checkRole(...CREATE_ROLES),
  async (req, res) => {
    try {
      const { title, description, meeting_date, location } = req.body;

      if (!title || !meeting_date)
        return res.status(400).json({ error: "Title & date required" });

      const { rows } = await pool.query(
        `
        INSERT INTO meetings
        (title, description, meeting_date, location, created_by)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id
        `,
        [title, description || null, meeting_date, location || null, req.user.id]
      );

      await logAudit("CREATE", "MEETING", rows[0].id, req.user.id);
      res.status(201).json({ message: "Meeting created" });
    } catch (err) {
      console.error("CREATE MEETING 👉", err.message);
      res.status(500).json({ error: "Meeting creation failed" });
    }
  }
);

/* =====================================================
   2️⃣ INVITE MEMBERS
===================================================== */
router.post(
  "/invite/:meetingId",
  verifyToken,
  checkRole(...CREATE_ROLES),
  async (req, res) => {
    try {
      const meetingId = Number(req.params.meetingId);
      const { userIds } = req.body;

      if (!Array.isArray(userIds) || !userIds.length)
        return res.status(400).json({ error: "User list required" });

      for (const userId of userIds) {
        await pool.query(
          `
          INSERT INTO meeting_invites (meeting_id, user_id)
          VALUES ($1,$2)
          ON CONFLICT DO NOTHING
          `,
          [meetingId, userId]
        );
      }

      await logAudit("INVITE", "MEETING", meetingId, req.user.id);
      res.json({ message: "Invitations sent" });
    } catch {
      res.status(500).json({ error: "Invite failed" });
    }
  }
);

/* =====================================================
   3️⃣ VIEW MY MEETINGS (ROLE BASED)
===================================================== */
router.get("/my", verifyToken, async (req, res) => {
  try {
    const { role, id } = req.user;

    let query;
    let params;

    if (role === ROLES.MEMBER) {
      query = `
        SELECT m.*
        FROM meetings m
        JOIN meeting_invites i ON i.meeting_id=m.id
        WHERE i.user_id=$1
        ORDER BY meeting_date DESC
      `;
      params = [id];
    } else {
      query = `
        SELECT *
        FROM meetings
        ORDER BY meeting_date DESC
      `;
      params = [];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Fetch failed" });
  }
});

/* =====================================================
   4️⃣ MARK ATTENDANCE
===================================================== */
router.post(
  "/attendance/:meetingId",
  verifyToken,
  async (req, res) => {
    try {
      const meetingId = Number(req.params.meetingId);
      const { status } = req.body;

      if (!["PRESENT", "ABSENT"].includes(status))
        return res.status(400).json({ error: "Invalid status" });

      await pool.query(
        `
        INSERT INTO meeting_attendance
        (meeting_id, user_id, status)
        VALUES ($1,$2,$3)
        ON CONFLICT (meeting_id, user_id)
        DO UPDATE SET status=$3, marked_at=NOW()
        `,
        [meetingId, req.user.id, status]
      );

      await logAudit("ATTENDANCE", "MEETING", meetingId, req.user.id, { status });
      res.json({ message: "Attendance marked" });
    } catch {
      res.status(500).json({ error: "Attendance failed" });
    }
  }
);

/* =====================================================
   5️⃣ UPLOAD MEETING MINUTES
===================================================== */
router.post(
  "/minutes/:meetingId",
  verifyToken,
  checkRole(
    ROLES.SUPER_ADMIN,
    ROLES.PRESIDENT,
    ROLES.GENERAL_SECRETARY,
    ROLES.JOINT_SECRETARY
  ),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "File required" });

      await pool.query(
        `
        INSERT INTO meeting_minutes
        (meeting_id, file_path, uploaded_by)
        VALUES ($1,$2,$3)
        `,
        [req.params.meetingId, req.file.path, req.user.id]
      );

      await logAudit(
        "UPLOAD_MINUTES",
        "MEETING",
        req.params.meetingId,
        req.user.id
      );

      res.json({ message: "Minutes uploaded" });
    } catch {
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

/* =====================================================
   6️⃣ CALENDAR VIEW
===================================================== */
router.get("/calendar", verifyToken, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT id, title, meeting_date
    FROM meetings
  `);

  res.json(rows);
});

module.exports = router;
