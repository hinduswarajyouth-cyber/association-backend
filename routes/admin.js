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
const adminOnly = checkRole(...ADMIN_ROLES);

/* =========================
   📣 COMPLAINT STATUS
========================= */
const COMPLAINT_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
};

/* =====================================================
   👤 ADD MEMBER
===================================================== */
router.post("/add-member", verifyToken, adminOnly, async (req, res) => {
  try {
    const { name, personal_email, phone, role = ROLES.MEMBER } = req.body;

    if (!name) return res.status(400).json({ error: "Name required" });
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
      [name, username, personal_email || null, phone || null, hashedPassword, role]
    );

    if (personal_email) {
      try {
        await sendMail(
          personal_email,
          "Welcome to HSY Association",
          addMemberTemplate({ name, username, password: rawPassword })
        );
      } catch (e) {
        console.warn("Mail failed:", e.message);
      }
    }

    await logAudit("CREATE", "USER", result.rows[0].id, req.user.id);
    res.status(201).json({ message: "Member added successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add member" });
  }
});

/* =====================================================
   ✏️ EDIT MEMBER DATA (ADMIN ONLY)
===================================================== */
router.put(
  "/edit-member/:id",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { name, personal_email, phone, role, active } = req.body;

      /* 🚫 Cannot edit own account */
      if (userId === req.user.id) {
        return res
          .status(400)
          .json({ error: "You cannot edit your own account" });
      }

      /* 🔎 Validate role */
      if (role && !ALL_ROLES.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      /* 🚫 PRESIDENT cannot promote SUPER_ADMIN */
      if (
        req.user.role === ROLES.PRESIDENT &&
        role === ROLES.SUPER_ADMIN
      ) {
        return res
          .status(403)
          .json({ error: "Insufficient privilege" });
      }

      const result = await pool.query(
        `
        UPDATE users
        SET
          name = COALESCE($1, name),
          personal_email = COALESCE($2, personal_email),
          phone = COALESCE($3, phone),
          role = COALESCE($4, role),
          active = COALESCE($5, active)
        WHERE id = $6
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

      if (!result.rowCount) {
        return res.status(404).json({ error: "User not found" });
      }

      /* 🧾 Audit Log */
      await logAudit("EDIT_MEMBER", "USER", userId, req.user.id);

      res.json({ message: "Member updated successfully" });
    } catch (err) {
      console.error("EDIT MEMBER ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to update member" });
    }
  }
);

/* =====================================================
   ✏️ EDIT MEMBER DATA (ADMIN ONLY)
===================================================== */
router.put(
  "/edit-member/:id",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { name, personal_email, phone, role, active } = req.body;

      /* 🚫 Cannot edit own account */
      if (userId === req.user.id) {
        return res
          .status(400)
          .json({ error: "You cannot edit your own account" });
      }

      /* 🔎 Validate role */
      if (role && !ALL_ROLES.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      /* 🚫 PRESIDENT cannot promote SUPER_ADMIN */
      if (
        req.user.role === ROLES.PRESIDENT &&
        role === ROLES.SUPER_ADMIN
      ) {
        return res
          .status(403)
          .json({ error: "Insufficient privilege" });
      }

      const result = await pool.query(
        `
        UPDATE users
        SET
          name = COALESCE($1, name),
          personal_email = COALESCE($2, personal_email),
          phone = COALESCE($3, phone),
          role = COALESCE($4, role),
          active = COALESCE($5, active)
        WHERE id = $6
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

      if (!result.rowCount) {
        return res.status(404).json({ error: "User not found" });
      }

      /* 🧾 Audit Log */
      await logAudit("EDIT_MEMBER", "USER", userId, req.user.id);

      res.json({ message: "Member updated successfully" });
    } catch (err) {
      console.error("EDIT MEMBER ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to update member" });
    }
  }
);

/* =====================================================
   🔁 EDIT ASSOCIATION ID (ADMIN ONLY)
===================================================== */
router.put(
  "/edit-association-id/:id",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { username } = req.body;

      /* 🚫 Cannot edit own association ID */
      if (userId === req.user.id) {
        return res
          .status(400)
          .json({ error: "You cannot edit your own Association ID" });
      }

      /* 🔎 Validate username */
      if (!username || !username.endsWith("@hsy.org")) {
        return res
          .status(400)
          .json({ error: "Association ID must end with @hsy.org" });
      }

      /* 🔁 Check duplicate */
      const exists = await pool.query(
        "SELECT id FROM users WHERE username=$1 AND id<>$2",
        [username.toLowerCase(), userId]
      );

      if (exists.rowCount > 0) {
        return res
          .status(409)
          .json({ error: "Association ID already exists" });
      }

      /* ✏️ Update */
      const result = await pool.query(
        `
        UPDATE users
        SET username=$1
        WHERE id=$2
        RETURNING id, username
        `,
        [username.toLowerCase(), userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      /* 🧾 Audit Log */
      await logAudit(
        "EDIT_ASSOCIATION_ID",
        "USER",
        userId,
        req.user.id
      );

      res.json({
        message: "Association ID updated successfully",
        username: result.rows[0].username,
      });
    } catch (err) {
      console.error("EDIT ASSOCIATION ID ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to update Association ID" });
    }
  }
);
/* =====================================================
   📧 RESEND LOGIN
===================================================== */
router.post("/resend-login/:id", verifyToken, adminOnly, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.user.id)
      return res.status(400).json({ error: "Cannot reset own login" });

    const { rows } = await pool.query(
      "SELECT name, username, personal_email FROM users WHERE id=$1",
      [userId]
    );

    if (!rows.length)
      return res.status(404).json({ error: "User not found" });

    const rawPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    await pool.query(
      "UPDATE users SET password=$1, is_first_login=true WHERE id=$2",
      [hashedPassword, userId]
    );

    if (rows[0].personal_email) {
      try {
        await sendMail(
          rows[0].personal_email,
          "Login Credentials – HSY Association",
          resendLoginTemplate({
            name: rows[0].name,
            username: rows[0].username,
            password: rawPassword,
          })
        );
      } catch {}
    }

    await logAudit("RESEND_LOGIN", "USER", userId, req.user.id);
    res.json({ message: "Login credentials resent" });
  } catch {
    res.status(500).json({ error: "Resend failed" });
  }
});

/* =====================================================
   🔒 BLOCK / UNBLOCK
===================================================== */
router.put("/block-member/:id", verifyToken, adminOnly, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.user.id)
      return res.status(400).json({ error: "Cannot block yourself" });

    const result = await pool.query(
      "UPDATE users SET active=$1 WHERE id=$2",
      [req.body.active, userId]
    );

    if (!result.rowCount)
      return res.status(404).json({ error: "User not found" });

    await logAudit(
      req.body.active ? "UNBLOCK" : "BLOCK",
      "USER",
      userId,
      req.user.id
    );

    res.json({ message: "Status updated" });
  } catch {
    res.status(500).json({ error: "Update failed" });
  }
});

/* =====================================================
   🗑️ DELETE MEMBER (TRANSACTION)
===================================================== */
router.delete("/delete-member/:id", verifyToken, adminOnly, async (req, res) => {
  const userId = Number(req.params.id);
  if (userId === req.user.id)
    return res.status(400).json({ error: "Cannot delete yourself" });

  try {
    const { rows } = await pool.query(
      "SELECT role FROM users WHERE id=$1",
      [userId]
    );

    if (!rows.length)
      return res.status(404).json({ error: "User not found" });

    if (rows[0].role === ROLES.SUPER_ADMIN)
      return res.status(403).json({ error: "Cannot delete Super Admin" });

    await pool.query("BEGIN");
    await pool.query("DELETE FROM complaints WHERE member_id=$1", [userId]);
    await pool.query("DELETE FROM contributions WHERE member_id=$1", [userId]);
    await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    await pool.query("COMMIT");

    await logAudit("HARD_DELETE", "USER", userId, req.user.id);
    res.json({ message: "Member deleted" });
  } catch {
    await pool.query("ROLLBACK");
    res.status(500).json({ error: "Delete failed" });
  }
});

/* =====================================================
   📣 COMPLAINTS
===================================================== */
router.post("/complaints/raise", verifyToken, async (req, res) => {
  try {
    const { subject, description } = req.body;
    if (!subject || !description)
      return res.status(400).json({ error: "Subject & description required" });

    await pool.query(
      "INSERT INTO complaints (member_id, subject, description) VALUES ($1,$2,$3)",
      [req.user.id, subject, description]
    );

    await logAudit("CREATE", "COMPLAINT", null, req.user.id);
    res.json({ message: "Complaint raised" });
  } catch {
    res.status(500).json({ error: "Failed to raise complaint" });
  }
});

router.get("/complaints/my", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM complaints WHERE member_id=$1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

router.get(
  "/complaints/all",
  verifyToken,
  checkRole(ROLES.SUPER_ADMIN, ROLES.PRESIDENT, ROLES.GENERAL_SECRETARY),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT c.*, u.name AS member_name
        FROM complaints c
        JOIN users u ON u.id=c.member_id
        ORDER BY c.created_at DESC
      `);
      res.json(rows);
    } catch {
      res.status(500).json({ error: "Fetch failed" });
    }
  }
);

router.put(
  "/complaints/update/:id",
  verifyToken,
  checkRole(ROLES.SUPER_ADMIN, ROLES.PRESIDENT, ROLES.GENERAL_SECRETARY),
  async (req, res) => {
    try {
      const { status, admin_remark } = req.body;
      if (!Object.values(COMPLAINT_STATUS).includes(status))
        return res.status(400).json({ error: "Invalid status" });

      const result = await pool.query(
        `
        UPDATE complaints
        SET status=$1, admin_remark=$2, updated_at=NOW()
        WHERE id=$3
        `,
        [status, admin_remark || null, req.params.id]
      );

      if (!result.rowCount)
        return res.status(404).json({ error: "Complaint not found" });

      await logAudit("UPDATE", "COMPLAINT", req.params.id, req.user.id);
      res.json({ message: "Complaint updated" });
    } catch {
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* =====================================================
   📊 DASHBOARD + RECENT CONTRIBUTIONS + COMPLAINT COUNTS
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
      const [
        members,
        approved,
        cancelled,
        recent,
        complaints,
      ] = await Promise.all([
        // 👤 ACTIVE MEMBERS
        pool.query(
          "SELECT COUNT(*) FROM users WHERE active=true"
        ),

        // 💰 APPROVED CONTRIBUTIONS
        pool.query(`
          SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
          FROM contributions
          WHERE status='APPROVED'
        `),

        // ❌ CANCELLED CONTRIBUTIONS
        pool.query(`
          SELECT COUNT(*)
          FROM contributions
          WHERE status='CANCELLED'
        `),

        // 🧾 RECENT CONTRIBUTIONS
        pool.query(`
          SELECT
            c.receipt_no,
            c.amount,
            c.receipt_date,
            u.name AS member_name,
            f.fund_name
          FROM contributions c
          JOIN users u ON u.id=c.member_id
          JOIN funds f ON f.id=c.fund_id
          WHERE c.status='APPROVED'
          ORDER BY c.receipt_date DESC
          LIMIT 5
        `),

        // 🔥 COMPLAINT COUNTS
        pool.query(`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status='OPEN') AS open,
            COUNT(*) FILTER (WHERE status='FORWARDED') AS forwarded,
            COUNT(*) FILTER (WHERE status='IN_PROGRESS') AS in_progress,
            COUNT(*) FILTER (WHERE status='RESOLVED') AS resolved,
            COUNT(*) FILTER (WHERE status='CLOSED') AS closed
          FROM complaints
        `),
      ]);

      res.json({
        // 👥 MEMBERS
        totalMembers: Number(members.rows[0].count),

        // 💰 CONTRIBUTIONS
        approvedReceipts: Number(approved.rows[0].count),
        totalCollection: Number(approved.rows[0].total),
        cancelledReceipts: Number(cancelled.rows[0].count),
        recentContributions: recent.rows,

        // 🧩 COMPLAINT DASHBOARD
        complaints: {
          total: Number(complaints.rows[0].total),
          open: Number(complaints.rows[0].open),
          forwarded: Number(complaints.rows[0].forwarded),
          in_progress: Number(complaints.rows[0].in_progress),
          resolved: Number(complaints.rows[0].resolved),
          closed: Number(complaints.rows[0].closed),
        },
      });
    } catch (err) {
      console.error("DASHBOARD ERROR 👉", err.message);
      res.status(500).json({ error: "Dashboard failed" });
    }
  }
);

module.exports = router;

