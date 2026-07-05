# MF API Explorer — Status & Improvements

What was rebuilt, what's verified, and what's still worth doing.

## Done (formula-audit pass, Jul 2026)

### Exports
- **NAV History sheet always contains the fund's complete history** (every NAV that ever existed), regardless of the fetch date-range or client-side filters. `api.history` now always fetches the full series and slices the requested range locally (`res.data` = range view, `res.fullData` = complete series); Trading Days + metrics stay on the selected range. The multi-scheme "Full NAV" sheet likewise uses complete histories.

### Formula fixes (multi-agent audit, findings adversarially verified)
- **SIP installment count** (major): a 1Y SIP scheduled 13 buys including a degenerate buy on the terminal valuation date (bought + redeemed the same instant) — inflated invested (₹1.3L vs ₹1.2L) and diluted absolute return. Now strict bounds: 12 buys/year, no terminal-date buy, and collapsed same-day buys (window pre-dating inception) are skipped.
- **Calmar on short spans**: for spans < 3 months the live Excel formula divided the *non-annualized* period return by MDD and displayed it as "CAGR per unit of max drawdown" on recalc (JS value was correctly NaN). Now a static "—" row.
- **#DIV/0! guards**: Sharpe / Sortino / Calmar formulas wrapped in `IFERROR(...,"")` — flat series (STDEV=0) or monotone NAV (MDD=0, normal for liquid funds) recalc to blank, matching the JS-cached value.
- **Trailing-return drift guard scaled to window**: flat 45-day tolerance let a "1M return" span 70 days across a NAV hole. Now `max(7, min(45, 12.5% of window))` days.
- **Rolling-window gap guard**: window ends matched across a NAV hole (e.g. 18 months for a "1Y" window) polluted the rolling distribution; ends drifting >10 days past target are now skipped (also applied to benchmark rolling win rates via the same series).
- **Up/down capture annualized** (Morningstar convention): was a ratio of cumulative compounded returns, which drifts away from 100 as history grows; now `(∏(1+r))^(12/k)−1` per side.
- **Calendar-year hit rate**: each year's return now based on the prior year-end observation (true calendar-year return); first year (no base) skipped.
- **"Overlapping return pairs"** on the Benchmark sheet was off by one (counted NAV observations); now counts return pairs.
- **XIRR robustness**: Newton step-size convergence could accept a non-root when pinned near the −100% floor; now requires a scale-relative NPV residual, else falls to bisection.

Verified: 29/29 synthetic + real-API assertions (`SIP counts, drift guards, capture stability across history lengths, XIRR vs independent bisection, workbook sheet contents`); production build green. Numeric execution harness found **zero** discrepancies in the core return/risk math (CAGR, vol, Sharpe/Sortino, VaR/CVaR, SKEW/KURT, percentile — all match Excel semantics).

Left as-is (convention choices, immaterial): daily-basis beta/alpha/TE/IR (documented; VR uses 36 monthly), trailing-return nominal-year exponent (AMFI quoting convention — confirmed against Value Research's published methodology), SIP 45-day inception tolerance.

### Second pass (same day) — re-audit findings, all fixed & verified
- **NAV-cadence-aware annualization** (`detectPeriodsPerYear`): overnight/liquid funds publish NAVs ~6-7 days/week; hardcoded ×252 understated their annualized return/vol by ~17% (Baroda Overnight 147196: Sharpe −6.46 → −1.47). Basis now snaps to 365 (≥340 obs/yr), 252 (230–270), else observed frequency; mirrored into every generated Excel formula + the "Annualization basis" row. SEBI daily-NAV mandate for overnight schemes confirmed via research pass.
- **Capture ratios use complete months only** — trailing partial-month stub dropped (Morningstar convention, confirmed against published methodology).
- **Date filter accepts ISO** (`2026-04`) as well as `dd-mm-yyyy` in NAV History.
- **Duplicate scheme codes deduped** in fetch (collided on `filteredSubsets`/React keys → wrong data in "Current filters" exports).
- **`filteredSubsets` reset on refetch** (was retaining removed schemes' full NAV arrays for the panel's lifetime).
- Re-verified: regression auditor, Excel row-integrity auditor, HyperFormula recalc harness — zero findings each; 56/56 test assertions; real-data spot checks (125497 equity unchanged on 252 convention; 147196 overnight now sane).

## Done (earlier pass)

### Excel exports — now fully functional & styled
- **Real date cells** (was text `"dd-mm-yyyy"` → couldn't sort/filter/date-math). Now real Excel dates.
- **Styling** via `exceljs` (lazy-loaded): bold filled headers, zebra banding, borders, frozen header rows, conditional formatting (green/red on returns & drawdowns), per-column number formats.
- **Live, recalculating formulas** with cached results + `fullCalcOnLoad`. Editing a NAV on the **Trading Days** sheet recalculates returns → recalculates every metric. The risk-free-rate cell (`$B$2`) is editable and drives Sharpe / Sortino / Treynor.
- **Cross-engine safe formulas**: universal `STDEV` / `PERCENTILE` (not the `_xlfn.`-requiring `STDEV.S` / `PERCENTILE.INC` that ExcelJS writes without the prefix → would `#NAME?` in real Excel) and a literal z-score instead of `NORM.S.INV`. `$B$2` instead of a named range (Google Sheets import safety).
- Per-scheme workbook: **Summary · NAV History (continuous) · Trading Days (metric basis) · Risk & Return Metrics · Benchmark · Rolling 1Y**.
- Multi-scheme: **Risk Comparison · Trimmed + ATH · 3Y/5Y Rolling · Full NAV**, all real numbers/dates.

### Correctness
- **Std dev**: sample (n-1), annualized **×√252** (was monthly, ~3.46× too small).
- **Volatility uses actual trading days** — weekend/holiday rows are forward-filled for a *continuous listing* but tagged `filled` and excluded from metrics (flat fills were deflating vol).
- **Real benchmark** (beta/alpha/R²/Treynor/tracking-error/capture) vs an index-fund TRI proxy from `api.mfapi.in` (Nifty 50 `100822`, Next 50 `149837`, Nifty 500 `147625`, Sensex `113269`) — replaces the old "average of your loaded funds" fake market.
- Up/down **capture ratios computed on monthly returns** (Value Research / Morningstar convention).
- Guards: CAGR not annualized for spans < 3 months; metrics sheet only when ≥5 NAVs; `rSquared` clamped to [0,1]; Sortino `NaN` on flat series; trailing-return absolute-vs-CAGR keyed to actual elapsed years.

### UX
- Decluttered export buttons across all tabs — each says what file it produces and what's inside; duplicates removed; analytics settings (risk-free %, benchmark) consolidated.

### Verified
- Metrics math: 20/20 vs Excel references (`STDEV.S`, `KURT`, `PERCENTILE.INC`, etc.).
- Workbook integrity + **formula recalculation** via HyperFormula: 17/20 formulas recalc exactly to displayed values (3 are HyperFormula engine gaps — `KURT`/`SUMPRODUCT`; their values match Excel-reference JS).
- Edit propagation, styling presence, edge cases (1–4 points, all-flat, zeros/negatives, empty), browser smoke (render → fetch → styled download). Production build green.

## Remaining / can be improved

### Correctness & analytics
- **Beta/alpha/TE/IR are daily-based**; Value Research uses trailing 36 *monthly* returns. Could add a "monthly basis (VR-style)" toggle for an exact match.
- **Benchmark alignment**: when fund and benchmark trading calendars diverge, a paired daily return can straddle a multi-day gap. Low impact with the TRI-proxy (shared calendar); could require contiguous pairs or a minimum overlap ratio.
- ~~XIRR / SIP returns~~ — implemented (simulated ₹10k monthly SIP, XIRR over 1Y/3Y/5Y/SI on the Metrics sheet). A custom cashflow-input UI is still a possible addition.
- **More benchmarks**: optionally add Yahoo Finance price indices (`^NSEI`, `^BSESN`, `^CRSLDX`, `^NSEBANK`) via a `/api/yahoo-chart` serverless proxy (researched; needs proxy since Yahoo has no CORS and no TRI symbol).
- Rolling-window endpoint search uses a ±10-day heuristic; could snap to exact nearest trading day.

### Robustness
- **PerformancePanel can white-screen** if the AMFI endpoint returns an unexpected shape (no error boundary; it mounts hidden on the Dashboard so a throw takes down the page). Add `Array.isArray` guards + a React error boundary.
- WebExcel push sends some dates as strings rather than real dates.

### Engineering
- **Bundle size**: `xlsx` (~744 kB) + `exceljs` (~940 kB, already lazy-loaded) + `@fortune-sheet` (~2.7 MB, lazy). Consider trimming `xlsx` usage now that `exceljs` covers analytical exports, and code-split further.
- **No committed test suite** — validation was run ad-hoc. Add the metrics + workbook tests under `test/` with `vitest`.
- Pin/lazy-load heavy spreadsheet libs per route.

### Design (pre-existing, not introduced here)
- 5 design-lint findings in `App.module.css` (split-card top accent, tab underline width animation) — original styling; left as-is.
- Dashboard split-pane could adapt better on small screens.

## Conventions (reference)
Simple daily returns for risk stats; geometric CAGR (Actual/365.25); sample (n-1) std dev × √252; risk-free default **5.25%** (RBI repo ≈ 91-day T-bill, Jun 2026), editable in-sheet. Metrics computed on actual trading days; listings show continuous calendar dates.
