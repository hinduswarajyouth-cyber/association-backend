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
   🌐 CORS (FINAL & SAFE ✅)
========================= */
const allowedOrigins = [
  "http://localhost:5173",
  "https://association-frontend-zeta.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman / server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // ❗ IMPORTANT: return false instead of throwing error
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* ✅ HANDLE PREFLIGHT REQUESTS */
app.options("*", cors());

/* =========================
   📦 BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   ⏱ RATE LIMITER
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
   🔌 DATABASE CHECK
========================= */
pool
  .query("SELECT 1")
  .then(() => console.log("✅ DB Connected successfully"))
  .catch((err) => console.error("❌ DB error:", err.message));

/* =========================
   🚏 ROUTES
========================= */
app.use("/auth", require("./routes/auth"));
app.use("/admin", require("./routes/admin"));
app.use("/members", require("./routes/members"));
app.use("/funds", require("./routes/funds"));
app.use("/treasurer", require("./routes/treasurer"));
app.use("/reports", require("./routes/reports"));
app.use("/receipts", require("./routes/receipts"));
app.use("/api/complaints", require("./routes/complaints"));
app.use("/api/meetings", require("./routes/meetings"));

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
