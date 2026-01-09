const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const QRCode = require("qrcode");

async function generateResolutionPDF(id) {
  const { rows } = await pool.query(
    `
    SELECT r.*, m.title meeting_title, m.meeting_date,
           a.name association_name, a.registration_no
    FROM meeting_resolutions r
    JOIN meetings m ON m.id=r.meeting_id
    JOIN association_info a ON TRUE
    WHERE r.id=$1
    `,
    [id]
  );

  const r = rows[0];
  const dir = "uploads/resolutions";
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `resolution_${id}.pdf`);
  const doc = new PDFDocument({ margin: 50 });

  doc.pipe(fs.createWriteStream(filePath));

  /* ===== WATERMARK ===== */
  doc.opacity(0.08)
     .fontSize(80)
     .rotate(-30, { origin: [300, 400] })
     .text(r.association_name, 100, 300, { align: "center" })
     .rotate(30)
     .opacity(1);

  /* ===== HEADER ===== */
  if (fs.existsSync("uploads/logo.png")) {
    doc.image("uploads/logo.png", 50, 40, { width: 80 });
  }

  doc
    .fontSize(18)
    .text(r.association_name, 150, 50, { align: "center" })
    .fontSize(11)
    .text(`Reg No: ${r.registration_no}`, { align: "center" });

  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

  /* ===== TITLE ===== */
  doc.moveDown();
  doc.fontSize(16).text("OFFICIAL RESOLUTION", {
    align: "center",
    underline: true,
  });

  /* ===== DETAILS ===== */
  doc.moveDown(2);
  doc.fontSize(12);
  doc.text(`Meeting Title : ${r.meeting_title}`);
  doc.text(`Meeting Date  : ${new Date(r.meeting_date).toLocaleString()}`);
  doc.text(`Resolution    : ${r.title}`);

  /* ===== CONTENT ===== */
  doc.moveDown();
  doc.font("Times-Roman").text(r.content, {
    align: "justify",
    lineGap: 5,
  });

  /* ===== STATUS ===== */
  doc.moveDown(2);
  doc.font("Helvetica-Bold").text("Status: APPROVED");

  /* ===== SEAL ===== */
  if (fs.existsSync("uploads/seal.png")) {
    doc.image("uploads/seal.png", 420, doc.y - 40, { width: 100 });
  }

  /* ===== QR CODE ===== */
  const verifyUrl = `${process.env.BASE_URL}/verify-resolution/${id}`;
  const qrData = await QRCode.toDataURL(verifyUrl);

  doc.image(qrData, 50, doc.y + 20, { width: 90 });
  doc.fontSize(9).text("Scan to verify", 50, doc.y + 115);

  /* ===== SIGNATURES ===== */
  doc.moveDown(4);
  doc.text("President Signature", 50);
  doc.text("Secretary Signature", 350);

  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(200, doc.y).stroke();
  doc.moveTo(350, doc.y).lineTo(500, doc.y).stroke();

  /* ===== FOOTER ===== */
  doc.fontSize(9);
  doc.text(
    `Generated on ${new Date().toLocaleString()}`,
    50,
    750,
    { align: "center" }
  );

  doc.end();

  await pool.query(
    "UPDATE meeting_resolutions SET pdf_path=$1 WHERE id=$2",
    [filePath, id]
  );
}

module.exports = { generateResolutionPDF };
