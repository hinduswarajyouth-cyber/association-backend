const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const multer = require("multer");

const router = express.Router();

const ROLES = { SUPER_ADMIN:"SUPER_ADMIN", PRESIDENT:"PRESIDENT", MEMBER:"MEMBER" };
const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.PRESIDENT];

/* ================= FILE UPLOAD ================= */
const storage = multer.diskStorage({
  destination: "uploads/meetings",
  filename: (req, file, cb) => cb(null, Date.now()+"_"+file.originalname),
});
const upload = multer({ storage });

/* ================= CREATE ================= */
router.post("/create", verifyToken, checkRole(...ADMIN_ROLES), async (req,res)=>{
  const { title, description, meeting_date, location, join_link, is_public } = req.body;
  const { rows } = await pool.query(`
    INSERT INTO meetings(title,description,meeting_date,location,join_link,is_public,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [title,description,meeting_date,location,join_link,is_public,req.user.id]
  );
  res.json(rows[0]);
});

/* ================= GET MEETINGS ================= */
router.get("/my", verifyToken, async (req,res)=>{
  if(ADMIN_ROLES.includes(req.user.role)){
    const { rows } = await pool.query(`SELECT * FROM meetings ORDER BY meeting_date DESC`);
    return res.json(rows);
  }
  const { rows } = await pool.query(`
    SELECT m.* FROM meetings m
    JOIN meeting_invites i ON i.meeting_id=m.id
    WHERE i.user_id=$1 ORDER BY meeting_date DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.get("/public", async (req,res)=>{
  const { rows } = await pool.query(`SELECT * FROM meetings WHERE is_public=true`);
  res.json(rows);
});

/* ================= INVITE MEMBERS ================= */
router.post("/invite/:id", verifyToken, checkRole(...ADMIN_ROLES), async (req,res)=>{
  for(const uid of req.body.userIds){
    await pool.query(`
      INSERT INTO meeting_invites(meeting_id,user_id)
      VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, uid]
    );
  }
  res.json({ message:"Invited" });
});

/* ================= ATTENDANCE ================= */
router.post("/attendance/:id", verifyToken, async (req,res)=>{
  await pool.query(`
    INSERT INTO meeting_attendance(meeting_id,user_id,status)
    VALUES($1,$2,$3)
    ON CONFLICT(meeting_id,user_id)
    DO UPDATE SET status=$3, marked_at=NOW()`,
    [req.params.id, req.user.id, req.body.status]
  );
  res.json({ message:"Attendance marked" });
});

/* ================= AGENDA / MINUTES ================= */
router.post("/files/:id", verifyToken, checkRole(...ADMIN_ROLES),
  upload.single("file"), async (req,res)=>{
    await pool.query(`
      INSERT INTO meeting_files(meeting_id,file_path,uploaded_by,file_type)
      VALUES($1,$2,$3,$4)`,
      [req.params.id, req.file.path, req.user.id, req.body.type]
    );
    res.json({ message:"File uploaded" });
});

/* ================= RESOLUTIONS ================= */
router.post("/resolution/:id", verifyToken, checkRole(...ADMIN_ROLES), async (req,res)=>{
  const { rows } = await pool.query(`
    INSERT INTO meeting_resolutions(meeting_id,title,created_by)
    VALUES($1,$2,$3) RETURNING *`,
    [req.params.id, req.body.title, req.user.id]
  );
  res.json(rows[0]);
});

router.get("/resolution/:id", verifyToken, async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT * FROM meeting_resolutions WHERE meeting_id=$1`,
    [req.params.id]
  );
  res.json(rows);
});

/* ================= ONLINE VOTING ================= */
router.post("/vote/:rid", verifyToken, async (req,res)=>{
  await pool.query(`
    INSERT INTO meeting_votes(resolution_id,user_id,vote)
    VALUES($1,$2,$3)
    ON CONFLICT(resolution_id,user_id)
    DO UPDATE SET vote=$3`,
    [req.params.rid, req.user.id, req.body.vote]
  );
  res.json({ message:"Vote recorded" });
});

/* ================= ATTENDANCE REPORT ================= */
router.get("/attendance-report/:id", verifyToken, checkRole(...ADMIN_ROLES), async (req,res)=>{
  const { rows } = await pool.query(`
    SELECT u.name, a.status, a.marked_at
    FROM meeting_attendance a
    JOIN users u ON u.id=a.user_id
    WHERE meeting_id=$1`,
    [req.params.id]
  );
  res.json(rows);
});

/* ================= CALENDAR ================= */
router.get("/calendar", verifyToken, async (req,res)=>{
  const { rows } = await pool.query(`SELECT id,title,meeting_date FROM meetings`);
  res.json(rows);
});

module.exports = router;
