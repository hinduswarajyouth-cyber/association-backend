const express = require("express");
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

/* =====================================================
   📨 SUBMIT SUGGESTION (MEMBER – SELF)
===================================================== */
router.post("/suggestions", verifyToken, async (req, res) => {
  try {
    const { title, message, type } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    await pool.query(
      `
      INSERT INTO suggestions (member_id, title, message, type)
      VALUES ($1, $2, $3, $4)
      `,
      [req.user.id, title || null, message, type || "GENERAL"]
    );

    res.json({ message: "Suggestion submitted successfully" });
  } catch (err) {
    console.error("SUGGESTION ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to submit suggestion" });
  }
});

/* =====================================================
   👥 GET ALL MEMBERS (ROLE BASED)
===================================================== */
router.get(
  "/",
  verifyToken,
  checkRole(
    "SUPER_ADMIN",
    "PRESIDENT",
    "VICE_PRESIDENT",
    "GENERAL_SECRETARY",
    "JOINT_SECRETARY",
    "TREASURER",
    "EC_MEMBER"
  ),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          id,
          member_id,
          name,
          username,
          personal_email,
          phone,
          address,
          role,
          active
        FROM users
        WHERE role != 'SUPER_ADMIN'
        ORDER BY member_id
      `);

      res.json(rows);
    } catch (err) {
      console.error("GET MEMBERS ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  }
);

/* =====================================================
   👤 GET MY PROFILE (SELF)
===================================================== */
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        member_id,
        name,
        username,
        personal_email,
        phone,
        address,
        role,
        active
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("GET PROFILE ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/* =====================================================
   ✏️ UPDATE MY PROFILE (SELF)
===================================================== */
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { name, personal_email, phone, address } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    await pool.query(
      `
      UPDATE users
      SET
        name = $1,
        personal_email = $2,
        phone = $3,
        address = $4
      WHERE id = $5
      `,
      [
        name,
        personal_email || null,
        phone || null,
        address || null,
        req.user.id,
      ]
    );

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/* =====================================================
   📊 MEMBER DASHBOARD (SELF)
===================================================== */
router.get("/dashboard", verifyToken, async (req, res) => {
  try {
    const profile = await pool.query(
      `
      SELECT id, name, role, active
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    const stats = await pool.query(
      `
      SELECT
        COUNT(*) AS total_contributions,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM contributions
      WHERE member_id = $1
      `,
      [req.user.id]
    );

    res.json({
      profile: profile.rows[0],
      stats: stats.rows[0],
    });
  } catch (err) {
    console.error("MEMBER DASHBOARD ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

/* =====================================================
   💰 MEMBER CONTRIBUTIONS (SELF)
===================================================== */
router.get("/contributions", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        receipt_no,
        amount,
        status,
        receipt_date
      FROM contributions
      WHERE member_id = $1
      ORDER BY receipt_date DESC
      `,
      [req.user.id]
    );

    res.json({ contributions: rows });
  } catch (err) {
    console.error("MEMBER CONTRIBUTIONS ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load contributions" });
  }
});

module.exports = router;
