const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const multer = require("multer");
const fs = require("fs");

const router = express.Router();

const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PRESIDENT: "PRESIDENT",
  MEMBER: "MEMBER",
};

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.PRESIDENT];

/* ================= FILE UPLOAD ================= */
const uploadDir = "uploads/meetings";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) =>
    cb(null, Date.now() + "_" + file.originalname),
});

const upload = multer({ storage });

/* ================= CREATE MEETING ================= */
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

      if (!title || !meeting_date) {
        return res.status(400).json({ error: "Title & date required" });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO meetings
        (title,description,meeting_date,location,join_link,is_public,created_by)
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

      res.json(rows[0]);
    } catch (err) {
      console.error("CREATE MEETING ERROR:", err.message);
      res.status(500).json({ error: "Create meeting failed" });
    }
  }
);

/* ================= GET MEETINGS (ALIAS) ================= */
router.get("/", verifyToken, async (req, res) => {
  if (ADMIN_ROLES.includes(req.user.role)) {
    const { rows } = await pool.query(
      "SELECT * FROM meetings ORDER BY meeting_date DESC"
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

/* ================= UPDATE ================= */
router.put(
  "/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { rows } = await pool.query(
      `
      UPDATE meetings
      SET title=$1, description=$2, meeting_date=$3,
          location=$4, join_link=$5, is_public=$6
      WHERE id=$7
      RETURNING *
      `,
      [
        req.body.title,
        req.body.description,
        req.body.meeting_date,
        req.body.location,
        req.body.join_link,
        req.body.is_public,
        req.params.id,
      ]
    );

    res.json(rows[0]);
  }
);

/* ================= DELETE ================= */
router.delete(
  "/:id",
  verifyToken,
  checkRole(ROLES.SUPER_ADMIN),
  async (req, res) => {
    await pool.query("DELETE FROM meetings WHERE id=$1", [req.params.id]);
    res.json({ message: "Meeting deleted" });
  }
);

/* ================= CHAT ================= */
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

router.post("/chat/:id", verifyToken, async (req, res) => {
  if (!req.body.message) {
    return res.status(400).json({ error: "Message required" });
  }

  await pool.query(
    `
    INSERT INTO meeting_messages (meeting_id,user_id,message)
    VALUES ($1,$2,$3)
    `,
    [req.params.id, req.user.id, req.body.message]
  );

  res.json({ message: "Message sent" });
});

/* ================= ATTENDANCE ================= */
router.post("/attendance/:id", verifyToken, async (req, res) => {
  await pool.query(
    `
    INSERT INTO meeting_attendance (meeting_id,user_id,status)
    VALUES ($1,$2,$3)
    ON CONFLICT (meeting_id,user_id)
    DO UPDATE SET status=$3, marked_at=NOW()
    `,
    [req.params.id, req.user.id, req.body.status]
  );

  res.json({ message: "Attendance marked" });
});

/* ================= FILES ================= */
router.post(
  "/files/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  upload.single("file"),
  async (req, res) => {
    await pool.query(
      `
      INSERT INTO meeting_files
      (meeting_id,file_path,file_type,uploaded_by)
      VALUES ($1,$2,$3,$4)
      `,
      [req.params.id, req.file.path, req.body.type, req.user.id]
    );

    res.json({ message: "File uploaded" });
  }
);

router.get("/files/:id", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT id, file_path, file_type, created_at
    FROM meeting_files
    WHERE meeting_id=$1
    ORDER BY created_at DESC
    `,
    [req.params.id]
  );
  res.json(rows);
});

/* ================= RESOLUTIONS ================= */
router.get("/resolution/:id", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM meeting_resolutions WHERE meeting_id=$1",
    [req.params.id]
  );
  res.json(rows);
});

router.post(
  "/resolution/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { rows } = await pool.query(
      `
      INSERT INTO meeting_resolutions (meeting_id,title,created_by)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [req.params.id, req.body.title, req.user.id]
    );

    res.json(rows[0]);
  }
);

/* ================= VOTING ================= */
router.post("/vote/:rid", verifyToken, async (req, res) => {
  await pool.query(
    `
    INSERT INTO meeting_votes (resolution_id,user_id,vote)
    VALUES ($1,$2,$3)
    ON CONFLICT (resolution_id,user_id)
    DO UPDATE SET vote=$3
    `,
    [req.params.rid, req.user.id, req.body.vote]
  );

  res.json({ message: "Vote recorded" });
});

/* ================= ATTENDANCE REPORT ================= */
router.get(
  "/attendance-report/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const { rows } = await pool.query(
      `
      SELECT u.name, a.status, a.marked_at
      FROM meeting_attendance a
      JOIN users u ON u.id=a.user_id
      WHERE meeting_id=$1
      `,
      [req.params.id]
    );

    res.json(rows);
  }
);

module.exports = router;
