import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { amfi } from '../amfi'
import { downloadSearchResultsExcel } from '../excel'
import { Panel, SearchBar, SectionHeader, Field, Btn, ErrorBox, Empty, SearchSelect, Accordion, Skeleton } from '../components/ui'
import SendToExcel from '../components/SendToExcel'
import styles from '../App.module.css'

function FilterableGroup({ group, ResultRow }) {
  const [filter, setFilter] = useState('')
  const filtered = filter
    ? group.schemes.filter(r =>
        r.schemeName.toLowerCase().includes(filter.toLowerCase()) ||
        String(r.schemeCode).includes(filter)
      )
    : group.schemes

  return (
    <Accordion title={`${group.house} (${filtered.length}/${group.schemes.length})`}>
      <input
        className={styles.input}
        placeholder="Filter schemes..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div className={styles.resultList}>
        {filtered.length === 0
          ? <Empty msg="No match" />
          : filtered.map(r => <ResultRow key={r.schemeCode} r={r} />)
        }
      </div>
    </Accordion>
  )
}

export default function SearchPanel({ onSchemeSelect, onAddToHistory, onRemoveFromHistory, historyCodes }) {
  const [allSchemes, setAllSchemes] = useState([])
  const [schemesLoading, setSchemesLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [codeFilter, setCodeFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')

  // AMFI category filters
  const [amfiFilters, setAmfiFilters] = useState(null)
  const [subcategories, setSubcategories] = useState([])
  const [category, setCategory] = useState(0)
  const [subCategory, setSubCategory] = useState(0)
  const [fundHouse, setFundHouse] = useState(0)
  const [browseResults, setBrowseResults] = useState(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedHouses, setSelectedHouses] = useState(null)

  // Load ALL schemes once
  useEffect(() => {
    fetch('https://api.mfapi.in/mf')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setAllSchemes(data)
      })
      .catch(() => setError('Failed to load scheme list'))
      .finally(() => setSchemesLoading(false))
  }, [])

  // Load AMFI filters
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

  // Client-side search — split into words, match ALL independently
  const searchResults = useMemo(() => {
    if (!query.trim() || allSchemes.length === 0) return null
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0)
    return allSchemes.filter(s => {
      const name = (s.schemeName || '').toLowerCase()
      const code = String(s.schemeCode)
      return words.every(w => name.includes(w) || code.includes(w))
    })
  }, [query, allSchemes])

  const filteredResults = searchResults ? searchResults.filter(r => {
    const cMatch = (r.schemeCode || '').toString().toLowerCase().includes(codeFilter.toLowerCase())
    const nMatch = (r.schemeName || '').toString().toLowerCase().includes(nameFilter.toLowerCase())
    return cMatch && nMatch
  }) : []
  const isFiltered = codeFilter || nameFilter

  // Browse by category — filter from local data
  const runBrowse = () => {
    if (allSchemes.length === 0) return
    const subCatName = subcategories.find(s => s.id === subCategory)?.name?.split(' ')[0]?.toLowerCase() || ''

    let houses = []
    if (fundHouse) {
      const found = amfiFilters?.mutualFundList.find(m => m.id === fundHouse)
      if (found) houses = [found]
    } else {
      houses = amfiFilters?.mutualFundList || []
    }

    const grouped = []
    houses.forEach(house => {
      const cleanName = house.name.replace(/\s*mutual\s*fund\s*/gi, ' ').trim().toLowerCase()
      const schemes = allSchemes.filter(s => {
        const name = s.schemeName?.toLowerCase() || ''
        const matchesHouse = cleanName.split(' ').some(word => word.length > 2 && name.includes(word))
        const matchesCat = !subCatName || name.includes(subCatName)
        return matchesHouse && matchesCat
      })
      if (schemes.length > 0) {
        grouped.push({ house: house.name, schemes })
      }
    })

    grouped.sort((a, b) => a.house.localeCompare(b.house))
    setBrowseResults(grouped)
  }

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
    <Panel title="Search Schemes" subtitle={`${allSchemes.length.toLocaleString()} schemes loaded · instant search`}>
      {schemesLoading ? (
        <Skeleton lines={3} />
      ) : (
        <>
          <SearchBar
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or code..."
            loading={schemesLoading}
          />

          {error && <ErrorBox msg={error} />}

          {/* Search results */}
          {searchResults !== null && (
            <div className={styles.section}>
              <div className={styles.filterBar}>
                <Field label="Filter Code">
                  <input className={styles.input} placeholder="e.g. 125" value={codeFilter} onChange={e => setCodeFilter(e.target.value)} />
                </Field>
                <Field label="Filter Name">
                  <input className={styles.input} placeholder="e.g. Direct Growth" value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
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
                  ? <Empty msg="No schemes match" />
                  : filteredResults.slice(0, 200).map(r => <ResultRow key={r.schemeCode} r={r} />)
                }
                {filteredResults.length > 200 && (
                  <div className={styles.empty}>Showing 200 of {filteredResults.length} — narrow your search</div>
                )}
              </div>
            </div>
          )}

         
        </>
      )}
    </Panel>
  )
}
