const express = require("express");
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

/* =========================
   👑 ADMIN ROLES
========================= */
const ADMIN_ROLES = ["SUPER_ADMIN", "PRESIDENT"];

/* =====================================================
   📨 SUBMIT SUGGESTION (MEMBER)
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
      [
        req.user.member_id,
        title || null,
        message,
        type || "GENERAL",
      ]
    );

    res.json({ message: "Suggestion submitted successfully" });
  } catch (err) {
    console.error("SUGGESTION ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to submit suggestion" });
  }
});

/* =====================================================
   👥 GET ALL MEMBERS (ADMIN ONLY)
   ✅ FROM users TABLE (FINAL FIX)
===================================================== */
router.get(
  "/",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          member_id,
          name,
          username,
          personal_email,
          phone,
          role,
          active
        FROM users
        WHERE role = 'MEMBER'
        ORDER BY member_id
      `);

      const members = result.rows.map(u => ({
        member_id: u.member_id,
        name: u.name,
        association_id: u.username, // already like name@hsy.org
        personal_email: u.personal_email,
        phone: u.phone,
        role: u.role,
        status: u.active ? "ACTIVE" : "BLOCKED",
      }));

      res.json(members);
    } catch (err) {
      console.error("GET MEMBERS ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   👤 GET MY PROFILE (SELF)
   ✅ FROM users TABLE
===================================================== */
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        member_id,
        name,
        username,
        personal_email,
        phone,
        role,
        active
      FROM users
      WHERE member_id = $1
      `,
      [req.user.member_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const u = result.rows[0];

    res.json({
      member_id: u.member_id,
      name: u.name,
      association_id: u.username,
      personal_email: u.personal_email,
      phone: u.phone,
      role: u.role,
      status: u.active ? "ACTIVE" : "BLOCKED",
    });
  } catch (err) {
    console.error("GET PROFILE ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/* =====================================================
   ✏️ UPDATE MY PROFILE (SELF)
   ❌ member_id, username, role NOT editable
===================================================== */
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { name, personal_email, phone } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET
        name = $1,
        personal_email = $2,
        phone = $3
      WHERE member_id = $4
      RETURNING
        member_id,
        name,
        username,
        personal_email,
        phone,
        role,
        active
      `,
      [
        name,
        personal_email || null,
        phone || null,
        req.user.member_id,
      ]
    );

    res.json({
      message: "Profile updated successfully",
      profile: result.rows[0],
    });
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
      SELECT
        member_id,
        name,
        role,
        active
      FROM users
      WHERE member_id = $1
      `,
      [req.user.member_id]
    );

    const stats = await pool.query(
      `
      SELECT
        COUNT(*) AS total_contributions,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM contributions
      WHERE member_id = $1
      `,
      [req.user.member_id]
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
    const result = await pool.query(
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
      [req.user.member_id]
    );

    res.json({ contributions: result.rows });
  } catch (err) {
    console.error("MEMBER CONTRIBUTIONS ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load contributions" });
  }
});

module.exports = router;
