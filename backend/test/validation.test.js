const assert = require("node:assert/strict");
const test = require("node:test");
const { validateCredentials, validateTask } = require("../src/validation");

test("registration validates and normalizes account fields", () => {
  assert.deepEqual(
    validateCredentials(
      { name: "  Morgan Lee  ", email: "  MORGAN@example.com ", password: "a-secure-password" },
      true,
    ).value,
    { name: "Morgan Lee", email: "morgan@example.com", password: "a-secure-password" },
  );
  assert.match(
    validateCredentials(
      { name: "Morgan", email: "morgan@example.com", password: "short" },
      true,
    ).error,
    /8 and 72/,
  );
});

test("login rejects malformed credentials", () => {
  assert.match(
    validateCredentials({ email: "not-an-email", password: "a-secure-password" }, false).error,
    /valid email/,
  );
});

test("task creation validates and applies documented defaults", () => {
  assert.deepEqual(validateTask({ title: "  Prepare review  " }).value, {
    title: "Prepare review",
    description: null,
    status: "pending",
    dueDate: null,
  });
});

test("task updates accept partial status changes", () => {
  assert.deepEqual(validateTask({ status: "in_progress" }, true).value, {
    status: "in_progress",
  });
  assert.match(validateTask({ status: "blocked" }, true).error, /Status must be/);
  assert.match(validateTask({ title: "A task", ownerId: 1 }).error, /unsupported/);
});

test("task fields reject invalid text, dates, and image hosts", () => {
  assert.match(validateTask({ title: " " }).error, /Title is required/);
  assert.match(
    validateTask({ title: "A task", dueDate: "not-a-date" }).error,
    /valid date/,
  );
  assert.match(
    validateTask({
      title: "A task",
      imageUrl: "https://example.com/image.png",
      imagePublicId: "other/image",
    }).error,
    /Cloudinary/,
  );
});
