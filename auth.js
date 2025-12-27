const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const verifyToken = require("./middleware/verifyToken");

const router = express.Router();

/* =========================
   🔐 REGISTER (SUPER ADMIN)
========================= */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1,$2,$3,$4)
       RETURNING id, email, role`,
      [name, email, hashedPassword, "SUPER_ADMIN"]
    );

    res.status(201).json({
      message: "Super Admin registered successfully",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("REGISTER ERROR 👉", err.message);
    res.status(400).json({ error: err.message });
  }
});

/* =========================
   🔑 LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: "Wrong password" });
    }

    /* 🔐 JWT TOKEN (2 HOURS EXPIRY) */
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" } // ⏰ 2 hours
    );

    res.json({
      message: "Login successful",
      token,
      role: user.role,
      expiresIn: "2h",
    });
  } catch (err) {
    console.error("LOGIN ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   ✅ VERIFY TOKEN
========================= */
router.get("/verify", verifyToken, (req, res) => {
  res.json({
    message: "Token verified",
    user: req.user,
  });
});

module.exports = router;
