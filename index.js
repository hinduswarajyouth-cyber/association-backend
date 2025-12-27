require("dotenv").config();

const express = require("express");
const app = express();
const pool = require("./db");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

/* =========================
   🔐 SECURITY MIDDLEWARE
========================= */
app.use(helmet());
app.use(cors());

/* =========================
   📦 BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   ⏱ RATE LIMITERS
========================= */

// Global limiter (all routes)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: "Too many requests, please try again later",
});

// Auth limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many authentication attempts",
});

// Admin limiter
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many admin requests",
});

// Apply limiters
app.use(generalLimiter);
app.use("/auth", authLimiter);
app.use("/verify-receipt", authLimiter);
app.use("/admin", adminLimiter);

/* =========================
   🔌 DATABASE CHECK
========================= */
pool
  .query("SELECT 1")
  .then(() => console.log("✅ DB Connected"))
  .catch((err) => console.error("❌ DB ERROR 👉", err.message));

/* =========================
   🚏 ROUTES
========================= */
app.use("/auth", require("./auth"));
app.use("/funds", require("./funds"));
app.use("/reports", require("./reports"));
app.use("/receipts", require("./receipts"));
app.use("/admin", require("./admin"));
app.use("/members", require("./members"));

/* =========================
   🏠 ROOT
========================= */
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

/* =========================
   🌍 PUBLIC RECEIPT VERIFY
========================= */
app.get("/verify-receipt/:receiptNo", async (req, res) => {
  try {
    const { receiptNo } = req.params;

    const result = await pool.query(
      `SELECT 
         c.receipt_no,
         c.amount,
         c.receipt_date,
         u.name AS member_name,
         f.fund_name
       FROM contributions c
       JOIN users u ON c.member_id = u.id
       JOIN funds f ON c.fund_id = f.id
       WHERE c.receipt_no = $1`,
      [receiptNo]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        valid: false,
        message: "Invalid receipt number",
      });
    }

    res.status(200).json({
      valid: true,
      receipt: result.rows[0],
    });
  } catch (err) {
    console.error("VERIFY RECEIPT ERROR 👉", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   ❗ GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR 👉", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

/* =========================
   🚀 START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
