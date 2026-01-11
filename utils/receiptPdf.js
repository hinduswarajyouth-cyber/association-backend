const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

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

async function generateReceiptPDF(res, r) {
  const verifyUrl = r.verifyUrl;
  const qr = Buffer.from((await QRCode.toDataURL(verifyUrl)).split(",")[1], "base64");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${r.receipt_no}.pdf`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  const logo = path.join(__dirname, "../assets/logo.jpeg");
  const seal = path.join(__dirname, "../assets/seal.png");

  if (fs.existsSync(logo)) doc.image(logo, 50, 30, { width: 90 });

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#0d47a1")
    .text("HINDUSWARAJ YOUTH WELFARE ASSOCIATION", 150, 40, { align: "center" });

  doc.fontSize(10).fillColor("black")
    .text("Aravind Nagar, Jagtial – 505327", 150, 65, { align: "center" })
    .text("Reg No: 784/25 | Ph: 8499878425", 150, 80, { align: "center" });

  const startY = 130;
  doc.rect(40, startY, 520, 430).stroke();

  doc.font("Helvetica-Bold").fontSize(14).fillColor("#c9a227")
    .text("OFFICIAL DONATION RECEIPT", 0, startY + 15, { align: "center" });

  let y = startY + 70;
  const draw = (l, v) => {
    doc.font("Helvetica-Bold").text(l, 80, y);
    doc.font("Helvetica").text(v, 260, y);
    y += 28;
  };

  draw("Receipt No", r.receipt_no);
  draw("Donor / Member", r.name);
  draw("Fund", r.fund_name);
  draw("Amount", `₹ ${Number(r.amount).toLocaleString("en-IN")}`);
  draw("Amount in Words", amountToWords(r.amount));
  draw("Date", new Date(r.receipt_date).toDateString());

  doc.fontSize(10).fillColor("#0d47a1")
    .text("Scan QR to verify receipt", 360, startY + 90, { align: "center" });

  doc.image(qr, 390, startY + 120, { width: 120 });

  doc.fontSize(9).fillColor("gray")
    .text("This is a system generated receipt. No signature required.", 0, startY + 350, { align: "center" });

  if (fs.existsSync(seal)) doc.image(seal, 240, startY + 365, { width: 120 });

  doc.end();
}

module.exports = generateReceiptPDF;
