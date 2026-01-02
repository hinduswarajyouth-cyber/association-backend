const { Resend } = require("resend");

/**
 * Initialize Resend with API Key
 * Make sure RESEND_API_KEY is set in Render
 */
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send email using verified domain
 * @param {string} to - recipient email
 * @param {string} subject - email subject
 * @param {string} html - email HTML content
 * @returns {boolean}
 */
const sendMail = async (to, subject, html) => {
  try {
    // Basic validation
    if (!to || !subject || !html) {
      throw new Error("Missing email parameters");
    }

    const { data, error } = await resend.emails.send({
      from: process.env.MAIL_FROM, // ✅ VERIFIED DOMAIN (MANDATORY)
      to: [to],
      subject,
      html,
      reply_to: "support@hinduswarajyouth.online", // ✅ optional but recommended
    });

    if (error) {
      console.error("❌ RESEND ERROR:", error);
      return false;
    }

    console.log("📨 EMAIL SENT SUCCESSFULLY");
    console.log("📨 RESEND MESSAGE ID:", data.id);

    return true;
  } catch (err) {
    console.error("❌ MAIL SEND FAILED:", err.message);
    return false;
  }
};

module.exports = sendMail;
