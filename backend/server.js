const app = require("./src/app");
const { initializeDatabase, pool } = require("./src/db");

const port = Number(process.env.PORT || 5000);

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Task Manager API listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Unable to initialize the Task Manager API:", error.message);
    pool.end().finally(() => process.exit(1));
  });

module.exports = app;
