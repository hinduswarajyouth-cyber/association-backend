const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const uploadLogo = require("../middleware/uploadLogo");

/* =========================
   GET ASSOCIATION INFO
========================= */
router.get("/", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM association_info ORDER BY id DESC LIMIT 1"
    );

    res.json({ success: true, data: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Load failed" });
  }
});

/* =========================
   CREATE / UPDATE (ADMIN)
   WITH LOGO UPLOAD ✅
========================= */
router.post(
  "/",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  uploadLogo.single("logo"),
  async (req, res) => {
    try {
      const {
        name,
        registration_no,
        established_year,
        address,
        phone,
        email,
        bank_name,
        account_no,
        ifsc,
      } = req.body;

      const logo = req.file ? `/uploads/${req.file.filename}` : null;

      const exists = await pool.query(
        "SELECT id, logo FROM association_info LIMIT 1"
      );

      if (exists.rows.length === 0) {
        await pool.query(
          `
          INSERT INTO association_info
          (name, registration_no, established_year, address, phone, email, bank_name, account_no, ifsc, logo)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `,
          [
            name,
            registration_no,
            established_year,
            address,
            phone,
            email,
            bank_name,
            account_no,
            ifsc,
            logo,
          ]
        );
      } else {
        await pool.query(
          `
          UPDATE association_info SET
            name=$1,
            registration_no=$2,
            established_year=$3,
            address=$4,
            phone=$5,
            email=$6,
            bank_name=$7,
            account_no=$8,
            ifsc=$9,
            logo=COALESCE($10, logo),
            updated_at=NOW()
          WHERE id=$11
          `,
          [
            name,
            registration_no,
            established_year,
            address,
            phone,
            email,
            bank_name,
            account_no,
            ifsc,
            logo,
            exists.rows[0].id,
          ]
        );
      }

      res.json({ success: true, message: "Association info saved" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Save failed" });
    }
  }
);

/* =========================
   DELETE (SUPER ADMIN)
========================= */
router.delete(
  "/",
  verifyToken,
  checkRole("SUPER_ADMIN"),
  async (req, res) => {
    try {
      await pool.query("DELETE FROM association_info");
      res.json({ success: true, message: "Association info deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: "Delete failed" });
    }
  }
);

module.exports = router;
