const isDev = import.meta.env.DEV

function post(endpoint, body = null) {
  // Dev: use Vite proxy. Prod: use Vercel serverless function.
  const url = isDev
    ? `/amfi-api/${endpoint}`
    : `/api/amfi?endpoint=${encodeURIComponent(endpoint)}`

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }).then(res => {
    if (res.validationStatus !== 'SUCCESS') throw new Error(res.validationMsg)
    return res.data
  })
}

export const amfi = {
  filters: () => post('fundperformancefilters'),
  isHoliday: (reportDate) => post('isHoliday', { reportDate }),
  subcategories: (category) => post('getsubcategory', { category }),
  performance: ({ maturityType, category, subCategory, mfid = 0, reportDate }) =>
    post('fundperformance', { maturityType, category, subCategory, mfid, reportDate }),
}
