# MF API Explorer

A Vite + React app for exploring Indian Mutual Fund data via [mfapi.in](https://www.mfapi.in/).

## Features

| Tab | API Used | Description |
|-----|----------|-------------|
| **Search** | `GET /mf/search?q=` | Live debounced search, click any result for a quick NAV view |
| **NAV History** | `GET /mf/{code}?startDate=&endDate=` | Full or date-filtered NAV history with table view |
| **Latest NAV** | `GET /mf/{code}/latest` | Single latest NAV with green highlight card |
| **Browse All** | `GET /mf?limit=&offset=` | Paginated listing of all ~20k schemes |

- ⬇ **Excel download** on every panel (scheme info + NAV data in separate sheets)
- 📋 **Raw JSON preview** toggle on all data responses
- 🔍 **Debounced search** — no button press needed
- 📱 **Responsive** — works on mobile

## Setup

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Build

```bash
npm run build
```

## Dependencies

- `react` + `react-dom` — UI
- `xlsx` (SheetJS) — Excel export
- `vite` + `@vitejs/plugin-react` — build tool

## API Base URL

`https://api.mfapi.in` — free, no auth required.

## Project Structure

```
src/
  App.jsx          # All panels and components
  App.module.css   # CSS Modules styles
  api.js           # API wrapper (search, list, history, latest)
  excel.js         # Excel export helpers using SheetJS
  main.jsx         # Entry point
  index.css        # Global CSS variables + reset
```
