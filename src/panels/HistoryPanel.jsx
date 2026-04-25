import { useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { api } from '../api'
import { downloadBulkZip } from '../excel'
import { Panel, SectionHeader, Field, Btn, ErrorBox, Accordion, SkeletonCard, Skeleton } from '../components/ui'
import SendToExcel from '../components/SendToExcel'
import { webExcelStore } from '../webExcelStore'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import NavResult from '../components/NavResult'
import styles from '../App.module.css'

function parseDDMMYYYY(s) {
  const [d, m, y] = s.split('-')
  return new Date(`${y}-${m}-${d}`)
}

function buildPivotData(results, filteredSubsets) {
  const dateMap = new Map()
  const schemeCols = []

  results.forEach(r => {
    const d = filteredSubsets[r.meta.scheme_code] || r.data
    const colName = `${r.meta.scheme_code} - ${r.meta.scheme_name}`
    schemeCols.push(colName)
    d.forEach(row => {
      if (!dateMap.has(row.date)) dateMap.set(row.date, {})
      dateMap.get(row.date)[colName] = row.nav
    })
  })

  const sortedDates = [...dateMap.keys()].sort((a, b) => parseDDMMYYYY(a) - parseDDMMYYYY(b))
  const header = ['Date', ...schemeCols]

  const fullRows = sortedDates.map(date => {
    const entry = dateMap.get(date)
    return [date, ...schemeCols.map(col => entry[col] ?? '')]
  })

  // Trimmed: find the latest start date across ALL schemes (where all have data)
  // then remove all rows before that date
  const startDates = results.map(r => {
    const d = filteredSubsets[r.meta.scheme_code] || r.data
    if (d.length === 0) return null
    // Data might be desc or asc — find the earliest date
    const dates = d.map(row => parseDDMMYYYY(row.date))
    return new Date(Math.min(...dates))
  }).filter(Boolean)

  const latestStart = startDates.length > 0 ? new Date(Math.max(...startDates)) : null

  const trimmedRows = latestStart
    ? fullRows.filter(row => parseDDMMYYYY(row[0]) >= latestStart)
    : fullRows

  // All Time High for each scheme (from FULL data, not trimmed)
  const athValues = schemeCols.map(col => {
    let max = -Infinity
    fullRows.forEach(row => {
      const idx = schemeCols.indexOf(col) + 1
      const val = parseFloat(row[idx])
      if (!isNaN(val) && val > max) max = val
    })
    return max === -Infinity ? '' : max
  })
  const athRow = ['ALL TIME HIGH', ...athValues]

  // Last date values (last row of full data = most recent date)
  const lastRow = fullRows.length > 0 ? fullRows[fullRows.length - 1] : null
  const lastDateRow = lastRow
    ? [lastRow[0], ...schemeCols.map((_, i) => lastRow[i + 1])]
    : ['LATEST', ...schemeCols.map(() => '')]

  // % from ATH: ((ATH - latest) / ATH) * 100 = how far below ATH
  const pctFromAth = ['% BELOW ATH', ...schemeCols.map((_, i) => {
    const ath = parseFloat(athValues[i])
    const latest = parseFloat(lastDateRow[i + 1])
    if (isNaN(ath) || isNaN(latest) || ath === 0) return ''
    const pct = ((ath - latest) / ath) * 100
    return pct.toFixed(2) + '%'
  })]

  // Trimmed with ATH header: ATH, latest, % below, blank, header, data
  const trimmedWithAth = [athRow, lastDateRow, pctFromAth, Array(header.length).fill(''), header, ...trimmedRows]

  // Build NAV lookup for rolling calcs
  const dateNavMap = {}
  schemeCols.forEach((col, ci) => {
    dateNavMap[col] = {}
    trimmedRows.forEach(row => {
      const nav = parseFloat(row[ci + 1])
      if (!isNaN(nav)) {
        dateNavMap[col][parseDDMMYYYY(row[0]).getTime()] = nav
      }
    })
  })

  function buildRollingSheet(years) {
    const rows = []
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const cutoff = new Date(now)
    cutoff.setFullYear(cutoff.getFullYear() - years)

    trimmedRows.forEach(row => {
      const startDate = parseDDMMYYYY(row[0])
      if (startDate > cutoff) return
      const endDate = new Date(startDate)
      endDate.setFullYear(endDate.getFullYear() + years)
      const targetMs = endDate.getTime()

      const returns = schemeCols.map(col => {
        const startNav = dateNavMap[col][startDate.getTime()]
        if (startNav == null || startNav === 0) return ''
        let endNav = null
        for (let offset = 0; offset <= 7; offset++) {
          if (dateNavMap[col][targetMs + offset * 86400000] != null) { endNav = dateNavMap[col][targetMs + offset * 86400000]; break }
          if (dateNavMap[col][targetMs - offset * 86400000] != null) { endNav = dateNavMap[col][targetMs - offset * 86400000]; break }
        }
        if (endNav == null) return ''
        const cagr = (Math.pow(endNav / startNav, 1 / years) - 1) * 100
        return cagr.toFixed(2) + '%'
      })
      if (returns.some(v => v !== '')) rows.push([row[0], ...returns])
    })

    const stats = schemeCols.map((_, ci) => {
      const vals = rows.map(r => parseFloat(r[ci + 1])).filter(v => !isNaN(v)).sort((a, b) => a - b)
      if (vals.length === 0) return { median: '', avg: '' }
      const mid = Math.floor(vals.length / 2)
      const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length
      return { median: median.toFixed(2) + '%', avg: avg.toFixed(2) + '%' }
    })

    const hdr = ['Date', ...schemeCols]
    return [
      ['MEDIAN', ...stats.map(s => s.median)],
      ['AVERAGE', ...stats.map(s => s.avg)],
      Array(hdr.length).fill(''),
      hdr,
      ...rows,
    ]
  }

  const rolling3yr = buildRollingSheet(3)
  const rolling5yr = buildRollingSheet(5)

  // Beta & Std Deviation sheet
  // 1. Build monthly NAV table (first available date each month)
  const monthlyNavs = [] // [{ date, navs: [nav1, nav2, ...] }]
  const seen = new Set()
  trimmedRows.forEach(row => {
    const d = parseDDMMYYYY(row[0])
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (seen.has(key)) return
    seen.add(key)
    const navs = schemeCols.map((_, ci) => parseFloat(row[ci + 1]))
    monthlyNavs.push({ date: row[0], navs })
  })

  // 2. Monthly returns: ((current / previous) - 1) * 100
  const monthlyReturns = monthlyNavs.map((m, i) => {
    if (i === 0) return { date: m.date, returns: schemeCols.map(() => '') }
    const prev = monthlyNavs[i - 1]
    const returns = m.navs.map((nav, ci) => {
      const prevNav = prev.navs[ci]
      if (isNaN(nav) || isNaN(prevNav) || prevNav === 0) return ''
      return ((nav / prevNav - 1) * 100).toFixed(4)
    })
    return { date: m.date, returns }
  })

  // 3. Std Dev for each scheme
  const schemeReturnArrays = schemeCols.map((_, ci) =>
    monthlyReturns.map(r => parseFloat(r.returns[ci])).filter(v => !isNaN(v))
  )

  function stddev(arr) {
    if (arr.length < 2) return 0
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1)
    return Math.sqrt(variance)
  }

  function correlation(a, b) {
    if (a.length !== b.length || a.length < 2) return 0
    const meanA = a.reduce((s, v) => s + v, 0) / a.length
    const meanB = b.reduce((s, v) => s + v, 0) / b.length
    let num = 0, denA = 0, denB = 0
    for (let i = 0; i < a.length; i++) {
      const da = a[i] - meanA, db = b[i] - meanB
      num += da * db
      denA += da * da
      denB += db * db
    }
    const den = Math.sqrt(denA * denB)
    return den === 0 ? 0 : num / den
  }

  // 4. Market = equal-weighted average of all schemes' monthly returns
  const marketReturns = []
  for (let i = 0; i < monthlyReturns.length; i++) {
    const vals = schemeReturnArrays.map(arr => arr[i]).filter(v => v !== undefined && !isNaN(v))
    marketReturns.push(vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0)
  }
  // Align lengths — market starts from index where returns exist
  const validMarket = marketReturns.filter((_, i) => i > 0).slice(0)
  const marketStdDev = stddev(validMarket)

  const schemeStats = schemeCols.map((_, ci) => {
    const returns = schemeReturnArrays[ci]
    const sd = stddev(returns)
    // Align scheme returns with market for correlation
    const aligned = []
    const alignedMarket = []
    let mIdx = 0
    monthlyReturns.forEach((r, i) => {
      if (i === 0) return
      const val = parseFloat(r.returns[ci])
      if (!isNaN(val)) {
        aligned.push(val)
        alignedMarket.push(validMarket[mIdx] ?? 0)
      }
      mIdx++
    })
    const corr = correlation(aligned, alignedMarket)
    const beta = marketStdDev > 0 ? corr * (sd / marketStdDev) : 0
    return { sd: sd.toFixed(4), corr: corr.toFixed(4), beta: beta.toFixed(4) }
  })

  // 5. Build the sheet: stats rows, blank, two side-by-side tables
  const betaHeader = ['', ...schemeCols]
  const corrRow = ['CORRELATION', ...schemeStats.map(s => s.corr)]
  const betaRow = ['BETA', ...schemeStats.map(s => s.beta)]
  const sdRow = ['STD DEVIATION', ...schemeStats.map(s => s.sd)]
  const blank = Array(betaHeader.length).fill('')

  // Monthly NAV table + Monthly Return table side by side
  const navHeader = ['Date (NAV)', ...schemeCols]
  const retHeader = ['Date (Return %)', ...schemeCols]
  const combinedHeader = [...navHeader, '', ...retHeader]
  const maxRows = monthlyNavs.length
  const betaSheetRows = [
    ['CORRELATION', ...schemeStats.map(s => s.corr), '', 'CORRELATION', ...schemeStats.map(s => s.corr)],
    ['BETA', ...schemeStats.map(s => s.beta), '', 'BETA', ...schemeStats.map(s => s.beta)],
    ['STD DEVIATION', ...schemeStats.map(s => s.sd), '', 'STD DEVIATION', ...schemeStats.map(s => s.sd)],
    Array(combinedHeader.length).fill(''),
    combinedHeader,
  ]

  for (let i = 0; i < maxRows; i++) {
    const nav = monthlyNavs[i]
    const ret = monthlyReturns[i]
    const navCells = [nav.date, ...nav.navs.map(v => isNaN(v) ? '' : v)]
    const retCells = [ret.date, ...ret.returns]
    betaSheetRows.push([...navCells, '', ...retCells])
  }

  const betaSheet = betaSheetRows

  return { header, fullRows, trimmedRows, trimmedWithAth, athRow, rolling3yr, rolling5yr, betaSheet, latestStart }
}

/**
 * Single Responsibility: fetch and display NAV history for multiple schemes.
 * Open/Closed: new download formats can be added without modifying this component.
 */
function HistoryPanel(_, ref) {
  const [rows, setRows] = useState([{ id: Date.now(), val: '', start: '', end: '' }])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filteredSubsets, setFilteredSubsets] = useState({})

  const handleFilteredDataChange = useCallback((code, filteredData) => {
    setFilteredSubsets(prev => ({ ...prev, [code]: filteredData }))
  }, [])

  const handleBulkDownload = () => {
    const exportResults = results.map(r => {
      const code = r.meta.scheme_code
      return { ...r, data: filteredSubsets[code] || r.data }
    })
    downloadBulkZip(exportResults)
  }

  const updateRow = (id, field, value) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r))
  }
  const clearDates = (id) => {
    setRows(rows.map(r => r.id === id ? { ...r, start: '', end: '' } : r))
  }
  const addRow = () => {
    setRows(prev => [...prev, { id: Date.now(), val: '', start: '', end: '' }])
  }
  const addSchemeCode = useCallback((code) => {
    setRows(prev => {
      const empty = prev.find(r => !r.val.trim())
      if (empty) {
        return prev.map(r => r.id === empty.id ? { ...r, val: String(code) } : r)
      }
      return [...prev, { id: Date.now(), val: String(code), start: '', end: '' }]
    })
  }, [])

  const removeSchemeCode = useCallback((code) => {
    const str = String(code)
    setRows(prev => {
      const filtered = prev.filter(r => r.val.trim() !== str)
      return filtered.length > 0 ? filtered : [{ id: Date.now(), val: '', start: '', end: '' }]
    })
  }, [])

  useImperativeHandle(ref, () => ({ addSchemeCode, removeSchemeCode }), [addSchemeCode, removeSchemeCode])

  const removeRow = (id) => {
    if (rows.length > 1) setRows(rows.filter(r => r.id !== id))
  }

  const fetch_ = async (e) => {
    e?.preventDefault()
    const validRows = rows.filter(r => r.val.trim())
    if (validRows.length === 0) return

    setLoading(true); setError(null); setResults(null)
    try {
      const promises = validRows.map(r =>
        api.history(r.val.trim(), r.start || undefined, r.end || undefined).then(res => {
          res.reqStart = r.start
          res.reqEnd = r.end
          return res
        })
      )
      const responses = await Promise.all(promises)

      const validResults = responses.filter(res => res.status === 'SUCCESS')
      if (validResults.length === 0) {
        setError('No schemes found or valid data returned.')
      } else {
        setResults(validResults)
        if (validResults.length < validRows.length) {
          setError(`Warning: Some schemes were not found (${validRows.length - validResults.length} failed).`)
        }
      }
    } catch {
      setError('Failed to fetch. Check your connection.')
    } finally { setLoading(false) }
  }

  return (
    <Panel title="NAV History" subtitle="Full NAV history for one or multiple schemes">
      <form className={styles.form} onSubmit={fetch_}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {rows.map((r, i) => (
            <div key={r.id} className={styles.schemeRow}>
              <Field label="Scheme Code *">
                <input
                  className={styles.input}
                  value={r.val}
                  onChange={e => updateRow(r.id, 'val', e.target.value)}
                  placeholder="e.g. 125497"
                  required={i === 0}
                  style={{ minWidth: '140px' }}
                />
              </Field>
              <Field label="Start Date">
                <input type="date" className={styles.input} value={r.start} onChange={e => updateRow(r.id, 'start', e.target.value)} />
              </Field>
              <Field label="End Date">
                <input type="date" className={styles.input} value={r.end} onChange={e => updateRow(r.id, 'end', e.target.value)} />
              </Field>
              <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end', paddingBottom: '2px' }}>
                {(r.start || r.end) && (
                  <Btn type="button" onClick={() => clearDates(r.id)} small>Clear Dates</Btn>
                )}
                {rows.length > 1 && (
                  <Btn type="button" onClick={() => removeRow(r.id)} small>✕</Btn>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <Btn type="button" onClick={addRow} small>+ Add Scheme</Btn>
          <Btn type="submit" loading={loading}>Fetch History</Btn>
        </div>
      </form>

      {error && <ErrorBox msg={error} />}

      {loading && (
        <div className={styles.section}>
          <SkeletonCard />
          <Skeleton height={200} />
        </div>
      )}

      {!loading && results && results.length > 0 && (() => {
        const isAnyFiltered = results.some(r => {
          const code = r.meta.scheme_code
          return filteredSubsets[code] && filteredSubsets[code].length !== r.data.length
        })
        return (
          <div className={styles.section}>
            <SectionHeader
              label={`${results.length} Schemes Loaded`}
              action={
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Btn onClick={() => downloadBulkZip(results)}>⬇ Bulk ZIP</Btn>
                  {isAnyFiltered && (
                    <Btn onClick={handleBulkDownload}>⬇ Filtered ZIP</Btn>
                  )}
                  <Btn onClick={async () => {
                    const { header, fullRows, trimmedWithAth, rolling3yr, rolling5yr, betaSheet } = buildPivotData(results, filteredSubsets)
                    const zip = new JSZip()
                    const addCsv = (name, rows) => {
                      const ws = XLSX.utils.aoa_to_sheet(rows)
                      zip.file(name, XLSX.utils.sheet_to_csv(ws))
                    }
                    addCsv('bulk_full.csv', [header, ...fullRows])
                    addCsv('bulk_trimmed_ath.csv', trimmedWithAth)
                    addCsv('3yr_rolling_return.csv', rolling3yr)
                    addCsv('5yr_rolling_return.csv', rolling5yr)
                    addCsv('beta_std_dev.csv', betaSheet)
                    const blob = await zip.generateAsync({ type: 'blob' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = 'bulk_analysis.zip'; a.click()
                    setTimeout(() => URL.revokeObjectURL(url), 1000)
                  }}>⬇ Analysis ZIP</Btn>
                  <Btn onClick={() => {
                    const { header, fullRows, trimmedWithAth, rolling3yr, rolling5yr, betaSheet } = buildPivotData(results, filteredSubsets)
                    webExcelStore.addSheet('Bulk (Full)', [header, ...fullRows], [])
                    webExcelStore.addSheet('Bulk (Trimmed + ATH)', trimmedWithAth, [])
                    webExcelStore.addSheet('3yr Rolling Return', rolling3yr, [])
                    webExcelStore.addSheet('5yr Rolling Return', rolling5yr, [])
                    webExcelStore.addSheet('Beta & Std Dev', betaSheet, [])
                  }}>📊 To Excel</Btn>
                </div>
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {results.map((data) => (
                <Accordion
                  key={data.meta.scheme_code}
                  title={`${data.meta.scheme_code} - ${data.meta.scheme_name}`}
                  defaultOpen={results.length === 1}
                >
                  <NavResult
                    data={data}
                    startDate={data.reqStart}
                    endDate={data.reqEnd}
                    onFilteredDataChange={handleFilteredDataChange}
                  />
                </Accordion>
              ))}
            </div>
          </div>
        )
      })()}
    </Panel>
  )
}

export default forwardRef(HistoryPanel)
