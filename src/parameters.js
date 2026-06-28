/**
 * parameters.js — Mutual-fund analysis parameter reference.
 *
 * Verbatim taxonomy from the "Mutual Fund Analysis — Complete Parameter
 * Reference Guide" (qualitative + quantitative). Each parameter carries:
 *   - def   : one-line definition (from the guide)
 *   - cov    : coverage in THIS tool — 'yes' | 'partial' | 'no'
 *   - where  : sheet(s) where a computed parameter appears (optional)
 *
 * Coverage rationale: this tool ingests AMFI NAV history only. Anything that
 * needs portfolio holdings, AUM/flows, expense data, or peer-category tables
 * is 'no' — not derivable from a NAV series. Benchmark-relative metrics are
 * 'yes' only when a benchmark scheme is supplied at export time.
 *
 * The Excel "Parameters Reference" sheet is generated directly from this data,
 * so editing here updates the workbook. Pure data — no dependencies.
 */

export const COVERAGE = {
  yes:     { label: '✓ Computed',     rank: 0 },
  partial: { label: '◐ Partial',      rank: 1 },
  no:      { label: '—',              rank: 2 },
}

// where AMFI-NAV-only limits coverage, this is the standard reason string.
const NO_DATA = 'no'

export const PARAMETERS = [
  {
    part: 'A — Qualitative',
    sections: [
      {
        name: '1. Fund House & Management',
        params: [
          { name: 'AMC Reputation', def: 'Track record, credibility, and market standing of the Asset Management Company', cov: NO_DATA },
          { name: 'Fund Manager Experience', def: 'Years in the industry, expertise across market cycles', cov: NO_DATA },
          { name: 'Fund Manager Consistency', def: 'Whether the same manager has been running the fund over time', cov: NO_DATA },
          { name: 'Investment Team Depth', def: 'Size and quality of the research/analyst team backing the fund manager', cov: NO_DATA },
          { name: "Fund Manager's Own Investment", def: 'Whether the manager has skin in the game (invests in own fund)', cov: NO_DATA },
        ],
      },
      {
        name: '2. Investment Philosophy & Process',
        params: [
          { name: 'Investment Mandate Clarity', def: "How clearly the fund's objective and strategy are defined", cov: NO_DATA },
          { name: 'Investment Philosophy', def: "Whether it's growth, value, GARP, contrarian, momentum, etc.", cov: NO_DATA },
          { name: 'Stock Selection Process', def: 'Bottom-up vs top-down approach; rigour of the process', cov: NO_DATA },
          { name: 'Portfolio Construction Discipline', def: 'Rules around concentration, diversification, and position sizing', cov: NO_DATA },
          { name: 'Buy/Sell Discipline', def: 'Defined criteria for entry and exit of securities', cov: NO_DATA },
        ],
      },
      {
        name: '3. Portfolio Characteristics',
        params: [
          { name: 'Portfolio Concentration', def: 'Highly concentrated vs broadly diversified', cov: NO_DATA },
          { name: 'Sector Bias', def: 'Overweight or underweight in specific sectors relative to benchmark', cov: NO_DATA },
          { name: 'Market Cap Bias', def: 'Tilt towards large-cap, mid-cap, or small-cap', cov: NO_DATA },
          { name: 'Portfolio Churn / Turnover', def: 'Frequency of buying and selling; reflects conviction and style', cov: NO_DATA },
          { name: 'Overlap with Benchmark', def: 'Active share; how differentiated the portfolio is from its index', cov: NO_DATA },
          { name: 'Style Consistency', def: 'Whether the fund sticks to its stated style (no style drift)', cov: NO_DATA },
        ],
      },
      {
        name: '4. Fund Category & Mandate Fit',
        params: [
          { name: 'Category Appropriateness', def: 'Whether the fund fits its SEBI-defined category', cov: 'partial', where: 'Summary (category shown)' },
          { name: 'Mandate Adherence', def: 'Whether the fund stays true to its stated objective', cov: NO_DATA },
          { name: 'Fund Age / Vintage', def: 'How long the fund has been in existence; tested across cycles', cov: 'yes', where: 'Summary / Risk & Return Metrics (NAV-history span; proxy for vintage)' },
        ],
      },
      {
        name: '5. Transparency & Governance',
        params: [
          { name: 'Disclosure Quality', def: 'Frequency and depth of fund manager commentary and factsheets', cov: NO_DATA },
          { name: 'Regulatory Compliance History', def: 'Any past SEBI actions, penalties, or violations', cov: NO_DATA },
          { name: 'AMC Ownership Structure', def: 'Independence of the AMC; promoter group influence', cov: NO_DATA },
          { name: 'Conflict of Interest Policies', def: 'Front-running safeguards, related-party transaction policies', cov: NO_DATA },
          { name: 'Proxy Voting Record', def: 'How the fund votes on corporate governance matters in portfolio companies', cov: NO_DATA },
        ],
      },
      {
        name: '6. Investor Communication',
        params: [
          { name: 'Fund Manager Accessibility', def: 'Availability for investor calls, webcasts, Q&As', cov: NO_DATA },
          { name: 'Quality of Investor Letters', def: 'Depth and honesty of communication with unitholders', cov: NO_DATA },
          { name: 'Clarity on Portfolio Changes', def: 'Whether changes in strategy or holdings are well explained', cov: NO_DATA },
        ],
      },
      {
        name: '7. Structural Factors',
        params: [
          { name: 'Fund Size (AUM) Appropriateness', def: "Whether AUM is suitable for the strategy (e.g., a small-cap fund shouldn't be too large)", cov: NO_DATA },
          { name: 'Liquidity of Underlying Portfolio', def: 'Ease with which the fund can meet redemption pressures', cov: NO_DATA },
          { name: 'Exit Load Policy', def: 'Lock-in discouragement and alignment with long-term investing', cov: NO_DATA },
          { name: 'Direct vs Regular Plan Awareness', def: 'Whether the fund house promotes direct plans fairly', cov: NO_DATA },
        ],
      },
    ],
  },
  {
    part: 'B — Quantitative',
    sections: [
      {
        name: '1. Returns-Based Metrics',
        params: [
          { name: 'Absolute Returns', def: 'Raw returns over 1M, 3M, 6M, 1Y, 3Y, 5Y, 10Y periods', cov: 'yes', where: 'Risk & Return Metrics (1M–10Y + YTD); Summary' },
          { name: 'CAGR', def: 'Compounded Annual Growth Rate; annualised return over a specific period', cov: 'yes', where: 'Risk & Return Metrics; Summary; Risk Comparison' },
          { name: 'Trailing Returns', def: 'Point-to-point returns from today going backwards', cov: 'yes', where: 'Risk & Return Metrics (1M–10Y + YTD)' },
          { name: 'Rolling Returns', def: 'Returns calculated over every possible period of a fixed length; removes recency bias', cov: 'yes', where: 'Risk & Return Metrics (1Y/3Y/5Y summary); Rolling 1Y sheet (per-scheme); 3Y/5Y Rolling Return sheets (multi-scheme comparison)' },
          { name: 'SIP Returns (XIRR)', def: 'Actual return on systematic investments accounting for cash flow timing', cov: 'yes', where: 'Risk & Return Metrics (SIP 1Y/3Y/5Y/SI); Summary; Risk Comparison' },
          { name: 'Category Average Returns', def: "Fund's return vs average of its peer category", cov: 'partial', where: 'Risk Comparison — set-average within the selected funds (not the full category)' },
          { name: 'Benchmark-Relative Returns (Alpha)', def: 'Excess return generated over the benchmark index', cov: 'yes', where: 'Benchmark (needs benchmark scheme)' },
        ],
      },
      {
        name: '2. Risk Metrics',
        params: [
          { name: 'Standard Deviation', def: 'Measure of volatility; how much returns fluctuate around the mean', cov: 'yes', where: 'Risk & Return Metrics; Risk Comparison' },
          { name: 'Beta', def: 'Sensitivity of the fund to market movements (Beta >1 = more volatile than market)', cov: 'yes', where: 'Benchmark; Risk Comparison (needs benchmark)' },
          { name: 'Value at Risk (VaR)', def: 'Maximum expected loss over a period at a given confidence level', cov: 'yes', where: 'Risk & Return Metrics (95% / 99%, hist. + param.)' },
          { name: 'Maximum Drawdown', def: 'Largest peak-to-trough fall in NAV; measures downside severity', cov: 'yes', where: 'Risk & Return Metrics; NAV History; Risk Comparison' },
          { name: 'Downside Deviation', def: 'Volatility of only negative returns; penalises bad outcomes specifically', cov: 'yes', where: 'Risk & Return Metrics; Risk Comparison' },
          { name: 'Capture Ratio (Upside/Downside)', def: 'How much of market gains the fund captures vs how much of losses it absorbs', cov: 'yes', where: 'Benchmark (needs benchmark)' },
        ],
      },
      {
        name: '3. Risk-Adjusted Return Metrics',
        params: [
          { name: 'Sharpe Ratio', def: 'Excess return per unit of total risk (standard deviation); higher is better', cov: 'yes', where: 'Risk & Return Metrics; Summary; Risk Comparison' },
          { name: 'Sortino Ratio', def: 'Excess return per unit of downside risk only; more relevant for investors', cov: 'yes', where: 'Risk & Return Metrics; Summary; Risk Comparison' },
          { name: 'Treynor Ratio', def: 'Excess return per unit of market risk (beta); useful for diversified portfolios', cov: 'yes', where: 'Benchmark (needs benchmark)' },
          { name: 'Calmar Ratio', def: 'CAGR divided by Maximum Drawdown; reward relative to worst loss', cov: 'yes', where: 'Risk & Return Metrics; Risk Comparison' },
          { name: 'Information Ratio', def: 'Consistency of alpha generation relative to tracking error', cov: 'yes', where: 'Benchmark; Risk Comparison (needs benchmark)' },
          { name: "Jensen's Alpha", def: 'Risk-adjusted excess return over what CAPM would predict', cov: 'yes', where: 'Benchmark (Alpha, needs benchmark)' },
        ],
      },
      {
        name: '4. Consistency Metrics',
        params: [
          { name: 'Rolling Return Consistency', def: '% of rolling periods where fund beat benchmark/category', cov: 'yes', where: 'Benchmark (rolling 1Y / 3Y win rate vs benchmark, needs benchmark)' },
          { name: 'Hit Rate', def: '% of years/quarters the fund outperformed its benchmark', cov: 'yes', where: 'Benchmark (calendar-year hit rate, needs benchmark)' },
          { name: 'Consistency Score', def: 'Rank stability across multiple time periods', cov: 'partial', where: 'Risk & Return Metrics — % positive of rolling 1Y/3Y/5Y windows (single-series proxy; no peer-rank data)' },
          { name: 'Quartile Ranking History', def: 'How consistently the fund ranks in top quartiles over time', cov: 'partial', where: 'Risk Comparison — CAGR percentile within the selected funds' },
        ],
      },
      {
        name: '5. Portfolio Metrics',
        params: [
          { name: 'Portfolio Turnover Ratio', def: '% of portfolio replaced in a year; higher = more churn', cov: NO_DATA },
          { name: 'Number of Holdings', def: 'Concentration vs diversification of the portfolio', cov: NO_DATA },
          { name: 'Active Share', def: '% of portfolio that differs from the benchmark; measures true active management', cov: NO_DATA },
          { name: 'Tracking Error', def: 'Standard deviation of the difference between fund and benchmark returns', cov: 'yes', where: 'Benchmark; Risk Comparison (needs benchmark)' },
          { name: 'Weighted Average Market Cap', def: 'Average size of companies held, weighted by allocation', cov: NO_DATA },
          { name: 'Price-to-Earnings (P/E) Ratio', def: 'Valuation of the portfolio relative to earnings', cov: NO_DATA },
          { name: 'Price-to-Book (P/B) Ratio', def: 'Valuation of the portfolio relative to book value', cov: NO_DATA },
          { name: 'Dividend Yield of Portfolio', def: 'Income generation potential of underlying holdings', cov: NO_DATA },
          { name: 'Debt-to-Equity of Portfolio', def: 'Leverage profile of the companies held', cov: NO_DATA },
        ],
      },
      {
        name: '6. Fund Size & Flow Metrics',
        params: [
          { name: 'AUM (Assets Under Management)', def: 'Total corpus of the fund', cov: NO_DATA },
          { name: 'AUM Growth Rate', def: 'Rate at which the fund is attracting or losing assets', cov: NO_DATA },
          { name: 'Net Fund Flows', def: 'Net inflows vs outflows over time; signals investor sentiment', cov: NO_DATA },
          { name: 'Expense Ratio', def: 'Annual fee charged as % of AUM; directly reduces investor returns', cov: NO_DATA },
          { name: 'Exit Load', def: 'Fee charged on early redemption (affects effective returns)', cov: NO_DATA },
          { name: 'Portfolio Liquidity Ratio', def: '% of portfolio that can be liquidated within X days', cov: NO_DATA },
        ],
      },
      {
        name: '7. Benchmark & Peer Comparison',
        params: [
          { name: 'Excess Return over Benchmark', def: 'Absolute outperformance vs stated benchmark', cov: 'yes', where: 'Benchmark (raw CAGR excess + Alpha, needs benchmark)' },
          { name: 'Excess Return over Category', def: 'Outperformance vs peer average', cov: 'partial', where: 'Risk Comparison — excess vs set-average within selected funds' },
          { name: 'Percentile Rank in Category', def: 'Where the fund stands among all peers (1Y, 3Y, 5Y)', cov: 'partial', where: 'Risk Comparison — CAGR percentile within selected funds' },
          { name: 'Risk-Adjusted Rank', def: 'Peer ranking on Sharpe or Sortino ratio', cov: 'partial', where: 'Risk Comparison — Sharpe rank within selected funds' },
        ],
      },
      {
        name: '8. Debt Fund-Specific Metrics',
        params: [
          { name: 'Modified Duration', def: 'Sensitivity of bond portfolio to interest rate changes', cov: NO_DATA },
          { name: 'Macaulay Duration', def: 'Weighted average time to receive cash flows', cov: NO_DATA },
          { name: 'Yield to Maturity (YTM)', def: 'Expected annualised return if all bonds held to maturity', cov: NO_DATA },
          { name: 'Average Maturity', def: 'Weighted average maturity of bonds in the portfolio', cov: NO_DATA },
          { name: 'Credit Quality Distribution', def: '% allocation across AAA, AA, A, BBB, and below-investment-grade', cov: NO_DATA },
          { name: 'Accrual Income', def: 'Interest income earned regardless of price movement', cov: NO_DATA },
        ],
      },
      {
        name: '9. Tax Efficiency Metrics',
        params: [
          { name: 'Pre-tax vs Post-tax Returns', def: 'Effective returns after accounting for capital gains tax', cov: NO_DATA },
          { name: 'Distribution of Gains (Short vs Long Term)', def: 'Mix of STCG and LTCG in redemptions', cov: NO_DATA },
          { name: 'Dividend Payout History', def: 'Frequency and quantum of dividends declared (for IDCW plans)', cov: NO_DATA },
        ],
      },
    ],
  },
]

/**
 * Metrics this tool computes that go BEYOND the reference guide — surfaced as
 * an addendum so the Parameters Reference sheet is honest about extra coverage.
 */
export const EXTRA_METRICS = [
  { name: 'Conditional VaR 95% (Expected Shortfall)', def: 'Mean loss in the worst 5% of days', where: 'Risk & Return Metrics' },
  { name: 'Skewness', def: 'Return-distribution asymmetry (negative = fat loss tail)', where: 'Risk & Return Metrics; Risk Comparison' },
  { name: 'Excess Kurtosis', def: 'Tail fatness vs normal (>0 = fat tails)', where: 'Risk & Return Metrics; Risk Comparison' },
  { name: 'R-squared', def: 'Variance explained by the benchmark', where: 'Benchmark (needs benchmark)' },
  { name: 'Best / Worst Day', def: 'Largest single-day gain and loss', where: 'Risk & Return Metrics' },
  { name: 'Positive / Negative Days %', def: 'Share of up vs down days', where: 'Risk & Return Metrics' },
]

export const REFERENCE_NOTE =
  'Source: "Mutual Fund Analysis — Complete Parameter Reference Guide". ' +
  'This tool ingests AMFI daily NAV history only; parameters marked "—" need ' +
  'portfolio holdings, AUM/flow, expense, or peer-category data not available ' +
  'from that feed. Benchmark-relative metrics are computed only when a ' +
  'benchmark scheme is supplied at export. Use parameters in combination — no ' +
  'single metric tells the complete story of a fund.'

// Flat [{ part, section, name, def, cov, where }] for easy table rendering.
export function flatParameters() {
  const out = []
  for (const p of PARAMETERS)
    for (const s of p.sections)
      for (const par of s.params)
        out.push({ part: p.part, section: s.name, name: par.name, def: par.def, cov: par.cov, where: par.where || '' })
  return out
}
