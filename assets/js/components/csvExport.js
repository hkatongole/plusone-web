/** Converts an array of row objects to CSV text. `columns` controls order/headers;
 *  defaults to the keys of the first row if omitted. */
export function toCsv(rows, columns) {
  if (!rows || rows.length === 0) return '';
  const cols = columns || Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => escape(c.label)).join(',');
  const lines = rows.map((row) => cols.map((c) => escape(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

/** Triggers a browser download of the given CSV text as a file. */
export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
