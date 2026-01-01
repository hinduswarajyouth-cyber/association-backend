const express = require("express");
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");

const router = express.Router();

/* =========================
   ROLES
========================= */
const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PRESIDENT: "PRESIDENT",
  GENERAL_SECRETARY: "GENERAL_SECRETARY",
  JOINT_SECRETARY: "JOINT_SECRETARY",
  EC_MEMBER: "EC_MEMBER",
  MEMBER: "MEMBER",
};

const ADMIN_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.PRESIDENT,
];

const OFFICE_ROLES = [
  ROLES.GENERAL_SECRETARY,
  ROLES.JOINT_SECRETARY,
  ROLES.EC_MEMBER,
];

/* =====================================================
   1️⃣ MEMBER → CREATE COMPLAINT
===================================================== */
router.post(
  "/create",
  verifyToken,
  checkRole(ROLES.MEMBER),
  async (req, res) => {
    try {
      const { subject, description, priority = "NORMAL" } = req.body;

      if (!subject || !description) {
        return res.status(400).json({ error: "Subject and description required" });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO complaints
        (member_id, subject, description, priority)
        VALUES ($1,$2,$3,$4)
        RETURNING id
        `,
        [req.user.id, subject, description, priority]
      );

      await logAudit("CREATE", "COMPLAINT", rows[0].id, req.user.id);

      res.status(201).json({ message: "Complaint submitted" });
    } catch (err) {
      console.error("CREATE COMPLAINT 👉", err.message);
      res.status(500).json({ error: "Complaint failed" });
    }
  }
);

/* =====================================================
   2️⃣ MEMBER → VIEW OWN COMPLAINTS
===================================================== */
router.get(
  "/my",
  verifyToken,
  checkRole(ROLES.MEMBER),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT *
        FROM complaints
        WHERE member_id=$1
        ORDER BY created_at DESC
        `,
        [req.user.id]
      );

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  }
);

/* =====================================================
   3️⃣ ADMIN → VIEW ALL COMPLAINTS
===================================================== */
router.get(
  "/all",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          c.*,
          u.name AS member_name
        FROM complaints c
        JOIN users u ON u.id = c.member_id
        ORDER BY c.created_at DESC
      `);

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  }
);

/* =====================================================
   4️⃣ ADMIN → ASSIGN / FORWARD COMPLAINT
===================================================== */
router.put(
  "/assign/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const complaintId = Number(req.params.id);
      const { assigned_role, admin_remark } = req.body;

      if (!OFFICE_ROLES.includes(assigned_role)) {
        return res.status(400).json({ error: "Invalid assigned role" });
      }

      await pool.query(
        `
        UPDATE complaints SET
          assigned_role=$1,
          assigned_by=$2,
          admin_remark=$3,
          status='FORWARDED',
          updated_at=NOW()
        WHERE id=$4
        `,
        [assigned_role, req.user.id, admin_remark || null, complaintId]
      );

      await logAudit(
        "ASSIGN",
        "COMPLAINT",
        complaintId,
        req.user.id,
        { assigned_role }
      );

      res.json({ message: "Complaint forwarded successfully" });
    } catch (err) {
      console.error("ASSIGN ERROR 👉", err.message);
      res.status(500).json({ error: "Forward failed" });
    }
  }
);

/* =====================================================
   5️⃣ OFFICE ROLE → VIEW ASSIGNED COMPLAINTS
===================================================== */
router.get(
  "/assigned",
  verifyToken,
  checkRole(...OFFICE_ROLES),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT *
        FROM complaints
        WHERE assigned_role=$1
        ORDER BY updated_at DESC
        `,
        [req.user.role]
      );

      res.json(rows);
    } catch {
      res.status(500).json({ error: "Failed to fetch assigned complaints" });
    }
  }
);

/* =====================================================
   6️⃣ OFFICE ROLE → UPDATE STATUS
===================================================== */
router.put(
  "/update/:id",
  verifyToken,
  checkRole(...OFFICE_ROLES),
  async (req, res) => {
    try {
      const { status, admin_remark } = req.body;

      await pool.query(
        `
        UPDATE complaints SET
          status=$1,
          admin_remark=COALESCE($2, admin_remark),
          updated_at=NOW()
        WHERE id=$3
        `,
        [status, admin_remark || null, Number(req.params.id)]
      );

      await logAudit(
        "UPDATE",
        "COMPLAINT",
        req.params.id,
        req.user.id,
        { status }
      );

      res.json({ message: "Complaint updated" });
    } catch {
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* =====================================================
   7️⃣ ADMIN → CLOSE COMPLAINT
===================================================== */
router.put(
  "/close/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    await pool.query(
      `
      UPDATE complaints
      SET status='CLOSED', updated_at=NOW()
      WHERE id=$1
      `,
      [Number(req.params.id)]
    );

    await logAudit("CLOSE", "COMPLAINT", req.params.id, req.user.id);

    res.json({ message: "Complaint closed" });
  }
);

/* =====================================================
   8️⃣ ADMIN → DELETE COMPLAINT
===================================================== */
router.delete(
  "/delete/:id",
  verifyToken,
  checkRole(...ADMIN_ROLES),
  async (req, res) => {
    await pool.query(
      "DELETE FROM complaints WHERE id=$1",
      [Number(req.params.id)]
    );

    await logAudit("DELETE", "COMPLAINT", req.params.id, req.user.id);

    res.json({ message: "Complaint deleted" });
  }
);

module.exports = router;
