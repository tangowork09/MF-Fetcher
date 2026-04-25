import { useState, useEffect, useRef, useCallback } from 'react'
import { Workbook } from '@fortune-sheet/react'
import '@fortune-sheet/react/dist/index.css'
import * as XLSX from 'xlsx'
import { webExcelStore } from '../webExcelStore'
import { Btn } from '../components/ui'
import styles from '../App.module.css'

function toCell(val) {
  if (val == null || val === '') return null
  const display = typeof val === 'object' ? JSON.stringify(val) : String(val)
  const numVal = Number(val)
  if (!isNaN(numVal) && val !== '' && typeof val !== 'boolean') {
    return { v: numVal, m: display, ct: { fa: 'General', t: 'n' } }
  }
  return { v: display, m: display, ct: { fa: 'General', t: 'g' } }
}

function toFortuneSheet(storeSheets) {
  if (storeSheets.length === 0) {
    return [{ name: 'Sheet 1', celldata: [], order: 0, status: 1, row: 100, column: 30 }]
  }

  return storeSheets.map((s, idx) => {
    const rows = s.data || []
    const maxCol = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)

    // Use celldata (sparse) format — Fortune Sheet converts to 2D internally
    const celldata = []
    rows.forEach((row, r) => {
      if (!Array.isArray(row)) return
      row.forEach((val, c) => {
        const cell = toCell(val)
        if (cell) celldata.push({ r, c, v: cell })
      })
    })

    return {
      name: s.name || `Sheet ${idx + 1}`,
      celldata,
      order: idx,
      status: idx === 0 ? 1 : 0,
      row: Math.max(rows.length + 30, 100),
      column: Math.max(maxCol + 10, 30),
    }
  })
}

export default function WebExcelPanel({ onMount, isVisible }) {
  const [sheets, setSheets] = useState(webExcelStore.getSheets())
  const [workbookKey, setWorkbookKey] = useState(() => Date.now())
  const [containerHeight, setContainerHeight] = useState(600)
  const [liveData, setLiveData] = useState(null)
  const wrapRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => { onMount?.() }, []) // eslint-disable-line

  useEffect(() => {
    return webExcelStore.subscribe((s) => {
      setSheets(s)
      // Remount workbook when sheets change
      setWorkbookKey(Date.now())
    })
  }, [])

  // ResizeObserver for container height
  useEffect(() => {
    if (!wrapRef.current) return
    const calcHeight = () => {
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect()
        setContainerHeight(Math.max(window.innerHeight - rect.top - 20, 400))
      }
    }
    calcHeight()
    const ro = new ResizeObserver(calcHeight)
    ro.observe(wrapRef.current)
    window.addEventListener('resize', calcHeight)
    return () => { ro.disconnect(); window.removeEventListener('resize', calcHeight) }
  }, [isVisible])

  const importFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result)
      const wb = XLSX.read(data, { type: 'array' })
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
        webExcelStore.addSheet(name, rows.length > 0 ? rows : [[]], [])
      })
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const addBlankSheet = () => {
    webExcelStore.addSheet(`Sheet ${sheets.length + 1}`, [[]], [])
  }

  const fortuneData = toFortuneSheet(sheets)

  const exportXlsx = () => {
    const source = liveData || fortuneData
    const wb = XLSX.utils.book_new()
    source.forEach(sheet => {
      const rows = []
      const grid = sheet.data || []
      grid.forEach(row => {
        if (!Array.isArray(row)) return
        rows.push(row.map(cell => {
          if (!cell) return ''
          return cell.v ?? cell.m ?? ''
        }))
      })
      // If using celldata (no grid data), convert from celldata
      if (rows.length === 0 && sheet.celldata) {
        const maxR = sheet.celldata.reduce((m, c) => Math.max(m, c.r), 0)
        const maxC = sheet.celldata.reduce((m, c) => Math.max(m, c.c), 0)
        for (let r = 0; r <= maxR; r++) {
          const row = []
          for (let c = 0; c <= maxC; c++) {
            const found = sheet.celldata.find(cd => cd.r === r && cd.c === c)
            row.push(found?.v?.v ?? found?.v?.m ?? '')
          }
          rows.push(row)
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, (sheet.name || 'Sheet').slice(0, 31))
    })
    XLSX.writeFile(wb, 'web_excel_export.xlsx')
  }

  const exportCsv = () => {
    const source = liveData || fortuneData
    // Export active sheet as CSV
    const active = source.find(s => s.status === 1) || source[0]
    if (!active) return
    const rows = []
    const grid = active.data || []
    grid.forEach(row => {
      if (!Array.isArray(row)) return
      rows.push(row.map(cell => cell?.v ?? cell?.m ?? ''))
    })
    if (rows.length === 0 && active.celldata) {
      const maxR = active.celldata.reduce((m, c) => Math.max(m, c.r), 0)
      const maxC = active.celldata.reduce((m, c) => Math.max(m, c.c), 0)
      for (let r = 0; r <= maxR; r++) {
        const row = []
        for (let c = 0; c <= maxC; c++) {
          const found = active.celldata.find(cd => cd.r === r && cd.c === c)
          row.push(found?.v?.v ?? found?.v?.m ?? '')
        }
        rows.push(row)
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const csv = XLSX.utils.sheet_to_csv(ws)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${active.name || 'sheet'}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div ref={wrapRef} className={styles.webExcelWrap}>
      <div className={styles.webExcelToolbar}>
        <span className={styles.webExcelTitle}>Web Excel</span>
        <div className={styles.actions}>
          <Btn small onClick={addBlankSheet}>+ New Sheet</Btn>
          {sheets.length > 0 && <Btn small onClick={() => webExcelStore.clearAll()}>✕ Clear All</Btn>}
          <Btn small onClick={() => fileInputRef.current?.click()}>📁 Import</Btn>
          <Btn small onClick={exportXlsx}>⬇ Export .xlsx</Btn>
          <Btn small onClick={exportCsv}>⬇ Export .csv</Btn>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importFile} style={{ display: 'none' }} />
        </div>
      </div>
      <div className={styles.excelSecondBar}>
        <span className={styles.excelSecondBarLabel}>Quick:</span>
        <button className={styles.excelQuickBtn} onClick={() => {
          const el = document.querySelector('.fortune-toolbar [data-tooltip*="rint"], .fortune-toolbar button[title*="rint"]')
          if (el) el.click()
          else window.print()
        }}>🖨 Print</button>
        <button className={styles.excelQuickBtn} onClick={() => {
          const el = document.querySelector('.fortune-toolbar [data-name="search"], .fortune-toolbar button[title*="earch"]')
          if (el) el.click()
        }}>🔍 Find</button>
        <button className={styles.excelQuickBtn} onClick={() => fileInputRef.current?.click()}>📁 Import</button>
        <span className={styles.excelSecondBarHint}>Ctrl+B Bold · Ctrl+I Italic · Ctrl+Z Undo · Ctrl+F Find · Ctrl+C Copy · Ctrl+V Paste</span>
      </div>
      <div className={styles.webExcelContainer} style={{ height: containerHeight }}>
        <Workbook
          key={workbookKey}
          data={fortuneData}
          onChange={(d) => setLiveData(d)}
          showToolbar
          showFormulaBar
          showSheetTabs
          allowEdit
          addRows={30}
          row={100}
          column={30}
          currency="₹"
          forceCalculation
          toolbarItems={[
            'undo', 'redo', '|',
            'format-painter', 'clear-format', '|',
            'font', 'font-size', '|',
            'bold', 'italic', 'underline', 'strike-through', '|',
            'font-color', 'background', 'border', '|',
            'merge-cell', '|',
            'horizontal-align', 'vertical-align', 'text-wrap', 'text-rotation', '|',
            'currency-format', 'percentage-format', 'number-decrease', 'number-increase', 'format', '|',
            'freeze', '|',
            'conditionFormat', 'dataVerification', 'filter', '|',
            'link', 'image', 'comment', '|',
            'quick-formula', 'search', '|',
            'splitColumn', 'locationCondition', 'screenshot',
          ]}
          cellContextMenu={[
            'copy', 'paste', '|',
            'insert-row', 'insert-column', '|',
            'delete-row', 'delete-column', 'delete-cell', '|',
            'hide-row', 'hide-column', '|',
            'set-row-height', 'set-column-width', '|',
            'clear', '|',
            'sort', 'orderAZ', 'orderZA', 'filter', '|',
            'image', 'link', 'chart', '|',
            'data', 'cell-format',
          ]}
          headerContextMenu={[
            'copy', 'paste', '|',
            'insert-row', 'insert-column', '|',
            'delete-row', 'delete-column', '|',
            'hide-row', 'hide-column', '|',
            'set-row-height', 'set-column-width', '|',
            'clear', 'sort', 'orderAZ', 'orderZA',
          ]}
          sheetTabContextMenu={[
            'delete', 'copy', 'rename', 'color', 'hide', '|', 'move',
          ]}
          filterContextMenu={[
            'sort-by-asc', 'sort-by-desc', '|',
            'filter-by-color', 'filter-by-value',
          ]}
        />
      </div>
    </div>
  )
}
