const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");
const sendMail = require("../utils/sendMail");
const {
  addMemberTemplate,
  resendLoginTemplate,
} = require("../utils/mailTemplates");

const router = express.Router();

/* =========================
   🔐 ROLE CONSTANTS
========================= */
const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PRESIDENT: "PRESIDENT",
  VICE_PRESIDENT: "VICE_PRESIDENT",
  GENERAL_SECRETARY: "GENERAL_SECRETARY",
  JOINT_SECRETARY: "JOINT_SECRETARY",
  TREASURER: "TREASURER",
  EC_MEMBER: "EC_MEMBER",
  MEMBER: "MEMBER",
};

const ALL_ROLES = Object.values(ROLES);
const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.PRESIDENT];

/* =========================
   🆔 MEMBER ID GENERATOR
========================= */
async function generateMemberId(client) {
  const year = new Date().getFullYear();
  const prefix = `HSY/JGTL/${year}/`;

  const last = await client.query(
    `SELECT member_id FROM users
     WHERE member_id LIKE $1
     ORDER BY member_id DESC
     LIMIT 1
     FOR UPDATE`,
    [`${prefix}%`]
  );

  let next = 1;
  if (last.rowCount) {
    next = Number(last.rows[0].member_id.split("/").pop()) + 1;
  }

  return prefix + String(next).padStart(4, "0");
}

/* =========================
   👤 USERNAME GENERATOR
========================= */
async function generateUsername(name) {
  const base = name.toLowerCase().replace(/[^a-z]/g, "");
  let username = `${base}@hsy.org`;
  let i = 1;

  while (true) {
    const exists = await pool.query(
      "SELECT id FROM users WHERE username=$1",
      [username]
    );
    if (!exists.rowCount) break;
    username = `${base}${++i}@hsy.org`;
  }

  return username;
}

/* =====================================================
   👤 ADD MEMBER
===================================================== */
router.post(
  "/add-member",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { name, personal_email, phone, role = ROLES.MEMBER } = req.body;

      if (!name) return res.status(400).json({ error: "Name required" });
      if (!ALL_ROLES.includes(role))
        return res.status(400).json({ error: "Invalid role" });

      if (req.user.role === ROLES.PRESIDENT && role === ROLES.SUPER_ADMIN)
        return res.status(403).json({ error: "Permission denied" });

      await client.query("BEGIN");

      const memberId = await generateMemberId(client);
      const username = await generateUsername(name);
      const rawPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      const { rows } = await client.query(
        `INSERT INTO users
         (member_id,name,username,personal_email,phone,password,role,is_first_login,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,true)
         RETURNING id`,
        [
          memberId,
          name,
          username,
          personal_email || null,
          phone || null,
          hashedPassword,
          role,
        ]
      );

      await client.query("COMMIT");

      if (personal_email) {
        await sendMail(
          personal_email,
          "Welcome to HSY Association",
          addMemberTemplate({
            name,
            username,
            password: rawPassword,
            memberId,
          })
        );
      }

      await logAudit("CREATE_MEMBER", "USER", rows[0].id, req.user.id);

      res.status(201).json({
        message: "Member added successfully",
        memberId,
        username,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("ADD MEMBER ERROR 👉", err.message);
      res.status(500).json({ error: "Add member failed" });
    } finally {
      client.release();
    }
  }
);

/* =====================================================
   ✏️ EDIT MEMBER
===================================================== */
router.put(
  "/edit-member/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { name, personal_email, phone, role, active } = req.body;

      if (userId === req.user.id)
        return res.status(400).json({ error: "Cannot edit self" });

      if (role && !ALL_ROLES.includes(role))
        return res.status(400).json({ error: "Invalid role" });

      const result = await pool.query(
        `UPDATE users SET
          name=COALESCE($1,name),
          personal_email=COALESCE($2,personal_email),
          phone=COALESCE($3,phone),
          role=COALESCE($4,role),
          active=COALESCE($5,active)
         WHERE id=$6
         RETURNING id`,
        [
          name || null,
          personal_email || null,
          phone || null,
          role || null,
          typeof active === "boolean" ? active : null,
          userId,
        ]
      );

      if (!result.rowCount)
        return res.status(404).json({ error: "User not found" });

      await logAudit("EDIT_MEMBER", "USER", userId, req.user.id, req.body);
      res.json({ message: "Member updated successfully" });
    } catch (err) {
      console.error("EDIT MEMBER ERROR 👉", err.message);
      res.status(500).json({ error: "Edit failed" });
    }
  }
);

/* =====================================================
   📧 RESEND LOGIN
===================================================== */
router.post(
  "/resend-login/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);

      const { rows } = await pool.query(
        "SELECT name,username,personal_email FROM users WHERE id=$1",
        [userId]
      );

      if (!rows.length)
        return res.status(404).json({ error: "User not found" });

      const rawPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      await pool.query(
        "UPDATE users SET password=$1,is_first_login=true WHERE id=$2",
        [hashedPassword, userId]
      );

      if (rows[0].personal_email) {
        await sendMail(
          rows[0].personal_email,
          "Login Credentials – HSY Association",
          resendLoginTemplate({
            name: rows[0].name,
            username: rows[0].username,
            password: rawPassword,
          })
        );
      }

      await logAudit("RESEND_LOGIN", "USER", userId, req.user.id);
      res.json({ message: "Login credentials resent" });
    } catch (err) {
      console.error("RESEND LOGIN ERROR 👉", err.message);
      res.status(500).json({ error: "Resend failed" });
    }
  }
);

/* =====================================================
   🔒 BLOCK / UNBLOCK
===================================================== */
router.put(
  "/block-member/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    const userId = Number(req.params.id);

    await pool.query("UPDATE users SET active=$1 WHERE id=$2", [
      req.body.active,
      userId,
    ]);

    await logAudit(
      req.body.active ? "UNBLOCK_USER" : "BLOCK_USER",
      "USER",
      userId,
      req.user.id
    );

    res.json({ message: "Status updated" });
  }
);

/* =====================================================
   🗑️ DELETE MEMBER
===================================================== */
router.delete(
  "/delete-member/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);

      const { rows } = await pool.query(
        "SELECT role FROM users WHERE id=$1",
        [userId]
      );

      if (!rows.length)
        return res.status(404).json({ error: "User not found" });

      if (rows[0].role === ROLES.SUPER_ADMIN)
        return res.status(403).json({ error: "Cannot delete Super Admin" });

      await pool.query("DELETE FROM contributions WHERE member_id=$1", [userId]);
      await pool.query("DELETE FROM users WHERE id=$1", [userId]);

      await logAudit("DELETE_MEMBER", "USER", userId, req.user.id);
      res.json({ message: "Member deleted permanently" });
    } catch (err) {
      console.error("DELETE MEMBER ERROR 👉", err.message);
      res.status(500).json({ error: "Delete failed" });
    }
  }
);

/* =====================================================
   📊 DASHBOARD
===================================================== */
router.get(
  "/dashboard",
  verifyToken,
  checkRole(
    ROLES.SUPER_ADMIN,
    ROLES.PRESIDENT,
    ROLES.VICE_PRESIDENT,
    ROLES.GENERAL_SECRETARY,
    ROLES.JOINT_SECRETARY,
    ROLES.EC_MEMBER,
    ROLES.TREASURER
  ),
  async (req, res) => {
    try {
      const members = await pool.query(
        "SELECT COUNT(*) FROM users WHERE active=true"
      );

      let approved = { rows: [{ count: 0, total: 0 }] };
      let cancelled = { rows: [{ count: 0 }] };
      let recent = { rows: [] };

      const exists = await pool.query(
        "SELECT to_regclass('public.contributions')"
      );

      if (exists.rows[0].to_regclass) {
        approved = await pool.query(`
          SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
          FROM contributions WHERE status='APPROVED'
        `);

        cancelled = await pool.query(`
          SELECT COUNT(*) AS count FROM contributions WHERE status='CANCELLED'
        `);

        recent = await pool.query(`
          SELECT receipt_no,amount,receipt_date
          FROM contributions
          ORDER BY receipt_date DESC
          LIMIT 5
        `);
      }

      await logAudit("VIEW_DASHBOARD", "DASHBOARD", null, req.user.id);

      res.json({
        totalMembers: Number(members.rows[0].count),
        approvedReceipts: Number(approved.rows[0].count),
        totalCollection: Number(approved.rows[0].total),
        cancelledReceipts: Number(cancelled.rows[0].count),
        recentReceipts: recent.rows,
      });
    } catch (err) {
      console.error("DASHBOARD ERROR 👉", err.message);
      res.status(500).json({ error: "Dashboard failed" });
    }
  }
);

module.exports = router;
