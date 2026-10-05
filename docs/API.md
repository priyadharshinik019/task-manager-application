# Task Manager API

This document describes the implemented HTTP API in the Task Manager backend. The server uses Node.js's built-in HTTP server. Replace `<API_BASE_URL>` with the URL where the backend is running (for example, `http://localhost:3000`).

All request and response bodies are JSON except task create/update requests that use `multipart/form-data` for an uploaded image. Error responses use this shape:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "A description of the error.",
    "details": ["Optional validation detail."]
  }
}
```

The `details` property is included when task or authentication input validation provides details.

## Authentication

Registration and login do not require a token. Every task endpoint requires a valid JWT in this header:

```http
Authorization: Bearer <JWT_TOKEN>
```

The API gets the task `owner_id` from the verified JWT's user ID. `owner_id` is not an accepted task request field and cannot be set or changed by a client. Task reads, updates, and deletes are restricted to the authenticated owner.

## Endpoints

### 1. Register

- **Method:** `POST`
- **Path:** `/register`
- **Purpose:** Create an account.
- **Authentication:** Not required.
- **Headers:** `Content-Type: application/json`
- **Request body:** JSON object with:
  - `name` (string, required; must not be blank)
  - `email` (string, required; must match the backend's basic email format check)
  - `password` (string, required; must not be empty)

  The backend trims `name` and `email`; it does not trim the password. Unknown fields are not used.

- **Success:** `201 Created`

  ```json
  {
    "user": {
      "id": "<USER_ID>",
      "name": "Alex Example",
      "email": "alex@example.test"
    }
  }
  ```

- **Important errors:**
  - `400 Bad Request` — malformed JSON or invalid registration fields. Validation errors are returned in `error.details`.
  - `400 Bad Request` — email is already registered (`DUPLICATE_EMAIL`).
  - `500 Internal Server Error` — an unexpected server failure.

- **Example request:**

  ```http
  POST <API_BASE_URL>/register
  Content-Type: application/json
  ```

  ```json
  {
    "name": "Alex Example",
    "email": "alex@example.test",
    "password": "<YOUR_PASSWORD>"
  }
  ```

- **Example response (`201`):**

  ```json
  {
    "user": {
      "id": "<USER_ID>",
      "name": "Alex Example",
      "email": "alex@example.test"
    }
  }
  ```

### 2. Login

- **Method:** `POST`
- **Path:** `/login`
- **Purpose:** Verify account credentials and issue a JWT.
- **Authentication:** Not required.
- **Headers:** `Content-Type: application/json`
- **Request body:** JSON object with:
  - `email` (string, required; must match the backend's basic email format check)
  - `password` (string, required; must not be empty)

  The backend trims `email`; it does not trim the password.

- **Success:** `200 OK`

  ```json
  {
    "accessToken": "<JWT_TOKEN>"
  }
  ```

- **Important errors:**
  - `400 Bad Request` — malformed JSON or invalid login fields. Validation errors are returned in `error.details`.
  - `401 Unauthorized` — email/password combination is invalid (`UNAUTHORIZED`).
  - `500 Internal Server Error` — an unexpected server failure.

- **Example request:**

  ```http
  POST <API_BASE_URL>/login
  Content-Type: application/json
  ```

  ```json
  {
    "email": "alex@example.test",
    "password": "<YOUR_PASSWORD>"
  }
  ```

- **Example response (`200`):**

  ```json
  {
    "accessToken": "<JWT_TOKEN>"
  }
  ```

### Task request fields and image upload

The create and update endpoints accept these task fields:

| Field | Type | Required / behavior |
| --- | --- | --- |
| `title` | string | Required; must contain at least one non-whitespace character. |
| `description` | string or `null` | Optional; defaults to `null` when omitted. |
| `status` | string | Optional; defaults to `pending`. Allowed values are `pending`, `in_progress`, and `completed`. |
| `due_date` | string or `null` | Optional; defaults to `null` when omitted. The validator checks its type, not a date format. Returned dates use `YYYY-MM-DD`. |
| `image_url` | string or `null` | Optional; defaults to `null` when omitted. A supplied value must be a valid HTTPS URL and is uploaded to Cloudinary; the response contains Cloudinary's secure URL. |
| `image` | file | Optional multipart file field, not a JSON field. Supply at most one file; its MIME type must begin with `image/`. The backend uploads it to Cloudinary. |
| `owner_id` | — | Not accepted in the request. The server derives ownership from the authenticated JWT. |

Task request objects reject fields other than `title`, `description`, `status`, `due_date`, and `image_url`. Do not send both an `image` file and `image_url` in the same request. Uploaded and URL-provided images are stored by Cloudinary; task responses expose the resulting `image_url`, not Cloudinary's internal public ID.

JSON requests use `Content-Type: application/json`. To upload an image, use `multipart/form-data` with the file field named exactly `image`; include other task values as text fields. Let the HTTP client set the multipart boundary in the `Content-Type` header.

### 3. List tasks

- **Method:** `GET`
- **Path:** `/tasks/`
- **Purpose:** List tasks owned by the authenticated user.
- **Authentication:** Required — `Authorization: Bearer <JWT_TOKEN>`.
- **Request headers:** `Authorization: Bearer <JWT_TOKEN>`. No request body.
- **Successful response:** `200 OK`

  ```json
  {
    "tasks": [
      {
        "id": "<TASK_ID>",
        "title": "Prepare project notes",
        "description": "Collect the latest notes",
        "status": "in_progress",
        "due_date": "2026-10-06",
        "image_url": null,
        "owner_id": "<AUTHENTICATED_USER_ID>"
      }
    ]
  }
  ```

  An empty list is returned as `"tasks": []`.

- **Important errors:**
  - `401 Unauthorized` — bearer token is missing, invalid, expired, or lacks a user ID.
  - `500 Internal Server Error` — task request or database failure.

- **Example request:**

  ```http
  GET <API_BASE_URL>/tasks/
  Authorization: Bearer <JWT_TOKEN>
  ```

- **Example response (`200`):**

  ```json
  {
    "tasks": [
      {
        "id": "<TASK_ID>",
        "title": "Prepare project notes",
        "description": "Collect the latest notes",
        "status": "in_progress",
        "due_date": "2026-10-06",
        "image_url": null,
        "owner_id": "<AUTHENTICATED_USER_ID>"
      }
    ]
  }
  ```

### 4. Create a task

- **Method:** `POST`
- **Path:** `/tasks/`
- **Purpose:** Create a task for the authenticated user.
- **Authentication:** Required — `Authorization: Bearer <JWT_TOKEN>`.
- **Request headers:** `Authorization: Bearer <JWT_TOKEN>` and either `Content-Type: application/json` or `Content-Type: multipart/form-data` for an image file.
- **Request body:** The task fields described in [Task request fields and image upload](#task-request-fields-and-image-upload). `title` is required. `owner_id` must not be supplied.

- **Successful response:** `201 Created`

  ```json
  {
    "task": {
      "id": "<TASK_ID>",
      "title": "Prepare project notes",
      "description": "Collect the latest notes",
      "status": "pending",
      "due_date": "2026-10-06",
      "image_url": null,
      "owner_id": "<AUTHENTICATED_USER_ID>"
    }
  }
  ```

- **Important errors:**
  - `400 Bad Request` — malformed JSON/multipart body, repeated multipart fields, unsupported or repeated file field, non-image file, invalid task fields, or invalid image URL. Validation details are returned in `error.details` when available.
  - `401 Unauthorized` — missing or invalid bearer token.
  - `500 Internal Server Error` — unexpected database, Cloudinary, or server failure.

- **Example JSON request:**

  ```http
  POST <API_BASE_URL>/tasks/
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
  ```

  ```json
  {
    "title": "Prepare project notes",
    "description": "Collect the latest notes",
    "status": "pending",
    "due_date": "2026-10-06"
  }
  ```

- **Example multipart request:**

  ```sh
  curl -X POST "<API_BASE_URL>/tasks/" \
    -H "Authorization: Bearer <JWT_TOKEN>" \
    -F "title=Prepare project notes" \
    -F "description=Collect the latest notes" \
    -F "status=pending" \
    -F "due_date=2026-10-06" \
    -F "image=@<PATH_TO_IMAGE>"
  ```

- **Example response (`201`):**

  ```json
  {
    "task": {
      "id": "<TASK_ID>",
      "title": "Prepare project notes",
      "description": "Collect the latest notes",
      "status": "pending",
      "due_date": "2026-10-06",
      "image_url": "<CLOUDINARY_SECURE_IMAGE_URL>",
      "owner_id": "<AUTHENTICATED_USER_ID>"
    }
  }
  ```

### 5. Get a task

- **Method:** `GET`
- **Path:** `/tasks/{id}/`
- **Purpose:** Get one task belonging to the authenticated user.
- **Authentication:** Required — `Authorization: Bearer <JWT_TOKEN>`.
- **Request headers:** `Authorization: Bearer <JWT_TOKEN>`. No request body.
- **Path parameter:** `id` must be a positive decimal task ID.
- **Successful response:** `200 OK`

  ```json
  {
    "task": {
      "id": "<TASK_ID>",
      "title": "Prepare project notes",
      "description": "Collect the latest notes",
      "status": "pending",
      "due_date": "2026-10-06",
      "image_url": null,
      "owner_id": "<AUTHENTICATED_USER_ID>"
    }
  }
  ```

- **Important errors:**
  - `400 Bad Request` — invalid task ID.
  - `401 Unauthorized` — missing or invalid bearer token.
  - `404 Not Found` — task does not exist or is not owned by the authenticated user.
  - `500 Internal Server Error` — unexpected server failure.

- **Example request:**

  ```http
  GET <API_BASE_URL>/tasks/<TASK_ID>/
  Authorization: Bearer <JWT_TOKEN>
  ```

- **Example response (`200`):**

  ```json
  {
    "task": {
      "id": "<TASK_ID>",
      "title": "Prepare project notes",
      "description": "Collect the latest notes",
      "status": "pending",
      "due_date": "2026-10-06",
      "image_url": null,
      "owner_id": "<AUTHENTICATED_USER_ID>"
    }
  }
  ```

### 6. Update a task

- **Method:** `PUT`
- **Path:** `/tasks/{id}/`
- **Purpose:** Replace the task's editable values for a task belonging to the authenticated user.
- **Authentication:** Required — `Authorization: Bearer <JWT_TOKEN>`.
- **Request headers:** `Authorization: Bearer <JWT_TOKEN>` and either `Content-Type: application/json` or `Content-Type: multipart/form-data` for an image file.
- **Path parameter:** `id` must be a positive decimal task ID.
- **Request body:** The task fields described in [Task request fields and image upload](#task-request-fields-and-image-upload). `title` is required. Values omitted from an otherwise valid update become `null` for `description`, `due_date`, and `image_url`, and `pending` for `status`. `owner_id` must not be supplied.

- **Successful response:** `200 OK`

  ```json
  {
    "task": {
      "id": "<TASK_ID>",
      "title": "Prepare project notes",
      "description": "Add the latest notes",
      "status": "in_progress",
      "due_date": "2026-10-06",
      "image_url": null,
      "owner_id": "<AUTHENTICATED_USER_ID>"
    }
  }
  ```

- **Important errors:**
  - `400 Bad Request` — invalid task ID, malformed JSON/multipart body, or invalid task/image fields. Validation details are returned in `error.details` when available.
  - `401 Unauthorized` — missing or invalid bearer token.
  - `404 Not Found` — task does not exist or is not owned by the authenticated user.
  - `500 Internal Server Error` — unexpected database, Cloudinary, or server failure.

- **Example request:**

  ```http
  PUT <API_BASE_URL>/tasks/<TASK_ID>/
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
  ```

  ```json
  {
    "title": "Prepare project notes",
    "description": "Add the latest notes",
    "status": "in_progress",
    "due_date": "2026-10-06"
  }
  ```

- **Example response (`200`):**

  ```json
  {
    "task": {
      "id": "<TASK_ID>",
      "title": "Prepare project notes",
      "description": "Add the latest notes",
      "status": "in_progress",
      "due_date": "2026-10-06",
      "image_url": null,
      "owner_id": "<AUTHENTICATED_USER_ID>"
    }
  }
  ```

### 7. Delete a task

- **Method:** `DELETE`
- **Path:** `/tasks/{id}/`
- **Purpose:** Delete a task belonging to the authenticated user.
- **Authentication:** Required — `Authorization: Bearer <JWT_TOKEN>`.
- **Request headers:** `Authorization: Bearer <JWT_TOKEN>`. No request body.
- **Path parameter:** `id` must be a positive decimal task ID.
- **Successful response:** `200 OK`

  ```json
  {
    "message": "Task deleted successfully."
  }
  ```

- **Important errors:**
  - `400 Bad Request` — invalid task ID.
  - `401 Unauthorized` — missing or invalid bearer token.
  - `404 Not Found` — task does not exist or is not owned by the authenticated user.
  - `500 Internal Server Error` — unexpected database, Cloudinary, or server failure.

- **Example request:**

  ```http
  DELETE <API_BASE_URL>/tasks/<TASK_ID>/
  Authorization: Bearer <JWT_TOKEN>
  ```

- **Example response (`200`):**

  ```json
  {
    "message": "Task deleted successfully."
  }
  ```
