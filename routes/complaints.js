const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const notifyUsers = require("../utils/notify");
const logAudit = require("../utils/auditLogger");

const router = express.Router();

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
  ROLES.EC_MEMBER,
  ROLES.VICE_PRESIDENT,
  ROLES.GENERAL_SECRETARY,
  ROLES.JOINT_SECRETARY,
];
const PRESIDENT_ONLY = [ROLES.PRESIDENT, ROLES.SUPER_ADMIN];

const STATUS_FLOW = ["OPEN","FORWARDED","IN_PROGRESS","RESOLVED","CLOSED"];

/* =========================
   CREATE
========================= */
router.post("/create", verifyToken, async (req, res) => {
  const { subject, description, priority="NORMAL" } = req.body;
  if (!subject || !description)
    return res.status(400).json({ error: "Subject & description required" });

  const { rows } = await pool.query(
    `INSERT INTO complaints (member_id,subject,description,priority)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [req.user.id, subject, description, priority]
  );

  await logAudit("CREATE","COMPLAINT",rows[0].id,req.user.id,null,req);
  res.status(201).json({ id: rows[0].id });
});

/* =========================
   MY COMPLAINTS
========================= */
router.get("/my", verifyToken, async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT * FROM complaints WHERE member_id=$1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

/* =========================
   ALL (PRESIDENT)
========================= */
router.get("/all", verifyToken, checkRole(...PRESIDENT_ONLY), async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT c.*,u.name member_name
     FROM complaints c JOIN users u ON u.id=c.member_id
     ORDER BY c.created_at DESC`
  );
  res.json(rows);
});

/* =========================
   ASSIGN
========================= */
router.put("/assign/:id", verifyToken, checkRole(...PRESIDENT_ONLY), async (req,res)=>{
  const { assigned_role } = req.body;
  if (!OFFICE_ROLES.includes(assigned_role))
    return res.status(400).json({ error:"Invalid role" });

  await pool.query(
    `UPDATE complaints
     SET assigned_role=$1,assigned_by=$2,status='FORWARDED',updated_at=NOW()
     WHERE id=$3 AND status='OPEN'`,
    [assigned_role, req.user.id, req.params.id]
  );

  await notifyUsers([], "📌 Complaint Assigned", "New complaint forwarded", "/complaints");
  res.json({ success:true });
});

/* =========================
   ASSIGNED
========================= */
router.get("/assigned", verifyToken, checkRole(...OFFICE_ROLES), async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT * FROM complaints WHERE assigned_role=$1`,
    [req.user.role]
  );
  res.json(rows);
});

/* =========================
   UPDATE STATUS
========================= */
router.put("/update/:id", verifyToken, checkRole(...OFFICE_ROLES), async (req,res)=>{
  const { status } = req.body;
  if (!STATUS_FLOW.includes(status))
    return res.status(400).json({ error:"Invalid status" });

  if (status==="CLOSED")
    return res.status(403).json({ error:"Only President can close" });

  await pool.query(
    `UPDATE complaints SET status=$1,updated_at=NOW() WHERE id=$2`,
    [status, req.params.id]
  );

  res.json({ success:true });
});

/* =========================
   COMMENTS
========================= */
router.post("/comment/:id", verifyToken, checkRole(...OFFICE_ROLES), async (req,res)=>{
  const { comment } = req.body;
  await pool.query(
    `INSERT INTO complaint_comments (complaint_id,comment,commented_by)
     VALUES ($1,$2,$3)`,
    [req.params.id, comment, req.user.id]
  );
  res.json({ success:true });
});

router.get("/comments/:id", verifyToken, async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT cc.comment,cc.created_at,u.name commented_by
     FROM complaint_comments cc JOIN users u ON u.id=cc.commented_by
     WHERE complaint_id=$1 ORDER BY created_at`,
    [req.params.id]
  );
  res.json(rows);
});

/* =========================
   CLOSE
========================= */
router.put("/close/:id", verifyToken, checkRole(...PRESIDENT_ONLY), async (req,res)=>{
  await pool.query(
    `UPDATE complaints SET status='CLOSED',closed_by=$1 WHERE id=$2`,
    [req.user.id, req.params.id]
  );
  res.json({ success:true });
});

/* =========================
   STATS
========================= */
router.get("/stats", verifyToken, checkRole(...PRESIDENT_ONLY), async (req,res)=>{
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
});

module.exports = router;
