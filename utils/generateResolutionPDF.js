const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const pool = require("../db");

async function generateResolutionPDF(resolutionId) {
  const { rows } = await pool.query(
    `
    SELECT r.*, 
           m.title AS meeting_title, 
           m.meeting_date, 
           m.location,
           a.name AS association_name, 
           a.registration_no, 
           a.address,
           a.president_name,
           a.secretary_name
    FROM meeting_resolutions r
    JOIN meetings m ON m.id = r.meeting_id
    JOIN association_info a ON a.id = 1
    WHERE r.id = $1
    `,
    [resolutionId]
  );

  if (!rows.length) return;
  const r = rows[0];

  const resolutionNo =
    r.resolution_no ||
    `RES/HSY/${new Date().getFullYear()}/${String(r.id).padStart(4, "0")}`;

  /* ===== VOTE COUNT ===== */
  const votes = await pool.query(
    `SELECT vote, COUNT(*) c FROM meeting_votes WHERE resolution_id=$1 GROUP BY vote`,
    [resolutionId]
  );

  let yes = 0,
    no = 0;
  votes.rows.forEach(v => {
    if (v.vote === "YES") yes = Number(v.c);
    if (v.vote === "NO") no = Number(v.c);
  });

  await pool.query(
    `UPDATE meeting_resolutions
     SET resolution_no=$1, yes_count=$2, no_count=$3
     WHERE id=$4`,
    [resolutionNo, yes, no, resolutionId]
  );

  const dir = "uploads/resolutions";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `resolution_${resolutionId}.pdf`);
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  doc.pipe(fs.createWriteStream(filePath));

  /* ======================================================
     🟦 OUTER PAGE BORDER
  ====================================================== */
  doc.rect(25, 25, 545, 792 - 50).stroke();

  /* ======================================================
     🟦 HEADER BOX
  ====================================================== */
  doc.rect(40, 40, 515, 80).stroke();
  doc.font("Helvetica-Bold").fontSize(16)
    .text(r.association_name, 40, 55, { width: 515, align: "center" });
  doc.font("Helvetica").fontSize(10)
    .text(`Reg No: ${r.registration_no}\n${r.address}`, {
      align: "center",
    });

  /* ======================================================
     🟦 RESOLUTION TITLE BOX
  ====================================================== */
  doc.rect(40, 135, 515, 45).stroke();
  doc.font("Helvetica-Bold").fontSize(14)
    .text("RESOLUTION", 40, 150, { width: 515, align: "center" });
  doc.fontSize(9)
    .text(`Resolution No: ${resolutionNo}`, { align: "center" });

  /* ======================================================
     🟦 MEETING INFO BOX
  ====================================================== */
  doc.rect(40, 190, 515, 90).stroke();
  doc.fontSize(11).font("Helvetica")
    .text(`Meeting Title : ${r.meeting_title}`, 55, 205)
    .text(`Meeting Date  : ${new Date(r.meeting_date).toLocaleString()}`)
    .text(`Place         : ${r.location || "-"}`);

  /* ======================================================
     🟦 RESOLUTION DETAILS BOX
  ====================================================== */
  doc.rect(40, 290, 515, 200).stroke();
  doc.font("Helvetica-Bold").text("RESOLUTION DETAILS", 55, 305);
  doc.font("Helvetica")
    .text(r.content, 55, 330, {
      width: 485,
      align: "justify",
      lineGap: 4,
    });

  /* ======================================================
     🟦 STATUS BOX
  ====================================================== */
  doc.rect(40, 500, 515, 60).stroke();
  doc.font("Helvetica-Bold")
    .text(`Resolution Status : ${r.status}`, 55, 515);
  doc.font("Helvetica")
    .text(`Voting Summary : YES – ${yes} | NO – ${no}`);

  /* ======================================================
     🟦 SIGNATURE BOX
  ====================================================== */
  doc.rect(40, 570, 515, 90).stroke();

  doc.fontSize(11)
    .text("President Signature", 80, 585)
    .text("Secretary Signature", 360, 585);

  doc.moveDown(2);
  doc.text("__________________", 80, 610);
  doc.text("__________________", 360, 610);

  doc.fontSize(9)
    .text(`${r.president_name}\nPresident`, 80, 635)
    .text(`${r.secretary_name}\nSecretary`, 360, 635);

  /* ======================================================
     🟦 SEAL BOX (CENTER)
  ====================================================== */
  doc.rect(220, 670, 150, 100).stroke();
  doc.image("uploads/seal.png", 245, 690, { width: 100 });

  /* ======================================================
     🟦 QR CODE
  ====================================================== */
  const qr = await QRCode.toDataURL(`Resolution No: ${resolutionNo}`);
  doc.image(qr, 460, 675, { width: 70 });

  /* ======================================================
     🟦 FOOTER BOX
  ====================================================== */
  doc.rect(40, 780, 515, 40).stroke();
  doc.fontSize(8).text(
    `Generated on: ${new Date().toLocaleDateString()}
System: Association Management System`,
    40,
    790,
    { width: 515, align: "center" }
  );

  doc.end();

  await pool.query(
    "UPDATE meeting_resolutions SET pdf_path=$1 WHERE id=$2",
    [filePath, resolutionId]
  );
}

module.exports = { generateResolutionPDF };
