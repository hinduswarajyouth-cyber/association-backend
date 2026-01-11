const sendMail = require("./sendMail");
const { publicDonationReceiptTemplate } = require("./emailTemplates");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const pool = require("../db");

module.exports = async function sendReceiptEmail(donation) {
  try {
    const {
      donor_email,
      donor_name,
      receipt_no,
      amount,
      fund_name,
      receipt_date,
    } = donation;

    const verifyUrl = `${process.env.BASE_URL}/receipts/verify/${receipt_no}`;

    // Generate QR
    const qrBuffer = Buffer.from(
      (await QRCode.toDataURL(verifyUrl)).split(",")[1],
      "base64"
    );

    // Generate PDF
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", async () => {
      const pdfData = Buffer.concat(buffers);

      const html = publicDonationReceiptTemplate({
        name: donor_name,
        receiptNo: receipt_no,
        amount,
        fund: fund_name,
        date: new Date(receipt_date).toDateString(),
        verifyUrl,
      });

      await sendMail(
        donor_email,
        "Your Donation Receipt – Hinduswaraj Youth Welfare Association",
        html,
        [
          {
            filename: `${receipt_no}.pdf`,
            content: pdfData,
          },
        ]
      );
    });

    doc.fontSize(16).text("HINDUSWARAJ YOUTH WELFARE ASSOCIATION", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Receipt No: ${receipt_no}`);
    doc.text(`Donor: ${donor_name}`);
    doc.text(`Fund: ${fund_name}`);
    doc.text(`Amount: ₹ ${Number(amount).toLocaleString("en-IN")}`);
    doc.text(`Date: ${new Date(receipt_date).toDateString()}`);
    doc.moveDown();
    doc.image(qrBuffer, { width: 120 });

    doc.end();

    return true;
  } catch (err) {
    console.error("❌ SEND RECEIPT EMAIL FAILED:", err.message);
    return false;
  }
};
