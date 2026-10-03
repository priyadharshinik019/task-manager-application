const { initializeDatabase, pool } = require("../src/db");

initializeDatabase()
  .then(() => {
    console.log("PostgreSQL schema is ready.");
  })
  .catch((error) => {
    console.error("Unable to initialize PostgreSQL schema:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
