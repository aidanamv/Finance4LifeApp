import { useState } from 'react'
import { api } from '../api'
import Logo from './Logo'

// Parent sign-up + consent + create a teen profile, all in one friendly flow.
export default function Onboarding({ onReady, onLogin }) {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [parentId, setParentId] = useState(null)
  const [childName, setChildName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function createParent() {
    setBusy(true); setError('')
    try {
      const p = await api.createParent(email, password)
      setParentId(p.id)
      setStep(2)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function consentAndNext() {
    setBusy(true); setError('')
    try {
      await api.giveConsent(parentId)
      setStep(3)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function createChild() {
    setBusy(true); setError('')
    try {
      const child = await api.createChild(parentId, childName)
      onReady(child)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="app">
      <div className="header"><Logo /></div>
      <div className="content" style={{ maxWidth: 520, margin: '0 auto', width: '100%' }}>
        {step === 1 && (
          <div className="stack">
            <h2 className="section-title">Welcome, parent! 👋</h2>
            <p className="muted">Create an account to get your teen started. No real money is ever used.</p>
            <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <button className="btn btn-primary" disabled={busy} onClick={createParent}>Create account</button>
            {onLogin && (
              <p className="muted center">
                Already have an account?{' '}
                <a href="#" onClick={e => { e.preventDefault(); onLogin() }}>Log in</a>
              </p>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <h2 className="section-title">Parental consent 🔒</h2>
            <p className="muted">
              As required in Switzerland (FADP) and the EU (GDPR-K), please confirm you consent to
              your child using Finance for Life. We collect only what's needed and never show ads.
            </p>
            <button className="btn btn-yellow" disabled={busy} onClick={consentAndNext}>I give consent</button>
          </div>
        )}
        {step === 3 && (
          <div className="stack">
            <h2 className="section-title">Create your teen's profile 🎒</h2>
            <input placeholder="Display name (e.g. Max)" value={childName} onChange={e => setChildName(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || !childName} onClick={createChild}>Start learning</button>
          </div>
        )}
        {error && <p style={{ color: '#e24b4b', fontWeight: 700 }}>{error}</p>}
      </div>
    </div>
  )
}

