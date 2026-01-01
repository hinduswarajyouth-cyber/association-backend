const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

transporter.verify(() => {
  console.log("✅ SMTP READY");
});

module.exports = async (to, subject, html) => {
  const info = await transporter.sendMail({
    from: `"HSY Admin" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html, // ✅ USE HTML
  });

  console.log("📨 MESSAGE ID:", info.messageId);
};
