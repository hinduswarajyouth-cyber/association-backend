const express = require("express");
const router = express.Router();
const pool = require("../db");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const verifyToken = require("../middleware/verifyToken");
const rateLimit = require("express-rate-limit");

/* =========================
   🔐 RATE LIMIT (PUBLIC VERIFY)
========================= */
const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
});

/* =========================
   🔢 AMOUNT TO WORDS (INDIAN)
========================= */
function amountToWords(num) {
  const a = ["", "One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const b = ["", "", "Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000)
      return a[Math.floor(n / 100)] + " Hundred" +
        (n % 100 ? " " + inWords(n % 100) : "");
    if (n < 100000)
      return inWords(Math.floor(n / 1000)) + " Thousand" +
        (n % 1000 ? " " + inWords(n % 1000) : "");
    return "";
  };

  return inWords(Math.floor(num)) + " Rupees Only";
}

/* =====================================================
   🌐 PUBLIC RECEIPT VERIFICATION (QR TARGET)
===================================================== */
router.get("/verify/:receiptNo", verifyLimiter, async (req, res) => {
  try {
    const { receiptNo } = req.params;

    if (receiptNo.length > 40) {
      return res.status(400).send("Invalid receipt");
    }

    const result = await pool.query(
      `SELECT c.receipt_no, c.amount, c.receipt_date,
              u.name AS member_name, f.fund_name
       FROM contributions c
       JOIN users u ON u.id = c.member_id
       JOIN funds f ON f.id = c.fund_id
       WHERE c.receipt_no=$1
         AND c.status='APPROVED'
         AND c.qr_locked = true`,
      [receiptNo]
    );

    if (!result.rowCount) {
      return res.send("<h2>❌ Invalid or Unapproved Receipt</h2>");
    }

    const r = result.rows[0];

    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Receipt Verified</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial; background:#f4f6f8; padding:20px; }
    .card { max-width:420px; margin:auto; background:#fff; padding:24px;
      border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.08); text-align:center; }
    h2 { color:#0d47a1; }
    p { margin:6px 0; }
    small { color:#666; }
  </style>
</head>
<body>
  <div class="card">
    <h2>✅ Receipt Verified</h2>
    <p><b>Receipt No:</b> ${r.receipt_no}</p>
    <p><b>Member:</b> ${r.member_name}</p>
    <p><b>Fund:</b> ${r.fund_name}</p>
    <p><b>Amount:</b> Rs. ${Number(r.amount).toFixed(2)}</p>
    <p><b>Date:</b> ${new Date(r.receipt_date).toDateString()}</p>
    <hr/>
    <small>This page verifies receipt authenticity only.</small>
  </div>
</body>
</html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

/* =====================================================
   🔐 MEMBER PDF RECEIPT WITH QR (FINAL)
===================================================== */
router.get("/pdf/:receiptNo", verifyToken, async (req, res) => {
  try {
    const { receiptNo } = req.params;

    const result = await pool.query(
      `SELECT c.receipt_no, c.amount, c.receipt_date,
              u.name AS member_name, f.fund_name
       FROM contributions c
       JOIN users u ON u.id = c.member_id
       JOIN funds f ON f.id = c.fund_id
       WHERE c.receipt_no=$1
         AND c.member_id=$2
         AND c.status='APPROVED'
         AND c.qr_locked = true`,
      [receiptNo, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const r = result.rows[0];
    const amountWords = amountToWords(r.amount);

    /* =====================================================
   🌍 PUBLIC PDF RECEIPT WITH QR
===================================================== */
router.get("/public-pdf/:receiptNo", async (req, res) => {
  try {
    const { receiptNo } = req.params;

    const result = await pool.query(
      `SELECT 
          c.receipt_no,
          c.amount,
          c.receipt_date,
          c.donor_name,
          f.fund_name
       FROM contributions c
       JOIN funds f ON f.id = c.fund_id
       WHERE c.receipt_no=$1
         AND c.source='PUBLIC'
         AND c.status='APPROVED'
         AND c.qr_locked=true`,
      [receiptNo]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const r = result.rows[0];
    const amountWords = amountToWords(r.amount);
    const verifyUrl = `${process.env.BASE_URL}/receipts/verify/${receiptNo}`;

    const qrBuffer = Buffer.from(
      (await QRCode.toDataURL(verifyUrl)).split(",")[1],
      "base64"
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${receiptNo}.pdf`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    const logoPath = path.join(__dirname, "../assets/logo.png");
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 85 });

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0d47a1")
      .text("HINDUSWARAJ YOUTH WELFARE ASSOCIATION", 150, 50, { width: 420, align: "center" });

    doc.moveDown(2).fontSize(14).fillColor("#c9a227")
      .text("PUBLIC DONATION RECEIPT", { align: "center" });

    doc.fontSize(11).fillColor("black");
    doc.text(`Receipt No: ${r.receipt_no}`, 80, 200);
    doc.text(`Donor: ${r.donor_name}`, 80, 225);
    doc.text(`Fund: ${r.fund_name}`, 80, 250);
    doc.text(`Amount: Rs. ${Number(r.amount).toFixed(2)}`, 80, 275);
    doc.text(`In Words: ${amountWords}`, 80, 300);
    doc.text(`Date: ${new Date(r.receipt_date).toDateString()}`, 80, 325);

    doc.fontSize(10).fillColor("#0d47a1")
      .text("Scan QR to verify receipt", 360, 200, { width: 160, align: "center" });

    doc.image(qrBuffer, 380, 225, { width: 120 });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

    /* ===== FINAL QR URL (NO LOCALHOST) ===== */
    const verifyUrl = `${process.env.BASE_URL}/receipts/verify/${receiptNo}`;

    const qrBuffer = Buffer.from(
      (await QRCode.toDataURL(verifyUrl)).split(",")[1],
      "base64"
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${receiptNo}.pdf`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    const logoPath = path.join(__dirname, "../assets/logo.png");
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 85 });

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor("#0d47a1")
      .text("HINDUSWARAJ YOUTH WELFARE ASSOCIATION", 150, 50, {
        width: 420,
        align: "center",
      });

    doc.moveDown(2)
      .fontSize(14)
      .fillColor("#c9a227")
      .text("OFFICIAL PAYMENT RECEIPT", { align: "center" });

    doc.fontSize(11).fillColor("black");
    doc.text(`Receipt No: ${r.receipt_no}`, 80, 200);
    doc.text(`Member: ${r.member_name}`, 80, 225);
    doc.text(`Fund: ${r.fund_name}`, 80, 250);
    doc.text(`Amount: Rs. ${Number(r.amount).toFixed(2)}`, 80, 275);
    doc.text(`In Words: ${amountWords}`, 80, 300);
    doc.text(`Date: ${new Date(r.receipt_date).toDateString()}`, 80, 325);

    doc.fontSize(10)
      .fillColor("#0d47a1")
      .text("Scan QR to verify receipt", 360, 200, { width: 160, align: "center" });

    doc.image(qrBuffer, 380, 225, { width: 120 });

    doc.fontSize(9)
      .fillColor("gray")
      .text(
        "This is a system generated receipt. No signature required.",
        50,
        750,
        { width: 500, align: "center" }
      );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

module.exports = router;
