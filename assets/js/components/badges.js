import { logoRepository } from '../db/logoRepository.js';

/**
 * Team/league "badge" rendering. Real crests come from the team_logos table
 * (hotlinked from a third-party CDN) when a row exists for that team; the
 * monogram-on-hue fallback still covers everything else -- teams with no
 * logo row, leagues (no per-league logo source exists), players (silhouette),
 * and any image that 404s at request time (inline onerror swap, since these
 * are external URLs sql.js has no control over).
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

function monogram(name, size) {
  const hue = hashHue(name);
  return `<span class="badge badge--${size}" style="--badge-hue:${hue}" title="${escapeHtml(name)}">${escapeHtml(
    initials(name)
  )}</span>`;
}

export function teamBadge(name, { size = 'md' } = {}) {
  if (!name) return `<span class="badge badge--${size} badge--empty">?</span>`;
  const logoUrl = logoRepository.get(name);
  if (!logoUrl) return monogram(name, size);

  // Render both: the real crest, and a hidden monogram fallback right behind it.
  // If the hotlinked image 404s or fails, onerror hides the <img> and reveals
  // the fallback -- no JS wiring needed elsewhere, no flash of broken-image icon.
  return `
    <span class="badge-wrap badge-wrap--${size}">
      <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}"
           class="badge-img badge-img--${size}" loading="lazy"
           onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <span class="badge badge--${size}" style="--badge-hue:${hashHue(name)}; display:none;">${escapeHtml(initials(name))}</span>
    </span>
  `.trim();
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
