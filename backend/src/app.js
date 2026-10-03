const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v2: cloudinary } = require("cloudinary");
const { pool } = require("./db");
const { sendDueReminderEmail, sendWelcomeEmail } = require("./mail");
const { isRecord, validateCredentials, validateTask } = require("./validation");

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const app = express();
const router = express.Router();
const taskSelect = `SELECT id, title, description, status, due_date AS "dueDate",
  image_url AS "imageUrl", image_public_id AS "imagePublicId",
  created_at AS "createdAt", updated_at AS "updatedAt"
  FROM tasks`;

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      const allowed = (process.env.CORS_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new ApiError(403, "This origin is not allowed.", "CORS_ORIGIN"));
    },
  }),
);
app.use(express.json({ limit: "1mb" }));

function sendToken(user, res, status = 200, notification) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new ApiError(
      500,
      "JWT_SECRET must contain at least 32 characters.",
      "SERVER_CONFIGURATION",
    );
  }

  const accessToken = jwt.sign(
    { sub: String(user.id), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "8h" },
  );
  res.status(status).json({
    accessToken,
    tokenType: "Bearer",
    expiresIn: 28800,
    user: { id: String(user.id), name: user.name, email: user.email },
    ...(notification ? { notification } : {}),
  });
}

function authenticate(req, _res, next) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    next(new ApiError(401, "A valid Bearer token is required.", "UNAUTHORIZED"));
    return;
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    next(
      new ApiError(
        500,
        "JWT_SECRET must contain at least 32 characters.",
        "SERVER_CONFIGURATION",
      ),
    );
    return;
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: String(claims.sub), email: claims.email };
    next();
  } catch (error) {
    if (
      error instanceof jwt.TokenExpiredError ||
      error instanceof jwt.JsonWebTokenError
    ) {
      next(new ApiError(401, "Your session is invalid or expired.", "UNAUTHORIZED"));
      return;
    }
    next(error);
  }
}

function validateId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new ApiError(400, "Task ID must be a positive integer.", "INVALID_ID");
  }
}

function cloudinarySettings() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new ApiError(
      503,
      "Cloudinary is not configured. Set its cloud name, API key, and API secret.",
      "CLOUDINARY_NOT_CONFIGURED",
    );
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  return { cloudName: CLOUDINARY_CLOUD_NAME, apiKey: CLOUDINARY_API_KEY };
}

function checkImageOwner(publicId, userId) {
  if (!publicId.startsWith(`task-manager/${userId}/`)) {
    throw new ApiError(
      400,
      "Image attachment does not belong to the authenticated user.",
      "INVALID_IMAGE_OWNER",
    );
  }
}

async function removeCloudinaryImage(publicId) {
  cloudinarySettings();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new ApiError(
      502,
      "Cloudinary could not remove the task image.",
      "CLOUDINARY_DELETE_FAILED",
    );
  }
}

router.post("/register", async (req, res, next) => {
  const credentials = validateCredentials(req.body, true);
  if (credentials.error) {
    next(new ApiError(400, credentials.error, "VALIDATION_ERROR"));
    return;
  }

  const { name, email, password } = credentials.value;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, passwordHash],
    );
    const user = result.rows[0];
    let notification;
    try {
      notification = await sendWelcomeEmail(user);
    } catch (error) {
      console.error("Welcome email delivery failed:", error.message);
      notification = { sent: false, reason: "delivery_failed" };
    }
    if (notification.reason === "not_configured") {
      console.warn("Welcome email was not sent because SMTP is not configured.");
    }
    sendToken(user, res, 201, notification);
  } catch (error) {
    if (error.code === "23505") {
      next(new ApiError(409, "An account with this email already exists.", "EMAIL_IN_USE"));
      return;
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  const credentials = validateCredentials(req.body, false);
  if (credentials.error) {
    next(new ApiError(400, credentials.error, "VALIDATION_ERROR"));
    return;
  }

  try {
    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [credentials.value.email],
    );
    const user = result.rows[0];
    const validPassword =
      user && (await bcrypt.compare(credentials.value.password, user.password_hash));
    if (!validPassword) {
      next(new ApiError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS"));
      return;
    }
    sendToken(user, res);
  } catch (error) {
    next(error);
  }
});

router.get("/tasks", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `${taskSelect} WHERE owner_id = $1 ORDER BY due_date ASC NULLS LAST, created_at DESC`,
      [req.user.id],
    );
    res.json({ tasks: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/tasks", authenticate, async (req, res, next) => {
  const validated = validateTask(req.body);
  if (validated.error) {
    next(new ApiError(400, validated.error, "VALIDATION_ERROR"));
    return;
  }
  const task = validated.value;
  try {
    if (task.imagePublicId) checkImageOwner(task.imagePublicId, req.user.id);
    const result = await pool.query(
      `INSERT INTO tasks
        (title, description, status, due_date, image_url, image_public_id, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        task.title,
        task.description,
        task.status,
        task.dueDate,
        task.imageUrl || null,
        task.imagePublicId || null,
        req.user.id,
      ],
    );
    const created = await pool.query(
      `${taskSelect} WHERE id = $1 AND owner_id = $2`,
      [result.rows[0].id, req.user.id],
    );
    res.status(201).json({ task: created.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:id", authenticate, async (req, res, next) => {
  try {
    validateId(req.params.id);
    const result = await pool.query(
      `${taskSelect} WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.id],
    );
    if (!result.rowCount) {
      next(new ApiError(404, "Task was not found.", "TASK_NOT_FOUND"));
      return;
    }
    res.json({ task: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/tasks/:id", authenticate, async (req, res, next) => {
  const validated = validateTask(req.body, true);
  if (validated.error || Object.keys(validated.value || {}).length === 0) {
    next(
      new ApiError(
        400,
        validated.error || "Provide at least one task field to update.",
        "VALIDATION_ERROR",
      ),
    );
    return;
  }

  try {
    validateId(req.params.id);
    const { value } = validated;
    if (value.imagePublicId) checkImageOwner(value.imagePublicId, req.user.id);
    const oldResult = await pool.query(
      "SELECT image_public_id FROM tasks WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.user.id],
    );
    if (!oldResult.rowCount) {
      next(new ApiError(404, "Task was not found.", "TASK_NOT_FOUND"));
      return;
    }

    const columnMap = {
      title: "title",
      description: "description",
      status: "status",
      dueDate: "due_date",
      imageUrl: "image_url",
      imagePublicId: "image_public_id",
    };
    const fields = Object.entries(value);
    const assignments = fields.map(
      ([key], index) => `${columnMap[key]} = $${index + 1}`,
    );
    const values = fields.map(([, fieldValue]) => fieldValue);
    const idPosition = values.length + 1;
    const ownerPosition = values.length + 2;
    await pool.query(
      `UPDATE tasks SET ${assignments.join(", ")}, updated_at = NOW()
       WHERE id = $${idPosition} AND owner_id = $${ownerPosition}`,
      [...values, req.params.id, req.user.id],
    );
    const updated = await pool.query(
      `${taskSelect} WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.id],
    );

    const oldImage = oldResult.rows[0].image_public_id;
    if (oldImage && oldImage !== value.imagePublicId &&
        (Object.hasOwn(value, "imagePublicId") || Object.hasOwn(value, "imageUrl"))) {
      try {
        await removeCloudinaryImage(oldImage);
      } catch (error) {
        console.error("Replaced task image could not be removed:", error.message);
        res.json({
          task: updated.rows[0],
          warning: "The task was updated, but its previous image could not be removed.",
        });
        return;
      }
    }
    res.json({ task: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/tasks/:id", authenticate, async (req, res, next) => {
  try {
    validateId(req.params.id);
    const taskResult = await pool.query(
      "SELECT image_public_id FROM tasks WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.user.id],
    );
    if (!taskResult.rowCount) {
      next(new ApiError(404, "Task was not found.", "TASK_NOT_FOUND"));
      return;
    }

    const publicId = taskResult.rows[0].image_public_id;
    if (publicId) {
      checkImageOwner(publicId, req.user.id);
      await removeCloudinaryImage(publicId);
    }
    await pool.query("DELETE FROM tasks WHERE id = $1 AND owner_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/uploads/signature", authenticate, (req, res, next) => {
  if (!isRecord(req.body) || req.body.resourceType !== "image") {
    next(new ApiError(400, "Only image attachments can be uploaded.", "VALIDATION_ERROR"));
    return;
  }

  try {
    const { cloudName, apiKey } = cloudinarySettings();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `task-manager/${req.user.id}`;
    const publicId = crypto.randomUUID();
    const params = {
      allowed_formats: "jpg,jpeg,png,webp",
      folder,
      public_id: publicId,
      timestamp,
    };
    res.json({
      cloudName,
      apiKey,
      timestamp,
      folder,
      publicId,
      signature: cloudinary.utils.api_sign_request(
        params,
        process.env.CLOUDINARY_API_SECRET,
      ),
      allowedFormats: params.allowed_formats,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/cron/reminders", async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    next(new ApiError(503, "CRON_SECRET is not configured.", "SERVER_CONFIGURATION"));
    return;
  }
  const supplied = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    next(new ApiError(401, "Cron authorization is required.", "UNAUTHORIZED"));
    return;
  }

  try {
    const dueTasks = await pool.query(
      `SELECT t.id, t.title, t.due_date, u.email
       FROM tasks t
       JOIN users u ON u.id = t.owner_id
       WHERE t.due_date > NOW()
         AND t.due_date <= NOW() + INTERVAL '24 hours'
         AND t.status <> 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM task_reminders r
           WHERE r.task_id = t.id AND r.due_date = t.due_date
         )
       ORDER BY t.due_date ASC`,
    );
    let sent = 0;
    const failures = [];
    for (const task of dueTasks.rows) {
      try {
        const result = await sendDueReminderEmail(task);
        if (!result.sent) {
          failures.push({ taskId: String(task.id), reason: result.reason });
          continue;
        }
        await pool.query(
          `INSERT INTO task_reminders (task_id, due_date)
           VALUES ($1, $2)
           ON CONFLICT (task_id, due_date) DO NOTHING`,
          [task.id, task.due_date],
        );
        sent += 1;
      } catch (error) {
        console.error(`Due reminder failed for task ${task.id}:`, error.message);
        failures.push({ taskId: String(task.id), reason: "delivery_failed" });
      }
    }
    res.status(failures.length ? 502 : 200).json({
      sent,
      failed: failures.length,
      failures,
    });
  } catch (error) {
    next(error);
  }
});

app.get(["/health", "/api/health"], (_req, res) => {
  res.json({ status: "ok", service: "task-manager-api" });
});
app.use("/api", router);
app.use("/", router);
app.use((req, _res, next) => {
  next(new ApiError(404, `Route ${req.method} ${req.path} was not found.`, "NOT_FOUND"));
});
app.use((error, _req, res, _next) => {
  const status =
    error instanceof ApiError
      ? error.status
      : error.type === "entity.too.large"
        ? 413
        : error instanceof SyntaxError && error.status === 400 && "body" in error
          ? 400
          : 500;
  if (status >= 500) {
    console.error("API request failed:", error.message);
  }
  res.status(status).json({
    error: {
      code:
        error.code ||
        (status === 413
          ? "PAYLOAD_TOO_LARGE"
          : status === 400
            ? "INVALID_JSON"
            : "INTERNAL_ERROR"),
      message:
        status === 500
          ? "An unexpected server error occurred."
          : status === 413
            ? "Request body must be 1 MB or smaller."
            : status === 400 && error instanceof SyntaxError
              ? "Request body must contain valid JSON."
              : error.message,
    },
  });
});

module.exports = app;
