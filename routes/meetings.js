const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const notifyUsers = require("../utils/notify");
const { generateResolutionPDF } = require("../utils/generateResolutionPDF");

const router = express.Router();

const ADMIN_ROLES = ["SUPER_ADMIN", "PRESIDENT"];
/* ======================================================
   📝 AGENDA SYSTEM
====================================================== */
/* ======================================================
   📥 GET AGENDA (ALL USERS)
====================================================== */
router.get("/agenda/:id", verifyToken, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT agenda, agenda_locked FROM meetings WHERE id=$1",
      [req.params.id]
    );

    res.json(r.rows[0] || {});
  } catch (err) {
    console.error("GET AGENDA ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch agenda" });
  }
});
/* ======================================================
   💾 SAVE AGENDA (ONLY BEFORE MEETING STARTS)
====================================================== */
router.post(
  "/agenda/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const m = await pool.query(
        "SELECT meeting_date, agenda_locked FROM meetings WHERE id=$1",
        [req.params.id]
      );

      if (!m.rows.length)
        return res.status(404).json({ error: "Meeting not found" });

      if (
        m.rows[0].agenda_locked ||
        new Date() > new Date(m.rows[0].meeting_date)
      ) {
        return res
          .status(403)
          .json({ error: "Agenda locked. Meeting already started." });
      }

      await pool.query(
        "UPDATE meetings SET agenda=$1 WHERE id=$2",
        [req.body.agenda, req.params.id]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("SAVE AGENDA ERROR:", err.message);
      res.status(500).json({ error: "Failed to save agenda" });
    }
  }
);

/* ======================================================
   📅 GET ALL MEETINGS (ALL USERS)
====================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    // 🔒 Auto-lock agendas when meeting starts
    await pool.query(`
      UPDATE meetings 
      SET agenda_locked=true 
      WHERE meeting_date < NOW() AND agenda_locked=false
    `);

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
VALUES ($1, $2, ( ($3::timestamptz) AT TIME ZONE 'Asia/Kolkata' ), $4, $5, $6)
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
   ✏️ UPDATE MEETING (ADMIN / PRESIDENT)
====================================================== */
router.put(
  "/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { title, description, meeting_date, location, join_link } = req.body;

      const { rows } = await pool.query(
        `
        UPDATE meetings
        SET title=$1,
            description=$2,
           meeting_date = ( ($3::timestamptz) AT TIME ZONE 'Asia/Kolkata' ),
            location=$4,
            join_link=$5
        WHERE id=$6
        RETURNING *
        `,
        [
          title,
          description,
          meeting_date,
          location,
          join_link,
          req.params.id,
        ]
      );

      res.json(rows[0]);
    } catch (err) {
      console.error("UPDATE MEETING ERROR:", err.message);
      res.status(500).json({ error: "Failed to update meeting" });
    }
  }
);

/* ======================================================
   🗑 DELETE MEETING (ADMIN / PRESIDENT)
====================================================== */
router.delete(
  "/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      await pool.query("DELETE FROM meetings WHERE id=$1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE MEETING ERROR:", err.message);
      res.status(500).json({ error: "Failed to delete meeting" });
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
      VALUES ($1, $2, 'PRESENT')
      ON CONFLICT (meeting_id, user_id)
      DO UPDATE
      SET status='PRESENT', marked_at=NOW()
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
   📜 GET RESOLUTIONS
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
   🗳 VOTE ON RESOLUTION
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

    if (r.rows[0].is_locked || new Date() > new Date(r.rows[0].vote_deadline)) {
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
   🧾 WHO VOTED (YES / NO)
====================================================== */
router.get("/votes/:rid", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT u.name, v.vote
      FROM meeting_votes v
      JOIN users u ON u.id = v.user_id
      WHERE v.resolution_id = $1
      ORDER BY u.name
      `,
      [req.params.rid]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET VOTES ERROR:", err.message);
    res.status(500).json({ error: "Failed to load votes" });
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

  let yes = 0, no = 0;

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
/* ======================================================
   📜 GENERATE MINUTES OF MEETING PDF
====================================================== */
router.post("/minutes-pdf/:meetingId", verifyToken, checkRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { meetingId } = req.params;

    const meeting = await pool.query(
      "SELECT * FROM meetings WHERE id=$1",
      [meetingId]
    );

    const resolutions = await pool.query(
      "SELECT * FROM meeting_resolutions WHERE meeting_id=$1",
      [meetingId]
    );

    const votes = await pool.query(`
      SELECT r.id, r.title, u.name, v.vote
      FROM meeting_resolutions r
      LEFT JOIN meeting_votes v ON r.id = v.resolution_id
      LEFT JOIN users u ON u.id = v.user_id
      WHERE r.meeting_id = $1
      ORDER BY r.id
    `, [meetingId]);

    const pdfPath = await generateMinutesPDF(
      meeting.rows[0],
      resolutions.rows,
      votes.rows
    );

    res.json({ pdf: pdfPath });
  } catch (err) {
    console.error("MINUTES PDF ERROR:", err.message);
    res.status(500).json({ error: "Failed to generate minutes" });
  }
});

module.exports = router;
