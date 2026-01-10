const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");

/* =====================================================
   📊 TREASURER SUMMARY
===================================================== */
router.get("/summary",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN","PRESIDENT"),
  async (req,res)=>{
    try{
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE source='MEMBER') AS member_count,
          COUNT(*) FILTER (WHERE source='PUBLIC') AS public_count,
          COALESCE(SUM(amount) FILTER (WHERE status='APPROVED'),0) AS total_collection
        FROM contributions
      `);
      res.json(rows[0]);
    }catch(err){
      console.error(err);
      res.status(500).json({error:"Server error"});
    }
});

/* =====================================================
   📋 MEMBER PENDING
===================================================== */
router.get("/pending-members",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN","PRESIDENT"),
  async (req,res)=>{
    const { rows } = await pool.query(`
      SELECT
        c.id,
        c.amount,
        c.payment_mode,
        c.reference_no,
        c.created_at,
        u.name AS member_name,
        f.fund_name
      FROM contributions c
      JOIN users u ON u.id = c.member_id
      JOIN funds f ON f.id = c.fund_id
      WHERE c.status='PENDING' AND c.source='MEMBER'
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
});

/* =====================================================
   🌍 PUBLIC PENDING
===================================================== */
router.get("/pending-public",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN","PRESIDENT"),
  async (req,res)=>{
    const { rows } = await pool.query(`
      SELECT
        id,
        donor_name,
        amount,
        payment_mode,
        reference_no,
        created_at
      FROM contributions
      WHERE status='PENDING' AND source='PUBLIC'
      ORDER BY created_at DESC
    `);
    res.json(rows);
});

/* =====================================================
   ✅ APPROVE MEMBER
===================================================== */
router.patch("/approve-member/:id",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN"),
  async (req,res)=>{
    try{
      const id = req.params.id;

      const { rowCount } = await pool.query(`
        UPDATE contributions
        SET status='APPROVED',
            approved_by=$1,
            approved_at=NOW()
        WHERE id=$2 AND source='MEMBER' AND status='PENDING'
      `,[req.user.id,id]);

      if(!rowCount) return res.status(400).json({error:"Invalid or already processed"});

      res.json({message:"Member donation approved"});
    }catch(e){
      res.status(500).json({error:e.message});
    }
});

/* =====================================================
   ✅ APPROVE PUBLIC
===================================================== */
router.patch("/approve-public/:id",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN"),
  async (req,res)=>{
    try{
      const id = req.params.id;

      const { rowCount } = await pool.query(`
        UPDATE contributions
        SET status='APPROVED',
            approved_by=$1,
            approved_at=NOW()
        WHERE id=$2 AND source='PUBLIC' AND status='PENDING'
      `,[req.user.id,id]);

      if(!rowCount) return res.status(400).json({error:"Invalid or already processed"});

      res.json({message:"Public donation approved"});
    }catch(e){
      res.status(500).json({error:e.message});
    }
});

module.exports = router;
