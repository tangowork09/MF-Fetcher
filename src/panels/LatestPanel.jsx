import { useState } from 'react'
import { Panel, Field, Btn, ErrorBox, Skeleton } from '../components/ui'
import SchemeQuickView from '../components/SchemeQuickView'
import styles from '../App.module.css'

export default function LatestPanel({ selectedScheme }) {
  const [code, setCode] = useState('')
  const [submitted, setSubmitted] = useState(null)

  const fetch_ = (e) => {
    e?.preventDefault()
    if (!code.trim()) return
    setSubmitted(code.trim())
  }

  return (
    <Panel title="Latest NAV" subtitle="Get the most recent NAV for any scheme code">
      {selectedScheme && (
        <SchemeQuickView code={selectedScheme.schemeCode} name={selectedScheme.schemeName} />
      )}

      <form className={styles.form} onSubmit={fetch_}>
        <div className={styles.formRow}>
          <Field label="Scheme Code *">
            <input
              className={styles.input}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="e.g. 125497"
              required
            />
          </Field>
        </div>
        <Btn type="submit">Get Latest NAV</Btn>
      </form>

      {submitted && (
        <SchemeQuickView key={submitted} code={submitted} name={`Scheme ${submitted}`} />
      )}
    </Panel>
  )
}
