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
} = require("../utils/emailTemplates");

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
   🧾 ADMIN – VIEW ALL SUGGESTIONS
===================================================== */
router.get(
  "/admin/suggestions",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          id,
          member_id,
          title,
          message,
          type,
          status,
          created_at
        FROM suggestions
        ORDER BY created_at DESC
      `);

      res.json({ count: rows.length, suggestions: rows });
    } catch (err) {
      console.error("GET SUGGESTIONS ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to load suggestions" });
    }
  }
);

/* =====================================================
   🔁 ADMIN – UPDATE SUGGESTION STATUS
===================================================== */
router.put(
  "/admin/suggestions/:id/status",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { status } = req.body;
      const suggestionId = Number(req.params.id);

      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }

      const result = await pool.query(
        `UPDATE suggestions
         SET status=$1
         WHERE id=$2
         RETURNING id`,
        [status, suggestionId]
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Suggestion not found" });
      }

      await logAudit(
        "UPDATE_SUGGESTION_STATUS",
        "SUGGESTION",
        suggestionId,
        req.user.id,
        { status }
      );

      res.json({ message: "Suggestion status updated successfully" });
    } catch (err) {
      console.error("UPDATE SUGGESTION ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to update status" });
    }
  }
);

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

  const next = last.rowCount
    ? Number(last.rows[0].member_id.split("/").pop()) + 1
    : 1;

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
      const password = Math.random().toString(36).slice(-8);
      const hashed = await bcrypt.hash(password, 10);

      const { rows } = await client.query(
        `INSERT INTO users
         (member_id,name,username,personal_email,phone,password,role,is_first_login,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,true)
         RETURNING id`,
        [memberId, name, username, personal_email || null, phone || null, hashed, role]
      );

      await client.query("COMMIT");

      if (personal_email) {
        await sendMail(
          personal_email,
          "Welcome to HSY Association",
          addMemberTemplate({ name, username, password, memberId })
        );
      }

      await logAudit("CREATE_MEMBER", "USER", rows[0].id, req.user.id);

      res.status(201).json({ message: "Member added", memberId, username });
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

      const approved = await pool.query(`
        SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
        FROM contributions WHERE status='APPROVED'
      `);

      const cancelled = await pool.query(`
        SELECT COUNT(*) AS count FROM contributions WHERE status='CANCELLED'
      `);

      const recent = await pool.query(`
        SELECT receipt_no,amount,receipt_date
        FROM contributions
        ORDER BY receipt_date DESC
        LIMIT 5
      `);

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
