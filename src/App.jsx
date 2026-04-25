import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import Header from './components/Header'
import SearchPanel from './panels/SearchPanel'
import HistoryPanel from './panels/HistoryPanel'
import LatestPanel from './panels/LatestPanel'
import BrowsePanel from './panels/BrowsePanel'
import PerformancePanel from './panels/PerformancePanel'
const WebExcelPanel = lazy(() => import('./panels/WebExcelPanel'))
import styles from './App.module.css'

const TABS = ['Dashboard', 'Fund Performance', 'Browse All', 'Web Excel', 'Latest NAV', 'NAV History']

export default function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [selectedScheme, setSelectedScheme] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [designStyle, setDesignStyle] = useState(() => localStorage.getItem('design-style') || 'classic')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-style', designStyle)
    localStorage.setItem('design-style', designStyle)
  }, [designStyle])

  const historyRef = useRef(null)
  const [historyCodes, setHistoryCodes] = useState(new Set())
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  const toggleStyle = () => setDesignStyle(s => s === 'classic' ? 'glass' : 'classic')
  const addToHistory = (code) => {
    const key = String(code)
    if (historyCodes.has(key)) return
    historyRef.current?.addSchemeCode(code)
    setHistoryCodes(prev => new Set(prev).add(key))
  }
  const removeFromHistory = (code) => {
    const key = String(code)
    historyRef.current?.removeSchemeCode(code)
    setHistoryCodes(prev => { const next = new Set(prev); next.delete(key); return next })
  }

  return (
    <div className={styles.app}>
      <Header theme={theme} toggleTheme={toggleTheme} designStyle={designStyle} toggleStyle={toggleStyle} />
      <nav className={styles.tabs}>
        {TABS.map((t, i) => (
          <button
            key={t}
            className={`${styles.tab} ${activeTab === i ? styles.tabActive : ''}`}
            onClick={() => { setActiveTab(i); window.scrollTo({ top: 0 }) }}
          >
            <span className={styles.tabDot} />
            {t}
          </button>
        ))}
      </nav>
      <main className={styles.main}>
        {/* 0: Dashboard */}
        <div style={{ display: activeTab === 0 ? 'flex' : 'none', gap: '16px', alignItems: 'flex-start' }} className={styles.splitPane}>
          <div style={{ flex: 1, minWidth: 0 }} className={styles.splitCard}>
            <SearchPanel onSchemeSelect={setSelectedScheme} onAddToHistory={addToHistory} onRemoveFromHistory={removeFromHistory} historyCodes={historyCodes} />
          </div>
          <div className={styles.splitDivider} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className={styles.splitCard}><LatestPanel selectedScheme={selectedScheme} /></div>
            <div className={styles.splitCard}><HistoryPanel ref={historyRef} /></div>
          </div>
        </div>
        {/* 1: Fund Performance */}
        <div style={{ display: activeTab === 1 ? 'block' : 'none' }}><PerformancePanel /></div>
        {/* 2: Browse All */}
        <div style={{ display: activeTab === 2 ? 'block' : 'none' }}><BrowsePanel /></div>
        {/* 3: Web Excel */}
        {activeTab === 3 && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading Web Excel...</div>}>
            <WebExcelPanel isVisible={activeTab === 3} />
          </Suspense>
        )}
        {/* 4: Latest NAV */}
        <div style={{ display: activeTab === 4 ? 'block' : 'none' }}><LatestPanel /></div>
        {/* 5: NAV History */}
        <div style={{ display: activeTab === 5 ? 'block' : 'none' }}><HistoryPanel /></div>
      </main>
    </div>
  )
}
