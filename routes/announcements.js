const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const sendMail = require("../utils/sendMail");

// ✅ IMPORTANT: template import
const { announcementTemplate } = require("../utils/emailTemplates");

const router = express.Router();

/* =====================================================
   📢 CREATE ANNOUNCEMENT (ADMIN) + EMAIL NOTIFY
===================================================== */
router.post(
  "/",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const {
        title,
        message,
        category,
        priority,
        expiry_date,
        notify, // true / false
      } = req.body;

      // 🗄️ INSERT ANNOUNCEMENT
      const result = await pool.query(
        `
        INSERT INTO announcements
        (title, message, category, priority, expiry_date)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [title, message, category, priority, expiry_date]
      );

      // 🔔 EMAIL NOTIFICATION (THIS IS WHERE TEMPLATE IS USED)
      if (notify) {
        const members = await pool.query(
          `
          SELECT email 
          FROM members 
          WHERE status = 'ACTIVE' 
            AND email IS NOT NULL
          `
        );

        for (const m of members.rows) {
          await sendMail(
            m.email,
            `📢 ${title}`,
            announcementTemplate({
              title,
              message,
              category,
              priority,
              expiry_date,
            })
          );
        }
      }

      res.json({
        message: notify
          ? "Announcement created & emails sent"
          : "Announcement created successfully",
        announcement: result.rows[0],
      });
    } catch (err) {
      console.error("CREATE ANNOUNCEMENT ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to create announcement" });
    }
  }
);

/* =====================================================
   📥 GET ANNOUNCEMENTS (WITH SEEN STATUS)
===================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const memberId = req.user.member_id;

    const result = await pool.query(
      `
      SELECT
        a.*,
        CASE
          WHEN v.id IS NULL THEN false
          ELSE true
        END AS seen
      FROM announcements a
      LEFT JOIN announcement_views v
        ON v.announcement_id = a.id
       AND v.member_id = $1
      ORDER BY a.created_at DESC
      `,
      [memberId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load announcements" });
  }
});

/* =====================================================
   👁️ MARK ANNOUNCEMENT AS SEEN
===================================================== */
router.post("/:id/seen", verifyToken, async (req, res) => {
  try {
    await pool.query(
      `
      INSERT INTO announcement_views (announcement_id, member_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [req.params.id, req.user.member_id]
    );

    res.json({ message: "Marked as seen" });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as seen" });
  }
});

/* =====================================================
   ✏️ UPDATE ANNOUNCEMENT (ADMIN)
===================================================== */
router.put(
  "/:id",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const { title, message, category, priority, expiry_date } = req.body;

      await pool.query(
        `
        UPDATE announcements
        SET title=$1,
            message=$2,
            category=$3,
            priority=$4,
            expiry_date=$5
        WHERE id=$6
        `,
        [title, message, category, priority, expiry_date, req.params.id]
      );

      res.json({ message: "Announcement updated" });
    } catch (err) {
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* =====================================================
   🗑️ DELETE ANNOUNCEMENT (ADMIN)
===================================================== */
router.delete(
  "/:id",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      await pool.query(
        `DELETE FROM announcements WHERE id=$1`,
        [req.params.id]
      );

      res.json({ message: "Announcement deleted" });
    } catch (err) {
      res.status(500).json({ error: "Delete failed" });
    }
  }
);

module.exports = router;
