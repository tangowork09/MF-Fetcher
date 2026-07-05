import { useState, useEffect, useMemo } from 'react'
import { MetaCard, SectionHeader, Field, Btn, JsonPreview } from './ui'
import SendToExcel from './SendToExcel'
import styles from '../App.module.css'

/**
 * Displays NAV data for one scheme with filtering. Downloads are delegated to
 * the parent (HistoryPanel) so they use the shared risk-free-rate / benchmark
 * settings.
 */
export default function NavResult({ data, startDate, endDate, onFilteredDataChange, onDownload, busy, hasBench }) {
  const { meta, data: navData } = data
  const [dateFilter, setDateFilter] = useState('')
  const [priceFilter, setPriceFilter] = useState('')

  const filteredData = useMemo(() => navData.filter(row => {
    const df = dateFilter.toLowerCase()
    const [dd, mm, yyyy] = row.date.split('-')
    const iso = `${yyyy}-${mm}-${dd}`
    const dMatch = row.date.toLowerCase().includes(df) || iso.includes(df)
    const pMatch = row.nav.toLowerCase().includes(priceFilter.toLowerCase())
    return dMatch && pMatch
  }), [navData, dateFilter, priceFilter])

  useEffect(() => {
    if (onFilteredDataChange) onFilteredDataChange(meta.scheme_code, filteredData)
  }, [filteredData, meta.scheme_code, onFilteredDataChange])

  const isFiltered = !!(dateFilter || priceFilter)
  const filterLabel = [dateFilter && `date ~ “${dateFilter}”`, priceFilter && `NAV ~ “${priceFilter}”`].filter(Boolean).join(', ')

  const datePart = (startDate || endDate)
    ? `${startDate || ''}-${endDate || ''}`.replace(/^-|-$/g, '')
    : 'all'
  const filename = `${meta.scheme_code} - ${meta.scheme_name} - ${datePart}.xlsx`

  const handleDownload = () => onDownload
    ? onDownload(filteredData, meta, filename)
    : null

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

      <SectionHeader label={`${filteredData.length.toLocaleString()} NAV record${filteredData.length === 1 ? '' : 's'}`} />

      <div className={styles.exportBlock}>
        <div className={styles.exportHead}>
          <span className={styles.exportTitle}>Export this scheme to Excel</span>
          <span className={styles.exportCount}>{filteredData.length.toLocaleString()} rows</span>
        </div>
        <p className={styles.exportManifest}>
          Workbook with <b>Summary</b>, <b>NAV History</b> (complete history since inception — sort &amp; filter),
          and <b>Risk &amp; Return Metrics</b> (live formulas, computed on your selected range/filter){hasBench ? <>, plus a <b>Benchmark</b> tab</> : null}.
        </p>
        <div className={styles.exportActions}>
          <Btn small loading={busy} onClick={handleDownload}>⬇ Download Excel{isFiltered ? ' — current filter' : ''}</Btn>
          <SendToExcel name={`${meta.scheme_code} NAV`} data={filteredData.map(d => ({ Date: d.date, NAV: parseFloat(d.nav) }))} />
        </div>
        {isFiltered && (
          <p className={styles.exportNote}>
            Metrics will be computed on your current filter{filterLabel ? ` (${filterLabel})` : ''}: {filteredData.length.toLocaleString()} of {navData.length.toLocaleString()} rows.
            The NAV History sheet always contains the fund’s complete history.
          </p>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>#</th><th>Date</th><th>NAV (₹)</th></tr>
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
          <p className={styles.truncNote}>Showing first 200 of {filteredData.length.toLocaleString()} rows — the Excel export has them all.</p>
        )}
      </div>
      <JsonPreview data={{ meta, data: filteredData }} />
    </div>
  )
}
