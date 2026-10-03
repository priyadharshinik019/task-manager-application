import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const SESSION_KEY = 'daymark-session'
const TASK_STATUSES = ['pending', 'in_progress', 'completed']
const STATUS_LABELS = {
  all: 'All tasks',
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
}

async function readJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}).`)
  }
}

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (response.status === 204) return null
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Something went wrong. Please try again.')
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(`The server returned an empty response (HTTP ${response.status}).`)
  }
  return payload
}

function loadSession() {
  const saved = localStorage.getItem(SESSION_KEY)
  if (!saved) return null
  try {
    const session = JSON.parse(saved)
    if (session?.accessToken && session?.user?.id && session?.user?.name) return session
    throw new Error('Stored session is incomplete.')
  } catch (error) {
    console.error('Unable to restore the saved session:', error.message)
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

function dateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function formatDueDate(value) {
  if (!value) return 'No due date'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function cloudinaryImage(url, transformation) {
  return url.replace('/image/upload/', `/image/upload/${transformation}/`)
}

function localDateKey(value) {
  if (!value) return ''
  const date = new Date(value)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function dateIsToday(value, timestamp) {
  if (!value) return false
  const due = new Date(value)
  const today = new Date(timestamp)
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  )
}

function Icon({ name, size = 18 }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    moon: <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    edit: <><path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></>,
    arrow: <><path d="M5 12h14m-7-7 7 7-7 7" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    clip: <><path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L10.1 17a2 2 0 0 1-2.8-2.8l8.5-8.5" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function AuthView({ onAuthenticated, notify }) {
  const [mode, setMode] = useState('login')
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const isRegister = mode === 'register'

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = await request(`/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(values),
      })
      onAuthenticated(payload)
      if (payload.notification && !payload.notification.sent) {
        notify('Your account is ready, but the welcome email could not be sent.', 'error')
      } else {
        notify(isRegister ? 'Your workspace is ready.' : `Welcome back, ${payload.user.name}.`)
      }
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a className="brand brand-light" href="/" aria-label="Daymark home">
          <span className="brand-mark">d.</span>
          <span>daymark</span>
        </a>
        <div className="story-copy">
          <p className="eyebrow">A quieter way to get things done</p>
          <h1>Make room for the work that matters.</h1>
          <p className="story-description">
            Keep your next steps close, your priorities clear, and your day moving at its own pace.
          </p>
        </div>
        <div className="story-note" aria-hidden="true">
          <span className="note-dot" />
          <span>One thoughtful step at a time.</span>
          <span className="note-lines">──────</span>
        </div>
        <div className="story-orbit orbit-one" aria-hidden="true" />
        <div className="story-orbit orbit-two" aria-hidden="true" />
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <p className="eyebrow">{isRegister ? 'Start with a clean slate' : 'Your day, in view'}</p>
          <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-subtitle">
            {isRegister
              ? 'A little space to plan what comes next.'
              : 'Sign in to pick up right where you left off.'}
          </p>

          <form className="auth-form" onSubmit={submit}>
            {isRegister && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  maxLength="100"
                  name="name"
                  onChange={(event) => setValues({ ...values, name: event.target.value })}
                  placeholder="Alex Morgan"
                  required
                  value={values.name}
                />
              </label>
            )}
            <label>
              Email address
              <input
                autoComplete="email"
                name="email"
                onChange={(event) => setValues({ ...values, email: event.target.value })}
                placeholder="you@example.com"
                required
                type="email"
                value={values.email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength="8"
                name="password"
                onChange={(event) => setValues({ ...values, password: event.target.value })}
                placeholder="At least 8 characters"
                required
                type="password"
                value={values.password}
              />
            </label>
            <button className="button button-primary auth-submit" disabled={busy} type="submit">
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
              {!busy && <Icon name="arrow" />}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to Daymark?'}{' '}
            <button
              className="text-button"
              onClick={() => setMode(isRegister ? 'login' : 'register')}
              type="button"
            >
              {isRegister ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
        <p className="auth-footer">A little more intention. A little less noise.</p>
      </section>
    </main>
  )
}

function TaskModal({ task, token, onClose, onSave }) {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [status, setStatus] = useState(task?.status || 'pending')
  const [dueDate, setDueDate] = useState(dateTimeInput(task?.dueDate))
  const [image] = useState(
    task?.imageUrl
      ? { imageUrl: task.imageUrl, imagePublicId: task.imagePublicId }
      : null,
  )
  const [removeImage, setRemoveImage] = useState(false)
  const [file, setFile] = useState(null)
  const [chooseReplacement, setChooseReplacement] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  async function uploadImage(selectedFile, token) {
    const signed = await request('/uploads/signature', {
      token,
      method: 'POST',
      body: JSON.stringify({ resourceType: 'image' }),
    })
    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('api_key', signed.apiKey)
    formData.append('timestamp', String(signed.timestamp))
    formData.append('folder', signed.folder)
    formData.append('public_id', signed.publicId)
    formData.append('allowed_formats', signed.allowedFormats)
    formData.append('signature', signed.signature)
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
      { method: 'POST', body: formData },
    )
    const payload = await readJson(response)
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'The image could not be uploaded.')
    }
    if (!payload?.secure_url || !payload.public_id) {
      throw new Error('The image service returned incomplete upload details.')
    }
    return { imageUrl: payload.secure_url, imagePublicId: payload.public_id }
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        ...(file
          ? await uploadImage(file, token)
          : removeImage
            ? { imageUrl: null, imagePublicId: null }
            : image || { imageUrl: null, imagePublicId: null }),
      })
      onClose()
    } catch (error) {
      setFormError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        aria-labelledby="task-modal-title"
        aria-modal="true"
        className="modal task-modal"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{task ? 'Keep it up to date' : 'Make a little progress'}</p>
            <h2 id="task-modal-title">{task ? 'Edit task' : 'Add a task'}</h2>
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>
        <form className="task-form" onSubmit={submit}>
          <label>
            Task title <span className="required-mark">*</span>
            <input
              autoFocus
              maxLength="255"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs your attention?"
              required
              value={title}
            />
          </label>
          <label>
            Notes <span className="optional-label">Optional</span>
            <textarea
              maxLength="5000"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a few details to help you get started…"
              rows="4"
              value={description}
            />
          </label>
          <div className="form-row">
            <label>
              Status
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                {TASK_STATUSES.map((value) => (
                  <option key={value} value={value}>{STATUS_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <label>
              Due date <span className="optional-label">Optional</span>
              <input
                onChange={(event) => setDueDate(event.target.value)}
                type="datetime-local"
                value={dueDate}
              />
            </label>
          </div>
          <div className="attachment-field">
            <span>Image attachment <span className="optional-label">Optional</span></span>
            {image?.imageUrl && !removeImage && !file && (
              <div className="attachment-preview">
                <img
                  alt="Current task attachment"
                  src={cloudinaryImage(image.imageUrl, 'f_auto,q_auto,w_160,h_160,c_fill')}
                />
                <button
                  className="text-button remove-attachment"
                  onClick={() => setRemoveImage(true)}
                  type="button"
                >
                  Remove image
                </button>
              </div>
            )}
            {(removeImage || !image || chooseReplacement) && (
              <label className="upload-control">
                <Icon name="clip" />
                <span>{file ? file.name : 'Choose an image'}</span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null)
                    setRemoveImage(false)
                    setChooseReplacement(false)
                  }}
                  type="file"
                />
              </label>
            )}
            {image?.imageUrl && !removeImage && !chooseReplacement && (
              <button
                className="text-button replace-attachment"
                onClick={() => setChooseReplacement(true)}
                type="button"
              >
                Replace image
              </button>
            )}
            {image?.imageUrl && removeImage && !file && (
              <button
                className="text-button replace-attachment"
                onClick={() => setRemoveImage(false)}
                type="button"
              >
                Keep current image
              </button>
            )}
            {file && (
              <button
                className="text-button replace-attachment"
                onClick={() => { setFile(null); setChooseReplacement(false) }}
                type="button"
              >
                Remove selected image
              </button>
            )}
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions">
            <button className="button button-quiet" onClick={onClose} type="button">Cancel</button>
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? 'Saving…' : task ? 'Save changes' : 'Add task'}
              {!busy && <Icon name="arrow" />}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function DeleteModal({ task, onClose, onDelete, busy }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="delete-title" aria-modal="true" className="modal delete-modal" role="dialog">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">One last check</p>
            <h2 id="delete-title">Delete this task?</h2>
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>
        <p className="delete-copy">
          “{task.title}” will be removed permanently, along with its image attachment.
        </p>
        <div className="modal-actions">
          <button className="button button-quiet" onClick={onClose} type="button">Keep task</button>
          <button className="button button-danger" disabled={busy} onClick={onDelete} type="button">
            {busy ? 'Deleting…' : 'Delete task'}
          </button>
        </div>
      </section>
    </div>
  )
}

function TaskCard({ task, now, onEdit, onDelete, onAdvance }) {
  const isOverdue = task.dueDate && Date.parse(task.dueDate) < now && task.status !== 'completed'
  return (
    <article className={`task-card ${task.status === 'completed' ? 'is-complete' : ''}`}>
      {task.imageUrl && (
        <img
          className="task-image"
          alt=""
          loading="lazy"
          src={cloudinaryImage(task.imageUrl, 'f_auto,q_auto,w_320,h_240,c_fill')}
        />
      )}
      <div className="task-card-main">
        <div className="task-card-topline">
          <span className={`status-pill status-${task.status}`}>
            <span className="status-dot" />
            {STATUS_LABELS[task.status]}
          </span>
          <div className="task-actions">
            <button
              aria-label={`Edit ${task.title}`}
              className="icon-button"
              onClick={() => onEdit(task)}
              type="button"
            >
              <Icon name="edit" size={17} />
            </button>
            <button
              aria-label={`Delete ${task.title}`}
              className="icon-button icon-button-danger"
              onClick={() => onDelete(task)}
              type="button"
            >
              <Icon name="trash" size={17} />
            </button>
          </div>
        </div>
        <h3>{task.title}</h3>
        {task.description && <p className="task-description">{task.description}</p>}
        <div className="task-card-footer">
          <span className={`task-due ${isOverdue ? 'is-overdue' : ''}`}>
            <Icon name={task.dueDate ? 'calendar' : 'clock'} size={15} />
            {formatDueDate(task.dueDate)}
          </span>
          {task.status !== 'completed' && (
            <button className="advance-button" onClick={() => onAdvance(task)} type="button">
              {task.status === 'pending' ? 'Start task' : 'Mark complete'}
              <Icon name={task.status === 'pending' ? 'arrow' : 'check'} size={15} />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function Dashboard({ session, onLogout, notify }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeStatus, setActiveStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [dueFilter, setDueFilter] = useState('')
  const [taskModal, setTaskModal] = useState(undefined)
  const [deleteTask, setDeleteTask] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('daymark-theme') === 'dark')
  const [now, setNow] = useState(() => Date.now())
  const [dateLabel] = useState(() => new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date()))

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('daymark-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let active = true
    request('/tasks', { token: session.accessToken })
      .then((payload) => {
        if (active) setTasks(payload.tasks)
      })
      .catch((error) => {
        if (active) {
          notify(error.message, 'error')
          if (error.message.includes('session') || error.message.includes('token')) onLogout()
        }
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [session.accessToken, notify, onLogout])

  const filteredTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return tasks.filter((task) => {
      const matchesStatus = activeStatus === 'all' || task.status === activeStatus
      const matchesSearch =
        !normalizedSearch ||
        `${task.title} ${task.description || ''}`.toLowerCase().includes(normalizedSearch)
      const matchesDate =
        !dueFilter || localDateKey(task.dueDate) === dueFilter
      return matchesStatus && matchesSearch && matchesDate
    })
  }, [tasks, activeStatus, search, dueFilter])

  const summary = useMemo(() => ({
    open: tasks.filter((task) => task.status !== 'completed').length,
    today: tasks.filter((task) => dateIsToday(task.dueDate, now) && task.status !== 'completed').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  }), [tasks, now])

  async function saveTask(values) {
    const editing = taskModal?.id
    const payload = await request(editing ? `/tasks/${editing}` : '/tasks', {
      token: session.accessToken,
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    })
    setTasks((current) => (
      editing
        ? current.map((task) => task.id === payload.task.id ? payload.task : task)
        : [payload.task, ...current]
    ))
    if (payload.warning) notify(payload.warning, 'error')
    else notify(editing ? 'Your changes are saved.' : 'Task added to your list.')
  }

  async function advanceTask(task) {
    const nextStatus = TASK_STATUSES[TASK_STATUSES.indexOf(task.status) + 1]
    try {
      const payload = await request(`/tasks/${task.id}`, {
        token: session.accessToken,
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      })
      setTasks((current) => current.map((item) => item.id === task.id ? payload.task : item))
      notify(nextStatus === 'completed' ? 'Nicely done. Task completed.' : 'Task moved to in progress.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true)
    try {
      await request(`/tasks/${deleteTask.id}`, {
        token: session.accessToken,
        method: 'DELETE',
      })
      setTasks((current) => current.filter((task) => task.id !== deleteTask.id))
      setDeleteTask(null)
      notify('Task deleted.')
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  const statusNavigation = (
    <>
      {Object.entries(STATUS_LABELS).map(([status, label]) => (
        <button
          aria-pressed={activeStatus === status}
          className={`nav-filter ${activeStatus === status ? 'active' : ''}`}
          key={status}
          onClick={() => {
            setActiveStatus(status)
            setMobileMenu(false)
          }}
          type="button"
        >
          {label}
          {status === 'all' && <span className="nav-count">{tasks.length}</span>}
        </button>
      ))}
    </>
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Daymark home">
          <span className="brand-mark">d.</span>
          <span>daymark</span>
        </a>
        <nav aria-label="Task status" className={`desktop-nav ${mobileMenu ? 'is-open' : ''}`}>
          {statusNavigation}
        </nav>
        <div className="topbar-actions">
          <span className="user-name">{session.user.name}</span>
          <button
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="icon-button theme-toggle"
            onClick={() => setDark((value) => !value)}
            type="button"
          >
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <button aria-label="Sign out" className="logout-button" onClick={onLogout} type="button">
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
          <button
            aria-expanded={mobileMenu}
            aria-label={mobileMenu ? 'Close navigation menu' : 'Open navigation menu'}
            className="icon-button mobile-menu-button"
            onClick={() => setMobileMenu((value) => !value)}
            type="button"
          >
            <Icon name={mobileMenu ? 'close' : 'menu'} />
          </button>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="sidebar">
          <p className="sidebar-label">YOUR SPACE</p>
          <nav aria-label="Task status" className="sidebar-nav">
            {statusNavigation}
          </nav>
          <div className="sidebar-note">
            <span className="note-sun">✳</span>
            <p>Small steps make meaningful days.</p>
          </div>
        </aside>

        <section className="dashboard-content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">{dateLabel}</p>
              <h1>Your day, <span>in focus.</span></h1>
              <p className="welcome-copy">A clear list makes room for clear thinking.</p>
            </div>
            <button className="button button-primary add-task-button" onClick={() => setTaskModal(null)} type="button">
              <Icon name="plus" />
              <span>New task</span>
            </button>
          </div>

          <div className="summary-grid" aria-label="Task overview">
            <div className="summary-card">
              <span className="summary-icon summary-icon-green"><Icon name="arrow" size={17} /></span>
              <span className="summary-number">{summary.open}</span>
              <span className="summary-label">Still in motion</span>
            </div>
            <div className="summary-card">
              <span className="summary-icon summary-icon-amber"><Icon name="calendar" size={17} /></span>
              <span className="summary-number">{summary.today}</span>
              <span className="summary-label">Due today</span>
            </div>
            <div className="summary-card">
              <span className="summary-icon summary-icon-lilac"><Icon name="check" size={17} /></span>
              <span className="summary-number">{summary.completed}</span>
              <span className="summary-label">Already done</span>
            </div>
          </div>

          <div className="list-heading">
            <div>
              <p className="eyebrow">YOUR TASKS</p>
              <h2>{STATUS_LABELS[activeStatus]}</h2>
            </div>
            <span className="result-count">{filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}</span>
          </div>

          <div className="filter-bar">
            <label className="search-field">
              <Icon name="search" size={18} />
              <input
                aria-label="Search tasks"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your tasks"
                type="search"
                value={search}
              />
            </label>
            <label className="date-filter">
              <Icon name="calendar" size={16} />
              <input
                aria-label="Filter by due date"
                onChange={(event) => setDueFilter(event.target.value)}
                type="date"
                value={dueFilter}
              />
            </label>
          </div>

          {loading ? (
            <div className="loading-state" role="status"><span className="loading-spinner" />Loading your tasks…</div>
          ) : filteredTasks.length ? (
            <div className="task-list">
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  now={now}
                  onAdvance={advanceTask}
                  onDelete={setDeleteTask}
                  onEdit={setTaskModal}
                  task={task}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-mark"><Icon name={search || dueFilter ? 'search' : 'check'} size={23} /></span>
              <h3>{search || dueFilter ? 'Nothing in this view' : activeStatus === 'completed' ? 'Nothing completed yet' : 'A little room to begin'}</h3>
              <p>
                {search || dueFilter
                  ? 'Try another search or clear your filters.'
                  : activeStatus === 'completed'
                    ? 'Completed tasks will gather here as you make progress.'
                    : 'Add a task when you are ready to plan your next step.'}
              </p>
              {!search && !dueFilter && activeStatus !== 'completed' && (
                <button className="button button-outline" onClick={() => setTaskModal(null)} type="button">
                  <Icon name="plus" size={17} /> Add your first task
                </button>
              )}
              {(search || dueFilter) && (
                <button
                  className="text-button clear-filters"
                  onClick={() => { setSearch(''); setDueFilter('') }}
                  type="button"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
          <footer className="dashboard-footer">Made for the things that matter.</footer>
        </section>
      </div>

      {taskModal !== undefined && (
        <TaskModal
          key={taskModal?.id || 'new-task'}
          onClose={() => setTaskModal(undefined)}
          onSave={saveTask}
          task={taskModal}
          token={session.accessToken}
        />
      )}
      {deleteTask && (
        <DeleteModal
          busy={deleteBusy}
          onClose={() => !deleteBusy && setDeleteTask(null)}
          onDelete={confirmDelete}
          task={deleteTask}
        />
      )}
    </main>
  )
}

function App() {
  const [session, setSession] = useState(loadSession)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
  }, [])

  const authenticate = useCallback((payload) => {
    const nextSession = { accessToken: payload.accessToken, user: payload.user }
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))
    setSession(nextSession)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
    notify('You have signed out.')
  }, [notify])

  return (
    <>
      {session
        ? <Dashboard key={session.user.id} notify={notify} onLogout={logout} session={session} />
        : <AuthView notify={notify} onAuthenticated={authenticate} />}
      {toast && (
        <div className={`toast toast-${toast.type}`} key={toast.id} role="status">
          <span className="toast-indicator">{toast.type === 'error' ? '!' : <Icon name="check" size={15} />}</span>
          <span>{toast.message}</span>
          <button aria-label="Dismiss notification" className="icon-button" onClick={() => setToast(null)} type="button">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </>
  )
}

export default App
