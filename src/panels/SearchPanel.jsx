import { useState, useRef, useCallback, useEffect } from 'react'
import { api } from '../api'
import { downloadSearchResultsExcel } from '../excel'
import { Panel, SearchBar, SectionHeader, Field, Btn, ErrorBox, Empty } from '../components/ui'
import SendToExcel from '../components/SendToExcel'
import styles from '../App.module.css'

export default function SearchPanel({ onSchemeSelect, onAddToHistory, onRemoveFromHistory, historyCodes }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [codeFilter, setCodeFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const debounce = useRef(null)

  useEffect(() => () => clearTimeout(debounce.current), [])

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
          <div className={styles.filterBar}>
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
                <div className={styles.actions}>
                  <Btn small onClick={() => downloadSearchResultsExcel(filteredResults)}>
                    ⬇ Download {isFiltered ? 'Filtered ' : ''}Excel
                  </Btn>
                  <SendToExcel
                    name="Search Results"
                    data={filteredResults.map(r => ({ 'Scheme Code': r.schemeCode, 'Scheme Name': r.schemeName }))}
                  />
                </div>
              )
            }
          />
          <div className={styles.resultList}>
            {filteredResults.length === 0
              ? <Empty msg="No schemes match filters" />
              : filteredResults.map(r => (
                <div
                  key={r.schemeCode}
                  className={`${styles.resultItem} ${selected?.schemeCode === r.schemeCode ? styles.resultItemActive : ''}`}
                  onClick={() => { setSelected(r); onSchemeSelect?.(r) }}
                  role="button"
                  tabIndex={0}
                >
                  <span className={styles.schemeCode}>{r.schemeCode}</span>
                  <span className={styles.schemeName}>{r.schemeName}</span>
                  {onAddToHistory && (
                    historyCodes?.has(String(r.schemeCode)) ? (
                      <div className={styles.historyBtns}>
                        <span className={styles.addedBadge}>Added</span>
                        <button
                          className={styles.removeHistoryBtn}
                          onClick={(e) => { e.stopPropagation(); onRemoveFromHistory?.(r.schemeCode) }}
                          title="Remove from NAV History"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.addToHistoryBtn}
                        onClick={(e) => { e.stopPropagation(); onAddToHistory(r.schemeCode) }}
                        title="Add to NAV History"
                      >
                        + Add
                      </button>
                    )
                  )}
                </div>
              ))
            }
          </div>
        </div>
      )}

    </Panel>
  )
}
