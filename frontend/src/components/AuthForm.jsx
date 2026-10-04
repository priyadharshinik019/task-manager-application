import { useState } from 'react'
import { ApiError } from '../services/api.js'

function AuthForm({ mode, onSubmit, onSwitchMode, successMessage }) {
  const isRegister = mode === 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(isRegister ? { name, email, password } : { email, password })
      setPassword('')
      if (isRegister) setName('')
    } catch (submitError) {
      setError(submitError instanceof ApiError || submitError instanceof Error
        ? submitError.message
        : 'Unable to continue. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode) {
    setError('')
    setPassword('')
    onSwitchMode(nextMode)
  }

  return (
    <div className="auth-card">
      <p className="eyebrow">{isRegister ? 'GET STARTED' : 'WELCOME BACK'}</p>
      <h2>{isRegister ? 'Create your account' : 'Sign in'}</h2>
      <p className="auth-description">
        {isRegister ? 'Set up your account to start managing your tasks.' : 'Enter your details to access your tasks.'}
      </p>

      {successMessage && <p className="notice notice--success" role="status">{successMessage}</p>}
      {error && <p className="notice notice--error" role="alert">{error}</p>}

      <form className="form-stack" onSubmit={handleSubmit}>
        {isRegister && (
          <label className="field">
            <span>Name</span>
            <input
              autoComplete="name"
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            name="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />
        </label>
        <button className="button button--primary button--full" type="submit" disabled={submitting}>
          {submitting ? (isRegister ? 'Creating account…' : 'Signing in…') : (isRegister ? 'Create account' : 'Sign in')}
        </button>
      </form>

      <p className="auth-switch">
        {isRegister ? 'Already have an account?' : 'New to Task Manager?'}{' '}
        <button
          type="button"
          className="link-button"
          onClick={() => changeMode(isRegister ? 'login' : 'register')}
        >
          {isRegister ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  )
}

export default AuthForm
