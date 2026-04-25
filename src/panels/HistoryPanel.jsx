import { useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { api } from '../api'
import { downloadBulkZip } from '../excel'
import { Panel, SectionHeader, Field, Btn, ErrorBox, Accordion, SkeletonCard, Skeleton } from '../components/ui'
import SendToExcel from '../components/SendToExcel'
import { webExcelStore } from '../webExcelStore'
import NavResult from '../components/NavResult'
import styles from '../App.module.css'

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
                  <Btn onClick={() => downloadBulkZip(results)}>⬇ Download Bulk (ZIP)</Btn>
                  {isAnyFiltered && (
                    <Btn onClick={handleBulkDownload}>⬇ Download Filtered Bulk Data</Btn>
                  )}
                  <Btn onClick={() => {
                    // Build pivoted sheet: Date | Scheme1 NAV | Scheme2 NAV | ...
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
                    const parseDDMMYYYY = (s) => { const [d,m,y] = s.split('-'); return new Date(`${y}-${m}-${d}`) }
                    const sortedDates = [...dateMap.keys()].sort((a, b) => parseDDMMYYYY(a) - parseDDMMYYYY(b))
                    const header = ['Date', ...schemeCols]
                    const rows = sortedDates.map(date => {
                      const entry = dateMap.get(date)
                      return [date, ...schemeCols.map(col => entry[col] ?? '')]
                    })
                    webExcelStore.addSheet('Bulk Worksheet', [header, ...rows], [])
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
