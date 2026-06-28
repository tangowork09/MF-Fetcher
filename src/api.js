const BASE = 'https://api.mfapi.in'

// MF NAVs publish on business days only (no weekends / ~14 market holidays), so
// the raw series has calendar gaps. We forward-fill those gaps for a CONTINUOUS
// listing, but tag each manufactured row with `filled: true`. Risk metrics
// (metrics.js `toSeries`) drop filled rows and compute on actual trading days —
// filling with flat NAVs would create fake 0%-return days that deflate
// volatility / Sharpe / beta. So: continuous to read, accurate to measure.
function parseDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('-')
  return new Date(`${y}-${m}-${d}T00:00:00Z`)
}

function formatDate(date) {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const y = date.getUTCFullYear()
  return `${d}-${m}-${y}`
}

function fillMissingDates(data) {
  if (!data || data.length === 0) return data
  const reversed = [...data].reverse() // oldest-first
  const filled = []
  for (let i = 0; i < reversed.length; i++) {
    const current = reversed[i]
    filled.push(current)
    if (i < reversed.length - 1) {
      const currDate = parseDate(current.date)
      const nextDate = parseDate(reversed[i + 1].date)
      let temp = new Date(currDate)
      temp.setUTCDate(temp.getUTCDate() + 1)
      while (temp < nextDate) {
        filled.push({ date: formatDate(temp), nav: current.nav, filled: true })
        temp.setUTCDate(temp.getUTCDate() + 1)
      }
    }
  }
  return filled.reverse() // back to newest-first (mfapi order)
}

function safeFetch(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
}

function sanitizeCode(code) {
  const cleaned = String(code).trim()
  if (!/^\d+$/.test(cleaned)) throw new Error('Invalid scheme code')
  return cleaned
}

export const api = {
  search: (q) =>
    safeFetch(`${BASE}/mf/search?q=${encodeURIComponent(q)}`),

  list: (limit = 50, offset = 0) => {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50))
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0)
    return safeFetch(`${BASE}/mf?limit=${safeLimit}&offset=${safeOffset}`)
  },

  history: (code, startDate, endDate) => {
    const safeCode = sanitizeCode(code)
    let url = `${BASE}/mf/${safeCode}`
    const params = new URLSearchParams()
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    const qs = params.toString()
    return safeFetch(qs ? `${url}?${qs}` : url).then(res => {
      if (res && res.status === 'SUCCESS' && res.data) res.data = fillMissingDates(res.data)
      return res
    })
  },

  latest: (code) =>
    safeFetch(`${BASE}/mf/${sanitizeCode(code)}/latest`),
}
