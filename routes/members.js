const express = require("express");
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const upload = require("../middleware/uploadProfile");

const router = express.Router();

/* =========================
   👑 ADMIN ROLES
========================= */
const ADMIN_ROLES = ["SUPER_ADMIN", "PRESIDENT"];

/* =====================================================
   👥 GET ALL MEMBERS (ADMIN ONLY)
===================================================== */
router.get(
  "/",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT 
           id,
           name,
           username,
           personal_email,
           phone,
           role,
           active,
           profile_image
         FROM users
         ORDER BY name`
      );

      res.json(result.rows);
    } catch (err) {
      console.error("GET MEMBERS ERROR 👉", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/* =====================================================
   👤 GET MY PROFILE (ANY LOGGED USER)
===================================================== */
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         name,
         username,
         personal_email,
         phone,
         role,
         active,
         profile_image
       FROM users
       WHERE id=$1`,
      [req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET PROFILE ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/* =====================================================
   ✏️ UPDATE MY PROFILE
===================================================== */
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { name, personal_email, phone } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await pool.query(
      `UPDATE users
       SET name=$1,
           personal_email=$2,
           phone=$3
       WHERE id=$4
       RETURNING id,name,username,personal_email,phone,role,profile_image`,
      [name, personal_email || null, phone || null, req.user.id]
    );

    res.json({
      message: "Profile updated successfully",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/* =====================================================
   🖼️ UPLOAD / UPDATE PROFILE PICTURE
===================================================== */
router.post(
  "/profile-dp",
  verifyToken,
  upload.single("dp"), // 🔑 FIELD NAME MUST BE "dp"
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Image required" });
      }

      const imagePath = `/uploads/profile-dp/${req.file.filename}`;

      await pool.query(
        "UPDATE users SET profile_image=$1 WHERE id=$2",
        [imagePath, req.user.id]
      );

      res.json({
        message: "Profile picture updated successfully",
        image: imagePath,
      });
    } catch (err) {
      console.error("PROFILE DP ERROR 👉", err.message);
      res.status(500).json({ error: "Profile picture upload failed" });
    }
  }
);

/* =====================================================
   📊 MEMBER DASHBOARD
===================================================== */
router.get("/dashboard", verifyToken, async (req, res) => {
  try {
    const profile = await pool.query(
      `SELECT id, name, username, role
       FROM users
       WHERE id=$1`,
      [req.user.id]
    );

    const stats = await pool.query(
      `SELECT
         COUNT(*) AS total_contributions,
         COALESCE(SUM(amount), 0) AS total_amount
       FROM contributions
       WHERE member_id=$1`,
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
   💰 MEMBER CONTRIBUTIONS
===================================================== */
router.get("/contributions", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         c.id,
         c.receipt_no,
         c.amount,
         c.status,
         c.receipt_date,
         f.fund_name
       FROM contributions c
       JOIN funds f ON f.id = c.fund_id
       WHERE c.member_id=$1
       ORDER BY c.receipt_date DESC`,
      [req.user.id]
    );

    res.json({ contributions: result.rows });
  } catch (err) {
    console.error("MEMBER CONTRIBUTIONS ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load contributions" });
  }
});

module.exports = router;
