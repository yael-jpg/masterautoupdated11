export function DataTable({
  headers,
  rows,
  rowActions,
  selectable = false,
  selectedKeys = new Set(),
  onToggleRow,
  onToggleAll,
  onRowClick,
}) {
  const getColumnPriority = (header, index) => {
    const normalizedHeader = String(header || '').toLowerCase()
    const criticalPatterns = [
      'reference',
      'invoice',
      'plate',
      'customer',
      'name',
      'mobile',
      'amount',
      'status',
      'time',
      'service',
    ]
    const secondaryPatterns = [
      'package',
      'method',
      'type',
      'balance',
      'odometer',
      'lead',
      'contact',
      'bay',
      'team',
      'role',
      'conduction',
      'color',
    ]

    if (criticalPatterns.some((pattern) => normalizedHeader.includes(pattern))) {
      return 1
    }

    if (secondaryPatterns.some((pattern) => normalizedHeader.includes(pattern))) {
      return 2
    }

    if (index <= 1) {
      return 1
    }

    return 3
  }

  const normalizedRows = rows.map((row, rowIndex) =>
    Array.isArray(row) ? { key: `${row[0]}-${rowIndex}`, cells: row, raw: row } : row,
  )

  const allSelected =
    selectable && normalizedRows.length > 0
      ? normalizedRows.every((row) => selectedKeys.has(row.key))
      : false

  const clickable = typeof onRowClick === 'function'

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {selectable ? (
              <th className="col-static col-priority-1">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => onToggleAll?.(event.target.checked, normalizedRows)}
                />
              </th>
            ) : null}
            {headers.map((header, headerIndex) => {
              const priority = getColumnPriority(header, headerIndex)
              return (
                <th key={header} className={`col-priority-${priority}`}>
                  {header}
                </th>
              )
            })}
            {rowActions ? <th className="col-actions col-priority-1">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {normalizedRows.map((normalized, rowIndex) => {
            return (
              <tr
                key={normalized.key || `${rowIndex}`}
                style={clickable ? { cursor: 'pointer' } : undefined}
                onClick={clickable ? (e) => {
                  if (e.target && typeof e.target.closest === 'function') {
                    if (e.target.closest('.col-actions') || e.target.closest('input[type="checkbox"]')) return
                  }
                  onRowClick(normalized.raw, rowIndex)
                } : undefined}
              >
                {selectable ? (
                  <td className="col-static col-priority-1">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(normalized.key)}
                      onChange={(event) => onToggleRow?.(normalized, event.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                ) : null}
                {normalized.cells.map((cell, cellIndex) => {
                  const isPlainText = typeof cell === 'string' || typeof cell === 'number'
                  return (
                    <td
                      key={`${cellIndex}-${isPlainText ? cell : cellIndex}`}
                      className={`col-priority-${getColumnPriority(headers[cellIndex], cellIndex)} td-truncate`}
                      data-label={String(headers[cellIndex])}
                      title={isPlainText ? String(cell) : undefined}
                      onClick={clickable ? () => onRowClick(normalized.raw, rowIndex) : undefined}
                    >
                      {cell}
                    </td>
                  )
                })}
                {rowActions ? (
                  <td className="col-actions col-priority-1">
                    {rowActions(normalized.raw, rowIndex)}
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
