const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : configuredApiBaseUrl

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path, { method = 'GET', token, body } = {}) {
  if (!configuredApiBaseUrl) {
    throw new Error('Set VITE_API_BASE_URL in the frontend environment before using the application.')
  }

  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    throw new Error('Could not reach the server. Check the API address and try again.')
  }

  let payload = {}
  try {
    payload = await response.json()
  } catch {
    if (response.ok) return {}
  }

  if (!response.ok) {
    const errorBody = payload?.error
    const details = Array.isArray(errorBody?.details) ? errorBody.details : null
    let message

    if (details?.length) {
      message = details.join(' ')
    } else if (response.status === 401) {
      message = path === '/login'
        ? 'Email or password is incorrect.'
        : 'Your session has expired. Please sign in again.'
    } else if (response.status === 404) {
      message = 'That task could not be found.'
    } else if (response.status === 400) {
      message = path === '/register'
        ? 'An account with this email may already exist. Check the details and try again.'
        : 'Please check the information and try again.'
    } else {
      message = 'Something went wrong. Please try again later.'
    }

    throw new ApiError(message, response.status)
  }

  return payload
}

export const api = {
  register(values) {
    return request('/register', { method: 'POST', body: values })
  },
  login(values) {
    return request('/login', { method: 'POST', body: values })
  },
  async getTasks(token) {
    const result = await request('/tasks/', { token })
    return result.tasks
  },
  async getTask(id, token) {
    const result = await request(`/tasks/${encodeURIComponent(id)}/`, { token })
    return result.task
  },
  createTask(values, image, token) {
    return request('/tasks/', {
      method: 'POST',
      token,
      body: createTaskBody(values, image)
    })
  },
  updateTask(id, values, image, token) {
    return request(`/tasks/${encodeURIComponent(id)}/`, {
      method: 'PUT',
      token,
      body: createTaskBody(values, image)
    })
  },
  deleteTask(id, token) {
    return request(`/tasks/${encodeURIComponent(id)}/`, { method: 'DELETE', token })
  }
}

function createTaskBody(values, image) {
  if (!image) return values

  const formData = new FormData()
  for (const [field, value] of Object.entries(values)) {
    if (field !== 'image_url' && value !== null && value !== undefined && value !== '') {
      formData.append(field, value)
    }
  }
  formData.append('image', image)
  return formData
}
