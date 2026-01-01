const express = require("express");
const router = express.Router();
const pool = require("../db");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const verifyToken = require("../middleware/verifyToken");

/* =========================
   🔢 AMOUNT TO WORDS (INDIAN)
========================= */
function amountToWords(num) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
    "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen",
    "Nineteen"
  ];
  const b = [
    "", "", "Twenty", "Thirty", "Forty",
    "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000)
      return (
        a[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + inWords(n % 100) : "")
      );
    if (n < 100000)
      return (
        inWords(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 ? " " + inWords(n % 1000) : "")
      );
    return "";
  };

  return inWords(Math.floor(num)) + " Rupees Only";
}

/* =====================================================
   🌐 PUBLIC RECEIPT VERIFICATION
===================================================== */
router.get("/verify/:receiptNo", async (req, res) => {
  try {
    const { receiptNo } = req.params;

    const result = await pool.query(
      `SELECT c.receipt_no, c.amount, c.receipt_date,
              u.name AS member_name, f.fund_name
       FROM contributions c
       JOIN users u ON u.id = c.member_id
       JOIN funds f ON f.id = c.fund_id
       WHERE c.receipt_no=$1 AND c.status='APPROVED'`,
      [receiptNo]
    );

    if (!result.rowCount) {
      return res.send("<h2>❌ Invalid or Unapproved Receipt</h2>");
    }

    const r = result.rows[0];

    res.send(`
      <html>
        <body style="font-family:Arial;background:#f4f6f8;padding:30px">
          <div style="background:#fff;padding:25px;border-radius:10px;max-width:520px;margin:auto">
            <h2 style="color:#0d47a1">✅ Receipt Verified</h2>
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
   🔐 MEMBER PDF RECEIPT (FINAL – STABLE)
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
         AND c.status='APPROVED'`,
      [receiptNo, req.user.id]
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
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${receiptNo}.pdf`
    );

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    const logoPath = path.join(__dirname, "../assets/logo.png");

    /* ===== HEADER (FIXED & SAFE) ===== */
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 85 });
    }

    doc
      .font("Helvetica-Bold")
      .fillColor("#0d47a1")
      .fontSize(16)
      .text(
        "HINDUSWARAJ YOUTH WELFARE ASSOCIATION",
        150,
        50,
        {
          width: 420,
          align: "center",
          lineBreak: true,
        }
      );

    /* ===== ADDRESS BLOCK ===== */
    const addressStartY = 82;

    doc
      .font("Helvetica")
      .fillColor("black")
      .fontSize(10)
      .text("Aravind Nagar, Jagtial – 505327", 150, addressStartY, {
        width: 420,
        align: "center",
      })
      .text("Reg No: 784/25", 150, addressStartY + 14, {
        width: 420,
        align: "center",
      })
      .text("Mobile: 8499878425", 150, addressStartY + 28, {
        width: 420,
        align: "center",
      })
      .text("Email: hinduswarajyouth@gmail.com", 150, addressStartY + 42, {
        width: 420,
        align: "center",
      });

    /* ===== TITLE ===== */
    doc
      .moveDown(2)
      .font("Helvetica-Bold")
      .fillColor("#c9a227")
      .fontSize(14)
      .text("OFFICIAL PAYMENT RECEIPT", { align: "center" });

    /* ===== RECEIPT BOX ===== */
    const startY = doc.y + 20;
    doc.roundedRect(50, startY, 500, 215, 12)
      .strokeColor("#0d47a1")
      .stroke();

    const leftX = 80;
    const gap = 140;

    const row = (label, value, y) => {
      doc.fontSize(11).fillColor("black").text(label, leftX, y);
      doc.text(":", leftX + gap, y);
      doc.text(value, leftX + gap + 15, y);
    };

    row("Receipt No", r.receipt_no, startY + 25);
    row("Member Name", r.member_name, startY + 50);
    row("Fund Name", r.fund_name, startY + 75);
    row("Amount Paid", `Rs. ${Number(r.amount).toFixed(2)}`, startY + 100);
    row("Amount (in words)", amountWords, startY + 125);
    row("Receipt Date", new Date(r.receipt_date).toDateString(), startY + 150);

    /* ===== QR ===== */
    doc
      .fontSize(10)
      .fillColor("#0d47a1")
      .text("Scan QR to verify receipt", 360, startY + 30, {
        width: 160,
        align: "center",
      });

    doc.image(qrBuffer, 380, startY + 55, { width: 120 });

    /* ===== FOOTER ===== */
    doc
      .fontSize(9)
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
