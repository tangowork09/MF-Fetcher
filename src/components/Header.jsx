import { IconChartUp, IconSun, IconMoon, IconDroplet, IconGrid } from '../svg/icons'
import styles from '../App.module.css'

export default function Header({ theme, toggleTheme, designStyle, toggleStyle }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <IconChartUp />
          </div>
          <span>MF<b>API</b> Explorer</span>
        </div>
        <div className={styles.headerMeta}>
          <button className={styles.styleToggle} onClick={toggleStyle} title={`Switch to ${designStyle === 'classic' ? 'Liquid Glass' : 'Classic'} style`}>
            {designStyle === 'classic' ? <IconDroplet /> : <IconGrid />}
          </button>
          <button className={styles.themeToggle} onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </div>
    </header>
  )
}
