import { useEffect, useState } from 'react'
import { api } from '../api'

// Savings goal "jars" — create a goal and deposit coins toward it.
export default function Savings({ child, coins, onCoins }) {
  const [goals, setGoals] = useState([])
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setGoals(await api.listGoals(child.id))
  }
  useEffect(() => { load() }, [])

  async function addGoal() {
    setError('')
    try {
      await api.createGoal(child.id, name, Number(target))
      setName(''); setTarget('')
      load()
    } catch (e) { setError(e.message) }
  }

  async function deposit(goalId) {
    setError('')
    try {
      await api.depositToGoal(goalId, 10)
      const w = await api.getWallet(child.id)
      onCoins(w.coins)
      load()
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <h2 className="section-title">Savings jars 🫙</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3>New goal</h3>
        <div className="row">
          <input placeholder="What are you saving for?" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="Target coins" type="number" value={target} onChange={e => setTarget(e.target.value)} style={{ width: 140 }} />
          <button className="btn btn-yellow" disabled={!name || !target} onClick={addGoal}>Add jar</button>
        </div>
      </div>
      {error && <p style={{ color: '#e24b4b', fontWeight: 700 }}>{error}</p>}
      {goals.length === 0 ? (
        <div className="empty">No jars yet — create your first savings goal above!</div>
      ) : (
        <div className="grid">
          {goals.map(g => {
            const pct = Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100))
            return (
              <div className="card" key={g.id}>
                <h3>{g.name} {g.achieved && '🏆'}</h3>
                <div className="muted">{g.saved_amount} / {g.target_amount} coins</div>
                <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                <button className="btn btn-primary" disabled={g.achieved || coins < 10} onClick={() => deposit(g.id)}>
                  Save 10 coins
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

