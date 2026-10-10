# Task Manager Application Architecture

```mermaid
flowchart TD
    User[User]
    Frontend[React + Vite Frontend]
    API[Node.js Backend REST API<br/>Built-in HTTP server]
    JWT[JWT Authentication<br/>Bearer token verification]
    Tasks[Task CRUD + Validation<br/>Owner-scoped operations]
    Database[(PostgreSQL Database)]
    Cloudinary[Cloudinary<br/>Task image storage]
    Scheduler[Daily Pending-Task Reminder Scheduler]
    Email[EmailJS Server-Side REST API]

    User --> Frontend
    Frontend -->|HTTP API requests| API
    Frontend -->|Authorization: Bearer JWT| JWT
    API --> JWT
    JWT -->|Authenticated user ID| Tasks
    API --> Tasks
    Tasks -->|Parameterized queries| Database
    Tasks -->|Upload, replace, or delete task images| Cloudinary

    API -->|After registration or task creation| Email
    Scheduler -->|Find pending tasks without today's reminder| Database
    Scheduler -->|Daily pending-task reminder| Email
    API -. starts after server begins listening .-> Scheduler
```

## Component overview

- **React + Vite frontend:** Provides the user interface and sends HTTP requests to the backend API.
- **Node.js backend REST API:** Runs on Node.js's built-in HTTP server and dispatches registration, login, and task requests.
- **JWT authentication:** Task endpoints require a Bearer token. The backend verifies it and uses the token's user ID to scope task operations; task payloads cannot set `owner_id`.
- **Task CRUD and validation:** Backend services validate task input and provide create, list, read, update, and delete operations for the authenticated owner.
- **PostgreSQL:** Stores user and task records. The backend accesses it through parameterized queries.
- **Cloudinary:** Receives task image uploads, including uploaded image files and supported HTTPS image URLs. The task stores the resulting secure image URL.
- **Reminder scheduler:** Starts after the backend begins listening and checks once per day for `pending` tasks. Reminder delivery is recorded in PostgreSQL by task and date, preventing duplicate reminders across server restarts. `completed` and `failed` tasks are not selected.
- **EmailJS:** The backend sends welcome, task-created, due-date, and daily pending-task emails through EmailJS's server-side REST API using environment-configured service, template, and public-key values. The configured EmailJS template must render the corresponding dynamic variables and conditionally display the task image when `image_url` is non-empty.
