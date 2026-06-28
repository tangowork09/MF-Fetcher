/**
 * metrics.js — Mutual-fund risk & return analytics.
 *
 * Pure, dependency-free functions. Conventions follow Value Research /
 * Morningstar India methodology (verified against primary sources):
 *   - Periodic returns are SIMPLE: r_t = NAV_t / NAV_{t-1} - 1
 *   - CAGR / annualized return is GEOMETRIC
 *   - Standard deviation is the SAMPLE (n-1) std dev, annualized by sqrt(252)
 *     because Indian MF NAVs are published on ~252 business days/year.
 *     (Annualizing by sqrt(365) over-states volatility by ~20% — this, plus
 *     the old flat-fill of weekend NAVs, was the std-dev bug.)
 *   - Distribution stats (skew, excess kurtosis) match Excel SKEW / KURT.
 *   - Historical VaR/CVaR use the empirical return distribution.
 *
 * Every function works on an ASCENDING-by-date NAV series.
 */

export const TRADING_DAYS = 252

/* ─────────────────────────── parsing / shaping ─── */

// API NAV dates are "dd-mm-yyyy". Parse to a real Date (local midnight).
export function parseNavDate(s) {
  const [d, m, y] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Excel serial date: whole days since 1899-12-30 (absorbs the 1900 leap bug).
export function dateToSerial(date) {
  const epoch = Date.UTC(1899, 11, 30)
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((utc - epoch) / 86400000)
}

/**
 * Normalize raw mfapi rows -> ascending [{date:Date, nav:Number}], dropping
 * non-numeric/zero NAVs and de-duplicating identical dates. mfapi returns
 * newest-first; analytics need oldest-first.
 */
export function toSeries(rows, { includeFilled = false } = {}) {
  if (!Array.isArray(rows)) return []
  const seen = new Set()
  const out = []
  for (const r of rows) {
    // Skip forward-filled non-trading days for metrics: flat-filled weekends/
    // holidays would inject fake 0%-return days and deflate volatility.
    if (!includeFilled && r.filled) continue
    const nav = parseFloat(r.nav)
    if (!isFinite(nav) || nav <= 0) continue
    const key = r.date
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ date: parseNavDate(r.date), raw: r.date, nav, filled: !!r.filled })
  }
  out.sort((a, b) => a.date - b.date)
  return out
}

// Display series: keeps forward-filled calendar days for a continuous listing.
export function toDisplaySeries(rows) {
  return toSeries(rows, { includeFilled: true })
}

/* ─────────────────────────── primitive stats ─── */

export function mean(a) {
  if (!a.length) return NaN
  return a.reduce((s, x) => s + x, 0) / a.length
}

// Sample (n-1) standard deviation — Excel STDEV.S.
export function sampleStd(a) {
  const n = a.length
  if (n < 2) return NaN
  const m = mean(a)
  const ss = a.reduce((s, x) => s + (x - m) ** 2, 0)
  return Math.sqrt(ss / (n - 1))
}

// Excel SKEW — bias-corrected sample skewness.
export function skewness(a) {
  const n = a.length
  if (n < 3) return NaN
  const m = mean(a)
  const s = sampleStd(a)
  if (!(s > 0)) return NaN
  const sum = a.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0)
  return (n / ((n - 1) * (n - 2))) * sum
}

// Excel KURT — bias-corrected sample EXCESS kurtosis (normal = 0).
export function excessKurtosis(a) {
  const n = a.length
  if (n < 4) return NaN
  const m = mean(a)
  const s = sampleStd(a)
  if (!(s > 0)) return NaN
  const sum = a.reduce((acc, x) => acc + ((x - m) / s) ** 4, 0)
  const t1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))
  const t2 = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  return t1 * sum - t2
}

// Excel PERCENTILE.INC — linear interpolation on the sorted sample.
export function percentileInc(a, p) {
  const n = a.length
  if (!n) return NaN
  const s = [...a].sort((x, y) => x - y)
  if (n === 1) return s[0]
  const rank = p * (n - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return s[lo]
  return s[lo] + (rank - lo) * (s[hi] - s[lo])
}

export function covariance(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 2) return NaN
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let s = 0
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb)
  return s / (n - 1)
}

export function correlation(a, b) {
  const n = Math.min(a.length, b.length)
  const aa = a.slice(0, n), bb = b.slice(0, n)
  const sa = sampleStd(aa)
  const sb = sampleStd(bb)
  if (!(sa > 0) || !(sb > 0)) return NaN
  return covariance(aa, bb) / (sa * sb)
}

/* ─────────────────────────── returns ─── */

// Simple periodic returns from an ascending NAV array.
export function dailyReturns(navs) {
  const r = []
  for (let i = 1; i < navs.length; i++) r.push(navs[i] / navs[i - 1] - 1)
  return r
}

// Years between two dates, Actual/365.25 (for CAGR / elapsed time).
export function yearsBetween(d0, d1) {
  return (d1 - d0) / (365.25 * 86400000)
}

// NAV at-or-before a target date (nearest prior business day). Series ascending.
function navAtOrBefore(series, target) {
  let found = null
  for (const p of series) {
    if (p.date <= target) found = p
    else break
  }
  return found
}

/**
 * Trailing return ending at the last observation, looking back `days` calendar
 * days. <=1 year -> absolute %, >1 year -> CAGR. Returns null if no data point
 * old enough exists.
 */
export function trailingReturn(series, days) {
  if (series.length < 2) return null
  const end = series[series.length - 1]
  const targetMs = end.date.getTime() - days * 86400000
  const start = navAtOrBefore(series, new Date(targetMs))
  if (!start || start.date >= end.date) return null
  // reject if the matched start is far earlier than the requested lookback
  // (data doesn't actually reach back that far) — avoids mislabeled returns
  if (targetMs - start.date.getTime() > 45 * 86400000) return null
  const yrs = yearsBetween(start.date, end.date)
  const annualized = yrs > 1 // ≤1y → absolute, >1y → CAGR (SEBI/AMFI convention)
  const ratio = end.nav / start.nav
  const value = annualized ? ratio ** (1 / yrs) - 1 : ratio - 1
  return { value, annualized, startDate: start.raw, startNav: start.nav, years: yrs }
}

/**
 * Rolling returns: for every start date whose window-end exists, the annualized
 * (CAGR if window>1y) return over `windowDays`. Returns the distribution.
 */
export function rollingReturns(series, windowDays) {
  if (series.length < 2) return null
  const out = []
  const wMs = windowDays * 86400000
  for (let i = 0; i < series.length; i++) {
    const startP = series[i]
    const endTarget = new Date(startP.date.getTime() + wMs)
    if (endTarget > series[series.length - 1].date) break
    // first observation at-or-after the window end
    let endP = null
    for (let j = i + 1; j < series.length; j++) {
      if (series[j].date >= endTarget) { endP = series[j]; break }
    }
    if (!endP) continue
    const yrs = yearsBetween(startP.date, endP.date)
    const ratio = endP.nav / startP.nav
    out.push(windowDays > 366 ? ratio ** (1 / yrs) - 1 : ratio - 1)
  }
  if (!out.length) return null
  return {
    count: out.length,
    average: mean(out),
    median: percentileInc(out, 0.5),
    min: Math.min(...out),
    max: Math.max(...out),
    std: sampleStd(out),
    pctPositive: out.filter(x => x > 0).length / out.length,
    values: out,
  }
}

/* ─────────────────────────── drawdown ─── */

export function maxDrawdown(series) {
  if (series.length < 2) return null
  let peak = series[0].nav
  let peakDate = series[0].raw
  let worst = 0
  let troughDate = series[0].raw
  let mddPeakDate = series[0].raw
  for (const p of series) {
    if (p.nav > peak) { peak = p.nav; peakDate = p.raw }
    const dd = p.nav / peak - 1
    if (dd < worst) { worst = dd; troughDate = p.raw; mddPeakDate = peakDate }
  }
  return { value: Math.abs(worst), peakDate: mddPeakDate, troughDate }
}

/* ─────────────────────────── full metric set ─── */

/**
 * Compute every self-contained metric from an ascending NAV series.
 * @param {Array} series  [{date:Date, raw:String, nav:Number}] ascending
 * @param {Number} rfAnnual  annual risk-free rate as a fraction (e.g. 0.0525)
 */
export function computeMetrics(series, rfAnnual = 0.0525) {
  if (!series || series.length < 2) return null
  const navs = series.map(p => p.nav)
  const rets = dailyReturns(navs)
  const n = rets.length
  const start = series[0]
  const end = series[series.length - 1]
  const years = yearsBetween(start.date, end.date)

  const mDaily = mean(rets)
  const sDaily = sampleStd(rets)
  const annVol = sDaily * Math.sqrt(TRADING_DAYS)
  const annArith = mDaily * TRADING_DAYS // arithmetic annualized (Sharpe numerator base)
  const rfDaily = rfAnnual / TRADING_DAYS

  // downside deviation, MAR = daily risk-free (consistent with Sharpe)
  let dsSum = 0
  for (const r of rets) { const d = Math.min(r - rfDaily, 0); dsSum += d * d }
  const downsideDevDaily = Math.sqrt(dsSum / n)
  const annDownside = downsideDevDaily * Math.sqrt(TRADING_DAYS)

  // Floor the span before annualizing: a sub-quarter sample annualized as CAGR
  // produces absurd (e.g. quadrillion-%) figures.
  const cagr = years >= 0.25 ? (end.nav / start.nav) ** (1 / years) - 1 : NaN
  const absReturn = end.nav / start.nav - 1

  const sharpe = annVol > 0 ? (annArith - rfAnnual) / annVol : NaN
  // Sortino is meaningless on a zero-variance (flat) series — match Sharpe → NaN.
  const sortino = (annDownside > 0 && sDaily > 0) ? (annArith - rfAnnual) / annDownside : NaN

  const mdd = maxDrawdown(series)
  const calmar = mdd && mdd.value > 0 && isFinite(cagr) ? cagr / mdd.value : NaN

  // historical VaR / CVaR (1-day)
  const var95 = -percentileInc(rets, 0.05)
  const var99 = -percentileInc(rets, 0.01)
  const thresh95 = percentileInc(rets, 0.05)
  const tail = rets.filter(r => r <= thresh95)
  const cvar95 = tail.length ? -mean(tail) : NaN
  // parametric (normal) 1-day 95% VaR
  const var95p = -(mDaily + (-1.6448536269514722) * sDaily)

  const pos = rets.filter(r => r > 0).length
  const neg = rets.filter(r => r < 0).length

  const trailing = {
    '1M': trailingReturn(series, 30),
    '3M': trailingReturn(series, 91),
    '6M': trailingReturn(series, 182),
    '1Y': trailingReturn(series, 365),
    '3Y': trailingReturn(series, 365 * 3),
    '5Y': trailingReturn(series, 365 * 5),
  }
  const rolling1Y = rollingReturns(series, 365)

  return {
    rfAnnual,
    period: {
      startDate: start.raw, endDate: end.raw,
      startNav: start.nav, endNav: end.nav,
      observations: series.length, returns: n, years,
    },
    returnMetrics: {
      absoluteReturn: absReturn,
      cagr,
      annualizedArithmetic: annArith,
      meanDaily: mDaily,
      bestDay: Math.max(...rets),
      worstDay: Math.min(...rets),
      trailing,
      rolling1Y: rolling1Y && {
        average: rolling1Y.average, median: rolling1Y.median,
        min: rolling1Y.min, max: rolling1Y.max, std: rolling1Y.std,
        pctPositive: rolling1Y.pctPositive, count: rolling1Y.count,
      },
    },
    riskMetrics: {
      annualizedVol: annVol,
      dailyStd: sDaily,
      downsideDeviation: annDownside,
      sharpe, sortino,
      maxDrawdown: mdd ? mdd.value : NaN,
      maxDrawdownPeak: mdd ? mdd.peakDate : null,
      maxDrawdownTrough: mdd ? mdd.troughDate : null,
      calmar,
      var95Hist: var95, var99Hist: var99, var95Param: var95p,
      cvar95Hist: cvar95,
      skewness: skewness(rets),
      excessKurtosis: excessKurtosis(rets),
      positivePct: pos / n,
      negativePct: neg / n,
    },
  }
}

/* ─────────────────────────── benchmark-relative ─── */

// Align two ascending series on common dates -> aligned NAV arrays + dates.
function alignedSeries(fund, bench) {
  const bMap = new Map(bench.map(p => [p.raw, p.nav]))
  const dates = [], f = [], b = []
  for (const p of fund) {
    if (bMap.has(p.raw)) { dates.push(p.date); f.push(p.nav); b.push(bMap.get(p.raw)) }
  }
  return { dates, f, b }
}

// Month-end NAVs -> monthly simple returns (last NAV of each calendar month).
function monthlyReturns(dates, navs) {
  const byMonth = new Map()
  dates.forEach((d, i) => byMonth.set(`${d.getFullYear()}-${d.getMonth()}`, navs[i])) // ascending → last wins
  const vals = [...byMonth.values()]
  const r = []
  for (let i = 1; i < vals.length; i++) r.push(vals[i] / vals[i - 1] - 1)
  return r
}

/**
 * Benchmark-relative metrics. Beta/alpha/R²/Treynor/tracking-error/info-ratio
 * are computed on DAILY paired returns (daily-engine convention); up/down
 * CAPTURE ratios are computed on MONTHLY returns (Value Research / Morningstar
 * convention). Needs a benchmark series aligned by date.
 */
export function computeBenchmarkMetrics(fundSeries, benchSeries, rfAnnual = 0.0525) {
  if (!fundSeries || !benchSeries) return null
  const { dates, f, b } = alignedSeries(fundSeries, benchSeries)
  if (f.length < 2) return null
  const fr = dailyReturns(f), br = dailyReturns(b)
  const pairs = f.length

  const varB = sampleStd(br) ** 2
  const beta = varB > 0 ? covariance(fr, br) / varB : NaN
  const corr = correlation(fr, br)
  const rSquared = isFinite(corr) ? Math.min(1, corr * corr) : NaN // clamp float noise

  const annF = mean(fr) * TRADING_DAYS
  const annB = mean(br) * TRADING_DAYS
  const alpha = annF - (rfAnnual + beta * (annB - rfAnnual))
  const treynor = beta !== 0 && isFinite(beta) ? (annF - rfAnnual) / beta : NaN

  const active = fr.map((x, i) => x - br[i])
  const trackingError = sampleStd(active) * Math.sqrt(TRADING_DAYS)
  const infoRatio = trackingError > 0 ? (mean(active) * TRADING_DAYS) / trackingError : NaN

  // up/down capture: geometric over MONTHS where the benchmark was up / down
  const fm = monthlyReturns(dates, f), bm = monthlyReturns(dates, b)
  const cap = (mask) => {
    let prodF = 1, prodB = 1, k = 0
    for (let i = 0; i < bm.length; i++) { if (mask(bm[i])) { prodF *= 1 + fm[i]; prodB *= 1 + bm[i]; k++ } }
    return { f: prodF - 1, b: prodB - 1, k }
  }
  const up = cap(x => x > 0)
  const down = cap(x => x < 0)
  const upCapture = up.b !== 0 ? (up.f / up.b) * 100 : NaN
  const downCapture = down.b !== 0 ? (down.f / down.b) * 100 : NaN

  return {
    pairs, beta, alpha, rSquared, treynor,
    trackingError, informationRatio: infoRatio,
    upCapture, downCapture,
    upPeriods: up.k, downPeriods: down.k, // months
  }
}
