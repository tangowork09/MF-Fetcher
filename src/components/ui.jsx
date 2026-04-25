import { useState, useId, useRef, useEffect } from 'react'
import { IconSearch, IconSpinner } from '../svg/icons'
import styles from '../App.module.css'

export function Panel({ title, subtitle, children }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <p className={styles.panelSub}>{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

export function SearchBar({ value, onChange, placeholder, loading }) {
  return (
    <div className={styles.searchWrap}>
      <span className={styles.searchIcon} aria-hidden="true">
        {loading ? <IconSpinner className={styles.spin} /> : <IconSearch />}
      </span>
      <input
        className={styles.searchInput}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label="Search schemes"
        autoFocus
      />
    </div>
  )
}

export function SectionHeader({ label, action }) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionLabel}>{label}</span>
      {action}
    </div>
  )
}

export function Field({ label, children }) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <div>{typeof children === 'object' && children?.type ?
        { ...children, props: { ...children.props, id } } : children}</div>
    </div>
  )
}

export function Btn({ children, onClick, type = 'button', loading, disabled, small }) {
  return (
    <button
      type={type}
      className={`${styles.btn} ${small ? styles.btnSmall : ''}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <><Spinner inline /> <span>Loading…</span></> : children}
    </button>
  )
}

export function Spinner({ inline }) {
  return (
    <IconSpinner
      className={`${styles.spin} ${inline ? styles.spinInline : styles.spinBlock}`}
      role="status"
      aria-label="Loading"
    />
  )
}

export function Skeleton({ lines = 3, height }) {
  if (height) {
    return <div className={styles.skeleton} style={{ height }} />
  }
  return (
    <div className={styles.skeletonGroup}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={styles.skeleton} style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className={styles.skeletonCard}>
      <div className={styles.skeleton} style={{ width: '40%', height: 14 }} />
      <div className={styles.skeleton} style={{ height: 40 }} />
      <div className={styles.skeletonGroup}>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} style={{ width: '75%' }} />
        <div className={styles.skeleton} style={{ width: '50%' }} />
      </div>
    </div>
  )
}

export function ErrorBox({ msg }) {
  return <div className={styles.error} role="alert">{msg}</div>
}

export function Empty({ msg }) {
  return <div className={styles.empty}>{msg}</div>
}

export function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={styles.accordionWrap}>
      <button
        type="button"
        className={styles.accordionHeader}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className={styles.accordionTitle}>{title}</span>
        <span className={styles.accordionIcon} aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div id={id} className={styles.accordionBody} role="region">{children}</div>}
    </div>
  )
}

export function JsonPreview({ data }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.jsonWrap}>
      <button type="button" className={styles.jsonToggle} onClick={() => setOpen(o => !o)}>
        {open ? '▾ Hide' : '▸ View'} Raw JSON
      </button>
      {open && (
        <pre className={styles.jsonPre}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseAmfiDate(str) {
  if (!str) return null
  const [d, m, y] = str.split('-')
  const mi = MONTHS.indexOf(m)
  if (mi === -1) return null
  return new Date(+y, mi, +d)
}

function formatAmfiDate(date) {
  const d = String(date.getDate()).padStart(2, '0')
  return `${d}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`
}

export function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const parsed = parseAmfiDate(value)
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() || new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? new Date().getMonth())

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const today = new Date()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const selectDay = (day) => {
    const d = new Date(viewYear, viewMonth, day)
    onChange(formatAmfiDate(d))
    setOpen(false)
  }

  const selectToday = () => {
    onChange(formatAmfiDate(today))
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setOpen(false)
  }

  const isSelected = (day) => {
    if (!parsed) return false
    return parsed.getDate() === day && parsed.getMonth() === viewMonth && parsed.getFullYear() === viewYear
  }

  const isToday = (day) => {
    return today.getDate() === day && today.getMonth() === viewMonth && today.getFullYear() === viewYear
  }

  return (
    <div className={styles.datePicker} ref={wrapRef}>
      <button type="button" className={styles.searchSelectTrigger} onClick={() => setOpen(!open)}>
        <span className={styles.searchSelectValue}>{value || 'Select date...'}</span>
        <span className={styles.searchSelectArrow}>📅</span>
      </button>
      {open && (
        <div className={styles.dpDropdown}>
          <div className={styles.dpHeader}>
            <button type="button" className={styles.dpNav} onClick={prevMonth}>‹</button>
            <span className={styles.dpTitle}>{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" className={styles.dpNav} onClick={nextMonth}>›</button>
          </div>
          <div className={styles.dpDays}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <span key={d} className={styles.dpDayLabel}>{d}</span>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              return (
                <button
                  key={day}
                  type="button"
                  className={`${styles.dpDay} ${isSelected(day) ? styles.dpDaySelected : ''} ${isToday(day) ? styles.dpDayToday : ''}`}
                  onClick={() => selectDay(day)}
                >
                  {day}
                </button>
              )
            })}
          </div>
          <button type="button" className={styles.dpToday} onClick={selectToday}>Today</button>
        </div>
      )}
    </div>
  )
}

export function SearchSelect({ options, value, onChange, placeholder = 'Search...' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find(o => o.id === value)
  const filtered = query
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  return (
    <div className={styles.searchSelect} ref={wrapRef}>
      <button
        type="button"
        className={styles.searchSelectTrigger}
        onClick={() => { setOpen(!open); setQuery('') }}
      >
        <span className={styles.searchSelectValue}>{selected?.name || placeholder}</span>
        <span className={styles.searchSelectArrow}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.searchSelectDropdown}>
          <input
            ref={inputRef}
            className={styles.searchSelectInput}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
          />
          <div className={styles.searchSelectList}>
            {filtered.length === 0 ? (
              <div className={styles.searchSelectEmpty}>No matches</div>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                className={`${styles.searchSelectItem} ${o.id === value ? styles.searchSelectItemActive : ''}`}
                onClick={() => { onChange(o.id); setOpen(false); setQuery('') }}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function MetaCard({ meta, compact }) {
  if (!meta) return null
  const fields = [
    ['Fund House', meta.fund_house],
    ['Scheme Name', meta.scheme_name],
    ['Type', meta.scheme_type],
    ['Category', meta.scheme_category],
    ['Code', meta.scheme_code],
    ['ISIN Growth', meta.isin_growth],
  ].filter(([, v]) => v)

  return (
    <dl className={`${styles.metaCard} ${compact ? styles.metaCardCompact : ''}`}>
      {fields.map(([k, v]) => (
        <div key={k} className={styles.metaField}>
          <dt className={styles.metaKey}>{k}</dt>
          <dd className={styles.metaVal}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
