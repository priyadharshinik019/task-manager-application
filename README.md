# Task Manager Web Application

A full-stack task management application for creating and organizing personal tasks. The frontend is built with React and Vite; the backend uses Node.js's built-in HTTP server and stores application data in PostgreSQL.

## Implemented features

- Register an account and sign in to receive a JWT access token.
- Create, view, update, and delete tasks.
- Keep tasks associated with their authenticated owner; task reads and writes are scoped to that owner.
- Set a task title, description, status, and due date.
- Upload a task image or provide an HTTPS image URL. Images are stored in Cloudinary.
- Search tasks by title and filter by status.
- Toggle between light and dark themes; the selected theme is saved in browser local storage.
- Send welcome and due-date reminder emails using configured SMTP.

## Technology stack

- **Frontend:** React 19, Vite
- **Backend:** Node.js built-in `http` server (not Express)
- **Database:** PostgreSQL, accessed through `pg`
- **Authentication:** JSON Web Tokens (JWT)
- **Image storage:** Cloudinary
- **Email:** Nodemailer over SMTP; Gmail SMTP can be configured
- **Frontend deployment:** Vercel

## Authentication and authorization

Registration is available at `POST /register`; sign-in is available at `POST /login`. A successful login returns an access token. Include it on protected task requests using the standard header:

```http
Authorization: Bearer <your-jwt>
```

The backend verifies the token before processing task endpoints. It uses the authenticated user ID when listing, reading, updating, or deleting tasks, so a user cannot access another user's task through these endpoints. Passwords are stored as salted PBKDF2 hashes, not as plain text.

## Tasks

Task status values are:

| Value | Meaning |
| --- | --- |
| `pending` | Not yet completed |
| `in_progress` | Work is underway |
| `completed` | Finished |

Task records can include a title, description, due date, and image. The task form supports creating and editing records, and task cards provide view, edit, and delete actions.

### Search and status filter

The task list can be searched by title and filtered by `pending`, `in_progress`, or `completed`. Search and filtering are performed in the frontend on the tasks returned for the signed-in user.

### Dark mode

The interface has light and dark themes. The selected theme is stored in browser local storage and restored on subsequent visits.

### Due-date email reminders

The backend scheduler checks periodically for tasks in a narrow window approximately 24 hours before their due date and sends a reminder email for tasks whose status is not `completed`. Duplicate reminders for a task and due date are suppressed in the running server process, but this tracking is in memory and resets when the server restarts.

Welcome and reminder emails use SMTP configuration. For Gmail, configure the Gmail SMTP host and use an app password where required by the account.

### Cloudinary images

Task images can be uploaded as image files or supplied as HTTPS image URLs. The backend sends images to Cloudinary and stores the returned secure image URL with the task. Replacing or deleting a task also removes the previously stored Cloudinary image when applicable.

## Project structure

```text
.
├── backend/
│   ├── config/          # PostgreSQL and Cloudinary configuration
│   ├── middleware/      # JWT authentication
│   ├── migrations/      # SQL schema migrations
│   ├── models/          # PostgreSQL queries
│   ├── routes/          # HTTP route handlers
│   ├── services/        # Authentication, tasks, email, images, reminders
│   ├── test/            # Automated backend tests
│   ├── validators/      # Request validation
│   └── localServer.js    # Local Node.js HTTP server entry point
└── frontend/
    ├── src/
    │   ├── components/  # Authentication and task UI components
    │   ├── services/    # API client
    │   └── App.jsx      # Main application
    ├── public/
    └── vite.config.js
```

## Local setup

### Prerequisites

- Node.js and npm
- PostgreSQL
- Cloudinary credentials for image operations
- SMTP credentials for email notifications

### Configure environment variables

Create `backend/.env` locally. Do not commit this file or share its secret values.

```dotenv
PGHOST=<your-postgres-host>
PGPORT=<your-postgres-port>
PGDATABASE=<your-database-name>
PGUSER=<your-database-user>
PGPASSWORD=<your-database-password>

JWT_SECRET=<your-jwt-secret>
JWT_EXPIRES_IN=<your-token-expiration>

CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>

SMTP_HOST=<your-smtp-host>
SMTP_PORT=<your-smtp-port>
SMTP_USER=<your-smtp-user>
SMTP_PASSWORD=<your-smtp-password>
EMAIL_FROM=<your-from-address>

FRONTEND_ORIGIN=<your-frontend-origin>
PORT=3000
```

For Gmail SMTP, use `smtp.gmail.com` as `SMTP_HOST`, a supported Gmail SMTP port, and the account's SMTP-compatible app password as `SMTP_PASSWORD`. Keep all credentials in environment variables.

Create `frontend/.env` with the API base URL. For local development:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

Vite proxies the frontend's `/api` requests to this backend URL during development. In a deployed frontend, set `VITE_API_BASE_URL` to the publicly reachable backend base URL. The backend's `FRONTEND_ORIGIN` should match the deployed frontend origin.

### Prepare the database

Create the PostgreSQL database named in `PGDATABASE`, then apply the SQL files in `backend/migrations/` in numeric order using a PostgreSQL client. The repository provides the migration SQL files; it does not include an automatic migration runner.

### Run the backend

From the repository root:

```powershell
cd backend
npm install
npm start
```

The server uses port `3000` by default; set `PORT` to override it. It loads configuration from `backend/.env`.

### Run the frontend

Open a second terminal from the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in the terminal.

## API endpoint summary

| Method | Endpoint | Authentication | Description |
| --- | --- | --- | --- |
| `POST` | `/register` | No | Register an account |
| `POST` | `/login` | No | Sign in and receive a JWT |
| `GET` | `/tasks/` | Bearer JWT | List the signed-in user's tasks |
| `POST` | `/tasks/` | Bearer JWT | Create a task; accepts JSON or multipart form data for an image upload |
| `GET` | `/tasks/:id/` | Bearer JWT | Get one task belonging to the signed-in user |
| `PUT` | `/tasks/:id/` | Bearer JWT | Update one task belonging to the signed-in user |
| `DELETE` | `/tasks/:id/` | Bearer JWT | Delete one task belonging to the signed-in user |

Task request bodies support `title`, `description`, `status`, `due_date`, and `image_url`. For a file upload, send multipart form data with the file field named `image`; do not send both an uploaded file and `image_url` in the same request.

## Automated backend tests

Run the backend test suite with:

```powershell
cd backend
npm test
```

The tests cover registration and login, protected task endpoints, task CRUD operations, payload validation, and task-owner authorization.

## Vercel deployment

The frontend is a Vite application and can be deployed to Vercel by importing the GitHub repository and selecting `frontend` as the project root. Configure the frontend build command as `npm run build`, the output directory as `dist`, and set `VITE_API_BASE_URL` to the reachable backend URL in the Vercel project environment.

The repository-root `vercel.json` explicitly builds `backend/api/[...path].mjs` as a Node.js function and routes `/api` requests to it, avoiding automatic server entrypoint detection. `backend/localServer.js` remains the local development server used by `npm start`. Configure the backend environment variables in the deployment environment and set `FRONTEND_ORIGIN` to the deployed frontend origin.

## Security considerations

- Keep `.env` files and all deployment secrets out of source control. Use the hosting provider's environment-variable settings for deployments.
- Use a strong, private `JWT_SECRET` and configure token expiration.
- Use HTTPS for deployed frontend, backend, and externally supplied image URLs.
- Restrict `FRONTEND_ORIGIN` to the intended frontend origin.
- Protect task endpoints with the JWT Bearer token and do not expose tokens or credentials in logs or public client-side configuration. Only the frontend API base URL should use the `VITE_` prefix.
- Use Gmail app passwords or another SMTP provider's recommended credential mechanism; never put SMTP credentials in frontend variables.

## GitHub repository

Source repository: [priyadharshinik019/task-manager-application](https://github.com/priyadharshinik019/task-manager-application)
