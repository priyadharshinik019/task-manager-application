const allowedFields = new Set([
  'title',
  'description',
  'status',
  'due_date',
  'image_url'
]);
const allowedStatuses = new Set(['pending', 'in_progress', 'completed', 'failed']);

function validateTaskPayload(input) {
  const errors = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: ['Request body must be a JSON object.']
    };
  }

  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      errors.push(`Unexpected field: ${field}.`);
    }
  }

  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    errors.push('title is required and must be a non-empty string.');
  }

  const status = input.status === undefined ? 'pending' : input.status;
  if (typeof status !== 'string' || !allowedStatuses.has(status)) {
    errors.push('status must be pending, in_progress, completed, or failed.');
  }

  for (const field of ['description', 'due_date', 'image_url']) {
    const value = input[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      errors.push(`${field} must be a string or null.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      title: input.title,
      description: input.description === undefined ? null : input.description,
      status,
      due_date: input.due_date === undefined ? null : input.due_date,
      image_url: input.image_url === undefined ? null : input.image_url
    }
  };
}

module.exports = { validateTaskPayload };
