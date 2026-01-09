const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const PDFDocument = require("pdfkit");
const fs = require("fs");

const router = express.Router();
const ADMIN = ["SUPER_ADMIN", "PRESIDENT"];
const EC = ["EC_MEMBER"];

/* ================= GET ALL MEETINGS (ALL USERS) ================= */
router.get("/", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM meetings ORDER BY meeting_date DESC"
  );
  res.json(rows);
});

/* ================= CREATE MEETING ================= */
router.post(
  "/create",
  verifyToken,
  checkRole(...ADMIN),
  async (req, res) => {
    const {
      title,
      description,
      meeting_date,
      location,
      join_link,
    } = req.body;

    const { rows } = await pool.query(
      `
      INSERT INTO meetings
      (title,description,meeting_date,location,join_link,created_by)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [title, description, meeting_date, location, join_link, req.user.id]
    );

    res.json(rows[0]);
  }
);

/* ================= AUTO JOIN ================= */
router.post("/join/:id", verifyToken, async (req, res) => {
  await pool.query(
    `
    INSERT INTO meeting_attendance (meeting_id,user_id)
    VALUES ($1,$2)
    ON CONFLICT DO NOTHING
    `,
    [req.params.id, req.user.id]
  );
  res.json({ success: true });
});

/* ================= CHAT ================= */
router.get("/chat/:id", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT m.message, u.name, m.created_at
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
  await pool.query(
    `
    INSERT INTO meeting_messages (meeting_id,user_id,message)
    VALUES ($1,$2,$3)
    `,
    [req.params.id, req.user.id, req.body.message]
  );
  res.json({ success: true });
});

/* ================= RESOLUTION CREATE ================= */
router.post(
  "/resolution/:meetingId",
  verifyToken,
  checkRole(...ADMIN),
  async (req, res) => {
    const { title, content, vote_deadline } = req.body;
    const deadline =
      vote_deadline || new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { rows } = await pool.query(
      `
      INSERT INTO meeting_resolutions
      (meeting_id,title,content,created_by,vote_deadline)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [req.params.meetingId, title, content, req.user.id, deadline]
    );

    res.json(rows[0]);
  }
);

/* ================= GET RESOLUTIONS ================= */
router.get("/resolution/:meetingId", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT * FROM meeting_resolutions
    WHERE meeting_id=$1
    ORDER BY created_at
    `,
    [req.params.meetingId]
  );
  res.json(rows);
});

/* ================= VOTE (EC ONLY) ================= */
router.post("/vote/:rid", verifyToken, async (req, res) => {
  const { vote } = req.body;

  const { rows } = await pool.query(
    "SELECT vote_deadline,is_locked FROM meeting_resolutions WHERE id=$1",
    [req.params.rid]
  );

  const r = rows[0];
  if (r.is_locked || new Date() > new Date(r.vote_deadline)) {
    return res.status(403).json({ error: "Voting closed" });
  }

  await pool.query(
    `
    INSERT INTO meeting_votes (resolution_id,user_id,vote)
    VALUES ($1,$2,$3)
    ON CONFLICT (resolution_id,user_id)
    DO UPDATE SET vote=$3
    `,
    [req.params.rid, req.user.id, vote]
  );

  await finalizeResolution(req.params.rid);
  res.json({ success: true });
});

/* ================= FINALIZE RESOLUTION ================= */
async function finalizeResolution(id) {
  const votes = await pool.query(
    `
    SELECT vote, COUNT(*) c
    FROM meeting_votes
    WHERE resolution_id=$1
    GROUP BY vote
    `,
    [id]
  );

  let yes = 0,
    no = 0;
  votes.rows.forEach(v => {
    if (v.vote === "YES") yes = Number(v.c);
    if (v.vote === "NO") no = Number(v.c);
  });

  let status = yes > no ? "APPROVED" : "REJECTED";

  await pool.query(
    `
    UPDATE meeting_resolutions
    SET status=$1,is_locked=true,approved_at=NOW()
    WHERE id=$2
    `,
    [status, id]
  );

  if (status === "APPROVED") {
    await generatePDF(id);
  }
}

/* ================= PDF ================= */
async function generatePDF(id) {
  const { rows } = await pool.query(
    `
    SELECT r.*, m.title meeting_title, m.meeting_date,
           a.name association_name, a.registration_no
    FROM meeting_resolutions r
    JOIN meetings m ON m.id=r.meeting_id
    JOIN association_info a ON TRUE
    WHERE r.id=$1
    `,
    [id]
  );

  const r = rows[0];
  const path = `uploads/resolutions/resolution_${id}.pdf`;
  fs.mkdirSync("uploads/resolutions", { recursive: true });

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(path));

  doc.fontSize(16).text(r.association_name, { align: "center" });
  doc.text(`Reg No: ${r.registration_no}`, { align: "center" });
  doc.moveDown();

  doc.fontSize(14).text("RESOLUTION", { align: "center", underline: true });
  doc.moveDown();
  doc.text(`Meeting: ${r.meeting_title}`);
  doc.text(`Date: ${new Date(r.meeting_date).toLocaleString()}`);
  doc.moveDown();
  doc.text(r.content);
  doc.moveDown();
  doc.text(`Status: APPROVED`);
  doc.moveDown(2);
  doc.text("President Signature: ____________");
  doc.text("Secretary Signature: ____________");

  doc.end();

  await pool.query(
    "UPDATE meeting_resolutions SET pdf_path=$1 WHERE id=$2",
    [path, id]
  );
}

module.exports = router;
