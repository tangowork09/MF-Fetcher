import * as XLSX from 'xlsx'

import JSZip from 'jszip'

function parseDDMMYYYY(str) {
  const [d, m, y] = str.split('-')
  return new Date(`${y}-${m}-${d}`)
}

function sortByDateAsc(rows) {
  return [...rows].sort((a, b) => parseDDMMYYYY(a.Date) - parseDDMMYYYY(b.Date))
}

function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.{2,}/g, '_').slice(0, 200)
}

function buildWorkbook(data, meta) {
  const wb = XLSX.utils.book_new()

  // --- Meta sheet ---
  if (meta) {
    const metaRows = Object.entries(meta).map(([k, v]) => ({
      Field: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      Value: v ?? 'N/A',
    }))
    const metaSheet = XLSX.utils.json_to_sheet(metaRows)
    metaSheet['!cols'] = [{ wch: 28 }, { wch: 55 }]
    XLSX.utils.book_append_sheet(wb, metaSheet, 'Scheme Info')
  }

  // --- NAV data sheet ---
  if (data && data.length > 0) {
    const navRows = sortByDateAsc(data.map(d => ({
      Date: d.date,
      NAV: parseFloat(d.nav),
    })))
    const navSheet = XLSX.utils.json_to_sheet(navRows)
    navSheet['!cols'] = [{ wch: 16 }, { wch: 16 }]

    // Style header row (xlsx has limited styling in community version, but we can set widths)
    XLSX.utils.book_append_sheet(wb, navSheet, 'NAV History')
  }

  return wb
}

export function downloadExcel(data, meta, filename = 'mutual_fund_data.xlsx') {
  const wb = buildWorkbook(data, meta)
  XLSX.writeFile(wb, sanitizeFilename(filename))
}

export async function downloadBulkZip(results) {
  const zip = new JSZip()
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const yyyy = now.getFullYear()
  const h = now.getHours() % 12 || 12
  const min = String(now.getMinutes()).padStart(2, '0')
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM'
  const codes = results.map(r => r.meta.scheme_code).join(',')
  const baseName = sanitizeFilename(`BULK(${mm}-${dd}-${yyyy} ${h}-${min} ${ampm})[${codes}]`)

  // Map: date -> { schemeCol: nav } for pivoted combined CSV
  const dateMap = new Map()
  const schemeColumns = []

  results.forEach(res => {
    const { meta, data, reqStart, reqEnd } = res
    const datePart = (reqStart || reqEnd)
      ? `${reqStart || ''}-${reqEnd || ''}`.replace(/^-|-$/g, '')
      : 'all'

    if (data && data.length > 0) {
      const navRows = sortByDateAsc(data.map(d => ({
        Date: d.date,
        NAV: parseFloat(d.nav),
      })))
      const csvSheet = XLSX.utils.json_to_sheet(navRows)
      const csvStr = XLSX.utils.sheet_to_csv(csvSheet)
      const indFilename = sanitizeFilename(`${meta.scheme_code} - ${meta.scheme_name} - ${datePart}.csv`)
      zip.file(indFilename, csvStr)

      // Build pivoted data — each scheme gets its own NAV column
      const colName = `${meta.scheme_code} - ${meta.scheme_name}`
      schemeColumns.push(colName)
      navRows.forEach(row => {
        if (!dateMap.has(row.Date)) dateMap.set(row.Date, {})
        dateMap.get(row.Date)[colName] = row.NAV
      })
    }
  })

  // Combined CSV: Date | SchemeA NAV | SchemeB NAV | ...
  if (dateMap.size > 0) {
    const allDates = [...dateMap.keys()].sort((a, b) => parseDDMMYYYY(a) - parseDDMMYYYY(b))
    const combinedRows = allDates.map(date => {
      const row = { Date: date }
      schemeColumns.forEach(col => {
        row[col] = dateMap.get(date)[col] ?? ''
      })
      return row
    })
    const combinedSheet = XLSX.utils.json_to_sheet(combinedRows)
    const combinedCsv = XLSX.utils.sheet_to_csv(combinedSheet)
    const bulkCsvName = sanitizeFilename(`bulk(${mm}-${dd}-${yyyy} ${h}-${min} ${ampm})`)
    zip.file(`${bulkCsvName}.csv`, combinedCsv)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadSearchResultsExcel(results) {
  const wb = XLSX.utils.book_new()
  const rows = results.map(r => ({
    'Scheme Code': r.schemeCode,
    'Scheme Name': r.schemeName,
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [{ wch: 14 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, sheet, 'Search Results')
  XLSX.writeFile(wb, 'mf_search_results.xlsx')
}
