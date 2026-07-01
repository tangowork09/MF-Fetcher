import { useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react'
import { api } from '../api'
import { downloadExcel, downloadBulkZip, downloadAnalysisXlsx, analysisSheetsForWebExcel } from '../excel'
import { Panel, SectionHeader, Field, Btn, ErrorBox, Accordion, SkeletonCard, Skeleton } from '../components/ui'
import { webExcelStore } from '../webExcelStore'
import NavResult from '../components/NavResult'
import styles from '../App.module.css'

// Real benchmark indices via api.mfapi.in index-fund NAVs (SEBI-TRI proxies).
const BENCHMARKS = [
  { label: 'None', code: '' },
  { label: 'Nifty 50 (UTI Index Fund)', code: '100822' },
  { label: 'Nifty Next 50', code: '149837' },
  { label: 'Nifty 500', code: '147625' },
  { label: 'BSE Sensex', code: '113269' },
  { label: 'Custom scheme code…', code: 'custom' },
]

function AnalyticsOptions({ rfr, setRfr, benchSel, setBenchSel, customCode, setCustomCode }) {
  return (
    <details className={styles.opt}>
      <summary className={styles.optSummary}>
        Analytics settings
        <span className={styles.optHint}>
          risk-free {rfr || '5.25'}%{benchSel ? ` · vs ${BENCHMARKS.find(b => b.code === benchSel)?.label || benchSel}` : ''}
        </span>
      </summary>
      <div className={styles.optBody}>
        <div className={styles.optRow}>
          <Field label="Risk-free rate (annual %)">
            <input className={styles.input} type="number" step="0.05" min="0" value={rfr}
              onChange={e => setRfr(e.target.value)} placeholder="5.25" />
          </Field>
          <Field label="Benchmark (for beta / alpha)">
            <select className={styles.input} value={benchSel} onChange={e => setBenchSel(e.target.value)}>
              {BENCHMARKS.map(b => <option key={b.code || 'none'} value={b.code}>{b.label}</option>)}
            </select>
          </Field>
          {benchSel === 'custom' && (
            <Field label="Benchmark scheme code">
              <input className={styles.input} value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder="e.g. 120716" />
            </Field>
          )}
        </div>
        <p className={styles.optNote}>
          Risk-free rate drives Sharpe / Sortino / Treynor (default 5.25% ≈ RBI repo, Jun 2026). The benchmark is a real
          index-fund NAV (Total-Return proxy) fetched from the same API — it adds beta, alpha, R², tracking error and
          capture ratios. Std dev is the sample (n-1) daily std dev annualized ×√252.
        </p>
      </div>
    </details>
  )
}

function HistoryPanel(_, ref) {
  const [rows, setRows] = useState([{ id: Date.now(), val: '', start: '', end: '' }])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filteredSubsets, setFilteredSubsets] = useState({})
  const [rfr, setRfr] = useState('5.25')
  const [benchSel, setBenchSel] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [bulkScope, setBulkScope] = useState('all') // 'all' | 'filter'
  const [busy, setBusy] = useState(false)
  const benchCache = useRef({})

  const handleFilteredDataChange = useCallback((code, filteredData) => {
    setFilteredSubsets(prev => ({ ...prev, [code]: filteredData }))
  }, [])

  const resolveOpts = useCallback(async (withFilter) => {
    const opts = { rfr: (parseFloat(rfr) || 5.25) / 100 }
    if (withFilter) opts.filteredSubsets = filteredSubsets
    const code = (benchSel === 'custom' ? customCode : benchSel).trim()
    if (code) {
      if (!benchCache.current[code]) benchCache.current[code] = await api.history(code).catch(() => null)
      const b = benchCache.current[code]
      if (b && b.status === 'SUCCESS') { opts.benchSeries = b.data; opts.benchMeta = b.meta }
    }
    return opts
  }, [rfr, benchSel, customCode, filteredSubsets])

  const run = useCallback(async (fn) => {
    setBusy(true)
    try { await fn() } catch (e) { setError('Export failed: ' + (e?.message || 'unknown error')) } finally { setBusy(false) }
  }, [])

  const scopedResults = () => bulkScope === 'filter'
    ? results.map(r => ({ ...r, data: filteredSubsets[r.meta.scheme_code] || r.data }))
    : results

  const downloadOne = useCallback(async (data, meta, filename) => {
    await run(async () => downloadExcel(data, meta, filename, await resolveOpts(false)))
  }, [run, resolveOpts])

  const handleBulkZip = () => run(async () => downloadBulkZip(scopedResults(), await resolveOpts(bulkScope === 'filter')))
  const handleComparison = () => run(async () => downloadAnalysisXlsx(scopedResults(), bulkScope === 'filter' ? filteredSubsets : {}, await resolveOpts(false)))
  const handleWebExcel = () => run(async () => {
    const sheets = analysisSheetsForWebExcel(scopedResults(), bulkScope === 'filter' ? filteredSubsets : {}, await resolveOpts(false))
    sheets.forEach(s => webExcelStore.addSheet(s.name, s.rows, []))
  })

  const updateRow = (id, field, value) => setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r))
  const clearDates = (id) => setRows(rows.map(r => r.id === id ? { ...r, start: '', end: '' } : r))
  const addRow = () => setRows(prev => [...prev, { id: Date.now(), val: '', start: '', end: '' }])
  const addSchemeCode = useCallback((code) => {
    setRows(prev => {
      const empty = prev.find(r => !r.val.trim())
      if (empty) return prev.map(r => r.id === empty.id ? { ...r, val: String(code) } : r)
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
  const removeRow = (id) => { if (rows.length > 1) setRows(rows.filter(r => r.id !== id)) }

  const fetch_ = async (e) => {
    e?.preventDefault()
    const validRows = rows.filter(r => r.val.trim())
    if (validRows.length === 0) return
    setLoading(true); setError(null); setResults(null)
    try {
      const responses = await Promise.all(validRows.map(r =>
        api.history(r.val.trim(), r.start || undefined, r.end || undefined).then(res => {
          res.reqStart = r.start; res.reqEnd = r.end; return res
        })
      ))
      const validResults = responses.filter(res => res.status === 'SUCCESS')
      if (validResults.length === 0) setError('No NAV data for those codes. Check the scheme codes and try again.')
      else {
        setResults(validResults)
        if (validResults.length < validRows.length) setError(`${validRows.length - validResults.length} of ${validRows.length} codes returned no data and were skipped.`)
      }
    } catch {
      setError('Couldn’t reach the fund API. Check your connection and try again.')
    } finally { setLoading(false) }
  }

  const anyFiltered = results && results.some(r => {
    const code = r.meta.scheme_code
    return filteredSubsets[code] && filteredSubsets[code].length !== r.data.length
  })

  return (
    <Panel title="NAV History" subtitle="Full NAV history + risk &amp; return analytics for one or many schemes">
      <form className={styles.form} onSubmit={fetch_}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {rows.map((r, i) => (
            <div key={r.id} className={styles.schemeRow}>
              <Field label={i === 0 ? 'Scheme Code *' : 'Scheme Code'}>
                <input className={styles.input} value={r.val} onChange={e => updateRow(r.id, 'val', e.target.value)}
                  placeholder="e.g. 125497" required={i === 0} style={{ minWidth: '140px' }} />
              </Field>
              <Field label="Start Date">
                <input type="date" className={styles.input} value={r.start} onChange={e => updateRow(r.id, 'start', e.target.value)} />
              </Field>
              <Field label="End Date">
                <input type="date" className={styles.input} value={r.end} onChange={e => updateRow(r.id, 'end', e.target.value)} />
              </Field>
              <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end', paddingBottom: '2px' }}>
                {(r.start || r.end) && <Btn type="button" variant="ghost" onClick={() => clearDates(r.id)} small>Clear Dates</Btn>}
                {rows.length > 1 && <Btn type="button" variant="ghost" onClick={() => removeRow(r.id)} small title="Remove this scheme">✕</Btn>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <Btn type="button" variant="secondary" onClick={addRow} small>+ Add Scheme</Btn>
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

      {!loading && results && results.length > 0 && (
        <div className={styles.section}>
          <SectionHeader label={`${results.length} scheme${results.length === 1 ? '' : 's'} loaded`} />

          <AnalyticsOptions
            rfr={rfr} setRfr={setRfr}
            benchSel={benchSel} setBenchSel={setBenchSel}
            customCode={customCode} setCustomCode={setCustomCode}
          />

          {results.length > 1 && (
            <div className={styles.exportBlock}>
              <div className={styles.exportHead}>
                <span className={styles.exportTitle}>Export {results.length} schemes</span>
              </div>
              <p className={styles.exportManifest}>
                <b>Download all (ZIP)</b>: one analytics workbook per scheme + a comparison workbook.&nbsp;
                <b>Comparison workbook</b>: every scheme side-by-side (Risk Comparison, ATH, 3Y/5Y rolling, full NAV) with real dates &amp; numbers.&nbsp;
                <b>Open in Web Excel</b>: same comparison, editable in-app.
              </p>
              {anyFiltered && (
                <div className={styles.segWrap}>
                  <span className={styles.segLabel}>Date range to export</span>
                  <div className={styles.seg}>
                    <button type="button" className={`${styles.segBtn} ${bulkScope === 'all' ? styles.segActive : ''}`} onClick={() => setBulkScope('all')}>Full history</button>
                    <button type="button" className={`${styles.segBtn} ${bulkScope === 'filter' ? styles.segActive : ''}`} onClick={() => setBulkScope('filter')}>Current filters</button>
                  </div>
                </div>
              )}
              <div className={styles.exportActions}>
                <Btn onClick={handleBulkZip} loading={busy}>⬇ Download all (ZIP)</Btn>
                <Btn variant="secondary" onClick={handleComparison} loading={busy}>⬇ Comparison workbook (.xlsx)</Btn>
                <Btn variant="secondary" onClick={handleWebExcel} loading={busy}>📊 Open comparison in Web Excel</Btn>
              </div>
            </div>
          )}

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
                  onDownload={downloadOne}
                  busy={busy}
                  hasBench={!!(benchSel === 'custom' ? customCode.trim() : benchSel)}
                />
              </Accordion>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

export default forwardRef(HistoryPanel)
