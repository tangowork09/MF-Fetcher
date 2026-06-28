# MF API Explorer — Status & Improvements

What was rebuilt, what's verified, and what's still worth doing.

## Done (this pass)

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
- **XIRR / SIP returns** not implemented (needs a cashflow-input UI) — the only SEBI return type currently missing.
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
