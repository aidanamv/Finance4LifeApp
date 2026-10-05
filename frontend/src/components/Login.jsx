import { useState } from 'react'
import { api } from '../api'
import Logo from './Logo'

// Returning parents log in here, then pick which teen profile to continue as.
export default function Login({ onReady, onSignUp }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [parent, setParent] = useState(null)
  const [childName, setChildName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function login() {
    setBusy(true); setError('')
    try {
      const p = await api.login(email, password)
      // If there's exactly one profile, jump straight in.
      if (p.children.length === 1) {
        onReady(p.children[0])
        return
      }
      setParent(p)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function createChild() {
    setBusy(true); setError('')
    try {
      if (!parent.consent_given) await api.giveConsent(parent.id)
      const child = await api.createChild(parent.id, childName)
      onReady(child)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="app">
      <div className="header"><Logo /></div>
      <div className="content" style={{ maxWidth: 520, margin: '0 auto', width: '100%' }}>
        {!parent && (
          <div className="stack">
            <h2 className="section-title">Welcome back! 👋</h2>
            <p className="muted">Log in to continue your family's learning journey.</p>
            <input
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
            />
            <button className="btn btn-primary" disabled={busy || !email || !password} onClick={login}>
              Log in
            </button>
            <p className="muted center">
              New here?{' '}
              <a href="#" onClick={e => { e.preventDefault(); onSignUp() }}>Create an account</a>
            </p>
          </div>
        )}

        {parent && parent.children.length > 0 && (
          <div className="stack">
            <h2 className="section-title">Who's learning today? 🎒</h2>
            <div className="grid">
              {parent.children.map(c => (
                <button key={c.id} className="card" onClick={() => onReady(c)}>
                  <h3>{c.display_name}</h3>
                  <span className="muted">Age {c.age_band}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {parent && parent.children.length === 0 && (
          <div className="stack">
            <h2 className="section-title">Create your teen's profile 🎒</h2>
            <input
              placeholder="Display name (e.g. Max)"
              value={childName}
              onChange={e => setChildName(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy || !childName} onClick={createChild}>
              Start learning
            </button>
          </div>
        )}

        {error && <p style={{ color: '#e24b4b', fontWeight: 700 }}>{error}</p>}
      </div>
    </div>
  )
}

