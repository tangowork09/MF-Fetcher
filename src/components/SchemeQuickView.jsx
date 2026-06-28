import { useState, useEffect } from 'react'
import { api } from '../api'
import { downloadExcel } from '../excel'
import { Btn, Skeleton } from './ui'
import SendToExcel from './SendToExcel'
import styles from '../App.module.css'

export default function SchemeQuickView({ code, name }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setData(null); setLoading(true); setError(null)
    api.latest(code)
      .then(res => {
        if (cancelled) return
        if (res.status === 'SUCCESS') setData(res)
        else setError('Could not load')
      })
      .catch(() => { if (!cancelled) setError('Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [code])

  const handleFullHistory = async () => {
    setBusy(true)
    try {
      const full = await api.history(code)
      if (full.status === 'SUCCESS') await downloadExcel(full.data, full.meta, `${full.meta.scheme_code} - ${full.meta.scheme_name} - full.xlsx`)
    } catch {
      setError('Failed to download full history')
    } finally { setBusy(false) }
  }

  const meta = data?.meta
  const nav = data?.data?.[0]

  return (
    <div className={styles.quickViewCompact} role="region" aria-label={`Quick view for ${name}`}>
      {error && <span className={styles.errorInline}>{error}</span>}
      {loading ? (
        <Skeleton height={14} />
      ) : data && (
        <>
          <div className={styles.qvTopRow}>
            <div className={styles.qvLeft}>
              <span className={styles.schemeCode}>{meta.scheme_code}</span>
              <span className={styles.qvName}>{meta.scheme_name}</span>
            </div>
            <div className={styles.qvNavInline}>
              <span className={styles.qvNavValue}>₹{parseFloat(nav.nav).toFixed(4)}</span>
              <span className={styles.qvNavDate}>{nav.date}</span>
            </div>
          </div>
          <div className={styles.qvGrid}>
            {meta.fund_house && <div className={styles.qvCell}><div className={styles.qvKey}>Fund House</div><div className={styles.qvVal}>{meta.fund_house}</div></div>}
            {meta.scheme_type && <div className={styles.qvCell}><div className={styles.qvKey}>Type</div><div className={styles.qvVal}>{meta.scheme_type}</div></div>}
            {meta.scheme_category && <div className={styles.qvCell}><div className={styles.qvKey}>Category</div><div className={styles.qvVal}>{meta.scheme_category}</div></div>}
            {meta.isin_growth && <div className={styles.qvCell}><div className={styles.qvKey}>ISIN</div><div className={`${styles.qvVal} ${styles.qvIsin}`}>{meta.isin_growth}</div></div>}
          </div>
          <div className={styles.actions}>
            <Btn small variant="secondary" title="Single-row workbook: just the latest NAV + scheme info"
              onClick={() => downloadExcel(data.data, meta, `${meta.scheme_code} - ${meta.scheme_name} - latest.xlsx`)}>
              ⬇ Latest only
            </Btn>
            <Btn small loading={busy} title="Full NAV history workbook: Summary, NAV History (real dates) and Risk & Return Metrics (live formulas)"
              onClick={handleFullHistory}>
              ⬇ Full history + metrics
            </Btn>
            <SendToExcel
              name={`${meta.scheme_code} Latest`}
              data={[{ Code: meta.scheme_code, Name: meta.scheme_name, NAV: parseFloat(nav.nav), Date: nav.date, 'Fund House': meta.fund_house, Category: meta.scheme_category }]}
            />
          </div>
        </>
      )}
    </div>
  )
}
