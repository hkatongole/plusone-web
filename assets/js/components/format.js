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
