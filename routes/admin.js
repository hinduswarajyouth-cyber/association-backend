const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
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

/* =====================================================
   👤 ADD MEMBER
===================================================== */
router.post(
  "/add-member",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { name, personal_email, phone, role = ROLES.MEMBER } = req.body;

      if (!name) return res.status(400).json({ error: "Name is required" });
      if (!ALL_ROLES.includes(role))
        return res.status(400).json({ error: "Invalid role" });

      if (req.user.role === ROLES.PRESIDENT && role === ROLES.SUPER_ADMIN)
        return res.status(403).json({ error: "Insufficient privilege" });

      const username =
        name.toLowerCase().replace(/\s+/g, "") +
        crypto.randomBytes(2).toString("hex") +
        "@hsy.org";

      const rawPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      const result = await pool.query(
        `
        INSERT INTO users
        (name, username, personal_email, phone, password, role, is_first_login, active)
        VALUES ($1,$2,$3,$4,$5,$6,true,true)
        RETURNING id
        `,
        [
          name,
          username,
          personal_email || null,
          phone || null,
          hashedPassword,
          role,
        ]
      );

      if (personal_email) {
        try {
          await sendMail(
            personal_email,
            "Welcome to HSY Association",
            addMemberTemplate({ name, username, password: rawPassword })
          );
        } catch {}
      }

      await logAudit("CREATE", "USER", result.rows[0].id, req.user.id);
      res.status(201).json({ message: "Member added successfully" });
    } catch (err) {
      console.error("ADD MEMBER ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to add member" });
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
        return res.status(400).json({ error: "You cannot edit your own account" });

      if (role && !ALL_ROLES.includes(role))
        return res.status(400).json({ error: "Invalid role" });

      if (req.user.role === ROLES.PRESIDENT && role === ROLES.SUPER_ADMIN)
        return res.status(403).json({ error: "Insufficient privilege" });

      const result = await pool.query(
        `
        UPDATE users SET
          name = COALESCE($1, name),
          personal_email = COALESCE($2, personal_email),
          phone = COALESCE($3, phone),
          role = COALESCE($4, role),
          active = COALESCE($5, active)
        WHERE id=$6
        RETURNING id
        `,
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
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* =====================================================
   ✏️ EDIT ASSOCIATION ID
===================================================== */
router.put(
  "/edit-association-id/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { username } = req.body;

      if (userId === req.user.id)
        return res.status(400).json({ error: "You cannot edit your own ID" });

      if (!username || !username.endsWith("@hsy.org"))
        return res.status(400).json({ error: "Invalid Association ID" });

      const exists = await pool.query(
        "SELECT id FROM users WHERE username=$1 AND id<>$2",
        [username.toLowerCase(), userId]
      );

      if (exists.rowCount)
        return res.status(409).json({ error: "Association ID already exists" });

      await pool.query("UPDATE users SET username=$1 WHERE id=$2", [
        username.toLowerCase(),
        userId,
      ]);

      await logAudit("EDIT_ASSOCIATION_ID", "USER", userId, req.user.id);
      res.json({ message: "Association ID updated successfully" });
    } catch (err) {
      console.error("EDIT ASSOCIATION ID ERROR 👉", err.message);
      res.status(500).json({ error: "Update failed" });
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

      const { rows, rowCount } = await pool.query(
        "SELECT name, username, personal_email FROM users WHERE id=$1",
        [userId]
      );

      if (!rowCount)
        return res.status(404).json({ error: "User not found" });

      const rawPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      await pool.query(
        "UPDATE users SET password=$1, is_first_login=true WHERE id=$2",
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
   🔒 BLOCK / UNBLOCK MEMBER
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
      req.body.active ? "UNBLOCK" : "BLOCK",
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

      const { rows, rowCount } = await pool.query(
        "SELECT role FROM users WHERE id=$1",
        [userId]
      );

      if (!rowCount)
        return res.status(404).json({ error: "User not found" });

      if (rows[0].role === ROLES.SUPER_ADMIN)
        return res.status(403).json({ error: "Cannot delete Super Admin" });

      await pool.query("DELETE FROM contributions WHERE member_id=$1", [userId]);
      await pool.query("DELETE FROM users WHERE id=$1", [userId]);

      await logAudit("HARD_DELETE", "USER", userId, req.user.id);
      res.json({ message: "Member deleted permanently" });
    } catch (err) {
      console.error("DELETE MEMBER ERROR 👉", err.message);
      res.status(500).json({ error: "Delete failed" });
    }
  }
);

/* =====================================================
   📊 ADMIN DASHBOARD (SAFE – NO TABLE CRASH)
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
    ROLES.EC_MEMBER
  ),
  async (req, res) => {
    try {
      const members = await pool.query(
        "SELECT COUNT(*) FROM users WHERE active=true"
      );

      let approved = { rows: [{ count: 0, total: 0 }] };
      let cancelled = { rows: [{ count: 0 }] };
      let recent = { rows: [] };

      const cExists = await pool.query(
        "SELECT to_regclass('public.contributions')"
      );

      if (cExists.rows[0].to_regclass) {
        approved = await pool.query(`
          SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
          FROM contributions WHERE status='APPROVED'
        `);

        cancelled = await pool.query(`
          SELECT COUNT(*) FROM contributions WHERE status='CANCELLED'
        `);

        recent = await pool.query(`
          SELECT receipt_no, amount, receipt_date
          FROM contributions
          ORDER BY receipt_date DESC
          LIMIT 5
        `);
      }

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
