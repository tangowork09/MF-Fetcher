import { useState } from 'react'
import { api } from '../api'
import { downloadSearchResultsExcel } from '../excel'
import { Panel, SectionHeader, Field, Btn, ErrorBox, Empty, Skeleton } from '../components/ui'
import SendToExcel from '../components/SendToExcel'
import styles from '../App.module.css'

/**
 * Single Responsibility: paginated browsing of all schemes.
 */
export default function BrowsePanel() {
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

  const filteredSchemes = schemes.filter(s => {
    const code = (s.schemeCode || s.Scheme_Code || '').toString().toLowerCase()
    const name = (s.schemeName || s.Scheme_Name || '').toString().toLowerCase()
    return code.includes(codeFilter.toLowerCase()) && name.includes(nameFilter.toLowerCase())
  })
  const isFiltered = codeFilter || nameFilter

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
            <input type="number" className={styles.input} value={offset} min={0} onChange={e => setOffset(+e.target.value)} />
          </Field>
        </div>
        <Btn onClick={fetch_} loading={loading}>Load Schemes</Btn>
      </div>

      {error && <ErrorBox msg={error} />}

      {loading && (
        <div className={styles.section}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={38} />
          ))}
        </div>
      )}

      {!loading && schemes.length > 0 && (
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
            label={`${filteredSchemes.length} schemes${total ? ` of ${total}` : ''}`}
            action={
              <div className={styles.actions}>
                <Btn small onClick={() => downloadSearchResultsExcel(filteredSchemes.map(s => ({
                  schemeCode: s.schemeCode || s.Scheme_Code,
                  schemeName: s.schemeName || s.Scheme_Name,
                })))}>
                  ⬇ Download {isFiltered ? 'Filtered ' : ''}Excel
                </Btn>
                <SendToExcel
                  name="Browse Schemes"
                  data={filteredSchemes.map(s => ({ Code: s.schemeCode || s.Scheme_Code, Name: s.schemeName || s.Scheme_Name }))}
                />
              </div>
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
    </Panel>
  )
}
