const express = require("express");
const router = express.Router();
const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");
const checkRole = require("../middleware/checkRole");
const logAudit = require("../utils/auditLogger");
const isYearClosed = require("../utils/isYearClosed");

/* ================================
   📊 TREASURER SUMMARY
================================ */
router.get("/summary",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN","PRESIDENT"),
  async (req,res)=>{
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE source='CONTRIBUTION') AS member_count,
        COUNT(*) FILTER (WHERE source='PUBLIC_DONATION') AS public_count,
        COALESCE(SUM(amount),0) AS total_collection
      FROM ledger
      WHERE entry_type='CREDIT'
    `);
    res.json(rows[0]);
});

/* ================================
   📋 MEMBER PENDING
================================ */
router.get("/pending-members",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN","PRESIDENT"),
  async (req,res)=>{
    const { rows } = await pool.query(`
      SELECT c.id,c.amount,c.payment_mode,c.reference_no,c.created_at,
             u.name AS member_name,f.fund_name
      FROM contributions c
      JOIN users u ON u.id=c.member_id
      JOIN funds f ON f.id=c.fund_id
      WHERE c.status='PENDING'
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
});

/* ================================
   🌍 PUBLIC PENDING
================================ */
router.get("/pending-public",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN","PRESIDENT"),
  async (req,res)=>{
    const { rows } = await pool.query(`
      SELECT id,name,amount,payment_mode,reference_no,created_at
      FROM public_donations
      WHERE status='PENDING'
      ORDER BY created_at DESC
    `);
    res.json(rows);
});

/* ================================
   ✅ APPROVE MEMBER
================================ */
router.patch("/approve-member/:id",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN"),
  async (req,res)=>{
    const client = await pool.connect();
    try{
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT * FROM contributions WHERE id=$1 FOR UPDATE`,
        [req.params.id]
      );
      const c = rows[0];
      if(!c || c.status!=="PENDING") throw new Error("Invalid");

      const year = new Date(c.created_at).getFullYear();
      if(await isYearClosed(year)) throw new Error("Year closed");

      const seq = await client.query(`
        INSERT INTO receipt_sequence(year,last_number)
        VALUES($1,1)
        ON CONFLICT(year) DO UPDATE
        SET last_number=receipt_sequence.last_number+1
        RETURNING last_number
      `,[year]);

      const receipt = `REC-${year}-${String(seq.rows[0].last_number).padStart(6,"0")}`;

      const bal = await client.query(`SELECT balance_after FROM ledger ORDER BY id DESC LIMIT 1`);
      const prev = Number(bal.rows[0]?.balance_after || 0);
      const newBal = prev + Number(c.amount);

      await client.query(`
        UPDATE contributions
        SET status='APPROVED',receipt_no=$1,approved_by=$2,approved_at=NOW()
        WHERE id=$3
      `,[receipt,req.user.id,c.id]);

      await client.query(`
        INSERT INTO ledger(entry_type,source,source_id,fund_id,amount,balance_after,created_by)
        VALUES('CREDIT','CONTRIBUTION',$1,$2,$3,$4,$5)
      `,[c.id,c.fund_id,c.amount,newBal,req.user.id]);

      await logAudit("APPROVE","CONTRIBUTION",c.id,req.user.id,{receipt});
      await client.query("COMMIT");
      res.json({ receipt });

    }catch(e){
      await client.query("ROLLBACK");
      res.status(400).json({ error:e.message });
    }finally{
      client.release();
    }
});

/* ================================
   ✅ APPROVE PUBLIC
================================ */
router.patch("/approve-public/:id",
  verifyToken,
  checkRole("TREASURER","SUPER_ADMIN"),
  async (req,res)=>{
    const client = await pool.connect();
    try{
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT * FROM public_donations WHERE id=$1 FOR UPDATE`,
        [req.params.id]
      );
      const d = rows[0];
      if(!d || d.status!=="PENDING") throw new Error("Invalid");

      const bal = await client.query(`SELECT balance_after FROM ledger ORDER BY id DESC LIMIT 1`);
      const prev = Number(bal.rows[0]?.balance_after || 0);
      const newBal = prev + Number(d.amount);

      await client.query(`
        UPDATE public_donations
        SET status='APPROVED',approved_by=$1,approved_at=NOW()
        WHERE id=$2
      `,[req.user.id,d.id]);

      await client.query(`
        INSERT INTO ledger(entry_type,source,source_id,amount,balance_after,created_by)
        VALUES('CREDIT','PUBLIC_DONATION',$1,$2,$3,$4)
      `,[d.id,d.amount,newBal,req.user.id]);

      await logAudit("APPROVE","PUBLIC_DONATION",d.id,req.user.id,{amount:d.amount});
      await client.query("COMMIT");

      res.json({ success:true });

    }catch(e){
      await client.query("ROLLBACK");
      res.status(400).json({ error:e.message });
    }finally{
      client.release();
    }
});

module.exports = router;
