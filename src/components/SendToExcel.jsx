import { webExcelStore } from '../webExcelStore'
import styles from '../App.module.css'

/**
 * Converts various data shapes to spreadsheet rows + columns.
 * Usage: <SendToExcel name="Sheet Name" data={[...]} columns={[...]} />
 *
 * data: array of objects or array of arrays
 * columns: optional array of { title, width } for headers
 */
export default function SendToExcel({ name, data, columns, small = true }) {
  const send = () => {
    if (!data || data.length === 0) return

    let rows, cols

    if (Array.isArray(data[0]) ) {
      // Already array of arrays
      rows = data
      cols = columns || []
    } else {
      // Array of objects — extract keys as headers
      const keys = Object.keys(data[0])
      cols = keys.map(k => ({ title: k, width: 120 }))
      rows = data.map(obj => keys.map(k => {
        const v = obj[k]
        if (v == null) return ''
        if (typeof v === 'object') return JSON.stringify(v)
        return v
      }))
    }

    // Add header row at top
    if (cols.length > 0) {
      const headerRow = cols.map(c => c.title)
      rows = [headerRow, ...rows]
    }

    webExcelStore.addSheet(name || `Sheet`, rows, [])
  }

  return (
    <button
      type="button"
      className={`${styles.btn} ${small ? styles.btnSmall : ''}`}
      onClick={send}
      title={`Send "${name}" to Web Excel`}
    >
      📊 To Excel
    </button>
  )
}
