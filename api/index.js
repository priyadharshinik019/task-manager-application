const app = require("../backend/src/app");
const { initializeDatabase } = require("../backend/src/db");

let initialization;

module.exports = async function handler(req, res) {
  try {
    if (!initialization) {
      initialization = initializeDatabase().catch((error) => {
        initialization = null;
        throw error;
      });
    }
    await initialization;
    if (typeof req.query?.path === "string") {
      const url = new URL(req.url, "http://localhost");
      url.searchParams.delete("path");
      req.url = `/${req.query.path}${url.search}`;
    }
    app(req, res);
  } catch (error) {
    console.error("Unable to initialize the Task Manager API:", error.message);
    res.status(503).json({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "The API could not connect to its database.",
      },
    });
  }
};
