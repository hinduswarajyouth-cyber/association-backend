const express = require("express");
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

const router = express.Router();

/* =====================================================
   👥 GET ALL MEMBERS (SUPER ADMIN / PRESIDENT)
===================================================== */
router.get(
  "/",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          id,
          member_id,
          name,
          email,
          role,
          status,
          created_at
        FROM members
        ORDER BY created_at DESC
      `);

      res.json(result.rows);
    } catch (err) {
      console.error("GET MEMBERS ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to load members" });
    }
  }
);

/* =====================================================
   ✏️ UPDATE MEMBER ROLE / STATUS
===================================================== */
router.put(
  "/:id",
  verifyToken,
  checkRole("SUPER_ADMIN", "PRESIDENT"),
  async (req, res) => {
    try {
      const { role, status } = req.body;

      await pool.query(
        `
        UPDATE members
        SET role = $1,
            status = $2
        WHERE id = $3
        `,
        [role, status, req.params.id]
      );

      res.json({ message: "Member updated successfully" });
    } catch (err) {
      console.error("UPDATE MEMBER ERROR 👉", err.message);
      res.status(500).json({ error: "Failed to update member" });
    }
  }
);

module.exports = router;
