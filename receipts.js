const express = require("express");
const router = express.Router();
const pool = require("./db");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const verifyToken = require("./middleware/verifyToken");

/* =====================================================
   🔓 PUBLIC RECEIPT VERIFICATION (QR SCAN)
===================================================== */
router.get("/verify-receipt/:receiptNo", async (req, res) => {
  try {
    const { receiptNo } = req.params;

    const result = await pool.query(
      `SELECT c.receipt_no, c.amount, c.receipt_date,
              u.name AS member_name,
              f.fund_name
       FROM contributions c
       JOIN users u ON c.member_id = u.id
       JOIN funds f ON c.fund_id = f.id
       WHERE c.receipt_no = $1
         AND c.status = 'APPROVED'`,
      [receiptNo]
    );

    if (!result.rows.length) {
      return res.send("<h2>❌ Invalid Receipt</h2>");
    }

    const r = result.rows[0];

    res.send(`
      <html>
        <head>
          <title>Receipt Verified</title>
        </head>
        <body style="font-family:Arial;background:#f5f5f5;padding:20px">
          <div style="background:#fff;padding:20px;max-width:500px;margin:auto;border-radius:8px">
            <h2 style="color:green">✅ Receipt Verified</h2>
            <p><b>Receipt No:</b> ${r.receipt_no}</p>
            <p><b>Member:</b> ${r.member_name}</p>
            <p><b>Fund:</b> ${r.fund_name}</p>
            <p><b>Amount:</b> ₹${r.amount}</p>
            <p><b>Date:</b> ${new Date(r.receipt_date).toDateString()}</p>
            <hr/>
            <p style="color:gray;font-size:13px">
              This page only verifies receipt authenticity.<br/>
              PDF download is available to the member via login.
            </p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("VERIFY ERROR 👉", err.message);
    res.status(500).send("Server error");
  }
});

/* =====================================================
   🔐 MEMBER SECURE PDF DOWNLOAD
===================================================== */
router.get("/pdf/:receiptNo", verifyToken, async (req, res) => {
  try {
    const { receiptNo } = req.params;

    const result = await pool.query(
      `SELECT c.receipt_no, c.amount, c.receipt_date,
              u.name AS member_name,
              f.fund_name
       FROM contributions c
       JOIN users u ON c.member_id = u.id
       JOIN funds f ON c.fund_id = f.id
       WHERE c.receipt_no = $1
         AND c.member_id = $2
         AND c.status = 'APPROVED'`,
      [receiptNo, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const r = result.rows[0];

    const verifyUrl = `${process.env.BASE_URL}/receipts/verify-receipt/${receiptNo}`;
    const qrBase64 = await QRCode.toDataURL(verifyUrl);
    const qrBuffer = Buffer.from(qrBase64.split(",")[1], "base64");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${receiptNo}.pdf`
    );

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).text("Association Receipt", { align: "center" });
    doc.moveDown(2);

    doc.fontSize(12);
    doc.text(`Receipt No   : ${r.receipt_no}`);
    doc.text(`Member Name  : ${r.member_name}`);
    doc.text(`Fund Name    : ${r.fund_name}`);
    doc.text(`Amount       : ₹ ${r.amount}`);
    doc.text(`Date         : ${new Date(r.receipt_date).toDateString()}`);

    doc.moveDown(2);
    doc.text("Scan QR to verify receipt:");

    doc.image(qrBuffer, { width: 120 });

    doc.moveDown(2);
    doc.fontSize(10).text(
      "System generated receipt. No manual alteration allowed.",
      { align: "center" }
    );

    doc.end();
  } catch (err) {
    console.error("PDF ERROR 👉", err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
