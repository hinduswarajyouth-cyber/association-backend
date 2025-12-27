const pool = require("../db");

const isYearClosed = async (year) => {
  const result = await pool.query(
    "SELECT id FROM year_closings WHERE year = $1",
    [year]
  );
  return result.rows.length > 0;
};

module.exports = isYearClosed;
