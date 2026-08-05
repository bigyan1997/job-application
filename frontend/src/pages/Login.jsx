import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { googleLogin, signInWithPassword, signUpWithPassword } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleGoogleSuccess(credentialResponse) {
    setError(null)
    try {
      const data = await googleLogin(credentialResponse.credential)
      login(data.token, { email: data.email, name: data.name })
    } catch {
      setError('Sign-in failed. Please try again.')
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const data =
        mode === 'signin'
          ? await signInWithPassword(email, password)
          : await signUpWithPassword(email, password, name)
      login(data.token, { email: data.email, name: data.name })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8">
        <div className="mb-6 text-center">
          <h1 className="font-display text-xl font-semibold tracking-tight">Job Application Automation</h1>
          <div className="mt-1.5 text-[13px] text-ink-dim">
            {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
          </div>
        </div>

        <form onSubmit={handlePasswordSubmit}>
          {mode === 'signup' && (
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-line px-3 py-2.5 text-sm"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-line px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-line px-3 py-2.5 text-sm"
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[5px] border border-ink bg-ink px-4 py-2.5 font-mono text-xs text-white disabled:opacity-40"
          >
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-3 text-center text-[12.5px] text-ink-dim">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button onClick={() => setMode('signup')} className="text-accent">
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => setMode('signin')} className="text-accent">
                Sign in
              </button>
            </>
          )}
        </div>

        <div className="my-5 flex items-center gap-3 text-[11px] text-ink-faint">
          <div className="h-px flex-1 bg-line" />
          or
          <div className="h-px flex-1 bg-line" />
        </div>

        <div className="flex justify-center">
          <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError('Sign-in failed. Please try again.')} />
        </div>

        {error && <div className="mt-4 rounded border border-rust bg-rust-soft p-2 text-xs text-rust">{error}</div>}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[12.5px] font-medium">{label}</label>
      {children}
    </div>
  )
}
