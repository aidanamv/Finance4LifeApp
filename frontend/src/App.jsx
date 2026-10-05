import { useEffect, useState } from 'react'
import { api } from './api'
import Logo from './components/Logo'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import Lessons from './components/Lessons'
import Savings from './components/Savings'
import Invest from './components/Invest'
import Settings from './components/Settings'

const TABS = [
  { key: 'lessons', label: '📚 Learn' },
  { key: 'savings', label: '🫙 Save' },
  { key: 'invest', label: '📈 Invest' },
  { key: 'settings', label: '⚙️ Settings' },
]

export default function App() {
  // Persist the child session locally so a refresh keeps you logged in.
  const [child, setChild] = useState(() => {
    const saved = localStorage.getItem('f4l_child')
    return saved ? JSON.parse(saved) : null
  })
  const [coins, setCoins] = useState(0)
  const [tab, setTab] = useState('lessons')
  // Which auth screen to show when logged out: 'login' or 'signup'.
  const [authView, setAuthView] = useState('login')

  useEffect(() => {
    if (child) {
      localStorage.setItem('f4l_child', JSON.stringify(child))
      api.getWallet(child.id).then(w => setCoins(w.coins)).catch(() => {})
    }
  }, [child])

  function logout() {
    localStorage.removeItem('f4l_child')
    setChild(null)
  }

  if (!child) {
    return authView === 'signup'
      ? <Onboarding onReady={setChild} onLogin={() => setAuthView('login')} />
      : <Login onReady={setChild} onSignUp={() => setAuthView('signup')} />
  }

  return (
    <div className="app">
      <div className="header">
        <Logo />
        <div className="row">
          <span className="coin-pill">🪙 {coins}</span>
          <button className="btn btn-ghost" onClick={logout}>Switch</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="content">
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="pill-badge">Hi, {child.display_name}! 👋</span>
        </div>
        {tab === 'lessons' && <Lessons child={child} onCoins={setCoins} />}
        {tab === 'savings' && <Savings child={child} coins={coins} onCoins={setCoins} />}
        {tab === 'invest' && <Invest child={child} />}
        {tab === 'settings' && <Settings child={child} />}
      </div>
    </div>
  )
}

