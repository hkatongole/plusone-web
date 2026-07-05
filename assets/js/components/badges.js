/**
 * Team/league "badge" rendering. The real Media Library (Section 12.5) is a
 * backend concern this phase doesn't build yet, so every badge currently
 * renders the fallback: a monogram initials chip, styled consistently, never
 * a broken-image icon. Once /media/resolve exists, swap the `<img>` branch in
 * here — nothing else in the app should need to change, since pages call
 * teamBadge()/leagueBadge() rather than reaching for <img> directly.
 */
function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function hashHue(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export function teamBadge(name, { size = 'md' } = {}) {
  if (!name) return `<span class="badge badge--${size} badge--empty">?</span>`;
  const hue = hashHue(name);
  return `<span class="badge badge--${size}" style="--badge-hue:${hue}" title="${escapeHtml(name)}">${escapeHtml(
    initials(name)
  )}</span>`;
}

export function leagueBadge(name, { size = 'sm' } = {}) {
  if (!name) return `<span class="badge badge--${size} badge--league badge--empty">?</span>`;
  const hue = hashHue('league:' + name);
  return `<span class="badge badge--${size} badge--league" style="--badge-hue:${hue}" title="${escapeHtml(
    name
  )}">${escapeHtml(initials(name))}</span>`;
}

export function playerSilhouette({ size = 'md' } = {}) {
  return `<span class="badge badge--${size} badge--player" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="60%" height="60%" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
  </span>`;
}

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
