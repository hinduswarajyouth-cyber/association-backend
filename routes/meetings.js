const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const notifyUsers = require("../utils/notify");
const { generateResolutionPDF } = require("../utils/generateResolutionPDF");

const router = express.Router();

const ADMIN_ROLES = ["SUPER_ADMIN", "PRESIDENT"];

/* ======================================================
   📅 GET ALL MEETINGS (ALL ROLES)
====================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM meetings ORDER BY meeting_date DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("GET MEETINGS ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});

/* ======================================================
   ➕ CREATE MEETING (ADMIN / PRESIDENT)
====================================================== */
router.post(
  "/create",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { title, description, meeting_date, location, join_link } = req.body;

      if (!title || !meeting_date) {
        return res.status(400).json({ error: "Title & date required" });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO meetings
        (title, description, meeting_date, location, join_link, created_by)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
        `,
        [
          title,
          description || null,
          meeting_date,
          location || null,
          join_link || null,
          req.user.id,
        ]
      );

      // 🔔 Notify all users
      const users = await pool.query("SELECT id FROM users");
      await notifyUsers(
        users.rows.map(u => u.id),
        "📅 New Meeting Scheduled",
        `Meeting: ${title}`,
        "/meetings"
      );

      res.json(rows[0]);
    } catch (err) {
      console.error("CREATE MEETING ERROR:", err.message);
      res.status(500).json({ error: "Failed to create meeting" });
    }
  }
);

/* ======================================================
   👥 JOIN MEETING (ALL ROLES)
====================================================== */
router.post("/join/:id", verifyToken, async (req, res) => {
  try {
    await pool.query(
      `
      INSERT INTO meeting_attendance (meeting_id, user_id, status)
      VALUES ($1,$2,'JOINED')
      ON CONFLICT (meeting_id, user_id)
      DO UPDATE SET status='JOINED', marked_at=NOW()
      `,
      [req.params.id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("JOIN MEETING ERROR:", err.message);
    res.status(500).json({ error: "Failed to join meeting" });
  }
});

/* ======================================================
   📜 GET RESOLUTIONS (ALL ROLES)
====================================================== */
router.get("/resolution/:meetingId", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM meeting_resolutions
      WHERE meeting_id=$1
      ORDER BY created_at DESC
      `,
      [req.params.meetingId]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET RESOLUTION ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch resolutions" });
  }
});

/* ======================================================
   ➕ CREATE RESOLUTION (ADMIN / PRESIDENT)
====================================================== */
router.post(
  "/resolution/:meetingId",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { title, content, vote_deadline } = req.body;

      const deadline =
        vote_deadline || new Date(Date.now() + 24 * 60 * 60 * 1000);

      const { rows } = await pool.query(
        `
        INSERT INTO meeting_resolutions
        (meeting_id, title, content, created_by, vote_deadline)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *
        `,
        [req.params.meetingId, title, content, req.user.id, deadline]
      );

      res.json(rows[0]);
    } catch (err) {
      console.error("CREATE RESOLUTION ERROR:", err.message);
      res.status(500).json({ error: "Failed to create resolution" });
    }
  }
);

/* ======================================================
   🗳 VOTE ON RESOLUTION (ALL ROLES)
====================================================== */
router.post("/vote/:rid", verifyToken, async (req, res) => {
  try {
    const { vote } = req.body;

    const r = await pool.query(
      "SELECT vote_deadline,is_locked FROM meeting_resolutions WHERE id=$1",
      [req.params.rid]
    );

    if (!r.rows.length) {
      return res.status(404).json({ error: "Resolution not found" });
    }

    const reso = r.rows[0];

    if (reso.is_locked || new Date() > new Date(reso.vote_deadline)) {
      return res.status(403).json({ error: "Voting closed" });
    }

    await pool.query(
      `
      INSERT INTO meeting_votes (resolution_id, user_id, vote)
      VALUES ($1,$2,$3)
      ON CONFLICT (resolution_id, user_id)
      DO UPDATE SET vote=$3
      `,
      [req.params.rid, req.user.id, vote]
    );

    await finalizeResolution(req.params.rid);
    res.json({ success: true });
  } catch (err) {
    console.error("VOTE ERROR:", err.message);
    res.status(500).json({ error: "Vote failed" });
  }
});

/* ======================================================
   🔒 FINALIZE RESOLUTION
====================================================== */
async function finalizeResolution(resolutionId) {
  const votes = await pool.query(
    `
    SELECT vote, COUNT(*) c
    FROM meeting_votes
    WHERE resolution_id=$1
    GROUP BY vote
    `,
    [resolutionId]
  );

  let yes = 0,
    no = 0;

  votes.rows.forEach(v => {
    if (v.vote === "YES") yes = Number(v.c);
    if (v.vote === "NO") no = Number(v.c);
  });

  const status = yes > no ? "APPROVED" : "REJECTED";

  await pool.query(
    `
    UPDATE meeting_resolutions
    SET status=$1, is_locked=true, approved_at=NOW()
    WHERE id=$2
    `,
    [status, resolutionId]
  );

  if (status === "APPROVED") {
    await generateResolutionPDF(resolutionId);

    const users = await pool.query("SELECT id FROM users");
    await notifyUsers(
      users.rows.map(u => u.id),
      "✅ Resolution Approved",
      "A resolution has been approved",
      "/meetings"
    );
  }
}

module.exports = router;
