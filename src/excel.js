import JSZip from 'jszip'
import * as XLSX from 'xlsx' // only for the lightweight scheme-list export
import {
  toSeries, toDisplaySeries, computeMetrics, computeBenchmarkMetrics,
  dailyReturns, rollingReturns, yearsBetween, percentileInc,
} from './metrics.js'
import { PARAMETERS, EXTRA_METRICS, REFERENCE_NOTE, COVERAGE } from './parameters.js'

// exceljs is heavy — load it only when an export actually runs.
async function loadExcelJS() {
  const mod = await import('exceljs')
  return mod.default || mod
}

/* ─────────────────────────── style tokens ─── */
const C = {
  header: 'FF1F3A5F',   // deep indigo header fill
  headerText: 'FFFFFFFF',
  section: 'FFDDE6F2',  // section-header fill
  band: 'FFF4F7FB',     // zebra band
  border: 'FFD6DCE5',
  pos: 'FF177245',      // green
  neg: 'FFB02A37',      // red
  note: 'FF6B7280',     // muted note text
  rfFill: 'FFFFF3CD',   // editable risk-free cell highlight
}
const FMT = { date: 'dd-mm-yyyy', nav: '0.0000', pct: '0.00%', money: '#,##0.00', ratio: '0.00', fine: '0.000', int: '#,##0' }
const thin = { style: 'thin', color: { argb: C.border } }
const ALL_BORDERS = { top: thin, left: thin, bottom: thin, right: thin }

function styleHeaderCell(cell) {
  cell.font = { bold: true, color: { argb: C.headerText }, size: 11 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.header } }
  cell.alignment = { vertical: 'middle' }
  cell.border = ALL_BORDERS
}
function styleSectionCell(cell) {
  cell.font = { bold: true, color: { argb: C.header }, size: 11 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.section } }
}
const num = (v) => (isFinite(v) ? v : null)

/* ═══════════════════════════ PER-SCHEME WORKBOOK ═══════════════════════════ */

// NAV History — continuous (incl. filled non-trading days). All values, so the
// table sorts/filters cleanly. Green/red conditional formatting on return & DD.
function addNavHistorySheet(wb, display) {
  const ws = wb.addWorksheet('NAV History', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Date', key: 'd', width: 13 },
    { header: 'NAV (₹)', key: 'n', width: 12 },
    { header: 'Daily Return', key: 'r', width: 13 },
    { header: 'Growth of ₹100', key: 'g', width: 15 },
    { header: 'Running Peak', key: 'p', width: 13 },
    { header: 'Drawdown', key: 'dd', width: 12 },
  ]
  const navs = display.map(p => p.nav)
  const rets = dailyReturns(navs)
  const base = navs[0]
  let peak = -Infinity
  display.forEach((p, i) => {
    peak = Math.max(peak, p.nav)
    ws.addRow({ d: p.date, n: p.nav, r: i === 0 ? null : rets[i - 1], g: 100 * (p.nav / base), p: peak, dd: p.nav / peak - 1 })
  })
  ws.getColumn('d').numFmt = FMT.date
  ws.getColumn('n').numFmt = FMT.nav
  ws.getColumn('r').numFmt = FMT.pct
  ws.getColumn('g').numFmt = FMT.money
  ws.getColumn('p').numFmt = FMT.nav
  ws.getColumn('dd').numFmt = FMT.pct
  finishTable(ws, display.length)
  greenRed(ws, 'C', display.length)
  ws.getColumn('dd').eachCell((cell, r) => { if (r > 1) cell.font = { color: { argb: C.neg } } })
  return ws
}

// Trading Days — actual trading days only; the BASIS for metrics. Return &
// drawdown are FORMULAS off the NAV column, so editing a NAV recalcs metrics.
function addTradingDaysSheet(wb, real) {
  const ws = wb.addWorksheet('Trading Days', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Date', key: 'd', width: 13 },
    { header: 'NAV (₹)', key: 'n', width: 12 },
    { header: 'Daily Return', key: 'r', width: 13 },
    { header: 'Drawdown', key: 'dd', width: 12 },
  ]
  const navs = real.map(p => p.nav)
  const rets = dailyReturns(navs)
  let peak = -Infinity
  real.forEach((p, i) => {
    const excelRow = i + 2 // data starts at row 2
    peak = Math.max(peak, p.nav)
    const row = ws.addRow({ d: p.date, n: p.nav })
    if (i > 0) row.getCell('r').value = { formula: `B${excelRow}/B${excelRow - 1}-1`, result: rets[i - 1] }
    row.getCell('dd').value = { formula: `B${excelRow}/MAX($B$2:B${excelRow})-1`, result: p.nav / peak - 1 }
  })
  ws.getColumn('d').numFmt = FMT.date
  ws.getColumn('n').numFmt = FMT.nav
  ws.getColumn('r').numFmt = FMT.pct
  ws.getColumn('dd').numFmt = FMT.pct
  finishTable(ws, real.length)
  greenRed(ws, 'C', real.length)
  return ws
}

// Risk & Return Metrics — live formulas over Trading Days + an editable,
// named $B$2 cell. Cached `result` keeps non-recalc viewers correct.
function addMetricsSheet(wb, m, lastRow) {
  const ws = wb.addWorksheet('Risk & Return Metrics', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [{ width: 34 }, { width: 16 }, { width: 56 }]
  const TD = "'Trading Days'"
  const RET = `${TD}!C3:C${lastRow}`
  const DD = `${TD}!D2:D${lastRow}`
  const B0 = `${TD}!B2`, BL = `${TD}!B${lastRow}`
  const A0 = `${TD}!A2`, AL = `${TD}!A${lastRow}`
  const rm = m.returnMetrics, rk = m.riskMetrics, pe = m.period

  const title = ws.addRow(['RISK & RETURN METRICS']); title.getCell(1).font = { bold: true, size: 13, color: { argb: C.header } }
  const rfRow = ws.addRow(['Risk-free rate (annual)', num(m.rfAnnual), 'EDITABLE — Sharpe / Sortino / Treynor recalc when you change this cell'])
  rfRow.getCell(2).numFmt = FMT.pct
  rfRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.rfFill } }
  rfRow.getCell(2).border = ALL_BORDERS
  rfRow.getCell(1).font = { bold: true }
  // Formulas reference $B$2 directly (not a named range) — universal across
  // Excel / LibreOffice / Google Sheets.
  ws.addRow(['Annualization basis', '252 trading days', 'Daily volatility annualized by √252'])
  ws.addRow(['Analysis period', `${pe.startDate} → ${pe.endDate}`, `${pe.observations} obs · ${pe.returns} returns · ${pe.years.toFixed(2)} yrs`])
  ws.addRow([])

  let rowNum = 5 // next row index (1-based) after the 4 header rows + blank => row 6 is next
  rowNum = ws.rowCount
  const section = (t) => { const r = ws.addRow([t, 'Value', 'Definition']); r.eachCell(styleSectionCell) }
  // formula row; returns the 1-based row number written
  const fRow = (label, formula, result, numFmt, note) => {
    const r = ws.addRow([label, { formula, result: num(result) }, note])
    r.getCell(2).numFmt = numFmt
    return r.number
  }
  const vRow = (label, value, numFmt, note) => {
    const r = ws.addRow([label, num(value), note]); if (numFmt) r.getCell(2).numFmt = numFmt; return r.number
  }

  section('RETURN METRICS')
  fRow('Absolute return (point-to-point)', `${BL}/${B0}-1`, rm.absoluteReturn, FMT.pct, 'Total NAV change over the period')
  // Only annualize spans ≥ 3 months — annualizing a tiny window explodes.
  const cagrRow = pe.years >= 0.25
    ? fRow('CAGR (annualized)', `(${BL}/${B0})^(365.25/(${AL}-${A0}))-1`, rm.cagr, FMT.pct, 'Compound annual growth rate (geometric)')
    : vRow('Period return (absolute)', rm.absoluteReturn, FMT.pct, 'Span < 3 months — not annualized')
  fRow('Annualized return (arithmetic)', `AVERAGE(${RET})*252`, rm.annualizedArithmetic, FMT.pct, 'Mean daily return × 252')
  fRow('Mean daily return', `AVERAGE(${RET})`, rm.meanDaily, FMT.pct, 'Average daily simple return')
  fRow('Best day', `MAX(${RET})`, rm.bestDay, FMT.pct, 'Largest single-day gain')
  fRow('Worst day', `MIN(${RET})`, rm.worstDay, FMT.pct, 'Largest single-day loss')
  if (rm.ytd) vRow('YTD return', rm.ytd.value, FMT.pct, `From ${rm.ytd.startDate} (prev year-end NAV)`)
  for (const [k, t] of Object.entries(rm.trailing)) {
    if (t) vRow(`Trailing ${k} return${t.annualized ? ' (p.a.)' : ''}`, t.value, FMT.pct, `From ${t.startDate}${t.annualized ? ' · CAGR' : ' · absolute'}`)
    else { const r = ws.addRow([`Trailing ${k} return`, '—', 'Insufficient history']) ; r.getCell(2).alignment = { horizontal: 'right' } }
  }
  for (const [k, r] of [['1Y', rm.rolling1Y], ['3Y', rm.rolling3Y], ['5Y', rm.rolling5Y]]) {
    if (!r) continue
    vRow(`Rolling ${k} — average${k === '1Y' ? '' : ' (p.a.)'}`, r.average, FMT.pct, `${r.count} windows`)
    ws.addRow([`Rolling ${k} — min / max`, `${(r.min * 100).toFixed(2)}% / ${(r.max * 100).toFixed(2)}%`, `Worst / best ${k} window`])
    vRow(`Rolling ${k} — % positive`, r.pctPositive, FMT.pct, `Share of positive ${k} windows`)
  }

  // SIP returns (XIRR) — actual systematic-investment return simulated on the NAV
  const sip = rm.sip || {}
  if (sip['1Y'] || sip['3Y'] || sip['5Y'] || sip['SI']) {
    ws.addRow([])
    section('SIP RETURNS (XIRR)')
    for (const [k, label] of [['1Y', '1-year'], ['3Y', '3-year'], ['5Y', '5-year'], ['SI', 'Since inception']]) {
      const s = sip[k]
      if (s && isFinite(s.xirr)) vRow(`SIP ${label} (XIRR p.a.)`, s.xirr, FMT.pct, `${s.installments} monthly installments · invested ₹${Math.round(s.invested).toLocaleString('en-IN')} → ₹${Math.round(s.finalValue).toLocaleString('en-IN')}`)
      else { const r = ws.addRow([`SIP ${label} (XIRR p.a.)`, '—', 'Insufficient history']); r.getCell(2).alignment = { horizontal: 'right' } }
    }
  }
  ws.addRow([])

  section('RISK METRICS')
  fRow('Standard deviation (daily)', `STDEV(${RET})`, rk.dailyStd, FMT.pct, 'Sample (n-1) std dev of daily returns')
  fRow('Standard deviation (annualized)', `STDEV(${RET})*SQRT(252)`, rk.annualizedVol, FMT.pct, 'Daily std dev × √252 — headline volatility (Value Research / Morningstar convention)')
  const dsRow = fRow('Downside deviation', `SQRT(SUMPRODUCT(((${RET}-$B$2/252)<0)*((${RET}-$B$2/252)^2))/COUNT(${RET}))*SQRT(252)`, rk.downsideDeviation, FMT.pct, 'Volatility of below-target returns (annualized)')
  fRow('Sharpe ratio', `(AVERAGE(${RET})*252-$B$2)/(STDEV(${RET})*SQRT(252))`, rk.sharpe, FMT.ratio, 'Excess return per unit of total risk')
  fRow('Sortino ratio', `(AVERAGE(${RET})*252-$B$2)/$B$${dsRow}`, rk.sortino, FMT.ratio, 'Excess return per unit of downside risk')
  const mddRow = fRow('Maximum drawdown', `-MIN(${DD})`, rk.maxDrawdown, FMT.pct, `Worst decline (${rk.maxDrawdownPeak || '—'} → ${rk.maxDrawdownTrough || '—'})`)
  fRow('Calmar ratio', `$B$${cagrRow}/$B$${mddRow}`, rk.calmar, FMT.ratio, 'CAGR per unit of max drawdown')
  fRow('Value at Risk 95% (1-day, hist.)', `-PERCENTILE(${RET},0.05)`, rk.var95Hist, FMT.pct, 'Empirical 5th-percentile daily loss')
  fRow('Value at Risk 99% (1-day, hist.)', `-PERCENTILE(${RET},0.01)`, rk.var99Hist, FMT.pct, 'Empirical 1st-percentile daily loss')
  fRow('Value at Risk 95% (1-day, param.)', `-(AVERAGE(${RET})+(-1.6448536269514722)*STDEV(${RET}))`, rk.var95Param, FMT.pct, 'Normal-distribution 95% daily VaR')
  fRow('Conditional VaR 95% (Exp. Shortfall)', `-AVERAGEIF(${RET},"<="&PERCENTILE(${RET},0.05))`, rk.cvar95Hist, FMT.pct, 'Mean loss in the worst 5% of days')
  fRow('Skewness', `SKEW(${RET})`, rk.skewness, FMT.fine, 'Return asymmetry (negative = fat loss tail)')
  fRow('Excess kurtosis', `KURT(${RET})`, rk.excessKurtosis, FMT.fine, 'Tail fatness vs normal (>0 = fat tails)')
  fRow('Positive days %', `COUNTIF(${RET},">0")/COUNT(${RET})`, rk.positivePct, FMT.pct, 'Share of up days')
  fRow('Negative days %', `COUNTIF(${RET},"<0")/COUNT(${RET})`, rk.negativePct, FMT.pct, 'Share of down days')

  // style label/note columns
  ws.eachRow((row, r) => {
    row.getCell(3).font = { color: { argb: C.note }, size: 10 }
    if (r > 5 && !row.getCell(1).fill) row.getCell(1).font = row.getCell(1).font || {}
  })
  return ws
}

function addSummarySheet(wb, meta, m) {
  const ws = wb.addWorksheet('Summary')
  ws.columns = [{ width: 24 }, { width: 20 }, { width: 30 }]
  const t = ws.addRow(['FUND SUMMARY']); t.getCell(1).font = { bold: true, size: 14, color: { argb: C.header } }
  ws.addRow([])
  if (meta) {
    ;[['Fund House', meta.fund_house], ['Scheme Name', meta.scheme_name], ['Scheme Code', meta.scheme_code],
      ['Type', meta.scheme_type], ['Category', meta.scheme_category], ['ISIN (Growth)', meta.isin_growth]]
      .filter(([, v]) => v).forEach(([k, v]) => { const r = ws.addRow([k, v]); r.getCell(1).font = { bold: true } })
    ws.addRow([])
  }
  if (m) {
    const pe = m.period, rm = m.returnMetrics, rk = m.riskMetrics
    const h = ws.addRow(['KEY METRICS', 'Value', 'as of ' + pe.endDate]); h.eachCell(styleSectionCell)
    const kv = (k, v, fmt, note) => { const r = ws.addRow([k, num(v), note]); if (fmt) r.getCell(2).numFmt = fmt; r.getCell(3).font = { color: { argb: C.note }, size: 10 } }
    ws.addRow(['Period', `${pe.startDate} → ${pe.endDate}`, `${pe.years.toFixed(2)} yrs · ${pe.observations} obs`])
    kv('Latest NAV', pe.endNav, FMT.nav)
    kv('CAGR', rm.cagr, FMT.pct)
    kv('YTD return', rm.ytd?.value, FMT.pct)
    kv('1Y return', rm.trailing['1Y']?.value, FMT.pct)
    kv('3Y return (p.a.)', rm.trailing['3Y']?.value, FMT.pct)
    kv('SIP since-inception (XIRR)', rm.sip?.SI?.xirr, FMT.pct)
    kv('Standard deviation (ann.)', rk.annualizedVol, FMT.pct)
    kv('Sharpe ratio', rk.sharpe, FMT.ratio)
    kv('Sortino ratio', rk.sortino, FMT.ratio)
    kv('Maximum drawdown', rk.maxDrawdown, FMT.pct)
    kv('Risk-free rate used', m.rfAnnual, FMT.pct)
    ws.addRow([])
    const note = ws.addRow(['See "Risk & Return Metrics" for the full set with live formulas.'])
    note.getCell(1).font = { italic: true, color: { argb: C.note }, size: 10 }
  }
  return ws
}

function addBenchmarkSheet(wb, b, benchMeta) {
  const ws = wb.addWorksheet('Benchmark')
  ws.columns = [{ width: 26 }, { width: 14 }, { width: 52 }]
  const t = ws.addRow(['BENCHMARK-RELATIVE METRICS']); t.getCell(1).font = { bold: true, size: 13, color: { argb: C.header } }
  ws.addRow(['Benchmark', benchMeta ? `${benchMeta.scheme_code ?? ''} ${benchMeta.scheme_name || ''}`.trim() : '—'])
  const op = ws.addRow(['Overlapping return pairs', num(b.pairs)]); op.getCell(2).numFmt = FMT.int
  ws.addRow([])
  const put = (label, v, fmt, note) => { const r = ws.addRow([label, num(v), note]); r.getCell(2).numFmt = fmt; r.getCell(1).font = { bold: true }; r.getCell(3).font = { color: { argb: C.note }, size: 10 } }
  put('Beta', b.beta, FMT.ratio, 'Sensitivity to benchmark (1 = moves with it)')
  put('Alpha (Jensen, p.a.)', b.alpha, FMT.pct, 'Return above CAPM expectation')
  put('R-squared', b.rSquared, FMT.ratio, 'Variance explained by benchmark')
  put('Treynor ratio', b.treynor, FMT.ratio, 'Excess return per unit of systematic risk')
  put('Tracking error (p.a.)', b.trackingError, FMT.pct, 'Std dev of active return vs benchmark')
  put('Information ratio', b.informationRatio, FMT.ratio, 'Active return per unit of tracking error')
  put('Up-capture ratio', b.upCapture, FMT.ratio, `>100 = beats benchmark up-market (${b.upPeriods} months)`)
  put('Down-capture ratio', b.downCapture, FMT.ratio, `<100 = falls less down-market (${b.downPeriods} months)`)
  put('Excess return over benchmark (p.a.)', b.excessReturn, FMT.pct, 'Fund CAGR − benchmark CAGR over the common window')
  put('Rolling 1Y win rate', b.rollingWinRate1Y, FMT.pct, `% of 1Y windows the fund beat the benchmark (${b.rollingWindows1Y} windows)`)
  put('Rolling 3Y win rate', b.rollingWinRate3Y, FMT.pct, `% of 3Y windows the fund beat the benchmark (${b.rollingWindows3Y} windows)`)
  put('Calendar-year hit rate', b.yearlyHitRate, FMT.pct, `% of calendar years the fund beat the benchmark (${b.hitYears} yrs)`)
  return ws
}

function addRollingSheet(wb, roll, label) {
  const ws = wb.addWorksheet(`Rolling ${label}`, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [{ header: `Rolling ${label} return (annualized)`, key: 'v', width: 30 }]
  roll.values.forEach(v => { const r = ws.addRow({ v }); r.getCell('v').numFmt = FMT.pct })
  finishTable(ws, roll.values.length)
  greenRed(ws, 'A', roll.values.length)
  return ws
}

/* ─────────────────────────── parameters reference ─── */
// Full MF-analysis parameter taxonomy (qualitative + quantitative) from the
// reference guide, with THIS tool's coverage flagged per parameter. Flat,
// auto-filterable table so the user can slice by Part / Category / coverage.
function addParametersSheet(wb) {
  const ws = wb.addWorksheet('Parameters Reference', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Part', key: 'part', width: 17 },
    { header: 'Category', key: 'cat', width: 30 },
    { header: 'Parameter', key: 'param', width: 36 },
    { header: 'Definition', key: 'def', width: 78 },
    { header: 'In this report', key: 'cov', width: 15 },
    { header: 'Where computed', key: 'where', width: 32 },
  ]
  const COV_COLOR = { yes: C.pos, partial: 'FFB8860B', no: C.note } // amber for partial
  const writeRow = (vals, cov) => {
    const row = ws.addRow(vals)
    const c = COVERAGE[cov] || COVERAGE.no
    const cell = row.getCell('cov')
    cell.value = c.label
    cell.font = { color: { argb: COV_COLOR[cov] || C.note }, bold: cov === 'yes' }
    cell.alignment = { horizontal: 'center' }
    row.getCell('def').alignment = { wrapText: true, vertical: 'top' }
    row.getCell('param').font = { bold: true }
    row.getCell('param').alignment = { vertical: 'top', wrapText: true }
    row.getCell('where').alignment = { wrapText: true, vertical: 'top' }
    return row
  }
  let count = 0
  for (const p of PARAMETERS)
    for (const s of p.sections)
      for (const par of s.params) {
        writeRow({ part: p.part, cat: s.name, param: par.name, def: par.def, where: par.where || '' }, par.cov)
        count++
      }
  // addendum — metrics this tool computes beyond the reference guide
  for (const e of EXTRA_METRICS) {
    writeRow({ part: 'Beyond the guide', cat: 'Additional metrics', param: e.name, def: e.def, where: e.where }, 'yes')
    count++
  }
  finishTable(ws, count) // header style + zebra + autofilter across data rows
  // legend + source note below the table
  ws.addRow([])
  const legend = ws.addRow(['Legend', `${COVERAGE.yes.label} = computed   ${COVERAGE.partial.label} = partially / proxy   ${COVERAGE.no.label} = not derivable from NAV`])
  legend.getCell(1).font = { bold: true }
  legend.getCell(2).font = { color: { argb: C.note }, size: 10 }
  const note = ws.addRow([REFERENCE_NOTE])
  ws.mergeCells(`A${note.number}:F${note.number}`)
  note.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  note.getCell(1).font = { italic: true, color: { argb: C.note }, size: 10 }
  ws.getRow(note.number).height = 60
  return ws
}

/* ─────────────────────────── styling helpers ─── */
function finishTable(ws, dataRows) {
  ws.getRow(1).eachCell(styleHeaderCell)
  const lastCol = ws.columnCount
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lastCol } }
  for (let r = 2; r <= dataRows + 1; r++) {
    const row = ws.getRow(r)
    if (r % 2 === 0) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.band } } })
  }
}
function greenRed(ws, col, dataRows) {
  if (dataRows < 1) return
  ws.addConditionalFormatting({
    ref: `${col}2:${col}${dataRows + 1}`,
    rules: [
      { type: 'cellIs', operator: 'lessThan', priority: 1, formulae: ['0'], style: { font: { color: { argb: C.neg } } } },
      { type: 'cellIs', operator: 'greaterThan', priority: 2, formulae: ['0'], style: { font: { color: { argb: C.pos } } } },
    ],
  })
}

/* ═══════════════════════════ workbook assembly ═══════════════════════════ */
export async function buildWorkbook(rawData, meta, opts = {}) {
  const rfr = isFinite(opts.rfr) ? opts.rfr : 0.0525
  const real = toSeries(rawData)
  const display = toDisplaySeries(rawData)
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true
  const m = real.length >= 2 ? computeMetrics(real, rfr) : null

  addSummarySheet(wb, meta, m)
  if (display.length) addNavHistorySheet(wb, display)
  if (real.length) {
    addTradingDaysSheet(wb, real)
    // need ≥5 NAVs (≥4 returns) for SKEW/KURT formulas to be valid
    if (m && real.length >= 5) addMetricsSheet(wb, m, real.length + 1)
    if (opts.benchSeries) {
      const b = computeBenchmarkMetrics(real, toSeries(opts.benchSeries), rfr)
      if (b) addBenchmarkSheet(wb, b, opts.benchMeta)
    }
    const roll = rollingReturns(real, 365)
    if (roll && roll.count >= 10) addRollingSheet(wb, roll, '1Y')
  }
  addParametersSheet(wb)
  return wb
}

/* ═══════════════════════════ MULTI-SCHEME ANALYSIS ═══════════════════════════ */
function buildPivot(results, filteredSubsets = {}) {
  const schemes = results.map(r => {
    const raw = filteredSubsets[r.meta.scheme_code] || r.data
    const series = toDisplaySeries(raw)
    const real = toSeries(raw)
    return {
      meta: r.meta, label: `${r.meta.scheme_code} - ${r.meta.scheme_name}`,
      series, real, byRaw: new Map(series.map(p => [p.raw, p.nav])),
      first: series[0]?.date ?? null,
      ath: series.reduce((mx, p) => Math.max(mx, p.nav), -Infinity),
    }
  })
  const dateMap = new Map()
  schemes.forEach(s => s.series.forEach(p => { if (!dateMap.has(p.raw)) dateMap.set(p.raw, p.date) }))
  const dates = [...dateMap.entries()].map(([raw, date]) => ({ raw, date })).sort((a, b) => a.date - b.date)
  const firsts = schemes.map(s => s.first).filter(Boolean)
  const latestStart = firsts.length ? new Date(Math.max(...firsts.map(d => d.getTime()))) : null
  return { schemes, dates, latestStart }
}

function addPivotSheet(wb, name, { schemes, dates, latestStart }, trimmed) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
  ws.columns = [{ width: 13 }, ...schemes.map(() => ({ width: 22 }))]
  let headerRowNum = 1
  if (trimmed) {
    const ath = ws.addRow(['ALL-TIME HIGH', ...schemes.map(s => num(s.ath))]); ath.getCell(1).font = { bold: true }
    const latest = ws.addRow(['LATEST NAV', ...schemes.map(s => num(s.series[s.series.length - 1]?.nav))]); latest.getCell(1).font = { bold: true }
    const below = ws.addRow(['% BELOW ATH', ...schemes.map(s => { const l = s.series[s.series.length - 1]?.nav; return (s.ath > 0 && isFinite(l)) ? (s.ath - l) / s.ath : null })]); below.getCell(1).font = { bold: true }
    ath.eachCell((c, i) => { if (i > 1) c.numFmt = FMT.nav })
    latest.eachCell((c, i) => { if (i > 1) c.numFmt = FMT.nav })
    below.eachCell((c, i) => { if (i > 1) c.numFmt = FMT.pct })
    ws.addRow([])
    headerRowNum = 5
  }
  const hdr = ws.addRow(['Date', ...schemes.map(s => s.label)])
  hdr.eachCell(styleHeaderCell)
  const rowsToShow = trimmed && latestStart ? dates.filter(d => d.date >= latestStart) : dates
  rowsToShow.forEach(({ raw, date }) => {
    const row = ws.addRow([date, ...schemes.map(s => { const v = s.byRaw.get(raw); return v != null ? v : null })])
    row.getCell(1).numFmt = FMT.date
    for (let c = 2; c <= schemes.length + 1; c++) row.getCell(c).numFmt = FMT.nav
  })
  ws.autoFilter = { from: { row: headerRowNum, column: 1 }, to: { row: headerRowNum, column: schemes.length + 1 } }
  return ws
}

function addRollingPivotSheet(wb, { schemes, dates, latestStart }, years) {
  const ws = wb.addWorksheet(`${years}Y Rolling Return`, { views: [{ state: 'frozen', ySplit: 5, xSplit: 1 }] })
  ws.columns = [{ width: 14 }, ...schemes.map(() => ({ width: 16 }))]
  const windowMs = years * 365.25 * 86400000
  const rollVals = schemes.map(() => [])
  const dataRows = []
  const starts = latestStart ? dates.filter(d => d.date >= latestStart) : dates
  starts.forEach(({ raw, date }) => {
    const targetMs = date.getTime() + windowMs
    const cells = [date]; let any = false
    schemes.forEach((s, si) => {
      const startNav = s.byRaw.get(raw)
      if (startNav == null || startNav === 0) { cells.push(null); return }
      let endNav = null, endDate = null
      for (let off = 0; off <= 10 && endNav == null; off++) {
        for (const sign of [1, -1]) {
          const probe = new Date(targetMs + sign * off * 86400000)
          const key = `${String(probe.getDate()).padStart(2, '0')}-${String(probe.getMonth() + 1).padStart(2, '0')}-${probe.getFullYear()}`
          if (s.byRaw.has(key)) { endNav = s.byRaw.get(key); endDate = probe; break }
        }
      }
      if (endNav == null) { cells.push(null); return }
      const cagr = (endNav / startNav) ** (1 / yearsBetween(date, endDate)) - 1
      rollVals[si].push(cagr); cells.push(cagr); any = true
    })
    if (any) dataRows.push(cells)
  })
  const med = (a) => (a.length ? percentileInc(a, 0.5) : null) // same definition as metrics.js
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
  const statRow = (label, fn) => { const r = ws.addRow([label, ...rollVals.map(a => num(fn(a)))]); r.getCell(1).font = { bold: true }; r.eachCell((c, i) => { if (i > 1) c.numFmt = FMT.pct }) }
  statRow('AVERAGE', avg)
  statRow('MEDIAN', med)
  statRow('MIN', a => a.length ? Math.min(...a) : null)
  statRow('MAX', a => a.length ? Math.max(...a) : null)
  const hdr = ws.addRow(['Window start', ...schemes.map(s => s.label)]); hdr.eachCell(styleHeaderCell)
  dataRows.forEach(cells => {
    const row = ws.addRow(cells); row.getCell(1).numFmt = FMT.date
    for (let c = 2; c <= schemes.length + 1; c++) row.getCell(c).numFmt = FMT.pct
  })
  return ws
}

function addComparisonSheet(wb, pivot, rfr, benchSeries) {
  const { schemes } = pivot
  const bench = benchSeries ? toSeries(benchSeries) : null
  const per = schemes.map(s => ({
    m: s.real.length >= 2 ? computeMetrics(s.real, rfr) : null,
    b: bench ? computeBenchmarkMetrics(s.real, bench, rfr) : null,
  }))
  const ws = wb.addWorksheet('Risk Comparison', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
  ws.columns = [{ width: 24 }, ...schemes.map(() => ({ width: 20 }))]
  const hdr = ws.addRow(['METRIC', ...schemes.map(s => s.label)]); hdr.eachCell(styleHeaderCell)
  const section = (t) => { const r = ws.addRow([t]); r.getCell(1).font = { bold: true, color: { argb: C.header } }; r.eachCell(styleSectionCell) }
  const metricRow = (label, pick, fmt) => {
    const r = ws.addRow([label, ...per.map(p => num(pick(p)))])
    r.eachCell((c, i) => { if (i > 1) c.numFmt = fmt })
  }
  section('Return')
  metricRow('CAGR', p => p.m?.returnMetrics.cagr, FMT.pct)
  metricRow('YTD return', p => p.m?.returnMetrics.ytd?.value, FMT.pct)
  metricRow('1Y return', p => p.m?.returnMetrics.trailing['1Y']?.value, FMT.pct)
  metricRow('3Y return (p.a.)', p => p.m?.returnMetrics.trailing['3Y']?.value, FMT.pct)
  metricRow('5Y return (p.a.)', p => p.m?.returnMetrics.trailing['5Y']?.value, FMT.pct)
  metricRow('10Y return (p.a.)', p => p.m?.returnMetrics.trailing['10Y']?.value, FMT.pct)
  metricRow('SIP since-inception (XIRR)', p => p.m?.returnMetrics.sip?.SI?.xirr, FMT.pct)
  section('Risk')
  metricRow('Standard deviation (ann.)', p => p.m?.riskMetrics.annualizedVol, FMT.pct)
  metricRow('Downside deviation', p => p.m?.riskMetrics.downsideDeviation, FMT.pct)
  metricRow('Sharpe ratio', p => p.m?.riskMetrics.sharpe, FMT.ratio)
  metricRow('Sortino ratio', p => p.m?.riskMetrics.sortino, FMT.ratio)
  metricRow('Maximum drawdown', p => p.m?.riskMetrics.maxDrawdown, FMT.pct)
  metricRow('Calmar ratio', p => p.m?.riskMetrics.calmar, FMT.ratio)
  metricRow('VaR 95% (1-day)', p => p.m?.riskMetrics.var95Hist, FMT.pct)
  metricRow('Skewness', p => p.m?.riskMetrics.skewness, FMT.fine)
  metricRow('Excess kurtosis', p => p.m?.riskMetrics.excessKurtosis, FMT.fine)
  if (bench) {
    section('Vs benchmark')
    metricRow('Beta', p => p.b?.beta, FMT.ratio)
    metricRow('Alpha (p.a.)', p => p.b?.alpha, FMT.pct)
    metricRow('Excess return (p.a.)', p => p.b?.excessReturn, FMT.pct)
    metricRow('R-squared', p => p.b?.rSquared, FMT.ratio)
    metricRow('Tracking error (p.a.)', p => p.b?.trackingError, FMT.pct)
    metricRow('Information ratio', p => p.b?.informationRatio, FMT.ratio)
    metricRow('Up-capture', p => p.b?.upCapture, FMT.ratio)
    metricRow('Down-capture', p => p.b?.downCapture, FMT.ratio)
    metricRow('Rolling 1Y win rate', p => p.b?.rollingWinRate1Y, FMT.pct)
    metricRow('Calendar-year hit rate', p => p.b?.yearlyHitRate, FMT.pct)
  }

  // Peer ranking within the selected set — a proxy for category-relative metrics
  // (true category data isn't available from the NAV feed). 1 = best.
  if (schemes.length >= 2) {
    const arrRow = (label, arr, fmt) => {
      const r = ws.addRow([label, ...arr.map(num)])
      r.eachCell((c, i) => { if (i > 1) c.numFmt = fmt })
    }
    const rankDesc = (arr) => {
      const order = arr.map((v, i) => ({ v, i })).filter(o => isFinite(o.v)).sort((a, b) => b.v - a.v)
      const rank = arr.map(() => null)
      order.forEach((o, idx) => { rank[o.i] = idx + 1 })
      return rank
    }
    const pctile = (arr) => {
      const valid = arr.filter(isFinite)
      return arr.map(v => isFinite(v) && valid.length ? valid.filter(x => x <= v).length / valid.length : null)
    }
    const cagrs = per.map(p => p.m?.returnMetrics.cagr)
    const sharpes = per.map(p => p.m?.riskMetrics.sharpe)
    const validCagr = cagrs.filter(isFinite)
    const setAvg = validCagr.length ? validCagr.reduce((a, b) => a + b, 0) / validCagr.length : null
    section('Peer ranking (within selected set)')
    arrRow('Set-average CAGR', cagrs.map(() => setAvg), FMT.pct)
    arrRow('Excess vs set-average CAGR', cagrs.map(v => isFinite(v) && setAvg != null ? v - setAvg : null), FMT.pct)
    arrRow('CAGR rank (1 = best)', rankDesc(cagrs), FMT.int)
    arrRow('CAGR percentile', pctile(cagrs), FMT.pct)
    arrRow('Sharpe rank (1 = best)', rankDesc(sharpes), FMT.int)
  }

  const foot = ws.addRow([`Risk-free ${(rfr * 100).toFixed(2)}% · vol ×√252 · ${bench ? 'benchmark provided' : 'no benchmark'} · peer ranks are within the selected set only`])
  foot.getCell(1).font = { italic: true, color: { argb: C.note }, size: 10 }
  return ws
}

export async function buildAnalysisWorkbook(results, filteredSubsets = {}, opts = {}) {
  const rfr = isFinite(opts.rfr) ? opts.rfr : 0.0525
  const pivot = buildPivot(results, filteredSubsets)
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true
  addComparisonSheet(wb, pivot, rfr, opts.benchSeries)
  addPivotSheet(wb, 'Trimmed + ATH', pivot, true)
  addRollingPivotSheet(wb, pivot, 3)
  addRollingPivotSheet(wb, pivot, 5)
  addPivotSheet(wb, 'Full NAV', pivot, false)
  addParametersSheet(wb)
  return wb
}

/* ═══════════════════════════ download plumbing ═══════════════════════════ */
async function wbBuffer(wb) {
  const buf = await wb.xlsx.writeBuffer()
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf)
}
function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = sanitizeFilename(filename); a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ═══════════════════════════ public API ═══════════════════════════ */
export async function downloadExcel(rawData, meta, filename = 'mutual_fund_data.xlsx', opts = {}) {
  triggerDownload(await wbBuffer(await buildWorkbook(rawData, meta, opts)), filename)
}

export async function downloadBulkZip(results, opts = {}) {
  const zip = new JSZip()
  const codes = results.map(r => r.meta.scheme_code).join(',')
  const baseName = sanitizeFilename(`MF Analytics [${results.length}] [${codes}]`).slice(0, 120)
  for (const res of results) {
    const { meta, data, reqStart, reqEnd } = res
    const datePart = (reqStart || reqEnd) ? `${reqStart || ''}-${reqEnd || ''}`.replace(/^-|-$/g, '') : 'all'
    const wb = await buildWorkbook(data, meta, opts)
    zip.file(sanitizeFilename(`${meta.scheme_code} - ${meta.scheme_name} - ${datePart}.xlsx`), await wbBuffer(wb))
  }
  if (results.length > 1) {
    const analysis = await buildAnalysisWorkbook(results, opts.filteredSubsets || {}, opts)
    zip.file(`${baseName} - comparison.xlsx`, await wbBuffer(analysis))
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url; a.download = `${baseName}.zip`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadAnalysisXlsx(results, filteredSubsets = {}, opts = {}) {
  triggerDownload(await wbBuffer(await buildAnalysisWorkbook(results, filteredSubsets, opts)), 'mf_comparison_analysis.xlsx')
}

// Scheme LIST export (codes + names only) — lightweight, stays on SheetJS.
export function downloadSearchResultsExcel(results, filename = 'mf_scheme_list.xlsx') {
  const wb = XLSX.utils.book_new()
  const aoa = [['Scheme Code', 'Scheme Name'], ...results.map(r => [r.schemeCode, r.schemeName])]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 14 }, { wch: 72 }]
  ws['!autofilter'] = { ref: ws['!ref'] }
  XLSX.utils.book_append_sheet(wb, ws, 'Scheme List')
  XLSX.writeFile(wb, sanitizeFilename(filename), { bookType: 'xlsx' })
}

// Web Excel push (numbers stay numeric for Fortune-Sheet).
export function analysisSheetsForWebExcel(results, filteredSubsets = {}, opts = {}) {
  const rfr = isFinite(opts.rfr) ? opts.rfr : 0.0525
  const pivot = buildPivot(results, filteredSubsets)
  const { schemes, dates, latestStart } = pivot
  const labels = schemes.map(s => s.label)
  const bench = opts.benchSeries ? toSeries(opts.benchSeries) : null
  const per = schemes.map(s => ({
    m: s.real.length >= 2 ? computeMetrics(s.real, rfr) : null,
    b: bench ? computeBenchmarkMetrics(s.real, bench, rfr) : null,
  }))
  const numD = (v, d = 4) => (isFinite(v) ? +v.toFixed(d) : '')
  const pct = (v) => (isFinite(v) ? +(v * 100).toFixed(2) : '')
  const cmp = [['METRIC', ...labels]]
  cmp.push(['CAGR %', ...per.map(p => pct(p.m?.returnMetrics.cagr))])
  cmp.push(['YTD %', ...per.map(p => pct(p.m?.returnMetrics.ytd?.value))])
  cmp.push(['1Y %', ...per.map(p => pct(p.m?.returnMetrics.trailing['1Y']?.value))])
  cmp.push(['3Y % p.a.', ...per.map(p => pct(p.m?.returnMetrics.trailing['3Y']?.value))])
  cmp.push(['SIP SI XIRR %', ...per.map(p => pct(p.m?.returnMetrics.sip?.SI?.xirr))])
  cmp.push(['Std deviation % (ann.)', ...per.map(p => pct(p.m?.riskMetrics.annualizedVol))])
  cmp.push(['Sharpe', ...per.map(p => numD(p.m?.riskMetrics.sharpe, 2))])
  cmp.push(['Sortino', ...per.map(p => numD(p.m?.riskMetrics.sortino, 2))])
  cmp.push(['Max drawdown %', ...per.map(p => pct(p.m?.riskMetrics.maxDrawdown))])
  cmp.push(['Skewness', ...per.map(p => numD(p.m?.riskMetrics.skewness, 3))])
  cmp.push(['Excess kurtosis', ...per.map(p => numD(p.m?.riskMetrics.excessKurtosis, 3))])
  if (bench) {
    cmp.push(['Beta', ...per.map(p => numD(p.b?.beta, 3))])
    cmp.push(['Alpha % p.a.', ...per.map(p => pct(p.b?.alpha))])
    cmp.push(['Excess return % p.a.', ...per.map(p => pct(p.b?.excessReturn))])
    cmp.push(['R-squared', ...per.map(p => numD(p.b?.rSquared, 3))])
    cmp.push(['Tracking error %', ...per.map(p => pct(p.b?.trackingError))])
    cmp.push(['Rolling 1Y win rate %', ...per.map(p => pct(p.b?.rollingWinRate1Y))])
    cmp.push(['Cal-year hit rate %', ...per.map(p => pct(p.b?.yearlyHitRate))])
  }
  const rowsToShow = latestStart ? dates.filter(d => d.date >= latestStart) : dates
  const navRows = [['Date', ...labels]]
  rowsToShow.forEach(({ raw }) => navRows.push([raw, ...schemes.map(s => { const v = s.byRaw.get(raw); return v != null ? +v : '' })]))
  return [{ name: 'Risk Comparison', rows: cmp }, { name: 'NAV (Common Window)', rows: navRows }]
}

function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.{2,}/g, '_').slice(0, 200)
}
