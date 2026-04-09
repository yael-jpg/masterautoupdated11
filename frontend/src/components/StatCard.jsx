export function StatCard({ label, value, trend, onClick }) {
  return (
    <article
      className={`stat-card ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
    >
      <p className="stat-label">{label}</p>
      <h3>{value}</h3>
      <span>{trend}</span>
    </article>
  )
}
