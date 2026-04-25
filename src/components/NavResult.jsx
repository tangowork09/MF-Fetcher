import { useState, useEffect, useMemo } from 'react'
import { downloadExcel } from '../excel'
import { MetaCard, SectionHeader, Field, Btn, JsonPreview } from './ui'
import SendToExcel from './SendToExcel'
import styles from '../App.module.css'

/**
 * Single Responsibility: displays NAV data for one scheme with filtering.
 * Interface Segregation: receives only what it needs — data + optional callbacks.
 */
export default function NavResult({ data, startDate, endDate, onFilteredDataChange }) {
  const { meta, data: navData } = data
  const [dateFilter, setDateFilter] = useState('')
  const [priceFilter, setPriceFilter] = useState('')

  const filteredData = useMemo(() => navData.filter(row => {
    const dMatch = row.date.toLowerCase().includes(dateFilter.toLowerCase())
    const pMatch = row.nav.toLowerCase().includes(priceFilter.toLowerCase())
    return dMatch && pMatch
  }), [navData, dateFilter, priceFilter])

  useEffect(() => {
    if (onFilteredDataChange) {
      onFilteredDataChange(meta.scheme_code, filteredData)
    }
  }, [filteredData, meta.scheme_code, onFilteredDataChange])

  const isFiltered = dateFilter || priceFilter

  const datePart = (startDate || endDate)
    ? `${startDate || ''}-${endDate || ''}`.replace(/^-|-$/g, '')
    : 'all'
  const filename = `${meta.scheme_code} - ${meta.scheme_name} - ${datePart}.xlsx`

  return (
    <div className={styles.section}>
      <MetaCard meta={meta} />

      <div className={styles.filterBar}>
        <Field label="Filter Date">
          <input className={styles.input} placeholder="e.g. 2026-04" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </Field>
        <Field label="Filter Price">
          <input className={styles.input} placeholder="e.g. 18." value={priceFilter} onChange={e => setPriceFilter(e.target.value)} />
        </Field>
      </div>

      <SectionHeader label={`${filteredData.length} NAV records`} action={
        <div className={styles.actions}>
          <Btn small onClick={() => downloadExcel(filteredData, meta, filename)}>
            ⬇ Download {isFiltered ? 'Filtered ' : ''}Excel
          </Btn>
          <SendToExcel
            name={`${meta.scheme_code} NAV`}
            data={filteredData.map(d => ({ Date: d.date, NAV: d.nav }))}
          />
        </div>
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
