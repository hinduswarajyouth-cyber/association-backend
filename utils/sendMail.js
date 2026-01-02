const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendMail = async (to, subject, html) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "HSY Admin <onboarding@resend.dev>", // ✅ SAFE DEFAULT
      to: [to],                                  // ✅ array
      subject,
      html,
    });

    if (error) {
      console.error("❌ RESEND ERROR:", error);
      return false;
    }

    console.log("📨 MAIL SENT ID:", data.id);
    return true;
  } catch (err) {
    console.error("❌ MAIL FAILED:", err.message);
    return false;
  }
};

module.exports = sendMail;
