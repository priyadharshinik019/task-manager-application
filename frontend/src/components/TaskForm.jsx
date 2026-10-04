import { useState } from 'react'

const statuses = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' }
]

function TaskForm({ task, saving, onSubmit, onCancel }) {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [status, setStatus] = useState(task?.status || 'pending')
  const [dueDate, setDueDate] = useState(task?.due_date ? String(task.due_date).slice(0, 10) : '')
  const [image, setImage] = useState(null)
  const [formError, setFormError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim()) {
      setFormError('Add a title for this task.')
      return
    }

    setFormError('')
    const values = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      due_date: dueDate || null,
      image_url: task?.image_url || null
    }

    try {
      await onSubmit(values, image)
    } catch {
      setFormError('The task could not be saved. Please try again.')
    }
  }

  return (
    <section className="task-form-card" aria-labelledby="task-form-heading">
      <div className="form-card-heading">
        <div>
          <p className="eyebrow">{task ? 'UPDATE TASK' : 'NEW TASK'}</p>
          <h2 id="task-form-heading">{task ? 'Edit task' : 'Create a task'}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close task form" onClick={onCancel}>×</button>
      </div>
      {formError && <p className="notice notice--error" role="alert">{formError}</p>}
      <form className="task-form" onSubmit={handleSubmit}>
        <label className="field field--wide">
          <span>Title</span>
          <input
            autoFocus
            required
            maxLength={180}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to be done?"
          />
        </label>
        <label className="field field--wide">
          <span>Description <span className="optional-label">Optional</span></span>
          <textarea
            rows="3"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a few details"
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Due date <span className="optional-label">Optional</span></span>
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label className="field field--wide">
          <span>Image <span className="optional-label">Optional</span></span>
          {task?.image_url && !image && (
            <img className="form-image-preview" src={task.image_url} alt="Current task" />
          )}
          <input
            className="file-input"
            type="file"
            accept="image/*"
            onChange={(event) => setImage(event.target.files?.[0] || null)}
          />
          <span className="field-hint">Choose an image to upload. The current image stays unless replaced.</span>
        </label>
        <div className="form-actions field--wide">
          <button className="button button--secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default TaskForm
