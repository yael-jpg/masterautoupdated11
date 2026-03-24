/**
 * WorkflowStepper
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable visual progress bar for status workflows.
 *
 * Usage:
 *   <WorkflowStepper steps={JO_STATUS_ORDER} current="For QA" cancelled={false} />
 *
 * Props:
 *   steps      string[]  — ordered workflow stages (excluding Cancelled)
 *   current    string    — current status value
 *   cancelled  boolean   — if true, shows the bar in a cancelled/error state
 */

// Inline styles keep this component fully self-contained (no CSS import needed)
const DOT = 36
const STEPPER_STYLES = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 0,
    width: '100%',
    margin: '18px 0 14px',
    position: 'relative',
  },
  stepWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  connector: (active) => ({
    position: 'absolute',
    top: DOT / 2,
    left: '50%',
    right: '-50%',
    height: '2px',
    background: active ? 'rgba(180,188,200,0.55)' : 'rgba(100,116,139,0.18)',
    zIndex: 0,
    transition: 'background 0.3s',
  }),
  dot: (state) => {
    const base = {
      width: DOT,
      height: DOT,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 700,
      border: '2px solid',
      transition: 'all 0.2s',
      position: 'relative',
      zIndex: 1,
      flexShrink: 0,
    }
    if (state === 'done')    return { ...base, background: 'rgba(160,168,184,0.18)', borderColor: 'rgba(160,168,184,0.45)', color: '#a0a8b8' }
    if (state === 'current') return { ...base, background: '#fff', borderColor: '#c8d0dc', color: '#1a1a1a', boxShadow: '0 0 0 4px rgba(200,208,220,0.15)' }
    if (state === 'cancel')  return { ...base, background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.5)', color: '#ef4444' }
    return { ...base, background: 'transparent', borderColor: 'rgba(100,116,139,0.2)', color: 'rgba(100,116,139,0.35)' }
  },
  label: (state) => ({
    marginTop: 8,
    fontSize: 11,
    fontWeight: state === 'current' ? 700 : 400,
    color: state === 'done'    ? '#808898'
         : state === 'current' ? '#d8dfe8'
         : state === 'cancel'  ? '#ef4444'
         : 'rgba(100,116,139,0.4)',
    textAlign: 'center',
    letterSpacing: '0.02em',
    whiteSpace: 'pre-wrap',
    maxWidth: 72,
    lineHeight: 1.3,
  }),
}

export function WorkflowStepper({ steps = [], current, cancelled = false }) {
  const currentIdx = steps.indexOf(current)

  return (
    <div style={STEPPER_STYLES.container}>
      {steps.map((step, i) => {
        let state = 'pending'
        if (cancelled) {
          state = i < currentIdx ? 'done' : i === currentIdx ? 'cancel' : 'pending'
        } else {
          state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending'
        }

        const isLast = i === steps.length - 1
        const connectorActive = !isLast && i < currentIdx && !cancelled

        return (
          <div key={step} style={STEPPER_STYLES.stepWrap}>
            {/* Connector line (goes to the RIGHT) */}
            {!isLast && (
              <div style={STEPPER_STYLES.connector(connectorActive)} />
            )}

            {/* Step dot */}
            <div style={STEPPER_STYLES.dot(state)}>
              {state === 'done' ? '✓' : state === 'cancel' ? '✕' : i + 1}
            </div>

            {/* Label */}
            <div style={STEPPER_STYLES.label(state)}>
              {step.replace(' ', '\n')}
            </div>
          </div>
        )
      })}

      {cancelled && (
        <div style={{ ...STEPPER_STYLES.stepWrap, flex: '0 0 auto', marginLeft: 8 }}>
          <div style={STEPPER_STYLES.dot('cancel')}>✕</div>
          <div style={STEPPER_STYLES.label('cancel')}>Cancelled</div>
        </div>
      )}
    </div>
  )
}
