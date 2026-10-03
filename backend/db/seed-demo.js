const bcrypt = require("bcrypt");
const { initializeDatabase, pool } = require("../src/db");
const { validateCredentials } = require("../src/validation");

async function seedDemoUser() {
  const credentials = validateCredentials(
    {
      name: process.env.DEMO_USER_NAME,
      email: process.env.DEMO_USER_EMAIL,
      password: process.env.DEMO_USER_PASSWORD,
    },
    true,
  );
  if (credentials.error) {
    throw new Error(
      "Set a valid DEMO_USER_NAME, DEMO_USER_EMAIL, and DEMO_USER_PASSWORD in backend/.env.",
    );
  }

  await initializeDatabase();
  const passwordHash = await bcrypt.hash(credentials.value.password, 12);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [credentials.value.name, credentials.value.email, passwordHash],
  );

  if (result.rowCount) {
    console.log("Demo account created. Credentials were not printed.");
  } else {
    console.log("Demo account already exists; its password was not changed.");
  }
}

seedDemoUser()
  .catch((error) => {
    console.error("Unable to create the demo account:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
