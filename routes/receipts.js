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
   🔐 RATE LIMIT
========================= */
const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
});

/* =========================
   🔢 AMOUNT TO WORDS
========================= */
function amountToWords(num) {
  const a = ["", "One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const b = ["", "", "Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + inWords(n % 1000) : "");
    return "";
  };

  return inWords(Math.floor(num)) + " Rupees Only";
}

/* =========================
   🌐 VERIFY (QR)
========================= */
router.get("/verify/:receiptNo", verifyLimiter, async (req, res) => {
  const { receiptNo } = req.params;

  const { rows } = await pool.query(
    `SELECT c.receipt_no, c.amount, c.receipt_date,
            COALESCE(u.name,c.donor_name) AS name, f.fund_name
     FROM contributions c
     LEFT JOIN users u ON u.id=c.member_id
     JOIN funds f ON f.id=c.fund_id
     WHERE c.receipt_no=$1 AND c.status='APPROVED' AND c.qr_locked=true`,
    [receiptNo]
  );

  if (!rows.length) return res.send("<h2>❌ Invalid Receipt</h2>");

  const r = rows[0];
  res.send(`<h2>✅ Receipt Verified</h2>
    <p>${r.receipt_no}</p>
    <p>${r.name}</p>
    <p>${r.fund_name}</p>
    <p>₹${r.amount}</p>
  `);
});

/* =========================
   🌍 PUBLIC PDF
========================= */
router.get("/public-pdf/:receiptNo", async (req, res) => {
  const { receiptNo } = req.params;

  const { rows } = await pool.query(
    `SELECT c.receipt_no,c.amount,c.receipt_date,c.donor_name,f.fund_name
     FROM contributions c
     JOIN funds f ON f.id=c.fund_id
     WHERE c.receipt_no=$1 AND c.source='PUBLIC' AND c.status='APPROVED' AND c.qr_locked=true`,
    [receiptNo]
  );

  if (!rows.length) return res.status(404).send("Not found");

  await generatePdf(res, rows[0], receiptNo);
});

/* =========================
   👤 MEMBER PDF
========================= */
router.get("/pdf/:receiptNo", verifyToken, async (req, res) => {
  const { receiptNo } = req.params;

  const { rows } = await pool.query(
    `SELECT c.receipt_no,c.amount,c.receipt_date,u.name AS donor_name,f.fund_name
     FROM contributions c
     JOIN users u ON u.id=c.member_id
     JOIN funds f ON f.id=c.fund_id
     WHERE c.receipt_no=$1 AND c.member_id=$2 AND c.status='APPROVED' AND c.qr_locked=true`,
    [receiptNo, req.user.id]
  );

  if (!rows.length) return res.status(404).send("Not found");

  await generatePdf(res, rows[0], receiptNo);
});

/* =========================
   📄 PDF GENERATOR (USED BY BOTH)
========================= */
async function generatePdf(res, r, receiptNo) {
  const verifyUrl = `${process.env.BASE_URL}/receipts/verify/${receiptNo}`;
  const qr = Buffer.from((await QRCode.toDataURL(verifyUrl)).split(",")[1], "base64");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${receiptNo}.pdf`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  const logoPath = path.join(__dirname, "../assets/logo.png");
  if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 80 });

  doc.fontSize(16).text("Hinduswaraj Youth Welfare Association", { align: "center" });
  doc.moveDown();
  doc.text(`Receipt No: ${r.receipt_no}`);
  doc.text(`Name: ${r.donor_name}`);
  doc.text(`Fund: ${r.fund_name}`);
  doc.text(`Amount: ₹${r.amount}`);
  doc.text(`In Words: ${amountToWords(r.amount)}`);
  doc.text(`Date: ${new Date(r.receipt_date).toDateString()}`);
  doc.image(qr, 400, 200, { width: 120 });
  doc.text("Scan QR to verify", 400, 330);

  doc.end();
}

module.exports = router;
