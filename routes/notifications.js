router.get("/", verifyToken, async (req,res)=>{
  const { rows } = await pool.query(
    `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.post("/read/:id", verifyToken, async (req,res)=>{
  await pool.query(
    `UPDATE notifications SET is_read=true WHERE id=$1`,
    [req.params.id]
  );
  res.json({ success:true });
});
