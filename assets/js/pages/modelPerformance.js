import { predictionRepository } from '../db/repositories/predictionRepository.js';
import { lineChart } from '../components/chart.js';
import { formatPct } from '../components/format.js';
import { storage } from '../db/storageAdapter.js';

const TABS = [
  { key: 'accuracy', label: 'Accuracy Over Time' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'weights', label: 'Engine Weights' },
];

const ENGINE_COLORS = {
  consensus: 'var(--signal-gold)',
  dc: 'var(--pitch-teal)',
  ml: '#7C9CFF',
  legacy: '#E07A5F',
};

export async function renderModelPerformance({ query }) {
  if (!storage.ready) {
    return `<div class="empty-state"><h2>No database loaded</h2><p>Import a .sqlite backup from the Home page first.</p></div>`;
  }

  const tab = TABS.some((t) => t.key === query.tab) ? query.tab : 'accuracy';
  const tabNav = TABS.map(
    (t) => `<a class="tab-nav__item ${t.key === tab ? 'tab-nav__item--active' : ''}" href="#/model-performance?tab=${t.key}">${t.label}</a>`
  ).join('');

  let body;
  if (tab === 'calibration') body = calibrationTab();
  else if (tab === 'weights') body = weightsTab();
  else body = accuracyTab();

  return `
    <section class="page page--model-performance">
      <header class="page__header">
        <h1>Model Performance &amp; Calibration</h1>
        <p class="page__subtitle">Every number here is aggregated from stored grading columns (e.g. consensus_correct) &mdash; nothing is recomputed or re-graded.</p>
      </header>
      <nav class="tab-nav">${tabNav}</nav>
      ${body}
    </section>
  `;
}

function accuracyTab() {
  const rows = predictionRepository.accuracyOverTime({});
  if (!rows.length) {
    return `<div class="empty-state"><p>No graded predictions on record to compute accuracy over time.</p></div>`;
  }

  const engineKeys = [
    ['consensus_correct_rate', 'Consensus', ENGINE_COLORS.consensus],
    ['dc_correct_rate', 'Dixon-Coles', ENGINE_COLORS.dc],
    ['ml_correct_rate', 'ML Engine', ENGINE_COLORS.ml],
    ['legacy_correct_rate', 'Legacy', ENGINE_COLORS.legacy],
  ].filter(([key]) => rows.some((r) => r[key] != null));

  const series = engineKeys.map(([key, name, color]) => ({
    name,
    color,
    values: rows.map((r) => r[key]),
  }));

  const totalGraded = rows.reduce((sum, r) => sum + r.n, 0);

  return `
    <div class="panel">
      <h3>Accuracy by Month <span class="panel__count">${totalGraded.toLocaleString()} graded predictions</span></h3>
      ${lineChart({ series, xLabels: rows.map((r) => r.month), yMin: 0, yMax: 1 })}
    </div>
    <div class="panel">
      <h3>Monthly Detail</h3>
      <div class="table-scroll">
        <table class="data-table data-table--compact">
          <thead><tr><th>Month</th>${engineKeys.map(([, name]) => `<th>${name}</th>`).join('')}<th>Graded</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr><td>${r.month}</td>${engineKeys.map(([key]) => `<td>${formatPct(r[key])}</td>`).join('')}<td>${r.n}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function calibrationTab() {
  const rows = predictionRepository.calibrationCurve({});
  if (!rows.length) {
    return `<div class="empty-state"><p>No graded consensus predictions on record to build a calibration curve.</p></div>`;
  }

  const xLabels = rows.map((r) => `${r.bucket * 10}-${r.bucket * 10 + 10}%`);
  const series = [
    { name: 'Actual frequency correct', color: ENGINE_COLORS.consensus, values: rows.map((r) => r.actual_frequency) },
    { name: 'Stated probability (perfect calibration)', color: 'var(--paper-400)', values: rows.map((r) => r.avg_stated_prob) },
  ];

  return `
    <div class="panel">
      <h3>Calibration Curve <span class="panel__count">consensus pick only</span></h3>
      <p style="font-size:12px;color:var(--paper-400);margin-top:-4px;">
        For every graded prediction, bucketed by the stated probability of whichever outcome was actually
        picked. If the gold line tracks the grey line, the model's confidence numbers mean what they say.
      </p>
      ${lineChart({ series, xLabels, yMin: 0, yMax: 1 })}
    </div>
    <div class="panel">
      <h3>Bucket Detail</h3>
      <table class="data-table data-table--compact">
        <thead><tr><th>Stated probability</th><th>Actual frequency</th><th>Sample size</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `<tr><td>${xLabels[i]}</td><td>${formatPct(r.actual_frequency)}</td><td>${r.n}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function weightsTab() {
  const rows = predictionRepository.engineWeightHistory();
  if (!rows.length) {
    return `<div class="empty-state"><p>No engine_weights history on record. This table logs each time the DC/ML/Legacy blend weights were recalculated.</p></div>`;
  }

  const series = [
    { name: 'Dixon-Coles', color: ENGINE_COLORS.dc, values: rows.map((r) => r.dc_weight) },
    { name: 'ML Engine', color: ENGINE_COLORS.ml, values: rows.map((r) => r.ml_weight) },
    { name: 'Legacy', color: ENGINE_COLORS.legacy, values: rows.map((r) => r.legacy_weight) },
  ];
  const xLabels = rows.map((r) => (r.computed_at ? r.computed_at.slice(0, 16).replace('T', ' ') : '\u2014'));

  return `
    <div class="panel">
      <h3>Engine Weight History <span class="panel__count">${rows.length} recalculation${rows.length === 1 ? '' : 's'} on record</span></h3>
      ${lineChart({ series, xLabels, yMin: 0, yMax: 1 })}
    </div>
    <div class="panel">
      <h3>Recalculation Detail</h3>
      <div class="table-scroll">
        <table class="data-table data-table--compact">
          <thead><tr><th>Computed</th><th>DC</th><th>ML</th><th>Legacy</th><th>Sample size</th><th>Source</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r, i) => `<tr>
                  <td>${xLabels[i]}</td>
                  <td>${formatPct(r.dc_weight)}</td><td>${formatPct(r.ml_weight)}</td><td>${formatPct(r.legacy_weight)}</td>
                  <td>${r.sample_size ?? '\u2014'}</td><td>${r.source ?? '\u2014'}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
