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

export const api = {
  // Search schemes by name
  search: (q) =>
    fetch(`${BASE}/mf/search?q=${encodeURIComponent(q)}`).then(r => r.json()),

  // List all schemes (paginated)
  list: (limit = 50, offset = 0) =>
    fetch(`${BASE}/mf?limit=${limit}&offset=${offset}`).then(r => r.json()),

  // Full NAV history (optionally date-filtered)
  history: (code, startDate, endDate) => {
    let url = `${BASE}/mf/${code}`
    const params = new URLSearchParams()
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    const qs = params.toString()
    return fetch(qs ? `${url}?${qs}` : url)
      .then(r => r.json())
      .then(res => {
        if (res.status === 'SUCCESS' && res.data) {
          res.data = fillMissingDates(res.data);
        }
        return res;
      });
  },

  // Latest NAV only
  latest: (code) =>
    fetch(`${BASE}/mf/${code}/latest`).then(r => r.json()),
}
