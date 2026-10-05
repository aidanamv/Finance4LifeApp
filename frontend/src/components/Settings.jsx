import { useEffect, useState } from 'react'
import { api } from '../api'

const LOCALES = [
  { value: 'de-CH', label: 'Deutsch (CH)' },
  { value: 'fr-CH', label: 'Français (CH)' },
  { value: 'it-CH', label: 'Italiano (CH)' },
  { value: 'en', label: 'English' },
]

// Per-user preferences. These are saved in the database so they follow the
// child across devices (not just this browser).
export default function Settings({ child }) {
  const [settings, setSettings] = useState(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getSettings(child.id).then(setSettings).catch(() => {})
  }, [child.id])

  function update(patch) {
    setSettings(s => ({ ...s, ...patch }))
  }

  async function save() {
    setBusy(true); setStatus('')
    try {
      const saved = await api.updateSettings(child.id, settings)
      setSettings(saved)
      setStatus('Saved ✓')
    } catch (e) {
      setStatus(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return <p className="muted">Loading settings…</p>

  return (
    <div className="stack">
      <h2 className="section-title">Settings ⚙️</h2>
      <p className="muted">Your preferences are saved to your account.</p>

      <label className="stack" style={{ gap: 6 }}>
        <span>Language</span>
        <select
          value={settings.locale}
          onChange={e => update({ locale: e.target.value })}
        >
          {LOCALES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span>Theme</span>
        <select
          value={settings.theme}
          onChange={e => update({ theme: e.target.value })}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <label className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
        <input
          type="checkbox"
          checked={settings.sound_enabled}
          onChange={e => update({ sound_enabled: e.target.checked })}
        />
        <span>Sound effects</span>
      </label>

      <label className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
        <input
          type="checkbox"
          checked={settings.notifications_enabled}
          onChange={e => update({ notifications_enabled: e.target.checked })}
        />
        <span>Notifications</span>
      </label>

      <button className="btn btn-primary" disabled={busy} onClick={save}>
        Save settings
      </button>
      {status && <p className="muted">{status}</p>}
    </div>
  )
}

