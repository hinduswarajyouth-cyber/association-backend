const express = require("express");
const router = express.Router();
const pool = require("../db");

/* =========================
   🏛 PUBLIC ASSOCIATION INFO
========================= */
router.get("/association", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM association_info ORDER BY id DESC LIMIT 1"
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error("PUBLIC ASSOCIATION ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load association info" });
  }
});

/* =========================
   💰 PUBLIC FUNDS LIST
========================= */
router.get("/funds", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, fund_name FROM funds WHERE status='ACTIVE'"
    );
    res.json(rows);
  } catch (err) {
    console.error("PUBLIC FUNDS ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to load funds" });
  }
});

/* =========================
   🤝 PUBLIC DONATION
========================= */
router.post("/donate", async (req, res) => {
  try {
    const {
      donor_name,
      donor_phone,
      fund_id,
      amount,
      payment_mode,
      reference_no,
    } = req.body;

    if (!amount || !fund_id || !payment_mode) {
      return res.status(400).json({
        success: false,
        error: "Required fields missing",
      });
    }

    await pool.query(
      `
      INSERT INTO contributions
      (member_id, donor_name, donor_phone, fund_id, amount, payment_mode, reference_no, status)
      VALUES (NULL, $1, $2, $3, $4, $5, $6, 'PENDING')
      `,
      [
        donor_name || "Public Donor",
        donor_phone || null,
        fund_id,
        amount,
        payment_mode,
        reference_no || null,
      ]
    );

    res.json({
      success: true,
      message: "Donation submitted successfully",
    });
  } catch (err) {
    console.error("PUBLIC DONATION ERROR 👉", err.message);
    res.status(500).json({
      success: false,
      error: "Donation failed",
    });
  }
});

module.exports = router;
