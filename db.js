const { Pool } = require("pg");
console.log("DB URL 👉", process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

pool.on("connect", () => {
  console.log("DB Connected");
});

module.exports = pool;
