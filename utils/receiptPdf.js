async function generatePdf(res, r, receiptNo) {
  const verifyUrl = `${process.env.BASE_URL}/receipts/verify/${receiptNo}`;
  const qr = Buffer.from(
    (await QRCode.toDataURL(verifyUrl)).split(",")[1],
    "base64"
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${receiptNo}.pdf`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  const logo = path.join(__dirname, "../assets/logo.jpeg");
  const seal = path.join(__dirname, "../assets/seal.png");

  /* ===== HEADER ===== */
  if (fs.existsSync(logo)) doc.image(logo, 50, 30, { width: 90 });

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#0d47a1")
    .text("HINDUSWARAJ YOUTH WELFARE ASSOCIATION", 150, 40, { align: "center" });

  doc
    .fontSize(10)
    .fillColor("black")
    .text("Aravind Nagar, Jagtial – 505327", 150, 65, { align: "center" })
    .text("Reg No: 784/25 | Ph: 8499878425", 150, 80, { align: "center" });

  /* ===== MAIN BOX ===== */
  const startY = 130;
  doc.rect(40, startY, 520, 430).stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor("#c9a227")
    .text("OFFICIAL DONATION RECEIPT", 0, startY + 15, { align: "center" });

  let y = startY + 70;
  const draw = (l, v) => {
    doc.font("Helvetica-Bold").text(l, 80, y);
    doc.font("Helvetica").text(v, 260, y);
    y += 28;
  };

  draw("Receipt No", r.receipt_no);
  draw("Donor / Member", r.donor_name);
  draw("Fund", r.fund_name);
  draw("Amount", `₹ ${Number(r.amount).toLocaleString("en-IN")}`);
  draw("Amount in Words", amountToWords(r.amount));
  draw("Date", new Date(r.receipt_date).toDateString());

  /* ===== QR ===== */
  doc
    .fontSize(10)
    .fillColor("#0d47a1")
    .text("Scan QR to verify receipt", 360, startY + 90, { align: "center" });

  doc.image(qr, 390, startY + 120, { width: 120 });

  /* ===== FOOTER ===== */
  doc
    .fontSize(9)
    .fillColor("gray")
    .text("This is a system generated receipt. No signature required.", 0, startY + 350, { align: "center" });

  /* ===== SEAL ===== */
  if (fs.existsSync(seal)) doc.image(seal, 240, startY + 365, { width: 120 });

  doc.end();
}
