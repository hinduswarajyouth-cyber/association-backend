const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const multer = require("multer");
const path = require("path");

/* ================= UPLOAD ================= */
const storage = multer.diskStorage({
  destination: "uploads/logo",
  filename: (_, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/* ================= PUBLIC ================= */
router.get("/public", async (_, res) => {
  const r = await pool.query(
    "SELECT * FROM association_settings ORDER BY id DESC LIMIT 1"
  );
  res.json(r.rows[0] || null);
});

/* ================= ADMIN ================= */
router.get(
  "/admin",
  verifyToken,
  checkRole("SUPER_ADMIN"),
  async (_, res) => {
    const r = await pool.query(
      "SELECT * FROM association_settings ORDER BY id DESC LIMIT 1"
    );
    res.json(r.rows[0] || {});
  }
);

/* ================= UPDATE ================= */
router.put(
  "/admin",
  verifyToken,
  checkRole("SUPER_ADMIN"),
  async (req, res) => {
    const s = req.body;

    await pool.query(
      `
      INSERT INTO association_settings
      (
        association_name,
        hero_title, hero_subtitle,
        hero_title_te, hero_subtitle_te,
        primary_color, secondary_color, background_gradient,
        about_text, about_text_te,
        mission_text, mission_text_te,
        vision_text, vision_text_te,
        show_about, show_mission, show_activities,
        show_values, show_transparency,
        logo_url
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      )
      `,
      [
        s.association_name,
        s.hero_title,
        s.hero_subtitle,
        s.hero_title_te,
        s.hero_subtitle_te,
        s.primary_color,
        s.secondary_color,
        s.background_gradient,
        s.about_text,
        s.about_text_te,
        s.mission_text,
        s.mission_text_te,
        s.vision_text,
        s.vision_text_te,
        s.show_about,
        s.show_mission,
        s.show_activities,
        s.show_values,
        s.show_transparency,
        s.logo_url,
      ]
    );

    res.json({ success: true });
  }
);

/* ================= LOGO UPLOAD ================= */
router.post(
  "/logo",
  verifyToken,
  checkRole("SUPER_ADMIN"),
  upload.single("logo"),
  (req, res) => {
    res.json({
      success: true,
      logo_url: "/uploads/logo/" + req.file.filename,
    });
  }
);

module.exports = router;
