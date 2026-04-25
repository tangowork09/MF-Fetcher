import { useState, useRef, useCallback, useEffect } from 'react'
import { api } from '../api'
import { amfi } from '../amfi'
import { downloadSearchResultsExcel } from '../excel'
import { Panel, SearchBar, SectionHeader, Field, Btn, ErrorBox, Empty, SearchSelect, Accordion } from '../components/ui'
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

  // AMFI category filters
  const [amfiFilters, setAmfiFilters] = useState(null)
  const [subcategories, setSubcategories] = useState([])
  const [category, setCategory] = useState(0)
  const [subCategory, setSubCategory] = useState(0)
  const [fundHouse, setFundHouse] = useState(0)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseResults, setBrowseResults] = useState(null)

  useEffect(() => {
    amfi.filters().then(data => {
      setAmfiFilters(data)
      if (data.investmentTypeList?.length > 0) setCategory(data.investmentTypeList[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!category) { setSubcategories([]); setSubCategory(0); return }
    amfi.subcategories(category).then(data => {
      setSubcategories(data)
      setSubCategory(0)
    }).catch(() => {})
  }, [category])

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

  // Browse by category — search each fund house
  const runBrowse = async () => {
    setBrowseLoading(true); setError(null); setBrowseResults(null)
    try {
      let houses = []
      if (fundHouse) {
        // Specific fund house
        const found = amfiFilters?.mutualFundList.find(m => m.id === fundHouse)
        if (found) houses = [found]
      } else {
        // All fund houses
        houses = amfiFilters?.mutualFundList || []
      }

      const subCatName = subcategories.find(s => s.id === subCategory)?.name || ''
      const catName = amfiFilters?.investmentTypeList.find(c => c.id === category)?.name || ''
      const searchTerm = subCatName || catName

      // Search each fund house name + category
      const grouped = []
      await Promise.all(houses.map(async (house) => {
        try {
          const q = `${house.name.split(' ')[0]} ${searchTerm}`.trim()
          const data = await api.search(q)
          if (Array.isArray(data) && data.length > 0) {
            grouped.push({ house: house.name, schemes: data })
          }
        } catch {}
      }))

      grouped.sort((a, b) => a.house.localeCompare(b.house))
      setBrowseResults(grouped)
    } catch {
      setError('Browse failed.')
    } finally { setBrowseLoading(false) }
  }

  const filteredResults = results ? results.filter(r => {
    const cMatch = (r.schemeCode || '').toString().toLowerCase().includes(codeFilter.toLowerCase())
    const nMatch = (r.schemeName || '').toString().toLowerCase().includes(nameFilter.toLowerCase())
    return cMatch && nMatch
  }) : []
  const isFiltered = codeFilter || nameFilter

  const ResultRow = ({ r }) => (
    <div
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
            <button className={styles.removeHistoryBtn} onClick={(e) => { e.stopPropagation(); onRemoveFromHistory?.(r.schemeCode) }} title="Remove">✕</button>
          </div>
        ) : (
          <button className={styles.addToHistoryBtn} onClick={(e) => { e.stopPropagation(); onAddToHistory(r.schemeCode) }} title="Add to NAV History">+ Add</button>
        )
      )}
    </div>
  )

  return (
    <Panel title="Search Schemes" subtitle="Search by name or browse by category">
      <SearchBar
        value={query}
        onChange={handleInput}
        placeholder="e.g. HDFC, SBI, Mirae Asset, Axis..."
        loading={loading}
      />

      {error && <ErrorBox msg={error} />}

      {/* Search results */}
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
                  <Btn small onClick={() => downloadSearchResultsExcel(filteredResults)}>⬇ Excel</Btn>
                  <SendToExcel name="Search Results" data={filteredResults.map(r => ({ 'Scheme Code': r.schemeCode, 'Scheme Name': r.schemeName }))} />
                </div>
              )
            }
          />
          <div className={styles.resultList}>
            {filteredResults.length === 0
              ? <Empty msg="No schemes match filters" />
              : filteredResults.map(r => <ResultRow key={r.schemeCode} r={r} />)
            }
          </div>
        </div>
      )}

      {/* Category browse filters */}
      {amfiFilters && (
        <div className={styles.section}>
          <SectionHeader label="Browse by Category" />
          <div className={styles.filterBar} style={{ flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <Field label="Category">
                <SearchSelect options={[{ id: 0, name: 'Select...' }, ...amfiFilters.investmentTypeList]} value={category} onChange={setCategory} placeholder="Category..." />
              </Field>
              <Field label="Sub Category">
                <SearchSelect options={[{ id: 0, name: 'All' }, ...subcategories]} value={subCategory} onChange={setSubCategory} placeholder="Sub category..." />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%' }}>
              <Field label="Fund House">
                <SearchSelect options={[{ id: 0, name: 'All Fund Houses' }, ...amfiFilters.mutualFundList]} value={fundHouse} onChange={setFundHouse} placeholder="Fund house..." />
              </Field>
              <Btn small onClick={runBrowse} loading={browseLoading}>Browse</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Browse results — grouped by fund house */}
      {browseResults && (
        <div className={styles.section}>
          <SectionHeader label={`${browseResults.length} fund houses · ${browseResults.reduce((s, g) => s + g.schemes.length, 0)} schemes`} />
          {browseResults.length === 0 && <Empty msg="No schemes found for selected filters" />}
          <div className={styles.accordionStack}>
            {browseResults.map(group => (
              <Accordion key={group.house} title={`${group.house} (${group.schemes.length})`}>
                <div className={styles.resultList}>
                  {group.schemes.map(r => <ResultRow key={r.schemeCode} r={r} />)}
                </div>
              </Accordion>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
