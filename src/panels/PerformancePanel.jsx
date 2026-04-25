import { useState, useEffect, useRef, Fragment } from 'react'
import { amfi } from '../amfi'
import * as XLSX from 'xlsx'
import { Panel, Field, Btn, ErrorBox, Skeleton, SectionHeader, SearchSelect, DatePicker } from '../components/ui'
import SendToExcel from '../components/SendToExcel'
import styles from '../App.module.css'

function ColumnGroupFilter({ values, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [flipLeft, setFlipLeft] = useState(false)
  const ref = useRef(null)
  const openRef = useRef(false)
  openRef.current = open

  useEffect(() => {
    const handler = (e) => {
      if (openRef.current && ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unique = [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)))
  const filtered = search ? unique.filter(v => String(v).toLowerCase().includes(search.toLowerCase())) : unique
  const isAllSelected = !selected || selected.size === 0
  const hasFilter = selected && selected.size > 0 && selected.size < unique.length

  const toggle = (val) => {
    const next = new Set(selected || unique)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    onChange(next.size === unique.length ? null : next)
  }

  const selectAll = () => onChange(null)
  const clearAll = () => onChange(new Set())

  return (
    <span className={styles.groupFilterWrap} ref={ref}>
      <button
        type="button"
        className={`${styles.groupFilterBtn} ${hasFilter ? styles.groupFilterActive : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (!open && ref.current) {
            const rect = ref.current.getBoundingClientRect()
            setFlipLeft(rect.left + 220 > window.innerWidth)
          }
          setOpen(!open)
          setSearch('')
        }}
        title="Filter values"
      >
        ▼
      </button>
      {open && (
        <div className={styles.groupFilterDropdown} style={flipLeft ? { left: 'auto', right: 0 } : undefined} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
          <input
            className={styles.groupFilterSearch}
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.groupFilterActions}>
            <button type="button" onClick={selectAll}>All</button>
            <button type="button" onClick={clearAll}>None</button>
          </div>
          <div className={styles.groupFilterList}>
            {filtered.map((v, i) => {
              const checked = isAllSelected || (selected && selected.has(v))
              return (
                <label key={i} className={styles.groupFilterItem}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(v)} />
                  <span>{v == null || v === '' ? '(empty)' : String(v)}</span>
                </label>
              )
            })}
            {filtered.length === 0 && <div className={styles.groupFilterEmpty}>No matches</div>}
          </div>
        </div>
      )}
    </span>
  )
}

function ReturnCell({ val }) {
  if (val == null) return <td style={{ color: 'var(--text-faint)' }}>—</td>
  return <td style={{ color: val >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{val.toFixed(2)}</td>
}

function SortTh({ col, filterKey, children, placeholder, groupKey, groupValues, sortCol, sortAsc, onSort, colFilters, onFilter, groupFilters, onGroupFilter }) {
  return (
    <th>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', flex: 1 }}>
          {children} {sortCol === col ? (sortAsc ? '↑' : '↓') : ''}
        </span>
        {groupKey && groupValues && (
          <ColumnGroupFilter
            values={groupValues}
            selected={groupFilters[groupKey]}
            onChange={(sel) => onGroupFilter(groupKey, sel)}
          />
        )}
      </div>
      <input
        className={styles.colFilter}
        placeholder={placeholder || '...'}
        value={colFilters[filterKey] || ''}
        onChange={e => onFilter(filterKey, e.target.value)}
        onClick={e => e.stopPropagation()}
        style={{ marginTop: 4 }}
      />
    </th>
  )
}

export default function PerformancePanel() {
  const [filters, setFilters] = useState(null)
  const [subcategories, setSubcategories] = useState([])
  const [maturityType, setMaturityType] = useState(1)
  const [category, setCategory] = useState(1)
  const [subCategory, setSubCategory] = useState(1)
  const [mfid, setMfid] = useState(0)
  const [reportDate, setReportDate] = useState('')
  const [colFilters, setColFilters] = useState({})
  const [sortCol, setSortCol] = useState(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [groupFilters, setGroupFilters] = useState({})

  const setFilter = (col, val) => setColFilters(prev => ({ ...prev, [col]: val }))
  const setGroupFilter = (col, selected) => setGroupFilters(prev => ({ ...prev, [col]: selected }))
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filtersLoading, setFiltersLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load filters on mount
  useEffect(() => {
    amfi.filters()
      .then(data => {
        setFilters(data)
        setReportDate(data.reportDate || '')
      })
      .catch(() => setError('Failed to load filters'))
      .finally(() => setFiltersLoading(false))
  }, [])

  // Load subcategories when category changes
  useEffect(() => {
    if (!category) return
    setSubcategories([])
    setSubCategory('')
    amfi.subcategories(category)
      .then(data => {
        setSubcategories(data)
        if (data.length > 0) setSubCategory(data[0].id)
      })
      .catch(() => {})
  }, [category])

  const fetchPerformance = async () => {
    if (!subCategory || !reportDate) return
    setLoading(true); setError(null); setResults(null)
    try {
      const data = await amfi.performance({ maturityType, category, subCategory, mfid, reportDate })
      setResults(data)
    } catch {
      setError('Failed to fetch performance data.')
    } finally { setLoading(false) }
  }

  const returnCols = [
    ['1Y', 'return1YearRegular', 'return1YearDirect', 'return1YearBenchmark'],
    ['3Y', 'return3YearRegular', 'return3YearDirect', 'return3YearBenchmark'],
    ['5Y', 'return5YearRegular', 'return5YearDirect', 'return5YearBenchmark'],
    ['10Y', 'return10YearRegular', 'return10YearDirect', 'return10YearBenchmark'],
  ]

  return (
    <Panel title="Fund Performance" subtitle="AMFI India fund performance data with returns and AUM">
      {filtersLoading ? (
        <Skeleton lines={4} />
      ) : filters ? (
        <>
          <div className={styles.form}>
            <div className={styles.formRow}>
              <Field label="Maturity Type">
                <select className={styles.input} value={maturityType} onChange={e => setMaturityType(+e.target.value)}>
                  {filters.maturityTypeList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <SearchSelect
                  options={filters.investmentTypeList}
                  value={category}
                  onChange={setCategory}
                  placeholder="Select category..."
                />
              </Field>
              <Field label="Sub Category">
                <SearchSelect
                  options={subcategories}
                  value={subCategory}
                  onChange={setSubCategory}
                  placeholder="Select sub category..."
                />
              </Field>
            </div>
            <div className={styles.formRow}>
              <Field label="Fund House">
                <SearchSelect
                  options={[{ id: 0, name: 'All' }, ...filters.mutualFundList]}
                  value={mfid}
                  onChange={setMfid}
                  placeholder="Search fund house..."
                />
              </Field>
              <Field label="Report Date">
                <DatePicker value={reportDate} onChange={setReportDate} />
              </Field>
            </div>
            <div className={styles.actions}>
              <Btn onClick={fetchPerformance} loading={loading}>Fetch Performance</Btn>
              {results && results.length > 0 && (
                <Btn small onClick={() => {
                  const rows = results.map(r => ({
                    Scheme: r.schemeName, Benchmark: r.benchmark,
                    'NAV Direct': r.navDirect, 'AUM Cr': r.dailyAUM,
                    '1Y%': r.return1YearDirect, '3Y%': r.return3YearDirect,
                    '5Y%': r.return5YearDirect, '10Y%': r.return10YearDirect,
                  }))
                  const ws = XLSX.utils.json_to_sheet(rows)
                  const csv = XLSX.utils.sheet_to_csv(ws)
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'fund_performance.csv'; a.click()
                  setTimeout(() => URL.revokeObjectURL(url), 1000)
                }}>⬇ Export CSV</Btn>
              )}
            </div>
          </div>
        </>
      ) : null}

      {error && <ErrorBox msg={error} />}

      {loading && <Skeleton height={300} />}

      {!loading && results && results.length > 0 && (() => {
        const textMatch = (val, filter) => {
          if (!filter) return true
          return String(val || '').toLowerCase().includes(filter.toLowerCase())
        }
        const numMatch = (val, filter) => {
          if (!filter) return true
          const f = filter.trim()
          if (f.startsWith('>')) return val != null && val > parseFloat(f.slice(1))
          if (f.startsWith('<')) return val != null && val < parseFloat(f.slice(1))
          return String(val ?? '').includes(f)
        }

        const groupMatch = (val, groupKey) => {
          const sel = groupFilters[groupKey]
          if (!sel || sel.size === 0) return true
          return sel.has(val)
        }

        const filtered = results.filter(r => {
          return textMatch(r.schemeName, colFilters.scheme)
            && textMatch(r.benchmark, colFilters.benchmark)
            && numMatch(r.navDirect, colFilters.nav)
            && numMatch(r.dailyAUM, colFilters.aum)
            && returnCols.every(([label, , dir]) => numMatch(r[dir], colFilters[label]))
            && groupMatch(r.schemeName, 'g_scheme')
            && groupMatch(r.benchmark, 'g_benchmark')
            && groupMatch(r.navDirect != null ? r.navDirect.toFixed(2) : '—', 'g_nav')
            && groupMatch(r.dailyAUM != null ? r.dailyAUM.toFixed(0) : '—', 'g_aum')
            && returnCols.every(([label, , dir]) => groupMatch(r[dir] != null ? r[dir].toFixed(2) : '—', `g_${label}`))
        })

        const sorted = sortCol ? [...filtered].sort((a, b) => {
          const av = a[sortCol] ?? -Infinity
          const bv = b[sortCol] ?? -Infinity
          return sortAsc ? av - bv : bv - av
        }) : filtered

        const handleSort = (col) => {
          if (sortCol === col) setSortAsc(!sortAsc)
          else { setSortCol(col); setSortAsc(false) }
        }

        const thProps = { sortCol, sortAsc, onSort: handleSort, colFilters, onFilter: setFilter, groupFilters, onGroupFilter: setGroupFilter }

        return (
          <div className={styles.section}>
            <SectionHeader label={`${sorted.length} of ${results.length} funds`} action={
              <SendToExcel
                name="Fund Performance"
                data={sorted.map(r => ({
                  Scheme: r.schemeName,
                  Benchmark: r.benchmark,
                  'NAV Direct': r.navDirect?.toFixed(2),
                  'AUM Cr': r.dailyAUM?.toFixed(0),
                  '1Y %': r[returnCols[0][2]]?.toFixed(2),
                  '3Y %': r[returnCols[1][2]]?.toFixed(2),
                  '5Y %': r[returnCols[2][2]]?.toFixed(2),
                  '10Y %': r[returnCols[3][2]]?.toFixed(2),
                }))}
              />
            } />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <SortTh {...thProps} col="schemeName" filterKey="scheme" placeholder="Scheme..." groupKey="g_scheme" groupValues={results.map(r => r.schemeName)}>Scheme</SortTh>
                    <SortTh {...thProps} col="benchmark" filterKey="benchmark" placeholder="Bench..." groupKey="g_benchmark" groupValues={results.map(r => r.benchmark)}>Benchmark</SortTh>
                    <SortTh {...thProps} col="navDirect" filterKey="nav" placeholder=">100" groupKey="g_nav" groupValues={results.map(r => r.navDirect != null ? r.navDirect.toFixed(2) : '—')}>NAV (D)</SortTh>
                    <SortTh {...thProps} col="dailyAUM" filterKey="aum" placeholder=">1000" groupKey="g_aum" groupValues={results.map(r => r.dailyAUM != null ? r.dailyAUM.toFixed(0) : '—')}>AUM (Cr)</SortTh>
                    {returnCols.map(([label, , dir]) => (
                      <SortTh {...thProps} key={label} col={dir} filterKey={label} placeholder=">10" groupKey={`g_${label}`} groupValues={results.map(r => r[dir] != null ? r[dir].toFixed(2) : '—')}>{label} %</SortTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={i}>
                      <td className={styles.rowNum}>{i + 1}</td>
                      <td>{r.schemeName}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.benchmark}</td>
                      <td className={styles.navCell}>{r.navDirect?.toFixed(2)}</td>
                      <td>{r.dailyAUM?.toFixed(0)}</td>
                      {returnCols.map(([label, , dir]) => (
                        <ReturnCell key={label} val={r[dir]} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {!loading && results && results.length === 0 && (
        <div className={styles.empty}>No performance data found for selected filters.</div>
      )}
    </Panel>
  )
}
