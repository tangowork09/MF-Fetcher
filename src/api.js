const BASE = 'https://api.mfapi.in'

function parseDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('-');
  return new Date(`${y}-${m}-${d}T00:00:00Z`);
}

function formatDate(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

function fillMissingDates(data) {
  if (!data || data.length === 0) return data;
  
  const reversed = [...data].reverse();
  const filled = [];
  
  for (let i = 0; i < reversed.length; i++) {
    const current = reversed[i];
    filled.push(current);
    
    if (i < reversed.length - 1) {
      const next = reversed[i + 1];
      const currDate = parseDate(current.date);
      const nextDate = parseDate(next.date);
      
      let tempDate = new Date(currDate);
      tempDate.setUTCDate(tempDate.getUTCDate() + 1);
      
      while (tempDate < nextDate) {
        filled.push({
          date: formatDate(tempDate),
          nav: current.nav
        });
        tempDate.setUTCDate(tempDate.getUTCDate() + 1);
      }
    }
  }
  
  return filled.reverse();
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
    return safeFetch(qs ? `${url}?${qs}` : url)
      .then(res => {
        if (res.status === 'SUCCESS' && res.data) {
          res.data = fillMissingDates(res.data)
        }
        return res
      })
  },

  latest: (code) =>
    safeFetch(`${BASE}/mf/${sanitizeCode(code)}/latest`),
}
