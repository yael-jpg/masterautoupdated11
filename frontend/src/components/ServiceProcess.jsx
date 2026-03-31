/**
 * Shared service-process timeline components.
 * Used by PortalBooking, PortalServices, and PortalJobStatus.
 */

// ─── Generic (fallback) ─────────────────────────────────────────────────────

const GENERIC_STEPS = [
  { step: 1, label: 'Inspection',    day: 'Step 1', dayColor: '#7aa8f8', note: 'We confirm the vehicle condition and service scope before work begins.' },
  { step: 2, label: 'Preparation',   day: 'Step 2', dayColor: '#7aa8f8', note: 'Cleaning, surface prep, and masking (as needed).' },
  { step: 3, label: 'Service',       day: 'Step 3', dayColor: '#a888ff', note: 'Installation or treatment performed by trained technicians.' },
  { step: 4, label: 'Finishing',     day: 'Step 4', dayColor: '#5ce4e0', note: 'Edge work, curing (where applicable), and final detailing.' },
  { step: 5, label: 'Quality Check', day: 'Step 5', dayColor: '#5eda98', note: 'Final inspection and aftercare guidance before release.' },
]

export function GenericServiceProcess({ serviceName }) {
  const title = 'Service Process'
  const subtitle = serviceName ? `Process overview for ${serviceName}` : 'Typical service steps'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 12, padding: '13px 16px', marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 7,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
          color: '#c0c0c0', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#c0c0c0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'rgba(189,200,218,0.50)', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {GENERIC_STEPS.map((s, i) => (
          <div key={s.step} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {i < GENERIC_STEPS.length - 1 && (
              <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 1, background: 'rgba(255,255,255,0.07)' }} />
            )}
            <div style={{
              width: 23, height: 23, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(10,13,30,0.85)', border: `1px solid ${s.dayColor}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: s.dayColor, zIndex: 1, marginTop: 1,
            }}>{s.step}</div>
            <div style={{ paddingBottom: i < GENERIC_STEPS.length - 1 ? 11 : 0, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f2' }}>{s.label}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: `${s.dayColor}18`, border: `1px solid ${s.dayColor}40`,
                  color: s.dayColor, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                }}>{s.day}</span>
              </div>
              {s.note && <div style={{ fontSize: 11.5, color: 'rgba(189,200,218,0.45)', marginTop: 2 }}>{s.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Coating ─────────────────────────────────────────────────────────────────

const COATING_STEPS = [
  { step: 1, label: 'Premium Wash',                            day: '1st Day',           dayColor: '#7aa8f8', note: null },
  { step: 2, label: 'Decontamination',                         day: '1st Day',           dayColor: '#7aa8f8', note: null },
  { step: 3, label: 'Exterior Detailing',                      day: '1st – 2nd Day',     dayColor: '#a888ff', note: 'Depends on car condition' },
  { step: 4, label: 'Ceramic or Graphene Coating Application', day: '1st Day',           dayColor: '#7aa8f8', note: null },
  { step: 5, label: 'Curing',                                  day: '2nd Day',           dayColor: '#5ce4e0', note: null },
  { step: 6, label: 'Release',                                 day: '2nd Day Afternoon', dayColor: '#5eda98', note: null },
]

export function CoatingProcess() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 12, padding: '13px 16px', marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 7,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
          color: '#c0c0c0', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#c0c0c0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Service Process</div>
          <div style={{ fontSize: 11, color: 'rgba(189,200,218,0.50)', marginTop: 1 }}>Usually 2 – 3 days</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {COATING_STEPS.map((s, i) => (
          <div key={s.step} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {i < COATING_STEPS.length - 1 && (
              <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 1, background: 'rgba(255,255,255,0.07)' }} />
            )}
            <div style={{
              width: 23, height: 23, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(10,13,30,0.85)', border: `1px solid ${s.dayColor}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: s.dayColor, zIndex: 1, marginTop: 1,
            }}>{s.step}</div>
            <div style={{ paddingBottom: i < COATING_STEPS.length - 1 ? 11 : 0, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f2' }}>{s.label}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: `${s.dayColor}18`, border: `1px solid ${s.dayColor}40`,
                  color: s.dayColor, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                }}>{s.day}</span>
              </div>
              {s.note && <div style={{ fontSize: 11.5, color: 'rgba(189,200,218,0.45)', marginTop: 2, fontStyle: 'italic' }}>{s.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function isCoating(serviceName) {
  const n = (serviceName || '').toLowerCase()
  return n.includes('ceramic') || n.includes('graphene')
}

// ─── PPF ─────────────────────────────────────────────────────────────────────

const PPF_STEPS = [
  { step: 1, label: 'Initial Vehicle Checking', day: '1st Day',           dayColor: '#7aa8f8', note: 'Damages, paint defects, etc. If everything is okay, proceed to Step 2.' },
  { step: 2, label: 'Decontamination',          day: '1st Day',           dayColor: '#7aa8f8', note: null },
  { step: 3, label: 'Exterior Detailing',        day: '1st Day',           dayColor: '#7aa8f8', note: null },
  { step: 4, label: 'PPF Installation',          day: '2nd – 5th Day',     dayColor: '#a888ff', note: null },
  { step: 5, label: 'Retouch and Curing',        day: '6th Day',           dayColor: '#5ce4e0', note: null },
  { step: 6, label: 'Release',                   day: '7th Day · 3:00 PM', dayColor: '#5eda98', note: null },
]

export function PPFProcess() {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 12, padding: '13px 16px', marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 7,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
          color: '#c0c0c0', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#c0c0c0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>PPF Process</div>
          <div style={{ fontSize: 11, color: 'rgba(189,200,218,0.50)', marginTop: 1 }}>Usually 7 days</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {PPF_STEPS.map((s, i) => (
          <div key={s.step} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {i < PPF_STEPS.length - 1 && (
              <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 1, background: 'rgba(255,255,255,0.07)' }} />
            )}
            <div style={{
              width: 23, height: 23, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(10,13,30,0.85)', border: `1px solid ${s.dayColor}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: s.dayColor, zIndex: 1, marginTop: 1,
            }}>{s.step}</div>
            <div style={{ paddingBottom: i < PPF_STEPS.length - 1 ? 11 : 0, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f2' }}>{s.label}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: `${s.dayColor}18`, border: `1px solid ${s.dayColor}40`,
                  color: s.dayColor, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                }}>{s.day}</span>
              </div>
              {s.note && <div style={{ fontSize: 11.5, color: 'rgba(189,200,218,0.45)', marginTop: 2, fontStyle: 'italic' }}>{s.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function isPPF(serviceName) {
  const n = (serviceName || '').toLowerCase()
  return n.includes('ppf') || n.includes('paint protection film')
}

export function isDetailing(serviceName) {
  const n = (serviceName || '').toLowerCase()
  return n.includes('detail') || n.includes('detailing')
}

export function isTint(serviceName) {
  const n = (serviceName || '').toLowerCase()
  return n.includes('tint') || n.includes('window film')
}

// ─── Detailing ─────────────────────────────────────────────────────────────

const DETAILING_STEPS = [
  { step: 1, label: 'Inspection & Assessment',  day: '1st Day',           dayColor: '#7aa8f8', note: 'We check paint condition and set the scope.' },
  { step: 2, label: 'Premium Wash',             day: '1st Day',           dayColor: '#7aa8f8', note: null },
  { step: 3, label: 'Decontamination',          day: '1st Day',           dayColor: '#7aa8f8', note: null },
  { step: 4, label: 'Detailing & Correction',   day: '1st – 3rd Day',     dayColor: '#a888ff', note: 'Depends on vehicle condition' },
  { step: 5, label: 'Protection / Finishing',   day: '2nd – 4th Day',     dayColor: '#5ce4e0', note: 'Sealant / coating where applicable' },
  { step: 6, label: 'Quality Check & Release',  day: 'Final Day',         dayColor: '#5eda98', note: null },
]

export function DetailingProcess() {
  return (
    <div style={{
      background: 'rgba(92,228,224,0.04)', border: '1px solid rgba(92,228,224,0.16)',
      borderRadius: 12, padding: '13px 16px', marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 7,
          background: 'rgba(92,228,224,0.14)', border: '1px solid rgba(92,228,224,0.28)',
          color: '#5ce4e0', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5ce4e0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Detailing Process</div>
          <div style={{ fontSize: 11, color: 'rgba(189,200,218,0.50)', marginTop: 1 }}>Usually 3 – 4 days</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {DETAILING_STEPS.map((s, i) => (
          <div key={s.step} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {i < DETAILING_STEPS.length - 1 && (
              <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 1, background: 'rgba(255,255,255,0.07)' }} />
            )}
            <div style={{
              width: 23, height: 23, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(10,13,30,0.85)', border: `1px solid ${s.dayColor}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: s.dayColor, zIndex: 1, marginTop: 1,
            }}>{s.step}</div>
            <div style={{ paddingBottom: i < DETAILING_STEPS.length - 1 ? 11 : 0, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f2' }}>{s.label}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: `${s.dayColor}18`, border: `1px solid ${s.dayColor}40`,
                  color: s.dayColor, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                }}>{s.day}</span>
              </div>
              {s.note && <div style={{ fontSize: 11.5, color: 'rgba(189,200,218,0.45)', marginTop: 2, fontStyle: 'italic' }}>{s.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tint ─────────────────────────────────────────────────────────────────

const TINT_STEPS = [
  { step: 1, label: 'Inspection & Preparation', day: 'Same Day',          dayColor: '#7aa8f8', note: 'We confirm coverage and protect interior areas.' },
  { step: 2, label: 'Glass Cleaning',           day: 'Same Day',          dayColor: '#7aa8f8', note: null },
  { step: 3, label: 'Film Cutting',             day: 'Same Day',          dayColor: '#a888ff', note: 'Pattern and fitment based on your vehicle.' },
  { step: 4, label: 'Installation',             day: 'Same Day',          dayColor: '#a888ff', note: null },
  { step: 5, label: 'Heat Setting / Curing',    day: 'Same Day',          dayColor: '#5ce4e0', note: 'Drying time varies by weather.' },
  { step: 6, label: 'Quality Check & Release',  day: 'Same Day',          dayColor: '#5eda98', note: null },
]

export function TintProcess() {
  return (
    <div style={{
      background: 'rgba(94,218,152,0.04)', border: '1px solid rgba(94,218,152,0.16)',
      borderRadius: 12, padding: '13px 16px', marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 7,
          background: 'rgba(94,218,152,0.14)', border: '1px solid rgba(94,218,152,0.28)',
          color: '#5eda98', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5eda98', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tint Process</div>
          <div style={{ fontSize: 11, color: 'rgba(189,200,218,0.50)', marginTop: 1 }}>Usually same day</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {TINT_STEPS.map((s, i) => (
          <div key={s.step} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {i < TINT_STEPS.length - 1 && (
              <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 1, background: 'rgba(255,255,255,0.07)' }} />
            )}
            <div style={{
              width: 23, height: 23, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(10,13,30,0.85)', border: `1px solid ${s.dayColor}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: s.dayColor, zIndex: 1, marginTop: 1,
            }}>{s.step}</div>
            <div style={{ paddingBottom: i < TINT_STEPS.length - 1 ? 11 : 0, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f2' }}>{s.label}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: `${s.dayColor}18`, border: `1px solid ${s.dayColor}40`,
                  color: s.dayColor, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                }}>{s.day}</span>
              </div>
              {s.note && <div style={{ fontSize: 11.5, color: 'rgba(189,200,218,0.45)', marginTop: 2, fontStyle: 'italic' }}>{s.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Given a service/package name, returns the matching process timeline JSX,
 * or null if there is no special process for this service.
 */
export function getServiceProcess(serviceName) {
  if (isCoating(serviceName)) return <CoatingProcess />
  if (isPPF(serviceName)) return <PPFProcess />
  if (isTint(serviceName)) return <TintProcess />
  if (isDetailing(serviceName)) return <DetailingProcess />
  return null
}
