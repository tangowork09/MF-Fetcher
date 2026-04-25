const BASE = '/amfi-api'

function post(endpoint, body = null) {
  return fetch(`${BASE}/${endpoint}`, {
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
  /** Get filter options: maturity types, categories, MF houses, report date */
  filters: () => post('fundperformancefilters'),

  /** Check if a date is a holiday */
  isHoliday: (reportDate) => post('isHoliday', { reportDate }),

  /** Get subcategories for a category ID */
  subcategories: (category) => post('getsubcategory', { category }),

  /** Get fund performance data */
  performance: ({ maturityType, category, subCategory, mfid = 0, reportDate }) =>
    post('fundperformance', { maturityType, category, subCategory, mfid, reportDate }),
}
