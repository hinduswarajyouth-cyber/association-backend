const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const sendMail = require("../utils/sendMail");

// 📧 Email template
const { announcementTemplate } = require("../utils/emailTemplates");

const router = express.Router();

/* =====================================================
   📢 CREATE ANNOUNCEMENT (SUPER_ADMIN / PRESIDENT)
   + OPTIONAL EMAIL NOTIFICATION
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
        category = "GENERAL",
        priority = "NORMAL",
        expiry_date = null,
        notify = false,
      } = req.body;

      if (!title || !message) {
        return res.status(400).json({ error: "Title & message required" });
      }

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

      // 🔔 EMAIL NOTIFICATION (OPTIONAL)
      if (notify) {
        const users = await pool.query(`
          SELECT personal_email
          FROM users
          WHERE active = true
            AND personal_email IS NOT NULL
        `);

        for (const u of users.rows) {
          await sendMail(
            u.personal_email,
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
          ? "Announcement created & notifications sent"
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
   📥 GET ANNOUNCEMENTS (ALL USERS)
   ✔ Seen / Unseen
   ✔ PINNED first
   ✔ Expiry respected
===================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        a.*,
        EXISTS (
          SELECT 1
          FROM announcement_views v
          WHERE v.announcement_id = a.id
            AND v.user_id = $1
        ) AS seen
      FROM announcements a
      WHERE a.expiry_date IS NULL
         OR a.expiry_date >= CURRENT_DATE
      ORDER BY
        CASE WHEN a.priority = 'PINNED' THEN 0 ELSE 1 END,
        a.created_at DESC
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET ANNOUNCEMENTS ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load announcements" });
  }
});

/* =====================================================
   👁️ MARK ANNOUNCEMENT AS SEEN (ALL USERS)
===================================================== */
router.post("/:id/seen", verifyToken, async (req, res) => {
  try {
    await pool.query(
      `
      INSERT INTO announcement_views (announcement_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [req.params.id, req.user.id]
    );

    res.json({ message: "Marked as seen" });
  } catch (err) {
    console.error("MARK SEEN ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to mark as seen" });
  }
});

/* =====================================================
   ✏️ UPDATE ANNOUNCEMENT (SUPER_ADMIN / PRESIDENT)
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
        SET
          title = $1,
          message = $2,
          category = $3,
          priority = $4,
          expiry_date = $5
        WHERE id = $6
        `,
        [title, message, category, priority, expiry_date, req.params.id]
      );

      res.json({ message: "Announcement updated successfully" });
    } catch (err) {
      console.error("UPDATE ANNOUNCEMENT ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to update announcement" });
    }
  }
);

/* =====================================================
   🗑️ DELETE ANNOUNCEMENT (SUPER_ADMIN / PRESIDENT)
===================================================== */
router.delete(
  "/:id",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      await pool.query(
        `DELETE FROM announcements WHERE id = $1`,
        [req.params.id]
      );

      res.json({ message: "Announcement deleted successfully" });
    } catch (err) {
      console.error("DELETE ANNOUNCEMENT ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to delete announcement" });
    }
  }
);

module.exports = router;
