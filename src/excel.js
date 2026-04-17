import * as XLSX from 'xlsx'

import JSZip from 'jszip'

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
    const navRows = data.map(d => ({
      Date: d.date,
      NAV: parseFloat(d.nav),
    }))
    const navSheet = XLSX.utils.json_to_sheet(navRows)
    navSheet['!cols'] = [{ wch: 16 }, { wch: 16 }]

    // Style header row (xlsx has limited styling in community version, but we can set widths)
    XLSX.utils.book_append_sheet(wb, navSheet, 'NAV History')
  }

  return wb
}

export function downloadExcel(data, meta, filename = 'mutual_fund_data.xlsx') {
  const wb = buildWorkbook(data, meta)
  XLSX.writeFile(wb, filename)
}

export async function downloadBulkZip(results) {
  const zip = new JSZip()
  const combinedWb = XLSX.utils.book_new()
  const schemeNames = results.map(r => r.meta.scheme_name).join(', ')
  const baseName = `Bulk [${results.length}] [${schemeNames}]`

  results.forEach(res => {
    const { meta, data, reqStart, reqEnd } = res
    const datePart = (reqStart || reqEnd) 
      ? `${reqStart || ''}-${reqEnd || ''}`.replace(/^-|-$/g, '') 
      : 'all'

    const indWb = buildWorkbook(data, meta)
    const indBuffer = XLSX.write(indWb, { bookType: 'xlsx', type: 'array' })
    const indFilename = `${meta.scheme_code} - ${meta.scheme_name} - ${datePart}.xlsx`
    zip.file(indFilename, indBuffer)

    // For combined workbook, add the NAV History as a sheet named by scheme code
    if (data && data.length > 0) {
      const navRows = data.map(d => ({
        Date: d.date,
        NAV: parseFloat(d.nav),
      }))
      const navSheet = XLSX.utils.json_to_sheet(navRows)
      navSheet['!cols'] = [{ wch: 16 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(combinedWb, navSheet, meta.scheme_code.toString())
    }
  })

  const combinedBuffer = XLSX.write(combinedWb, { bookType: 'xlsx', type: 'array' })
  zip.file(`${baseName}.xlsx`, combinedBuffer)

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.zip`
  a.click()
  URL.revokeObjectURL(url)
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
