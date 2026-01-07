require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");

const pool = require("./db");
const app = express();

/* =========================
   🔐 SECURITY
========================= */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/* =========================
   🌐 CORS
========================= */
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/* =========================
   📦 BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   ⏱ RATE LIMIT
========================= */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
  })
);

/* =========================
   🗂 STATIC FILES
========================= */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   🔌 DB CHECK
========================= */
pool
  .query("SELECT 1")
  .then(() => console.log("✅ DB Connected"))
  .catch((err) => console.error("❌ DB Error:", err.message));

/* =========================
   🚏 ROUTES (FINAL & COMPLETE)
========================= */

/* AUTH */
app.use("/auth", require("./routes/auth"));

/* CORE MODULES */
app.use("/members", require("./routes/members"));
app.use("/funds", require("./routes/funds"));
app.use("/treasurer", require("./routes/treasurer"));
app.use("/reports", require("./routes/reports"));
app.use("/receipts", require("./routes/receipts"));

/* ADMIN / DASHBOARD */
app.use("/api/dashboard", require("./routes/dashboard"));

/* SUGGESTIONS ✅ (FIXED) */
app.use("/api/suggestions", require("./routes/suggestions"));

/* OTHER MODULES */
app.use("/api/complaints", require("./routes/complaints"));
app.use("/api/meetings", require("./routes/meetings"));
app.use("/api/announcements", require("./routes/announcements"));

/* =========================
   🏠 ROOT
========================= */
app.get("/", (req, res) => {
  res.send("🚀 Association Backend Running");
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
