export function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '\u2014';
  return `${Math.round(value * 100)}%`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function dataAsOfLabel(timestamp) {
  if (!timestamp) return 'Data as of: unavailable';
  return `Data as of: ${formatDateTime(timestamp)}`;
}

export function scoreline(homeScore, awayScore) {
  if (homeScore === null || homeScore === undefined || awayScore === null || awayScore === undefined) {
    return 'vs';
  }
  return `${homeScore}\u2013${awayScore}`;
}

/** players.nationality is stored as "es ESP" -- a lowercase flag-icon code
 *  (meant for a flag sprite this app doesn't have) followed by the actual
 *  3-letter code. Showing both wraps awkwardly in a narrow table cell, so
 *  just show the readable code. Falls back to the raw value for any other
 *  shape, since other backups/leagues may format this differently. */
export function formatNationality(value) {
  if (!value) return '\u2014';
  const match = /^[a-z]{2,3}\s+([A-Z]{2,4})$/.exec(value.trim());
  return match ? match[1] : value;
}
