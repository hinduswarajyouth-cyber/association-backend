const express = require("express");
const router = express.Router();
const pool = require("./db");
const verifyToken = require("./middleware/verifyToken");
const checkRole = require("./middleware/checkRole");

/* =========================
   👥 CREATE MEMBER (ADMIN)
========================= */
router.post(
  "/create",
  verifyToken,
  checkRole(["SUPER_ADMIN", "ADMIN"]),
  async (req, res) => {
    try {
      const { name, phone, email, address } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Member name required" });
      }

      // Generate member code
      const countResult = await pool.query("SELECT COUNT(*) FROM members");
      const count = parseInt(countResult.rows[0].count) + 1;
      const memberId = `MEM-${String(count).padStart(4, "0")}`;

      const result = await pool.query(
        `INSERT INTO members
         (member_id, name, phone, email, address)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [memberId, name, phone || null, email || null, address || null]
      );

      res.status(201).json({
        message: "Member created successfully",
        member: result.rows[0],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* =========================
   📋 LIST MEMBERS
========================= */
router.get(
  "/list",
  verifyToken,
  checkRole(["SUPER_ADMIN", "ADMIN", "TREASURER"]),
  async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM members ORDER BY id DESC"
      );
      res.json({ members: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* =========================
   👤 MEMBER PROFILE (VIEW)
========================= */
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, phone, role FROM users WHERE id = $1",
      [req.user.id]
    );

    res.json({ profile: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   ✏️ MEMBER PROFILE (UPDATE)
========================= */
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await pool.query(
      `UPDATE users
       SET name = $1,
           phone = $2
       WHERE id = $3
       RETURNING id, name, email, role, phone`,
      [name, phone || null, req.user.id]
    );

    res.json({
      message: "Profile updated successfully",
      profile: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   📄 MEMBER → MY CONTRIBUTIONS
========================= */
router.get("/my-contributions", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         c.id,
         f.fund_name,
         c.amount,
         c.status,
         c.receipt_no,
         c.receipt_date,
         c.created_at
       FROM contributions c
       JOIN funds f ON c.fund_id = f.id
       WHERE c.member_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    res.json({ contributions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   📊 MEMBER DASHBOARD
========================= */
router.get("/dashboard", verifyToken, async (req, res) => {
  try {
    // Profile
    const profile = await pool.query(
      "SELECT id, name, email, phone, role FROM users WHERE id = $1",
      [req.user.id]
    );

    // Stats
    const stats = await pool.query(
      `SELECT 
         COUNT(*) AS total_contributions,
         COALESCE(SUM(amount),0) AS total_amount
       FROM contributions
       WHERE member_id = $1
         AND status = 'APPROVED'`,
      [req.user.id]
    );

    // Recent contributions
    const recent = await pool.query(
      `SELECT 
         f.fund_name,
         c.amount,
         c.status,
         c.receipt_no
       FROM contributions c
       JOIN funds f ON c.fund_id = f.id
       WHERE c.member_id = $1
       ORDER BY c.created_at DESC
       LIMIT 5`,
      [req.user.id]
    );

    res.json({
      profile: profile.rows[0],
      stats: stats.rows[0],
      recent_contributions: recent.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
