// Thin wrapper around the FastAPI backend (proxied via /api in dev).
const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = data.detail ?? detail
    } catch (_) {}
    // FastAPI validation errors (422) return `detail` as an array of
    // { loc, msg, type } objects; flatten it to a readable string so the UI
    // never shows "[object Object]".
    if (Array.isArray(detail)) {
      detail = detail.map(e => e?.msg || JSON.stringify(e)).join(', ')
    } else if (detail && typeof detail === 'object') {
      detail = detail.msg || JSON.stringify(detail)
    }
    throw new Error(detail)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  health: () => request('/health'),

  // Onboarding
  createParent: (email, password, locale = 'de-CH') =>
    request('/parents', { method: 'POST', body: JSON.stringify({ email, password, locale }) }),
  login: (email, password) =>
    request('/parents/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  giveConsent: (parentId) => request(`/parents/${parentId}/consent`, { method: 'POST' }),
  createChild: (parentId, display_name, age_band = '14-17') =>
    request(`/parents/${parentId}/children`, {
      method: 'POST',
      body: JSON.stringify({ display_name, age_band }),
    }),

  // User settings (persisted per child in the DB)
  getSettings: (childId) => request(`/children/${childId}/settings`),
  updateSettings: (childId, settings) =>
    request(`/children/${childId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  // Lessons
  listLessons: () => request('/lessons'),  getLesson: (id) => request(`/lessons/${id}`),
  completeLesson: (id, childId) =>
    request(`/lessons/${id}/complete?child_id=${childId}`, { method: 'POST' }),
  submitQuiz: (id, childId, answers) =>
    request(`/lessons/${id}/quiz`, {
      method: 'POST',
      body: JSON.stringify({ child_id: childId, answers }),
    }),

  // Wallet & savings
  getWallet: (childId) => request(`/children/${childId}/wallet`),
  listGoals: (childId) => request(`/children/${childId}/goals`),
  createGoal: (childId, name, target_amount) =>
    request(`/children/${childId}/goals`, {
      method: 'POST',
      body: JSON.stringify({ name, target_amount }),
    }),
  depositToGoal: (goalId, amount) =>
    request(`/goals/${goalId}/deposit`, { method: 'POST', body: JSON.stringify({ amount }) }),

  // Investing
  listAssets: () => request('/market/assets'),
  tickMarket: () => request('/market/tick', { method: 'POST' }),
  getPortfolio: (childId) => request(`/children/${childId}/portfolio`),
  buy: (childId, assetId, shares) =>
    request('/market/buy', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId, asset_id: assetId, shares }),
    }),
  sell: (childId, assetId, shares) =>
    request('/market/sell', {
      method: 'POST',
      body: JSON.stringify({ child_id: childId, asset_id: assetId, shares }),
    }),
}

