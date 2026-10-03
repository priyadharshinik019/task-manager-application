const TASK_STATUSES = new Set(["pending", "in_progress", "completed"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateCredentials(body, includeName) {
  if (!isRecord(body)) {
    return { error: "Request body must be a JSON object." };
  }
  const allowedFields = includeName
    ? new Set(["name", "email", "password"])
    : new Set(["email", "password"]);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    return { error: "Request contains an unsupported field." };
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8 || password.length > 72) {
    return { error: "Password must be between 8 and 72 characters." };
  }

  if (!includeName) {
    return { value: { email, password } };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) {
    return { error: "Name is required and must be 100 characters or fewer." };
  }

  return { value: { name, email, password } };
}

function validateTask(body, partial = false) {
  if (!isRecord(body)) {
    return { error: "Request body must be a JSON object." };
  }
  const allowedFields = new Set([
    "title",
    "description",
    "status",
    "dueDate",
    "imageUrl",
    "imagePublicId",
  ]);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    return { error: "Request contains an unsupported task field." };
  }

  const value = {};
  const has = (field) => Object.hasOwn(body, field);

  if (!partial || has("title")) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 255) {
      return { error: "Title is required and must be 255 characters or fewer." };
    }
    value.title = title;
  }

  if (!partial || has("description")) {
    if (
      body.description !== undefined &&
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      return { error: "Description must be text." };
    }
    const description = body.description == null ? null : body.description.trim();
    if (description && description.length > 5000) {
      return { error: "Description must be 5,000 characters or fewer." };
    }
    value.description = description || null;
  }

  if (has("status") || !partial) {
    const status = body.status ?? "pending";
    if (typeof status !== "string" || !TASK_STATUSES.has(status)) {
      return { error: "Status must be pending, in_progress, or completed." };
    }
    value.status = status;
  }

  if (has("dueDate") || !partial) {
    const dueDate = body.dueDate;
    if (dueDate === undefined || dueDate === null || dueDate === "") {
      value.dueDate = null;
    } else if (
      typeof dueDate !== "string" ||
      Number.isNaN(Date.parse(dueDate))
    ) {
      return { error: "Due date must be a valid date or null." };
    } else {
      value.dueDate = new Date(dueDate).toISOString();
    }
  }

  if (has("imageUrl") || has("imagePublicId")) {
    const { imageUrl, imagePublicId } = body;
    if (imageUrl === null && imagePublicId === null) {
      value.imageUrl = null;
      value.imagePublicId = null;
    } else if (
      typeof imageUrl !== "string" ||
      !/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/.+/.test(imageUrl) ||
      typeof imagePublicId !== "string" ||
      imagePublicId.length > 512
    ) {
      return {
        error: "Image attachment must be a Cloudinary image URL and public ID.",
      };
    } else {
      value.imageUrl = imageUrl;
      value.imagePublicId = imagePublicId;
    }
  }

  return { value };
}

module.exports = { TASK_STATUSES, isRecord, validateCredentials, validateTask };
