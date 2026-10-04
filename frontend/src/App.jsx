import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './services/api.js'
import AuthForm from './components/AuthForm.jsx'
import TaskDetail from './components/TaskDetail.jsx'
import TaskForm from './components/TaskForm.jsx'
import './App.css'

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('task-manager-token'))
  const [authMode, setAuthMode] = useState('login')
  const [authMessage, setAuthMessage] = useState('')
  const [tasks, setTasks] = useState([])
  const [titleSearch, setTitleSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tasksLoading, setTasksLoading] = useState(() => Boolean(sessionStorage.getItem('task-manager-token')))
  const [taskSaving, setTaskSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [formMode, setFormMode] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [detailTask, setDetailTask] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState(null)
  const normalizedTitleSearch = titleSearch.trim().toLocaleLowerCase()
  const filteredTasks = tasks.filter((task) => {
    const matchesTitle = task.title.toLocaleLowerCase().includes(normalizedTitleSearch)
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter
    return matchesTitle && matchesStatus
  })

  const signOut = useCallback(() => {
    sessionStorage.removeItem('task-manager-token')
    setToken(null)
    setTasks([])
    setTasksLoading(false)
    setFormMode(null)
    setDetailId(null)
    setDetailTask(null)
    setDetailLoading(false)
  }, [])

  const refreshTasks = useCallback(async (activeToken) => {
    setTasksLoading(true)
    try {
      const nextTasks = await api.getTasks(activeToken)
      setTasks(nextTasks)
      return true
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
      if (error instanceof ApiError && error.status === 401) {
        signOut()
      }
      return false
    } finally {
      setTasksLoading(false)
    }
  }, [signOut])

  useEffect(() => {
    if (!token) return undefined

    let cancelled = false
    api.getTasks(token)
      .then((nextTasks) => {
        if (!cancelled) setTasks(nextTasks)
      })
      .catch((error) => {
        if (cancelled) return
        setNotice({ type: 'error', text: error.message })
        if (error instanceof ApiError && error.status === 401) signOut()
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, signOut])

  useEffect(() => {
    if (!token || detailId === null) return undefined

    let cancelled = false
    api.getTask(detailId, token)
      .then((task) => {
        if (!cancelled) setDetailTask(task)
      })
      .catch((error) => {
        if (cancelled) return
        setNotice({ type: 'error', text: error.message })
        setDetailId(null)
        if (error instanceof ApiError && error.status === 401) signOut()
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, detailId, signOut])

  async function handleAuthSubmit(values) {
    setNotice(null)
    setAuthMessage('')
    if (authMode === 'register') {
      await api.register(values)
      setAuthMode('login')
      setAuthMessage('Account created. Sign in with your email and password.')
      return
    }

    const result = await api.login(values)
    sessionStorage.setItem('task-manager-token', result.accessToken)
    setTasksLoading(true)
    setToken(result.accessToken)
    setNotice({ type: 'success', text: 'You are signed in.' })
  }

  function switchAuthMode(mode) {
    setAuthMode(mode)
    setAuthMessage('')
    setNotice(null)
  }

  async function handleTaskSubmit(values, image) {
    setTaskSaving(true)
    setNotice(null)
    try {
      if (formMode?.type === 'edit') {
        await api.updateTask(formMode.task.id, values, image, token)
        setNotice({ type: 'success', text: 'Task updated.' })
      } else {
        await api.createTask(values, image, token)
        setNotice({ type: 'success', text: 'Task created.' })
      }
      setFormMode(null)
      await refreshTasks(token)
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      setTaskSaving(false)
    }
  }

  async function handleDelete(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return

    setDeletingId(task.id)
    setNotice(null)
    try {
      await api.deleteTask(task.id, token)
      if (detailId === task.id) setDetailId(null)
      setNotice({ type: 'success', text: 'Task deleted.' })
      await refreshTasks(token)
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
      if (error instanceof ApiError && error.status === 401) signOut()
    } finally {
      setDeletingId(null)
    }
  }

  function openEdit(task) {
    setDetailId(null)
    setDetailTask(null)
    setDetailLoading(false)
    setFormMode({ type: 'edit', task })
    setNotice(null)
  }

  function openTaskDetail(taskId) {
    setDetailTask(null)
    setDetailLoading(true)
    setDetailId(taskId)
  }

  function closeTaskDetail() {
    setDetailId(null)
    setDetailTask(null)
    setDetailLoading(false)
  }

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-intro" aria-label="Task Manager">
          <div className="brand-mark" aria-hidden="true">T</div>
          <p className="eyebrow">YOUR WORK, IN ONE PLACE</p>
          <h1>Make room for what matters.</h1>
          <p className="intro-copy">Keep track of your tasks and stay on top of what’s due.</p>
          <div className="intro-rule" />
          <p className="intro-footnote">A simple space to plan your day.</p>
        </section>
        <section className="auth-panel">
          <AuthForm
            mode={authMode}
            onSubmit={handleAuthSubmit}
            onSwitchMode={switchAuthMode}
            successMessage={authMessage}
          />
          {notice && <p className={`notice notice--${notice.type}`} role="status">{notice.text}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Task Manager home">
          <span className="brand-mark brand-mark--small" aria-hidden="true">T</span>
          <span>Task Manager</span>
        </a>
        <button className="button button--quiet" type="button" onClick={signOut}>Log out</button>
      </header>

      <section className="dashboard">
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>Your tasks</h1>
            <p className="section-copy">Plan, update, and complete your work.</p>
          </div>
          {!formMode && (
            <button className="button button--primary" type="button" onClick={() => setFormMode({ type: 'create' })}>
              <span aria-hidden="true">+</span> New task
            </button>
          )}
        </div>

        {notice && <p className={`notice notice--${notice.type}`} role="status">{notice.text}</p>}

        {formMode && (
          <TaskForm
            task={formMode.type === 'edit' ? formMode.task : null}
            saving={taskSaving}
            onSubmit={handleTaskSubmit}
            onCancel={() => setFormMode(null)}
          />
        )}

        <section className="task-section" aria-labelledby="task-list-heading">
          <div className="task-section-heading">
            <h2 id="task-list-heading">All tasks</h2>
            <span className="task-count">
              {filteredTasks.length === tasks.length
                ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`
                : `${filteredTasks.length} of ${tasks.length} tasks`}
            </span>
          </div>
          <div className="task-filters">
            <label className="field">
              <span>Search by title</span>
              <input
                type="search"
                value={titleSearch}
                onChange={(event) => setTitleSearch(event.target.value)}
                placeholder="Search tasks"
              />
            </label>
            <label className="field">
              <span>Filter by status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>
          {tasksLoading ? (
            <div className="empty-state"><span className="spinner" aria-hidden="true" />Loading tasks…</div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">✓</div>
              <h3>No tasks yet</h3>
              <p>Create a task to see it here.</p>
              {!formMode && (
                <button className="button button--secondary" type="button" onClick={() => setFormMode({ type: 'create' })}>
                  Create your first task
                </button>
              )}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="empty-state">
              <h3>No matching tasks</h3>
              <p>Try a different title or status.</p>
            </div>
          ) : (
            <div className="task-grid">
              {filteredTasks.map((task) => (
                <article className="task-card" key={task.id}>
                  {task.image_url && (
                    <img className="task-card-image" src={task.image_url} alt="" loading="lazy" />
                  )}
                  <div className="task-card-content">
                    <div className="task-card-title-row">
                      <h3>{task.title}</h3>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="task-description">{task.description || 'No description'}</p>
                    <p className="task-due">
                      <span aria-hidden="true">◷</span> {formatDueDate(task.due_date)}
                    </p>
                    <div className="task-actions">
                      <button className="text-button" type="button" onClick={() => openTaskDetail(task.id)}>View</button>
                      <button className="text-button" type="button" onClick={() => openEdit(task)}>Edit</button>
                      <button
                        className="text-button text-button--danger"
                        type="button"
                        disabled={deletingId === task.id}
                        onClick={() => handleDelete(task)}
                      >
                        {deletingId === task.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {(detailId !== null) && (
        <TaskDetail
          task={detailTask}
          loading={detailLoading}
          onClose={closeTaskDetail}
          onEdit={openEdit}
        />
      )}
    </main>
  )
}

function StatusBadge({ status }) {
  const labels = {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed'
  }

  return <span className={`status-badge status-badge--${status}`}>{labels[status] || status}</span>
}

function formatDueDate(value) {
  if (!value) return 'No due date'
  const dateText = String(value).slice(0, 10)
  const [year, month, day] = dateText.split('-').map(Number)
  if (!year || !month || !day) return dateText
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export default App
