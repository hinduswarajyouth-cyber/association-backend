const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");
const multer = require("multer");

const router = express.Router();

/* =========================
   ROLES (FINAL)
========================= */
const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PRESIDENT: "PRESIDENT",
  MEMBER: "MEMBER",
};

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.PRESIDENT];

/* =========================
   FILE UPLOAD (AGENDA / MINUTES)
========================= */
const storage = multer.diskStorage({
  destination: "uploads/meetings",
  filename: (req, file, cb) =>
    cb(null, Date.now() + "_" + file.originalname),
});
const upload = multer({ storage });

/* =====================================================
   1️⃣ CREATE MEETING (ADMIN / PRESIDENT ONLY)
===================================================== */
router.post(
  "/create",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const {
        title,
        description,
        meeting_date,
        location,
        join_link,
        is_public,
      } = req.body;

      if (!title || !meeting_date)
        return res.status(400).json({ error: "Title & date required" });

      const { rows } = await pool.query(
        `
        INSERT INTO meetings
        (title, description, meeting_date, location, join_link, is_public, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
        `,
        [
          title,
          description || null,
          meeting_date,
          location || null,
          join_link || null,
          is_public ?? false,
          req.user.id,
        ]
      );

      await logAudit("CREATE", "MEETING", rows[0].id, req.user);
      res.status(201).json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Meeting creation failed" });
    }
  }
);

/* =====================================================
   2️⃣ UPDATE MEETING (ADMIN / PRESIDENT)
===================================================== */
router.put(
  "/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const {
      title,
      description,
      meeting_date,
      location,
      join_link,
      is_public,
    } = req.body;

    const { rows } = await pool.query(
      `
      UPDATE meetings
      SET title=$1, description=$2, meeting_date=$3,
          location=$4, join_link=$5, is_public=$6
      WHERE id=$7
      RETURNING *
      `,
      [
        title,
        description,
        meeting_date,
        location,
        join_link,
        is_public,
        req.params.id,
      ]
    );

    await logAudit("UPDATE", "MEETING", req.params.id, req.user);
    res.json(rows[0]);
  }
);

/* =====================================================
   3️⃣ DELETE MEETING (SUPER_ADMIN ONLY)
===================================================== */
router.delete(
  "/:id",
  verifyToken,
  checkRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    await pool.query(`DELETE FROM meetings WHERE id=$1`, [req.params.id]);
    await logAudit("DELETE", "MEETING", req.params.id, req.user);
    res.json({ message: "Meeting deleted" });
  }
);

/* =====================================================
   4️⃣ GET MY MEETINGS
===================================================== */
router.get("/my", verifyToken, async (req, res) => {
  if (ADMIN_ROLES.includes(req.user.role)) {
    const { rows } = await pool.query(
      `SELECT * FROM meetings ORDER BY meeting_date DESC`
    );
    return res.json(rows);
  }

  const { rows } = await pool.query(
    `
    SELECT m.*
    FROM meetings m
    JOIN meeting_invites i ON i.meeting_id=m.id
    WHERE i.user_id=$1
    ORDER BY meeting_date DESC
    `,
    [req.user.id]
  );

  res.json(rows);
});

/* =====================================================
   5️⃣ PUBLIC MEETINGS (NO LOGIN)
===================================================== */
router.get("/public", async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT id,title,description,meeting_date,location,join_link
    FROM meetings
    WHERE is_public=true
    ORDER BY meeting_date DESC
    `
  );
  res.json(rows);
});

/* =====================================================
   6️⃣ INVITE MEMBERS (ADMIN / PRESIDENT)
===================================================== */
router.post(
  "/invite/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { userIds } = req.body;

    for (const uid of userIds) {
      await pool.query(
        `
        INSERT INTO meeting_invites (meeting_id,user_id)
        VALUES ($1,$2)
        ON CONFLICT DO NOTHING
        `,
        [req.params.id, uid]
      );
    }

    await logAudit("INVITE", "MEETING", req.params.id, req.user);
    res.json({ message: "Members invited" });
  }
);

/* =====================================================
   7️⃣ ATTENDANCE (INVITED USERS)
===================================================== */
router.post("/attendance/:id", verifyToken, async (req, res) => {
  const { status } = req.body;

  if (!["PRESENT", "ABSENT"].includes(status))
    return res.status(400).json({ error: "Invalid status" });

  await pool.query(
    `
    INSERT INTO meeting_attendance (meeting_id,user_id,status)
    VALUES ($1,$2,$3)
    ON CONFLICT (meeting_id,user_id)
    DO UPDATE SET status=$3, marked_at=NOW()
    `,
    [req.params.id, req.user.id, status]
  );

  await logAudit("ATTENDANCE", "MEETING", req.params.id, req.user, { status });
  res.json({ message: "Attendance marked" });
});

/* =====================================================
   8️⃣ UPLOAD AGENDA / MINUTES (ADMIN / PRESIDENT)
===================================================== */
router.post(
  "/files/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "File required" });

    await pool.query(
      `
      INSERT INTO meeting_files (meeting_id,file_path,uploaded_by)
      VALUES ($1,$2,$3)
      `,
      [req.params.id, req.file.path, req.user.id]
    );

    await logAudit("UPLOAD_FILE", "MEETING", req.params.id, req.user);
    res.json({ message: "File uploaded" });
  }
);

/* =====================================================
   9️⃣ LIVE CHAT / COMMENTS (ONLINE PARTICIPATION)
===================================================== */
router.post("/chat/:id", verifyToken, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  await pool.query(
    `
    INSERT INTO meeting_messages (meeting_id,user_id,message)
    VALUES ($1,$2,$3)
    `,
    [req.params.id, req.user.id, message]
  );

  res.json({ message: "Message sent" });
});

router.get("/chat/:id", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT m.message, m.created_at, u.name
    FROM meeting_messages m
    JOIN users u ON u.id=m.user_id
    WHERE meeting_id=$1
    ORDER BY m.created_at
    `,
    [req.params.id]
  );
  res.json(rows);
});

/* =====================================================
   🔟 ONLINE VOTING / RESOLUTIONS
===================================================== */
router.post(
  "/resolution/:meetingId",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { title } = req.body;
    const { rows } = await pool.query(
      `
      INSERT INTO meeting_resolutions (meeting_id,title,created_by)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [req.params.meetingId, title, req.user.id]
    );
    res.json(rows[0]);
  }
);

router.post("/vote/:resolutionId", verifyToken, async (req, res) => {
  const { vote } = req.body;
  if (!["YES", "NO", "ABSTAIN"].includes(vote))
    return res.status(400).json({ error: "Invalid vote" });

  await pool.query(
    `
    INSERT INTO meeting_votes (resolution_id,user_id,vote)
    VALUES ($1,$2,$3)
    ON CONFLICT (resolution_id,user_id)
    DO UPDATE SET vote=$3
    `,
    [req.params.resolutionId, req.user.id, vote]
  );

  res.json({ message: "Vote recorded" });
});

/* =====================================================
   1️⃣1️⃣ TASK ASSIGNMENT + PROGRESS
===================================================== */
router.post(
  "/tasks/:meetingId",
  verifyToken,
  checkRole(ROLES.PRESIDENT),
  async (req, res) => {
    const { title, description, assigned_to } = req.body;

    const { rows } = await pool.query(
      `
      INSERT INTO meeting_tasks
      (meeting_id,title,description,assigned_to,assigned_by)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [req.params.meetingId, title, description, assigned_to, req.user.id]
    );

    res.json(rows[0]);
  }
);

router.put("/tasks/status/:taskId", verifyToken, async (req, res) => {
  const { status } = req.body;

  await pool.query(
    `
    UPDATE meeting_tasks
    SET status=$1
    WHERE id=$2 AND assigned_to=$3
    `,
    [status, req.params.taskId, req.user.id]
  );

  res.json({ message: "Task updated" });
});

/* =====================================================
   1️⃣2️⃣ ATTENDANCE REPORT (EXPORT READY)
===================================================== */
router.get(
  "/attendance-report/:meetingId",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { rows } = await pool.query(
      `
      SELECT u.name, a.status, a.marked_at
      FROM meeting_attendance a
      JOIN users u ON u.id=a.user_id
      WHERE meeting_id=$1
      ORDER BY u.name
      `,
      [req.params.meetingId]
    );

    res.json(rows);
  }
);

/* =====================================================
   1️⃣3️⃣ CALENDAR VIEW
===================================================== */
router.get("/calendar", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,title,meeting_date FROM meetings`
  );
  res.json(rows);
});

module.exports = router;
