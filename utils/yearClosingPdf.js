const PDFDocument = require("pdfkit");
const path = require("path");

module.exports = async function generateYearClosingPDF(res, data) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Response headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=year-closing-${data.year}.pdf`
  );

  doc.pipe(res);

  const logoPath = path.join(__dirname, "../assets/logo.jpeg");

  /* =================================================
     WATERMARK (CENTER LOGO)
  ================================================= */
  try {
    doc.save();
    doc.opacity(0.15);
    doc.image(logoPath, 170, 260, { width: 260 });
    doc.restore();
  } catch (e) {}

  /* =================================================
     HEADER (LOGO + DETAILS)
  ================================================= */
  try {
    doc.image(logoPath, 50, 40, { width: 50 });
  } catch (e) {}

  doc
    .fontSize(16)
    .text(data.association_name, 120, 40)
    .fontSize(10)
    .text(`Reg No: ${data.registration_no}`, 120, 60)
    .text(data.address, 120, 75);

  // Header line
  doc
    .moveTo(50, 105)
    .lineTo(545, 105)
    .strokeColor("#aaaaaa")
    .stroke();

  doc.moveDown(3);

  /* =================================================
     TITLE
  ================================================= */
  doc
    .fontSize(14)
    .text(`Financial Year Closing Report – ${data.year}`, {
      align: "center",
      underline: true,
    });

  doc.moveDown(2);

  /* =================================================
     SUMMARY
  ================================================= */
  const rs = "Rs.";

  const money = v => `${rs} ${Number(v || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2
  })}`;

  doc.fontSize(11);
  doc.text(`Opening Balance : ${money(data.opening_balance)}`);
  doc.text(`Total Receipts  : ${money(data.total_receipts)}`);
  doc.text(`Total Cancelled : ${money(data.total_cancelled)}`);
  doc.text(`Closing Balance : ${money(data.closing_balance)}`);

  doc.moveDown(2);

  /* =================================================
     FUND-WISE TABLE
  ================================================= */
  doc.fontSize(12).text("Fund-wise Collection", { underline: true });
  doc.moveDown(1);

  data.funds.forEach(f => {
    doc.fontSize(11).text(`${f.fund_name} : ${money(f.total)}`);
  });

  doc.moveDown(3);

  /* =================================================
     SIGNATURES
  ================================================= */
  doc.fontSize(11);
  doc.text(`Prepared By  : ${data.prepared_by || "System"}`);
  doc.text(`Approved By  : ${data.approved_by || "President"}`);

  /* =================================================
     FOOTER
  ================================================= */
  doc
    .fontSize(9)
    .fillColor("gray")
    .text(
      "System generated document – no manual alteration allowed",
      50,
      780,
      { align: "center" }
    );

  doc.end();
};
