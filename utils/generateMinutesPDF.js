const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

module.exports.generateMinutesPDF = async (meeting, resolutions, votes) => {
  const filePath = `uploads/minutes_${meeting.id}.pdf`;
  const doc = new PDFDocument();

  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(18).text("HINDUSWARAJ YOUTH WELFARE ASSOCIATION", { align: "center" });
  doc.moveDown();
  doc.fontSize(14).text(`Meeting: ${meeting.title}`);
  doc.text(`Date: ${meeting.meeting_date}`);
  doc.moveDown();

  doc.fontSize(14).text("AGENDA");
  doc.fontSize(11).text(meeting.agenda || "No agenda");
  doc.moveDown();

  doc.fontSize(14).text("RESOLUTIONS");

  resolutions.forEach(r => {
    doc.moveDown();
    doc.fontSize(12).text(r.title);
    doc.fontSize(10).text(r.content);

    const rv = votes.filter(v => v.id === r.id);

    const yes = rv.filter(v => v.vote === "YES").map(v => v.name).join(", ");
    const no = rv.filter(v => v.vote === "NO").map(v => v.name).join(", ");

    doc.text(`YES: ${yes || "None"}`);
    doc.text(`NO: ${no || "None"}`);
    doc.text(`Final: ${r.status}`);
  });

  doc.end();
  return filePath;
};
