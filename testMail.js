import "dotenv/config";
import sendMail from "./utils/sendMail.js";

(async () => {
  try {
    await sendMail(
      "vinodhkumarkokkula@gmail.com",
      "Mail Test Successful ✅",
      "<h2>Mail system working perfectly 🚀</h2>"
    );

    console.log("✅ Mail sent successfully");
  } catch (err) {
    console.error("❌ Mail failed:", err);
  }
})();
