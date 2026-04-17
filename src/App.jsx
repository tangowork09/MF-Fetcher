import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from './api'
import { downloadExcel, downloadSearchResultsExcel, downloadBulkZip } from './excel'
import styles from './App.module.css'

const TABS = ['Search', 'NAV History', 'Latest NAV', 'Browse All']

export default function App() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div className={styles.app}>
      <Header />
      <nav className={styles.tabs}>
        {TABS.map((t, i) => (
          <button
            key={t}
            className={`${styles.tab} ${activeTab === i ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(i)}
          >
            <span className={styles.tabDot} />
            {t}
          </button>
        ))}
      </nav>
      <main className={styles.main}>
        {activeTab === 0 && <SearchPanel />}
        {activeTab === 1 && <HistoryPanel />}
        {activeTab === 2 && <LatestPanel />}
        {activeTab === 3 && <BrowsePanel />}
      </main>
    </div>
  )
}

/* ─────────────────────────────────── HEADER ─── */
function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 17L9 11L13 15L21 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 7H21V11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span>MF<b>API</b> Explorer</span>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.badge}>🇮🇳 Indian Mutual Funds</span>
          <span className={styles.badge}>Free &amp; Open API</span>
        </div>
      </div>
    </header>
  )
}

/* ─────────────────────────────────── SEARCH ─── */
function SearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [codeFilter, setCodeFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const debounce = useRef(null)

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults(null); return }
    setLoading(true); setError(null)
    try {
      const data = await api.search(q)
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to fetch. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => runSearch(val), 400)
  }

  const filteredResults = results ? results.filter(r => {
    const cMatch = (r.schemeCode || '').toString().toLowerCase().includes(codeFilter.toLowerCase())
    const nMatch = (r.schemeName || '').toString().toLowerCase().includes(nameFilter.toLowerCase())
    return cMatch && nMatch
  }) : []
  const isFiltered = codeFilter || nameFilter

  return (
    <Panel title="Search Schemes" subtitle="Find mutual fund schemes by name — debounced live search">
      <SearchBar
        value={query}
        onChange={handleInput}
        placeholder="e.g. HDFC, SBI, Mirae Asset, Axis..."
        loading={loading}
      />

      {error && <ErrorBox msg={error} />}

      {results !== null && (
        <div className={styles.section}>
          <div style={{ display: 'flex', gap: '10px', background: 'var(--surface2)', padding: '10px', borderRadius: 'var(--radius)' }}>
            <Field label="Filter Code">
              <input className={styles.input} placeholder="e.g. 125" value={codeFilter} onChange={e => setCodeFilter(e.target.value)} />
            </Field>
            <Field label="Filter Name">
              <input className={styles.input} placeholder="e.g. Axis" value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
            </Field>
          </div>
          <SectionHeader
            label={`${filteredResults.length} results`}
            action={
              filteredResults.length > 0 && (
                <Btn small onClick={() => downloadSearchResultsExcel(filteredResults)}>
                  ⬇ Download {isFiltered ? 'Filtered ' : ''}Excel
                </Btn>
              )
            }
          />
          <div className={styles.resultList}>
            {filteredResults.length === 0
              ? <Empty msg="No schemes match filters" />
              : filteredResults.map(r => (
                <button
                  key={r.schemeCode}
                  className={`${styles.resultItem} ${selected?.schemeCode === r.schemeCode ? styles.resultItemActive : ''}`}
                  onClick={() => setSelected(r)}
                >
                  <span className={styles.schemeCode}>{r.schemeCode}</span>
                  <span className={styles.schemeName}>{r.schemeName}</span>
                </button>
              ))
            }
          </div>
        </div>
      )}

      {selected && <SchemeQuickView code={selected.schemeCode} name={selected.schemeName} />}
    </Panel>
  )
}

/* ─────────────────────────────────── HISTORY ─── */
function HistoryPanel() {
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
      return {
        ...r,
        data: filteredSubsets[code] || r.data
      }
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
    setRows([...rows, { id: Date.now(), val: '', start: '', end: '' }])
  }
  const removeRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id))
    }
  }

  const fetch_ = async (e) => {
    e?.preventDefault()
    const validRows = rows.filter(r => r.val.trim())
    if (validRows.length === 0) return
    
    setLoading(true); setError(null); setResults(null)
    try {
      const promises = validRows.map(r => 
        api.history(r.val.trim(), r.start || undefined, r.end || undefined).then(res => {
          res.reqStart = r.start;
          res.reqEnd = r.end;
          return res;
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
            <div key={r.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface2)', padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
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
                <input
                  type="date"
                  className={styles.input}
                  value={r.start}
                  onChange={e => updateRow(r.id, 'start', e.target.value)}
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  className={styles.input}
                  value={r.end}
                  onChange={e => updateRow(r.id, 'end', e.target.value)}
                />
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
      
      {results && results.length > 0 && (() => {
        const isAnyFiltered = results.some(r => {
          const code = r.meta.scheme_code
          return filteredSubsets[code] && filteredSubsets[code].length !== r.data.length
        })
        return (
          <div className={styles.section}>
            <SectionHeader 
              label={`${results.length} Schemes Loaded`} 
              action={
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Btn onClick={() => downloadBulkZip(results)}>
                    ⬇ Download Bulk (ZIP)
                  </Btn>
                  {isAnyFiltered && (
                    <Btn onClick={handleBulkDownload}>
                      ⬇ Download Filtered Bulk Data
                    </Btn>
                  )}
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

/* ─────────────────────────────────── LATEST ─── */
function LatestPanel() {
  const [code, setCode] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetch_ = async (e) => {
    e?.preventDefault()
    if (!code.trim()) return
    setLoading(true); setError(null); setData(null)
    try {
      const res = await api.latest(code.trim())
      if (res.status === 'SUCCESS') setData(res)
      else setError('Scheme not found')
    } catch {
      setError('Failed to fetch. Check your connection.')
    } finally { setLoading(false) }
  }

  return (
    <Panel title="Latest NAV" subtitle="Get the most recent NAV for any scheme code">
      <form className={styles.form} onSubmit={fetch_}>
        <div className={styles.formRow}>
          <Field label="Scheme Code *">
            <input
              className={styles.input}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="e.g. 125497"
              required
            />
          </Field>
        </div>
        <Btn type="submit" loading={loading}>Get Latest NAV</Btn>
      </form>

      {error && <ErrorBox msg={error} />}
      {data && (
        <div className={styles.section}>
          <MetaCard meta={data.meta} />
          <div className={styles.navHighlight}>
            <div className={styles.navHighlightLabel}>Latest NAV</div>
            <div className={styles.navHighlightValue}>₹{parseFloat(data.data[0]?.nav).toFixed(4)}</div>
            <div className={styles.navHighlightDate}>{data.data[0]?.date}</div>
          </div>
          <div className={styles.actions}>
            <Btn onClick={() => downloadExcel(data.data, data.meta, `${data.meta.scheme_code} - ${data.meta.scheme_name} - latest.xlsx`)}>
              ⬇ Download Excel
            </Btn>
            <JsonPreview data={data} />
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ─────────────────────────────────── BROWSE ─── */
function BrowsePanel() {
  const [schemes, setSchemes] = useState([])
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [total, setTotal] = useState(null)
  const [codeFilter, setCodeFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')

  const fetch_ = async () => {
    setLoading(true); setError(null)
    try {
      const res = await api.list(limit, offset)
      const arr = Array.isArray(res) ? res : (res.data || res.schemes || [])
      setSchemes(arr)
      if (res.total) setTotal(res.total)
    } catch {
      setError('Failed to fetch schemes list.')
    } finally { setLoading(false) }
  }

  return (
    <Panel title="Browse All Schemes" subtitle="Paginated listing of all available mutual fund schemes">
      <div className={styles.form}>
        <div className={styles.formRow}>
          <Field label="Limit">
            <select className={styles.input} value={limit} onChange={e => setLimit(+e.target.value)}>
              {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Offset">
            <input
              type="number"
              className={styles.input}
              value={offset}
              min={0}
              onChange={e => setOffset(+e.target.value)}
            />
          </Field>
        </div>
        <Btn onClick={fetch_} loading={loading}>Load Schemes</Btn>
      </div>

      {error && <ErrorBox msg={error} />}

      {(() => {
        const filteredSchemes = schemes.filter(s => {
          const code = (s.schemeCode || s.Scheme_Code || '').toString().toLowerCase()
          const name = (s.schemeName || s.Scheme_Name || '').toString().toLowerCase()
          return code.includes(codeFilter.toLowerCase()) && name.includes(nameFilter.toLowerCase())
        })
        const isFiltered = codeFilter || nameFilter
        return (
          <>

      {schemes.length > 0 && (
        <div className={styles.section}>
          <div style={{ display: 'flex', gap: '10px', background: 'var(--surface2)', padding: '10px', borderRadius: 'var(--radius)' }}>
            <Field label="Filter Code">
              <input className={styles.input} placeholder="e.g. 125" value={codeFilter} onChange={e => setCodeFilter(e.target.value)} />
            </Field>
            <Field label="Filter Name">
              <input className={styles.input} placeholder="e.g. Axis" value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
            </Field>
          </div>
          <SectionHeader
            label={`${filteredSchemes.length} schemes${total ? ` of ${total}` : ''}`}
            action={
              <Btn small onClick={() => downloadSearchResultsExcel(filteredSchemes.map(s => ({
                schemeCode: s.schemeCode || s.Scheme_Code,
                schemeName: s.schemeName || s.Scheme_Name,
              })))}>
                ⬇ Download {isFiltered ? 'Filtered ' : ''}Excel
              </Btn>
            }
          />
          <div className={styles.resultList}>
            {filteredSchemes.length === 0 ? <Empty msg="No schemes match filters" /> : filteredSchemes.map((s, i) => (
              <div key={s.schemeCode || i} className={styles.resultItem}>
                <span className={styles.schemeCode}>{s.schemeCode || s.Scheme_Code}</span>
                <span className={styles.schemeName}>{s.schemeName || s.Scheme_Name}</span>
              </div>
            ))}
          </div>
          <div className={styles.pagination}>
            <Btn small disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - limit)); setTimeout(fetch_, 0) }}>
              ← Prev
            </Btn>
            <span className={styles.paginationInfo}>Offset {offset}</span>
            <Btn small onClick={() => { setOffset(offset + limit); setTimeout(fetch_, 0) }}>
              Next →
            </Btn>
          </div>
        </div>
        )}
        </>
        )
      })()}
    </Panel>
  )
}

/* ─────────────────────────────── QUICK VIEW ─── */
function SchemeQuickView({ code, name }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData(null); setLoading(true); setError(null)
    api.latest(code)
      .then(res => {
        if (res.status === 'SUCCESS') setData(res)
        else setError('Could not load')
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [code])

  return (
    <div className={styles.quickView}>
      <div className={styles.quickViewTitle}>{name}</div>
      {loading && <Spinner />}
      {error && <span className={styles.errorInline}>{error}</span>}
      {data && (
        <>
          <MetaCard meta={data.meta} compact />
          <div className={styles.navHighlight}>
            <div className={styles.navHighlightLabel}>Latest NAV</div>
            <div className={styles.navHighlightValue}>₹{parseFloat(data.data[0]?.nav).toFixed(4)}</div>
            <div className={styles.navHighlightDate}>{data.data[0]?.date}</div>
          </div>
          <div className={styles.actions}>
            <Btn small onClick={() => downloadExcel(data.data, data.meta, `${data.meta.scheme_code} - ${data.meta.scheme_name} - latest.xlsx`)}>
              ⬇ Latest Excel
            </Btn>
            <Btn small onClick={async () => {
              const full = await api.history(code)
              if (full.status === 'SUCCESS') downloadExcel(full.data, full.meta, `${full.meta.scheme_code} - ${full.meta.scheme_name} - all.xlsx`)
            }}>
              ⬇ Full History
            </Btn>
          </div>
        </>
      )}
    </div>
  )
}

/* ──────────────────────────── NAV RESULT ─── */
function NavResult({ data, startDate, endDate, onFilteredDataChange }) {
  const { meta, data: navData } = data
  const [dateFilter, setDateFilter] = useState('')
  const [priceFilter, setPriceFilter] = useState('')

  const filteredData = navData.filter(row => {
    const dMatch = row.date.toLowerCase().includes(dateFilter.toLowerCase())
    const pMatch = row.nav.toLowerCase().includes(priceFilter.toLowerCase())
    return dMatch && pMatch
  })

  useEffect(() => {
    if (onFilteredDataChange) {
      onFilteredDataChange(meta.scheme_code, filteredData)
    }
  }, [dateFilter, priceFilter, navData, meta.scheme_code]) // eslint-disable-line

  const isFiltered = dateFilter || priceFilter

  const datePart = (startDate || endDate) 
    ? `${startDate || ''}-${endDate || ''}`.replace(/^-|-$/g, '') 
    : 'all';
  const filename = `${meta.scheme_code} - ${meta.scheme_name} - ${datePart}.xlsx`;

  return (
    <div className={styles.section}>
      <MetaCard meta={meta} />
      
      <div style={{ display: 'flex', gap: '10px', background: 'var(--surface2)', padding: '10px', borderRadius: 'var(--radius)' }}>
        <Field label="Filter Date">
          <input className={styles.input} placeholder="e.g. 2026-04" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </Field>
        <Field label="Filter Price">
          <input className={styles.input} placeholder="e.g. 18." value={priceFilter} onChange={e => setPriceFilter(e.target.value)} />
        </Field>
      </div>

      <SectionHeader label={`${filteredData.length} NAV records`} action={
        <Btn small onClick={() => downloadExcel(filteredData, meta, filename)}>
          ⬇ Download {isFiltered ? 'Filtered ' : ''}Excel
        </Btn>
      } />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>NAV (₹)</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.slice(0, 200).map((row, i) => (
              <tr key={i}>
                <td className={styles.rowNum}>{i + 1}</td>
                <td>{row.date}</td>
                <td className={styles.navCell}>{parseFloat(row.nav).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredData.length > 200 && (
          <p className={styles.truncNote}>Showing first 200 of {filteredData.length} rows — download Excel for full data.</p>
        )}
      </div>
      <JsonPreview data={{ meta, data: filteredData }} />
    </div>
  )
}

/* ──────────────────────────────── META CARD ─── */
function MetaCard({ meta, compact }) {
  if (!meta) return null
  const fields = [
    ['Fund House', meta.fund_house],
    ['Scheme Name', meta.scheme_name],
    ['Type', meta.scheme_type],
    ['Category', meta.scheme_category],
    ['Code', meta.scheme_code],
    ['ISIN Growth', meta.isin_growth],
  ].filter(([, v]) => v)

  return (
    <div className={`${styles.metaCard} ${compact ? styles.metaCardCompact : ''}`}>
      {fields.map(([k, v]) => (
        <div key={k} className={styles.metaField}>
          <span className={styles.metaKey}>{k}</span>
          <span className={styles.metaVal}>{v}</span>
        </div>
      ))}
    </div>
  )
}

/* ──────────────────────────── JSON PREVIEW ─── */
function JsonPreview({ data }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.jsonWrap}>
      <button className={styles.jsonToggle} onClick={() => setOpen(o => !o)}>
        {open ? '▾ Hide' : '▸ View'} Raw JSON
      </button>
      {open && (
        <pre className={styles.jsonPre}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

/* ─────────────────────────── SMALL COMPONENTS ─── */
function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.accordionWrap}>
      <button type="button" className={styles.accordionHeader} onClick={() => setOpen(!open)}>
        <span className={styles.accordionTitle}>{title}</span>
        <span className={styles.accordionIcon}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className={styles.accordionBody}>{children}</div>}
    </div>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <p className={styles.panelSub}>{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function SearchBar({ value, onChange, placeholder, loading }) {
  return (
    <div className={styles.searchWrap}>
      <span className={styles.searchIcon}>
        {loading
          ? <svg className={styles.spin} width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        }
      </span>
      <input
        className={styles.searchInput}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus
      />
    </div>
  )
}

function SectionHeader({ label, action }) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionLabel}>{label}</span>
      {action}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  )
}

function Btn({ children, onClick, type = 'button', loading, disabled, small }) {
  return (
    <button
      type={type}
      className={`${styles.btn} ${small ? styles.btnSmall : ''}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <><Spinner inline /> Loading…</> : children}
    </button>
  )
}

function Spinner({ inline }) {
  return (
    <svg
      className={`${styles.spin} ${inline ? styles.spinInline : styles.spinBlock}`}
      width="16" height="16" viewBox="0 0 24 24" fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20"/>
    </svg>
  )
}

function ErrorBox({ msg }) {
  return <div className={styles.error}>{msg}</div>
}

function Empty({ msg }) {
  return <div className={styles.empty}>{msg}</div>
}
