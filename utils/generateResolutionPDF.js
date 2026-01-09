const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const pool = require("../db");

async function generateResolutionPDF(resolutionId) {
  const { rows } = await pool.query(
    `
    SELECT r.*, m.title AS meeting_title, m.meeting_date
    FROM meeting_resolutions r
    JOIN meetings m ON m.id = r.meeting_id
    WHERE r.id = $1
    `,
    [resolutionId]
  );

  if (!rows.length) return;

  const r = rows[0];

  const dir = path.join(__dirname, "../uploads/resolutions");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileName = `resolution_${r.id}.pdf`;
  const filePath = path.join(dir, fileName);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
  });

  doc.pipe(fs.createWriteStream(filePath));

  /* ================= PAGE BORDER ================= */
  doc.rect(30, 30, 535, 782).stroke();

  /* ================= HEADER ================= */
  doc
    .fontSize(16)
    .font("Times-Bold")
    .text("HINDUSWARAJ YOUTH WELFARE ASSOCIATION", {
      align: "center",
    });

  doc
    .fontSize(11)
    .font("Times-Roman")
    .text("Reg No:784/2025", { align: "center" })
    .moveDown(0.5);

  doc.text("4-1-140 VANI NAGAR /JAGTIAL /TELANGANA", { align: "center" });

  doc.moveDown(1);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();

  /* ================= TITLE ================= */
  doc.moveDown(1);
  doc.font("Times-Bold").fontSize(14).text("RESOLUTION", {
    align: "center",
    underline: true,
  });

  doc.moveDown(1.5);

  /* ================= MEETING INFO ================= */
  doc.fontSize(11).font("Times-Roman");

  doc.text(`Meeting Title : ${r.meeting_title}`);
  doc.text(
    `Meeting Date  : ${new Date(r.meeting_date).toLocaleString()}`
  );
  doc.text(`Place         : ____________________________`);

  doc.moveDown(1);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();

  /* ================= RESOLUTION CONTENT ================= */
  doc.moveDown(1);
  doc.font("Times-Bold").text("RESOLUTION DETAILS");
  doc.moveDown(0.5);

  doc
    .font("Times-Roman")
    .text(r.content, {
      align: "justify",
      lineGap: 4,
    });

  doc.moveDown(1);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();

  /* ================= STATUS ================= */
  doc.moveDown(1);
  doc.font("Times-Bold").text(
    `Resolution Status : ${r.status}`
  );

  const votes = await pool.query(
    `
    SELECT vote, COUNT(*) c
    FROM meeting_votes
    WHERE resolution_id=$1
    GROUP BY vote
    `,
    [resolutionId]
  );

  let yes = 0,
    no = 0;
  votes.rows.forEach(v => {
    if (v.vote === "YES") yes = Number(v.c);
    if (v.vote === "NO") no = Number(v.c);
  });

  doc
    .font("Times-Roman")
    .text(`Voting Summary   : YES – ${yes} | NO – ${no}`);

  doc.moveDown(2);

  /* ================= SIGNATURES ================= */
  const signY = doc.y;

  doc.text("President Signature", 60, signY);
  doc.text("Secretary Signature", 350, signY);

  doc.moveDown(1.5);

  doc.text("____________________", 60);
  doc.text("____________________", 350);

  doc.moveDown(0.5);

  doc.text("Name & Designation", 60);
  doc.text("Name & Designation", 350);

  /* ================= SEAL ================= */
  const sealPath = path.join(__dirname, "../assets/seal.png");
  if (fs.existsSync(sealPath)) {
    doc.image(sealPath, 240, signY + 20, {
      width: 80,
    });
  }

  /* ================= FOOTER ================= */
  doc.moveDown(4);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();

  doc.moveDown(0.5);
  doc
    .fontSize(9)
    .text(
      `Generated on: ${new Date().toLocaleDateString()}`,
      { align: "left" }
    );

  doc.text(
    "System: Association Management System",
    { align: "right" }
  );

  doc.end();

  await pool.query(
    "UPDATE meeting_resolutions SET pdf_path=$1 WHERE id=$2",
    [`uploads/resolutions/${fileName}`, resolutionId]
  );
}

module.exports = { generateResolutionPDF };
