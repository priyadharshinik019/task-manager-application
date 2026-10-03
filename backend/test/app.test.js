const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, test } = require("node:test");

require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env") });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");

const { initializeDatabase, pool } = require("../src/db");
const app = require("../src/app");

const databaseHost = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).hostname
  : null;
const skipReason = !databaseHost
  ? "Set DATABASE_URL to run API integration tests."
  : !["localhost", "127.0.0.1", "::1"].includes(databaseHost)
    ? "API integration tests only run against a local PostgreSQL database."
    : false;

let server;

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await pool.end();
});

test(
  "authentication, validation, task CRUD, and per-user isolation",
  { skip: skipReason },
  async () => {
    await initializeDatabase();
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const emailSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    const emails = [`first-${emailSuffix}@example.test`, `second-${emailSuffix}@example.test`];
    const userIds = [];

    async function api(path, { token, ...options } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
      const body = response.status === 204 ? null : await response.json();
      return { response, body };
    }

    try {
      const unauthenticated = await api("/api/tasks");
      assert.equal(unauthenticated.response.status, 401);
      assert.equal(unauthenticated.body.error.code, "UNAUTHORIZED");

      const invalid = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ name: "Test", email: "invalid", password: "short" }),
      });
      assert.equal(invalid.response.status, 400);

      const first = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ name: "First User", email: emails[0], password: "test-password-1" }),
      });
      assert.equal(first.response.status, 201);
      assert.ok(first.body.accessToken);
      userIds.push(first.body.user.id);

      const second = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ name: "Second User", email: emails[1], password: "test-password-2" }),
      });
      assert.equal(second.response.status, 201);
      userIds.push(second.body.user.id);

      const login = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: emails[0], password: "test-password-1" }),
      });
      assert.equal(login.response.status, 200);
      assert.ok(login.body.accessToken);

      const created = await api("/api/tasks", {
        token: first.body.accessToken,
        method: "POST",
        body: JSON.stringify({
          title: "Integration test task",
          description: "Scoped to the first user",
          status: "pending",
        }),
      });
      assert.equal(created.response.status, 201);
      assert.equal(created.body.task.title, "Integration test task");

      const firstList = await api("/api/tasks", { token: first.body.accessToken });
      const secondList = await api("/api/tasks", { token: second.body.accessToken });
      assert.equal(firstList.body.tasks.length, 1);
      assert.equal(secondList.body.tasks.length, 0);

      const foreignRead = await api(`/api/tasks/${created.body.task.id}`, {
        token: second.body.accessToken,
      });
      assert.equal(foreignRead.response.status, 404);

      const invalidUpdate = await api(`/api/tasks/${created.body.task.id}`, {
        token: first.body.accessToken,
        method: "PUT",
        body: JSON.stringify({ status: "blocked" }),
      });
      assert.equal(invalidUpdate.response.status, 400);

      const updated = await api(`/api/tasks/${created.body.task.id}`, {
        token: first.body.accessToken,
        method: "PUT",
        body: JSON.stringify({ status: "completed" }),
      });
      assert.equal(updated.response.status, 200);
      assert.equal(updated.body.task.status, "completed");

      const deleted = await api(`/api/tasks/${created.body.task.id}`, {
        token: first.body.accessToken,
        method: "DELETE",
      });
      assert.equal(deleted.response.status, 204);
    } finally {
      if (userIds.length) {
        await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [userIds]);
      }
      await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [emails]);
    }
  },
);
