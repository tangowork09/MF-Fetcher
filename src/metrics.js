/**
 * metrics.js — Mutual-fund risk & return analytics.
 *
 * Pure, dependency-free functions. Conventions follow Value Research /
 * Morningstar India methodology (verified against primary sources):
 *   - Periodic returns are SIMPLE: r_t = NAV_t / NAV_{t-1} - 1
 *   - CAGR / annualized return is GEOMETRIC
 *   - Standard deviation is the SAMPLE (n-1) std dev, annualized by the
 *     detected NAV cadence: sqrt(252) for business-day funds, sqrt(365) for
 *     7-day daily-NAV funds, sqrt(observed obs/yr) for mixed cadences
 *     (see detectPeriodsPerYear). Flat-filled weekend NAVs are excluded.
 *   - Distribution stats (skew, excess kurtosis) match Excel SKEW / KURT.
 *   - Historical VaR/CVaR use the empirical return distribution.
 *
 * Every function works on an ASCENDING-by-date NAV series.
 */

export const TRADING_DAYS = 252

/**
 * Annualization basis from observation density. Snap to the two market
 * conventions when the cadence clearly matches (business-day ≈252/yr,
 * full-calendar ≈365/yr); otherwise use the OBSERVED frequency. Real funds
 * sit in between — e.g. Baroda overnight publishes ~296 NAVs/yr via mfapi
 * (roughly 6 days/wk): snapping it to 252 understates annualized return
 * (Sharpe −6.5 on a 5.13%-CAGR fund) while snapping to 365 overstates it
 * (Sharpe +5). mean(ret)×observed-frequency is the only sum that telescopes
 * to the true annual return regardless of publication cadence.
 */
export function detectPeriodsPerYear(nReturns, years) {
  if (!(years > 0) || !(nReturns > 0)) return TRADING_DAYS
  const obsPerYear = nReturns / years
  if (obsPerYear >= 340) return 365 // 7-day daily-NAV fund
  if (obsPerYear >= 230 && obsPerYear <= 270) return TRADING_DAYS // business-day fund
  return Math.max(1, Math.round(obsPerYear)) // mixed / sparse cadence → observed
}

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

// NAV at-or-after a target date (nearest following business day). For SIP, you
// buy on the first available NAV on/after each scheduled installment date.
function navAtOrAfter(series, target) {
  for (const p of series) if (p.date >= target) return p
  return null
}

/**
 * Trailing return ending at the last observation, looking back `days` calendar
 * days. <=1 year -> absolute %, >1 year -> CAGR. Returns null if no data point
 * old enough exists.
 * @param {Number} nominalYears  when annualizing, exponent = 1/nominalYears
 *   (flat 1/3/5/10) instead of 1/actual-elapsed-years — matches how AMFI/
 *   Value Research quote "3Y return" regardless of exact weekend/holiday drift
 *   in the matched start date.
 */
export function trailingReturn(series, days, nominalYears = null) {
  if (series.length < 2) return null
  const end = series[series.length - 1]
  const targetMs = end.date.getTime() - days * 86400000
  const start = navAtOrBefore(series, new Date(targetMs))
  if (!start || start.date >= end.date) return null
  // reject if the matched start is far earlier than the requested lookback
  // (data doesn't actually reach back that far) — avoids mislabeled returns.
  // Tolerance scales with the window: a "1M return" may drift a few days over
  // a weekend/holiday, not 45 — a flat 45-day guard let a 30-day lookback
  // report a 70-day return.
  const maxDriftDays = Math.max(7, Math.min(45, Math.round(days * 0.125)))
  if (targetMs - start.date.getTime() > maxDriftDays * 86400000) return null
  const yrs = yearsBetween(start.date, end.date)
  const annualized = yrs > 1 // ≤1y → absolute, >1y → CAGR (SEBI/AMFI convention)
  const ratio = end.nav / start.nav
  const n = nominalYears || yrs
  const value = annualized ? ratio ** (1 / n) - 1 : ratio - 1
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
    // Gap guard: if the matched end drifts far past the window target (a NAV
    // publication hole), the window no longer represents `windowDays` — a
    // "+20% over 18 months" move would pollute the 1Y distribution as a
    // "+20% 1Y window". Normal weekend/holiday drift is ≤ ~5 days.
    if (endP.date.getTime() - endTarget.getTime() > 10 * 86400000) continue
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

// Year-to-date return: last NAV of the previous calendar year → latest NAV.
export function ytdReturn(series) {
  if (series.length < 2) return null
  const end = series[series.length - 1]
  // Base = last NAV of the PRIOR calendar year. Target Dec-31 of last year so a
  // NAV dated exactly Jan-1 of the current year is excluded from the base.
  const prevYearEnd = new Date(end.date.getFullYear() - 1, 11, 31)
  const start = navAtOrBefore(series, prevYearEnd)
  if (!start || start.date >= end.date) return null
  return { value: end.nav / start.nav - 1, startDate: start.raw, startNav: start.nav }
}

/* ─────────────────────────── SIP / XIRR ─── */

/**
 * XIRR — internal rate of return for irregular cash flows. Newton-Raphson with
 * a bisection fallback (robust when Newton diverges). cashflows: ascending
 * [{date:Date, amount:Number}] with at least one negative and one positive.
 * Returns an annualized fraction (e.g. 0.143 = 14.3% p.a.), or NaN.
 */
export function xirr(cashflows) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) return NaN
  const hasNeg = cashflows.some(c => c.amount < 0)
  const hasPos = cashflows.some(c => c.amount > 0)
  if (!hasNeg || !hasPos) return NaN
  const t0 = cashflows[0].date.getTime()
  const yf = (c) => (c.date.getTime() - t0) / (365 * 86400000) // Actual/365
  const npv = (r) => cashflows.reduce((s, c) => s + c.amount / (1 + r) ** yf(c), 0)
  const dnpv = (r) => cashflows.reduce((s, c) => { const t = yf(c); return s - (t * c.amount) / (1 + r) ** (t + 1) }, 0)

  // Newton-Raphson
  const scale = Math.max(...cashflows.map(c => Math.abs(c.amount)), 1)
  let r = 0.1
  for (let i = 0; i < 100; i++) {
    const f = npv(r), fp = dnpv(r)
    if (!isFinite(f) || !isFinite(fp) || fp === 0) break
    let rn = r - f / fp
    if (rn <= -0.9999) rn = (r - 0.9999) / 2 // damp toward the -100% floor
    if (Math.abs(rn - r) < 1e-8) {
      // Step-size convergence alone can stall off-root (e.g. pinned against
      // the -100% floor) — accept only a true root, else fall to bisection.
      if (Math.abs(npv(rn)) < 1e-6 * scale) return rn
      break
    }
    r = rn
  }
  // Bisection fallback — grow the upper bracket geometrically until the NPV
  // changes sign (so very high IRRs are still bracketed), then bisect.
  let lo = -0.9999, hi = 1
  let flo = npv(lo), fhi = npv(hi)
  for (let g = 0; g < 40 && flo * fhi > 0 && hi < 1e6; g++) { hi *= 2; fhi = npv(hi) }
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) {
    return isFinite(r) && Math.abs(npv(r)) < 1e-4 * scale ? r : NaN // scale-relative guard
  }
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid)
    if (Math.abs(fm) < 1e-9 || (hi - lo) < 1e-10) return mid
    if (flo * fm < 0) { hi = mid; fhi = fm } else { lo = mid; flo = fm }
  }
  return (lo + hi) / 2
}

/**
 * SIP return: simulate a fixed monthly investment (default ₹10,000) bought on
 * the first available NAV on/after each month's installment date, then solve
 * XIRR over the contribution cash flows plus the terminal redemption value.
 * `lookbackDays` null = since inception. Returns null if <2 installments fit or
 * the requested window pre-dates available history (avoids mislabeled windows).
 */
export function sipReturn(series, lookbackDays = null, amount = 10000) {
  if (!series || series.length < 2) return null
  const end = series[series.length - 1]
  const startBound = lookbackDays ? new Date(end.date.getTime() - lookbackDays * 86400000) : series[0].date
  // Window pre-dates our data → don't pretend it's a full N-year SIP.
  if (lookbackDays && series[0].date.getTime() > startBound.getTime() + 45 * 86400000) return null

  const cfs = []
  let units = 0, invested = 0
  // Anchor the installment day-of-month and clamp to each month's last valid
  // day, so a 29–31 start doesn't overflow into the next month (which would
  // SKIP a month — e.g. Jan-31 → Mar-2 drops February — and permanently drift
  // the buy day). Feb stays Feb-28/29; the anchor day is restored in long months.
  const anchorDay = startBound.getDate()
  const daysInMonth = (y, mo) => new Date(y, mo + 1, 0).getDate()
  let y = startBound.getFullYear(), mo = startBound.getMonth()
  let cur = new Date(y, mo, Math.min(anchorDay, daysInMonth(y, mo)))
  // Step month-by-month; buy on first NAV on/after each scheduled date.
  // Both bounds STRICT (< end.date): a buy on the terminal valuation date is
  // degenerate (bought and redeemed the same instant — it cancels in XIRR but
  // inflates invested/installments, e.g. a "1Y SIP" showing 13 × ₹10k).
  // Skip buys that collapse onto an already-bought date (scheduled dates that
  // pre-date the fund's history all match its first NAV — no double-buying).
  let lastBuyMs = 0
  while (cur < end.date) {
    const p = navAtOrAfter(series, cur)
    if (p && p.date < end.date && p.date.getTime() !== lastBuyMs) {
      units += amount / p.nav
      invested += amount
      cfs.push({ date: p.date, amount: -amount })
      lastBuyMs = p.date.getTime()
    }
    mo += 1
    if (mo > 11) { mo = 0; y += 1 }
    cur = new Date(y, mo, Math.min(anchorDay, daysInMonth(y, mo)))
  }
  if (cfs.length < 2) return null
  const finalValue = units * end.nav
  cfs.push({ date: end.date, amount: finalValue })
  const annualized = xirr(cfs)
  return {
    xirr: annualized,
    invested,
    finalValue,
    gain: finalValue - invested,
    absoluteReturn: invested > 0 ? finalValue / invested - 1 : NaN,
    installments: cfs.length - 1,
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
  // Detect publication frequency: overnight/liquid funds publish NAVs most or
  // all calendar days, so their per-observation returns are calendar accruals —
  // annualizing by 252 understates return/vol (e.g. a 5.13%-CAGR overnight
  // fund showed annArith 4.26%, Sharpe −6.5). Business-day series (~250
  // obs/yr) stay on the standard 252 convention; anything else uses its
  // observed cadence (see detectPeriodsPerYear).
  const periodsPerYear = detectPeriodsPerYear(n, years)
  const annVol = sDaily * Math.sqrt(periodsPerYear)
  const annArith = mDaily * periodsPerYear // arithmetic annualized (Sharpe numerator base)
  const rfDaily = rfAnnual / periodsPerYear

  // downside deviation, MAR = daily risk-free (consistent with Sharpe)
  let dsSum = 0
  for (const r of rets) { const d = Math.min(r - rfDaily, 0); dsSum += d * d }
  const downsideDevDaily = Math.sqrt(dsSum / n)
  const annDownside = downsideDevDaily * Math.sqrt(periodsPerYear)

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
    '1Y': trailingReturn(series, 365, 1),
    '3Y': trailingReturn(series, 365 * 3, 3),
    '5Y': trailingReturn(series, 365 * 5, 5),
    '10Y': trailingReturn(series, 365 * 10, 10),
  }
  const rolling1Y = rollingReturns(series, 365)
  const rolling3Y = rollingReturns(series, 365 * 3)
  const rolling5Y = rollingReturns(series, 365 * 5)
  const ytd = ytdReturn(series)
  const sip = {
    '1Y': sipReturn(series, 365),
    '3Y': sipReturn(series, 365 * 3),
    '5Y': sipReturn(series, 365 * 5),
    'SI': sipReturn(series, null), // since inception (of available data)
  }

  return {
    rfAnnual,
    periodsPerYear, // annualization basis (252 business-day / 365 daily-NAV funds)
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
      ytd,
      trailing,
      sip,
      rolling1Y: rolling1Y && {
        average: rolling1Y.average, median: rolling1Y.median,
        min: rolling1Y.min, max: rolling1Y.max, std: rolling1Y.std,
        pctPositive: rolling1Y.pctPositive, count: rolling1Y.count,
      },
      rolling3Y: rolling3Y && {
        average: rolling3Y.average, median: rolling3Y.median,
        min: rolling3Y.min, max: rolling3Y.max, std: rolling3Y.std,
        pctPositive: rolling3Y.pctPositive, count: rolling3Y.count,
      },
      rolling5Y: rolling5Y && {
        average: rolling5Y.average, median: rolling5Y.median,
        min: rolling5Y.min, max: rolling5Y.max, std: rolling5Y.std,
        pctPositive: rolling5Y.pctPositive, count: rolling5Y.count,
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
  dates.forEach((d, i) => byMonth.set(`${d.getFullYear()}-${d.getMonth()}`, { nav: navs[i], date: d })) // ascending → last wins
  const entries = [...byMonth.values()]
  // Drop a trailing PARTIAL month: when the series ends mid-month, a few-day
  // stub would get full monthly weight in the capture ratios (a -4% crash in
  // the first 3 days of a month becomes a whole "down month"). Morningstar
  // uses complete months. 5-day tolerance: month-ends fall on weekends/holidays.
  if (entries.length) {
    const last = entries[entries.length - 1].date
    const monthEnd = new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate()
    if (monthEnd - last.getDate() > 5) entries.pop()
  }
  const vals = entries.map(e => e.nav)
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
  const pairs = fr.length // return pairs (the sheet labels it exactly that)

  const varB = sampleStd(br) ** 2
  const beta = varB > 0 ? covariance(fr, br) / varB : NaN
  const corr = correlation(fr, br)
  const rSquared = isFinite(corr) ? Math.min(1, corr * corr) : NaN // clamp float noise

  // same frequency detection as computeMetrics (aligned-pair cadence)
  const yrsAll = yearsBetween(dates[0], dates[dates.length - 1])
  const ppy = detectPeriodsPerYear(fr.length, yrsAll)
  const annF = mean(fr) * ppy
  const annB = mean(br) * ppy
  const alpha = annF - (rfAnnual + beta * (annB - rfAnnual))
  const treynor = beta !== 0 && isFinite(beta) ? (annF - rfAnnual) / beta : NaN

  const active = fr.map((x, i) => x - br[i])
  const trackingError = sampleStd(active) * Math.sqrt(ppy)
  const infoRatio = trackingError > 0 ? (mean(active) * ppy) / trackingError : NaN

  // up/down capture: geometric over MONTHS where the benchmark was up / down,
  // ANNUALIZED (×12/k exponent) per the Morningstar convention — the ratio of
  // raw cumulative returns drifts away from 100 as history length grows.
  const fm = monthlyReturns(dates, f), bm = monthlyReturns(dates, b)
  const cap = (mask) => {
    let prodF = 1, prodB = 1, k = 0
    for (let i = 0; i < bm.length; i++) { if (mask(bm[i])) { prodF *= 1 + fm[i]; prodB *= 1 + bm[i]; k++ } }
    if (!k) return { f: NaN, b: NaN, k }
    return { f: prodF ** (12 / k) - 1, b: prodB ** (12 / k) - 1, k }
  }
  const up = cap(x => x > 0)
  const down = cap(x => x < 0)
  const upCapture = up.b !== 0 ? (up.f / up.b) * 100 : NaN
  const downCapture = down.b !== 0 ? (down.f / down.b) * 100 : NaN

  // raw excess return over benchmark: geometric (CAGR) over the common window
  let excessReturn = NaN, cagrFund = NaN, cagrBench = NaN
  if (yrsAll >= 0.25) {
    cagrFund = (f[f.length - 1] / f[0]) ** (1 / yrsAll) - 1
    cagrBench = (b[b.length - 1] / b[0]) ** (1 / yrsAll) - 1
    excessReturn = cagrFund - cagrBench
  }

  // rolling-window consistency: % of N-year windows where the fund beats the
  // benchmark (point-to-point return over each window). And calendar-year hit
  // rate: % of years the fund's return exceeded the benchmark's.
  const win1Y = rollingWinRate(dates, f, b, 365)
  const win3Y = rollingWinRate(dates, f, b, 365 * 3)
  const hit = yearlyHitRate(dates, f, b)

  return {
    pairs, beta, alpha, rSquared, treynor,
    trackingError, informationRatio: infoRatio,
    upCapture, downCapture,
    upPeriods: up.k, downPeriods: down.k, // months
    excessReturn, cagrFund, cagrBench,
    rollingWinRate1Y: win1Y ? win1Y.rate : NaN, rollingWindows1Y: win1Y ? win1Y.windows : 0,
    rollingWinRate3Y: win3Y ? win3Y.rate : NaN, rollingWindows3Y: win3Y ? win3Y.windows : 0,
    yearlyHitRate: hit ? hit.rate : NaN, hitYears: hit ? hit.years : 0,
  }
}

// % of rolling `windowDays` windows where fund point-to-point return > benchmark.
function rollingWinRate(dates, f, b, windowDays) {
  const wMs = windowDays * 86400000
  const lastMs = dates[dates.length - 1].getTime()
  let win = 0, tot = 0
  for (let i = 0; i < dates.length; i++) {
    const target = dates[i].getTime() + wMs
    if (target > lastMs) break
    let j = -1
    for (let k = i + 1; k < dates.length; k++) { if (dates[k].getTime() >= target) { j = k; break } }
    if (j < 0) continue
    // same gap guard as rollingReturns: skip windows stretched by a NAV hole
    if (dates[j].getTime() - target > 10 * 86400000) continue
    const fr = f[j] / f[i] - 1, br = b[j] / b[i] - 1
    if (isFinite(fr) && isFinite(br)) { tot++; if (fr > br) win++ }
  }
  return tot ? { rate: win / tot, windows: tot } : null
}

// % of calendar years where the fund's return beat the benchmark's. Each
// year's base is the PRIOR year-end observation (standard calendar-year
// return); the first year in the data has no base and is skipped.
function yearlyHitRate(dates, f, b) {
  const byYear = new Map()
  dates.forEach((d, i) => {
    const y = d.getFullYear()
    if (!byYear.has(y)) byYear.set(y, { first: i, last: i })
    else byYear.get(y).last = i
  })
  let win = 0, tot = 0
  for (const { first, last } of byYear.values()) {
    const base = first - 1 // last aligned obs of the previous year
    if (base < 0 || last <= base) continue
    const fr = f[last] / f[base] - 1, br = b[last] / b[base] - 1
    if (isFinite(fr) && isFinite(br)) { tot++; if (fr > br) win++ }
  }
  return tot ? { rate: win / tot, years: tot } : null
}
