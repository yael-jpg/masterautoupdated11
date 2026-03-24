export function PaginationBar({ page, totalPages, total, onPageChange }) {
  return (
    <div className="pagination-bar">
      <button
        type="button"
        className="btn-secondary"
        onClick={() => onPageChange(Math.max(page - 1, 1))}
        disabled={page <= 1}
      >
        Prev
      </button>
      <span>
        Page {page} of {totalPages} • {total} records
      </span>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => onPageChange(Math.min(page + 1, totalPages))}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  )
}
