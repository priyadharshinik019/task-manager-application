const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? {
          rejectUnauthorized:
            process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
        }
      : undefined,
  connectionTimeoutMillis: 5000,
});

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured.");
  }

  const schema = fs.readFileSync(
    path.resolve(__dirname, "../db/schema.sql"),
    "utf8",
  );
  await pool.query(schema);
}

module.exports = { initializeDatabase, pool };
