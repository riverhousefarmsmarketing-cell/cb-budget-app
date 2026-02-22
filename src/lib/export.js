export function exportCsv(rows, filename = 'export', columns) {
  if (!rows || rows.length === 0) { alert('No data to export.'); return }
  const cols = columns || Object.keys(rows[0])
  const escapeCell = (val) => {
    if (val == null) return ''
    const s = String(val)
    return (s.includes(',') || s.includes('\n') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const header = cols.map(escapeCell).join(',')
  const body = rows.map(row => cols.map(col => escapeCell(row[col])).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${filename}.csv`; a.style.display = 'none'
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
}
