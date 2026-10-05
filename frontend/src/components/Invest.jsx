import { useEffect, useState } from 'react'
import { api } from '../api'

// Pretend-market sandbox: see assets, buy/sell, and fast-forward time.
export default function Invest({ child }) {
  const [assets, setAssets] = useState([])
  const [portfolio, setPortfolio] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const [a, p] = await Promise.all([api.listAssets(), api.getPortfolio(child.id)])
    setAssets(a); setPortfolio(p)
  }
  useEffect(() => { load() }, [])

  async function trade(fn, assetId) {
    setError('')
    try { await fn(child.id, assetId, 1); await load() }
    catch (e) { setError(e.message) }
  }

  async function tick() {
    await api.tickMarket(); await load()
  }

  const held = (assetId) => portfolio?.holdings.find(h => h.asset_id === assetId)?.shares || 0

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section-title" style={{ margin: 0 }}>Pretend market 📈</h2>
        <button className="btn btn-yellow" onClick={tick}>⏩ Next day</button>
      </div>

      {portfolio && (
        <div className="card" style={{ margin: '16px 0', borderColor: 'var(--f4l-yellow)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><div className="muted">Pretend cash</div><div className="price">{portfolio.cash}</div></div>
            <div><div className="muted">Total value</div><div className="price">{portfolio.total_value}</div></div>
          </div>
          <div className="muted">💡 Pretend money only — practice safely, never lose real cash.</div>
        </div>
      )}

      {error && <p style={{ color: '#e24b4b', fontWeight: 700 }}>{error}</p>}

      <div className="grid">
        {assets.map(a => (
          <div className="card" key={a.id}>
            <span className="pill-badge" style={{ alignSelf: 'flex-start' }}>{a.symbol}</span>
            <h3>{a.name}</h3>
            <div className="muted">{a.description}</div>
            <div className="price">{a.current_price}</div>
            <div className="muted">You own: {held(a.id)}</div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => trade(api.buy, a.id)}>Buy 1</button>
              <button className="btn btn-ghost" disabled={held(a.id) < 1} onClick={() => trade(api.sell, a.id)}>Sell 1</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

