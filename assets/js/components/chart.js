/**
 * Minimal SVG line chart. No dependency added -- these are simple enough
 * (accuracy-over-time, calibration curve, engine-weight history all just
 * need a handful of connected points on axes) that pulling in a full
 * charting library would be more weight than value, and would mean either
 * a CDN dependency (breaks offline-first) or vendoring another package.
 *
 * series: [{ name, color, values: [number|null, ...] }] -- values line up
 *         positionally with xLabels; null renders as a gap, not a zero.
 * xLabels: string[] for x-axis ticks (shown at a thinned-out interval if
 *          there are many).
 */
export function lineChart({
  series,
  xLabels,
  width = 640,
  height = 260,
  yMin = 0,
  yMax = 1,
  yTicks = 5,
  yFormat = (v) => `${Math.round(v * 100)}%`,
  showDiagonal = false,
}) {
  const padLeft = 42;
  const padRight = 16;
  const padTop = 12;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const n = xLabels.length;

  const xPos = (i) => padLeft + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yPos = (v) => padTop + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const gridLines = [];
  for (let t = 0; t <= yTicks; t++) {
    const v = yMin + (t / yTicks) * (yMax - yMin);
    const y = yPos(v);
    gridLines.push(
      `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="var(--line-700)" stroke-width="1" />`,
      `<text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--paper-400)">${yFormat(v)}</text>`
    );
  }

  // Thin x-axis labels so they don't overlap when there are many points.
  const labelStep = Math.max(1, Math.ceil(n / 6));
  const xLabelEls = xLabels
    .map((label, i) =>
      i % labelStep === 0
        ? `<text x="${xPos(i)}" y="${height - 8}" text-anchor="middle" font-size="10" fill="var(--paper-400)">${label}</text>`
        : ''
    )
    .join('');

  const diagonal = showDiagonal
    ? `<line x1="${xPos(0)}" y1="${yPos(yMin)}" x2="${xPos(n - 1)}" y2="${yPos(yMax)}" stroke="var(--paper-400)" stroke-width="1" stroke-dasharray="4 3" />`
    : '';

  const seriesEls = series
    .map((s) => {
      const segments = [];
      let current = [];
      s.values.forEach((v, i) => {
        if (v == null) {
          if (current.length) segments.push(current);
          current = [];
        } else {
          current.push(`${xPos(i)},${yPos(v)}`);
        }
      });
      if (current.length) segments.push(current);

      const lines = segments
        .map((seg) => `<polyline points="${seg.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" />`)
        .join('');
      const dots = s.values
        .map((v, i) => (v == null ? '' : `<circle cx="${xPos(i)}" cy="${yPos(v)}" r="3" fill="${s.color}" />`))
        .join('');
      return lines + dots;
    })
    .join('');

  const legend = series
    .map(
      (s) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;">
           <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;"></span>
           <span style="font-size:11px;color:var(--paper-400);">${s.name}</span>
         </span>`
    )
    .join('');

  return `
    <div class="chart">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Chart">
        ${gridLines.join('')}
        ${diagonal}
        ${seriesEls}
        ${xLabelEls}
      </svg>
      <div class="chart__legend">${legend}</div>
    </div>
  `;
}
