const header = `
  <div style="font-family:Arial,sans-serif;background:#f4f6f8;padding:30px">
    <div style="max-width:550px;margin:auto;background:#ffffff;padding:25px;border-radius:8px">
      <h2 style="color:#0d47a1;text-align:center;margin-bottom:5px">
        HINDUSWARAJ YOUTH WELFARE ASSOCIATION
      </h2>
      <p style="text-align:center;font-size:13px;color:#555">
        Aravind Nagar, Jagtial – 505327<br/>
        📞 8499878425 | 📧 hinduswarajyouth@gmail.com
      </p>
      <hr/>
`;

const footer = `
      <br/>
      <p style="font-size:13px;color:#555">
        Regards,<br/>
        <b>HSY Admin Team</b>
      </p>
    </div>
  </div>
`;

/* ===============================
   🔐 FORGOT PASSWORD – OTP
================================ */
exports.forgotPasswordTemplate = ({ name, otp }) => `
${header}

<p>Dear <b>${name}</b>,</p>

<p>
We received a request to reset your account password.
Please use the OTP below to continue.
</p>

<div style="
  font-size:22px;
  font-weight:bold;
  text-align:center;
  letter-spacing:4px;
  background:#eef3ff;
  padding:12px;
  margin:20px 0;
  border-radius:6px;
  color:#0d47a1">
  ${otp}
</div>

<p>⏱️ This OTP is valid for <b>10 minutes</b>.</p>

<p style="color:#d32f2f">
If you did not request this, please ignore this email.
</p>

${footer}
`;

/* ===============================
   ✅ PASSWORD RESET SUCCESS
================================ */
exports.passwordResetSuccessTemplate = ({ name }) => `
${header}

<h3 style="color:#2e7d32">Password Reset Successful ✅</h3>

<p>Dear <b>${name}</b>,</p>

<p>Your password has been updated successfully.</p>

<p>You can now login using your new password.</p>

<p style="color:#d32f2f">
⚠️ If this was not done by you, contact admin immediately.
</p>

${footer}
`;

/* ===============================
   👤 ADD MEMBER – WELCOME MAIL
================================ */
exports.addMemberTemplate = ({ name, username, password }) => `
${header}

<h3 style="color:#0d47a1">Welcome to HSY Association 🎉</h3>

<p>Dear <b>${name}</b>,</p>

<p>
You have been successfully added as a member of
<b>Hinduswaraj Youth Welfare Association</b>.
</p>

<h4>🔐 Login Details</h4>

<table style="width:100%;border-collapse:collapse">
  <tr>
    <td style="padding:6px"><b>Association ID</b></td>
    <td style="padding:6px">${username}</td>
  </tr>
  <tr>
    <td style="padding:6px"><b>Temporary Password</b></td>
    <td style="padding:6px">${password}</td>
  </tr>
</table>

<p style="color:#d32f2f">
⚠️ Please change your password after first login.
</p>

${footer}
`;

/* ===============================
   🔁 RESEND LOGIN CREDENTIALS (FINAL)
================================ */
exports.resendLoginTemplate = ({ username, password }) => `
${header}

<h3 style="color:#0d47a1">Login Credentials Reset 🔁</h3>

<p>Dear Member,</p>

<p>
Your login credentials have been reset by the administrator.
Please find your updated login details below.
</p>

<h4>🔐 Updated Login Details</h4>

<table style="width:100%;border-collapse:collapse">
  <tr>
    <td style="padding:6px"><b>Username</b></td>
    <td style="padding:6px">${username}</td>
  </tr>
  <tr>
    <td style="padding:6px"><b>Temporary Password</b></td>
    <td style="padding:6px">${password}</td>
  </tr>
</table>

<p style="color:#d32f2f">
⚠️ For security reasons, please change your password immediately after login.
</p>

${footer}
`;
