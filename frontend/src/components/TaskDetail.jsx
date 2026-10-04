function TaskDetail({ task, loading, onClose, onEdit }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-heading">
        <div className="detail-heading">
          <p className="eyebrow">TASK DETAILS</p>
          <button className="icon-button" type="button" aria-label="Close task details" onClick={onClose}>×</button>
        </div>
        {loading || !task ? (
          <div className="empty-state empty-state--compact"><span className="spinner" aria-hidden="true" />Loading task…</div>
        ) : (
          <>
            {task.image_url && <img className="detail-image" src={task.image_url} alt="" />}
            <div className="detail-title-row">
              <h2 id="detail-heading">{task.title}</h2>
              <StatusBadge status={task.status} />
            </div>
            <p className="detail-label">Description</p>
            <p className="detail-description">{task.description || 'No description'}</p>
            <p className="detail-label">Due date</p>
            <p className="detail-description">{formatDueDate(task.due_date)}</p>
            <div className="detail-actions">
              <button className="button button--secondary" type="button" onClick={onClose}>Close</button>
              <button className="button button--primary" type="button" onClick={() => onEdit(task)}>Edit task</button>
            </div>
          </>
        )}
      </section>
    </div>
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

export default TaskDetail
