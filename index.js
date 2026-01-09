require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");

const pool = require("./db");
const app = express();
// ✅ TRUST PROXY (FIXES X-Forwarded-For ERROR)
app.set("trust proxy", 1);

/* =========================
   🔐 SECURITY
========================= */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/* =========================
   🌐 CORS (🔥 FIXED)
========================= */
const allowedOrigins = [
  "https://hinduswarajyouth.online",
  "https://www.hinduswarajyouth.online",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (postman, curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// 🔥 VERY IMPORTANT (preflight)
app.options("*", cors());

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
   🚏 ROUTES (NO /api)
========================= */

/* AUTH */
app.use("/auth", require("./routes/auth"));

/* CORE */
app.use("/members", require("./routes/members"));
app.use("/funds", require("./routes/funds"));
app.use("/treasurer", require("./routes/treasurer"));
app.use("/reports", require("./routes/reports"));
app.use("/receipts", require("./routes/receipts"));

/* EXPENSES */
app.use("/expenses", require("./routes/expenses"));

/* ADMIN + DASHBOARD */
app.use("/admin", require("./routes/admin"));
app.use("/dashboard", require("./routes/dashboard"));

/* FEATURES */
app.use("/suggestions", require("./routes/suggestions"));
app.use("/complaints", require("./routes/complaints"));
app.use("/meetings", require("./routes/meetings"));
app.use("/announcements", require("./routes/announcements"));
app.use("/contributions", require("./routes/contributions"));

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
  console.error("GLOBAL ERROR 👉", err.message);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

/* =========================
   🚀 START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
