const PDFDocument = require("pdfkit");
const path = require("path");

module.exports = function generateReceiptPDF(res, data) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Response headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=receipt-${data.receipt_no}.pdf`
  );

  doc.pipe(res);

  const logoPath = path.join(__dirname, "../assets/logo.jpeg");

  /* =========================
     HEADER
  ========================= */
  try {
    doc.image(logoPath, 50, 40, { width: 60 });
  } catch (e) {}

  doc
    .fontSize(16)
    .text("HINDUSWARAJ YOUTH WELFARE ASSOCIATION", 130, 40)
    .fontSize(10)
    .text("Reg No: 784/25", 130, 60)
    .text("Hyderabad, Telangana", 130, 75);

  doc
    .moveTo(50, 105)
    .lineTo(545, 105)
    .stroke();

  doc.moveDown(3);

  /* =========================
     RECEIPT TITLE
  ========================= */
  doc
    .fontSize(14)
    .text("PAYMENT RECEIPT", { align: "center", underline: true });

  doc.moveDown(2);

  /* =========================
     RECEIPT DETAILS
  ========================= */
  const rs = amt =>
    `Rs. ${Number(amt).toLocaleString("en-IN", {
      minimumFractionDigits: 2
    })}`;

  doc.fontSize(11);
  doc.text(`Receipt No   : ${data.receipt_no}`);
  doc.text(`Receipt Date : ${new Date(data.receipt_date).toLocaleDateString("en-IN")}`);
  doc.text(`Member Name  : ${data.member_name}`);
  doc.text(`Fund Name    : ${data.fund_name}`);
  doc.text(`Amount Paid  : ${rs(data.amount)}`);

  doc.moveDown(3);

  /* =========================
     FOOTER
  ========================= */
  doc
    .fontSize(9)
    .fillColor("gray")
    .text(
      "System generated receipt – no signature required",
      50,
      780,
      { align: "center" }
    )
    .fillColor("black");

  doc.end();
};
