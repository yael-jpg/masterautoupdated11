export function SectionCard({ title, subtitle, children, actionLabel, onActionClick, actionNode }) {
  return (
    <section className="section-card">
      <div className="section-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="section-card-actions">
          {actionNode ? actionNode : null}
          {actionLabel ? (
            <button type="button" onClick={onActionClick}>
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  )
}
