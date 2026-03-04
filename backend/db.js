const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is missing. Set it in backend/.env for Neon/Postgres.");
}

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? { rejectUnauthorized: false }
    : process.env.DB_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
});

module.exports = pool;
