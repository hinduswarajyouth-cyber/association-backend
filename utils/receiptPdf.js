const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const generateReceiptPDF = require("../utils/receiptPdf");

/* =====================================================
   🧾 DOWNLOAD CONTRIBUTION RECEIPT (PDF)
   GET /contributions/receipt/:id
===================================================== */
router.get("/receipt/:id", verifyToken, async (req, res) => {
  try {
    const contributionId = Number(req.params.id);

    const result = await pool.query(
      `
      SELECT 
        c.id,
        c.receipt_no,
        c.amount,
        c.receipt_date,
        c.member_id,
        u.name AS member_name,
        f.fund_name
      FROM contributions c
      JOIN users u ON u.id = c.member_id
      JOIN funds f ON f.id = c.fund_id
      WHERE c.id = $1
      `,
      [contributionId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const receipt = result.rows[0];

    // 🔐 MEMBER CAN DOWNLOAD ONLY HIS RECEIPT
    if (
      req.user.role === "MEMBER" &&
      receipt.member_id !== req.user.id
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    generateReceiptPDF(res, receipt);
  } catch (err) {
    console.error("RECEIPT PDF ERROR 👉", err.message);
    res.status(500).json({ error: "Failed to generate receipt" });
  }
});

module.exports = router;
