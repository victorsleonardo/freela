/* Aba Resumo: cartões, heatmap, gráficos e as "leituras do mês". */

import { $, esc, setHTML, scheduleFrame } from './dom.js';
import { t } from '../i18n.js';
import { state, sel } from '../state.js';
import {
  money, monthShort, monthNames, weekdayNames, weekdayNameFromDow,
  parseISO, toLocalISO, mondayIndex, dateShort, percent
} from '../format.js';
import { heatmapThresholds, heatmapLevel, yearsWithData, calcValor } from '../calc.js';

export function renderResumo() {
  renderStatGrid();
  renderPeriodCards();
  renderInsights();
  renderHeatmap();
  renderMonthly();
  renderWeekday();
  renderMonthChart();
  renderLineChart();
  renderPieChart();
  renderChart12m();
  renderStatsGrid();
}

/* -------------------------------------------------------------------------- */

function statCard(label, value, hero) {
  return `<div class="glass stat-card${hero ? ' hero' : ''}">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(value)}</div>
  </div>`;
}

function renderStatGrid() {
  const s = sel.totals();
  setHTML($('stat-grid'), [
    statCard(t('stats.total'), money(s.total), true),
    statCard(t('stats.dias'), String(s.diasUnicos)),
    statCard(t('stats.media'), money(s.mediaTurno)),
    statCard(t('stats.completo'), String(s.completos)),
    statCard(t('stats.meio'), String(s.meios))
  ].join(''));
}

function renderPeriodCards() {
  const p = sel.period();
  const pctPct = Math.min(p.pctMeta * 100, 100);

  let goalSub;
  if (p.meta <= 0) goalSub = t('period.setGoal');
  else if (p.ganhoMes >= p.meta) goalSub = t('period.goalDone', { v: money(p.excedenteMeta) });
  else goalSub = t('period.goalLeft', { pct: percent(p.pctMeta), v: money(p.restanteMeta) });

  setHTML($('period-grid'), `
    <div class="glass period-card">
      <div class="label">${esc(t('period.month'))}</div>
      <div class="value">${esc(money(p.ganhoMes))}</div>
      <div class="sub">${esc(t('period.shifts', { n: p.turnosMes }))}</div>
    </div>
    <div class="glass period-card">
      <div class="label">${esc(t('period.week'))}</div>
      <div class="value">${esc(money(p.ganhoSemana))}</div>
      <div class="sub">${esc(t('period.monToSun'))}</div>
    </div>
    <div class="glass period-card">
      <div class="label">${esc(t('period.goal'))}</div>
      <div class="value">${esc(money(p.ganhoMes))} <span class="of">/ ${esc(money(p.meta))}</span></div>
      <div class="sub">${esc(goalSub)}</div>
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pctPct)}">
        <div class="progress-fill ${p.pctMeta >= 1 ? 'over' : ''}" id="meta-progress-fill"></div>
      </div>
    </div>
    <div class="glass period-card">
      <div class="label">${esc(t('period.forecast'))}</div>
      <div class="value">${esc(money(p.previsao))}</div>
      <div class="sub">${esc(t('period.forecastSub', { v: money(p.mediaDiaria), n: p.diasRestantes }))}</div>
    </div>
  `);

  scheduleFrame('meta-progress', () => {
    const fill = $('meta-progress-fill');
    if (fill) fill.style.width = pctPct + '%';
  });
}

const INSIGHT_ICON = {
  good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17 13.5 8.5 8.5 13.5 2 7"/><path d="M16 17h6v-6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>'
};

function renderInsights() {
  const items = sel.insights();
  setHTML($('insights-list'), items.map((item) => {
    const vars = { ...item.vars };
    // Números crus viram texto formatado só na hora de exibir.
    if (typeof vars.v === 'number' && item.key !== 'insights.vsLastMonth') vars.v = money(vars.v);
    if (typeof vars.v === 'number') vars.v = money(vars.v);
    if (typeof vars.total === 'number') vars.total = money(vars.total);
    if (typeof vars.perDay === 'number') vars.perDay = money(vars.perDay);
    if (vars.dirUp !== undefined) vars.dir = t(vars.dirUp ? 'insights.up' : 'insights.down');
    if (vars.dow !== undefined) vars.day = weekdayNameFromDow(vars.dow);
    return `<div class="insight insight-${esc(item.kind)}">
      <span class="insight-icon">${INSIGHT_ICON[item.kind] || INSIGHT_ICON.info}</span>
      <span>${esc(t(item.key, vars))}</span>
    </div>`;
  }).join(''));
}

/* -------------------------------------------------------------------------- */
/* Heatmap                                                                    */
/* -------------------------------------------------------------------------- */

function buildHeatmapCells(year, valueByDate) {
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - mondayIndex(jan1));
  const gridEnd = new Date(dec31);
  gridEnd.setDate(gridEnd.getDate() + (6 - mondayIndex(dec31)));

  const cells = [];
  const cursor = new Date(gridStart);
  let col = 0;
  while (cursor <= gridEnd) {
    const row = mondayIndex(cursor);
    const inYear = cursor.getFullYear() === year;
    const key = toLocalISO(cursor);
    cells.push({ col, row, date: key, inYear, value: inYear ? valueByDate[key] || 0 : 0 });
    if (row === 6) col++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function heatmapColor(level) {
  return `var(--heat-${level})`;
}

export function renderHeatmap() {
  const year = state.anoSelecionado;
  const data = sel.year(year);
  const cells = buildHeatmapCells(year, data.valueByDate);
  const thresholds = heatmapThresholds(data.valueByDate);
  const totalCols = Math.max(...cells.map((c) => c.col)) + 1;

  const label = $('heat-year');
  if (label) label.textContent = String(year);

  const years = yearsWithData(state.entries);
  const minYear = years.length ? Math.min(...years) : year;
  const maxYear = Math.max(new Date().getFullYear(), years.length ? Math.max(...years) : year);
  const prev = $('heat-prev');
  const next = $('heat-next');
  if (prev) prev.disabled = year <= minYear;
  if (next) next.disabled = year >= maxYear;

  const grid = $('heatmap-grid');
  if (grid) {
    grid.style.gridTemplateColumns = `repeat(${totalCols}, 11px)`;
    setHTML(grid, cells.map((c) => {
      const lvl = c.inYear ? heatmapLevel(c.value, thresholds) : -1;
      const bg = lvl === -1 ? 'var(--heat-out)' : heatmapColor(lvl);
      const title = c.inYear
        ? `${dateShort(c.date)} · ${c.value > 0 ? money(c.value) : t('heatmap.noShift')}`
        : '';
      return `<div class="hcell" style="grid-column:${c.col + 1}; grid-row:${c.row + 1}; background:${bg};" title="${esc(title)}"${c.inYear && c.value > 0 ? ` data-date="${esc(c.date)}"` : ''}></div>`;
    }).join(''));
  }

  const monthsEl = $('heatmap-months');
  if (monthsEl) {
    monthsEl.style.gridTemplateColumns = `repeat(${totalCols}, 11px)`;
    const labels = new Array(totalCols).fill('');
    const short = monthShort();
    for (let m = 0; m < 12; m++) {
      const iso = `${year}-${String(m + 1).padStart(2, '0')}-01`;
      const first = cells.find((c) => c.inYear && c.date === iso);
      if (first) labels[first.col] = short[m];
    }
    setHTML(monthsEl, labels.map((lbl, i) => `<span style="grid-column:${i + 1};">${esc(lbl)}</span>`).join(''));
  }

  const rowLabels = $('heatmap-rowlabels');
  if (rowLabels) {
    const wd = weekdayNames('short');
    setHTML(rowLabels, wd.map((n, i) => `<span>${i % 2 === 0 ? esc(n) : ''}</span>`).join(''));
  }

  document.querySelectorAll('.heatmap-legend .hcell').forEach((el) => {
    el.style.background = heatmapColor(Number(el.dataset.level));
  });
}

/* -------------------------------------------------------------------------- */
/* Listas e gráficos                                                          */
/* -------------------------------------------------------------------------- */

function renderMonthly() {
  const data = sel.year(state.anoSelecionado);
  const meta = Number(state.params.meta) || 0;
  const names = monthNames();
  setHTML($('monthly-list'), data.monthly.map((m, i) => {
    const pct = meta > 0 ? m.ganho / meta : 0;
    const hit = pct >= 1;
    return `<div class="modern-row">
      <span class="name">${esc(names[i])}${hit ? `<span class="badge ok">${esc(t('badge.goal'))}</span>` : ''}</span>
      <span class="num">
        <span class="mini-bar-bg"><span class="mini-bar-fill ${hit ? '' : 'under'}" style="width:${Math.min(pct * 100, 100)}%;"></span></span>
        ${esc(money(m.ganho))}
      </span>
    </div>`;
  }).join(''));
}

function renderWeekday() {
  const s = sel.totals();
  const max = Math.max(...s.weekday.map((w) => w.ganho), 1);
  const names = weekdayNames('long');
  const rows = names.map((name, idx) => {
    const dow = (idx + 1) % 7; // idx 0 = segunda
    const w = s.weekday[dow];
    const isPeak = w.ganho === max && max > 0;
    return `<div class="modern-row">
      <span class="name">${esc(name)}${isPeak ? `<span class="badge peak">${esc(t('badge.peak'))}</span>` : ''}</span>
      <span class="num">
        <span class="mini-bar-bg"><span class="mini-bar-fill" style="width:${(w.ganho / max) * 100}%;"></span></span>
        ${esc(money(w.ganho))}
      </span>
    </div>`;
  });
  setHTML($('weekday-list'), rows.join(''));
}

function renderMonthChart() {
  const data = sel.year(state.anoSelecionado);
  const max = Math.max(...data.monthly.map((m) => m.ganho), 1);
  const names = monthNames();
  const short = monthShort();
  setHTML($('chart'), data.monthly.map((m, i) => {
    const h = Math.max((m.ganho / max) * 100, m.ganho > 0 ? 3 : 0);
    return `<div class="bar-col" title="${esc(names[i] + ': ' + money(m.ganho))}">
      <div class="bar" style="height:${h}%;"></div>
      <div class="bar-label">${esc(short[i])}</div>
    </div>`;
  }).join(''));
}

function renderLineChart() {
  const p = sel.period();
  const dailyByDay = Array.from({ length: p.daysInMonth }, () => 0);
  sel.live().forEach((e) => {
    const d = parseISO(e.date);
    if (d.getFullYear() === p.year && d.getMonth() === p.month) {
      dailyByDay[d.getDate() - 1] += calcValor(e, state.params);
    }
  });

  let acc = 0;
  const cumulative = dailyByDay.slice(0, p.dayOfMonth).map((v) => (acc += v));
  const maxVal = Math.max(...cumulative, p.meta || 0, 1);

  const w = Math.max(p.daysInMonth * 22, 320);
  const h = 140;
  const padB = 18;
  const padT = 10;
  const stepX = w / (p.daysInMonth - 1 || 1);
  const yFor = (v) => padT + (1 - v / maxVal) * (h - padT - padB);

  const points = cumulative.map((v, i) => `${(i * stepX).toFixed(1)},${yFor(v).toFixed(1)}`);
  const pathD = points.length ? 'M' + points.join(' L') : '';
  const areaD = points.length
    ? `M0,${h - padB} L${points.join(' L')} L${((points.length - 1) * stepX).toFixed(1)},${h - padB} Z`
    : '';
  const last = points.length ? points[points.length - 1].split(',') : null;
  const goalY = p.meta > 0 ? yFor(p.meta) : null;

  setHTML($('line-chart'), `
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(t('chart.evolution'))}">
      <defs>
        <linearGradient id="lineFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-2)" stop-opacity=".32"/>
          <stop offset="100%" stop-color="var(--accent-2)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="0" y1="${h - padB}" x2="${w}" y2="${h - padB}" stroke="var(--border)" stroke-width="1"/>
      ${goalY !== null ? `<line x1="0" y1="${goalY.toFixed(1)}" x2="${w}" y2="${goalY.toFixed(1)}" stroke="var(--accent-3)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".8"/>` : ''}
      ${areaD ? `<path d="${areaD}" fill="url(#lineFade)" stroke="none"/>` : ''}
      ${pathD ? `<path d="${pathD}" fill="none" stroke="var(--accent-2)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${last ? `<circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="var(--accent-2)"/>` : ''}
    </svg>
  `);
}

function renderPieChart() {
  const s = sel.totals();
  const total = s.completos + s.meios;
  const pie = $('pie-chart');
  if (!pie) return;
  if (total === 0) {
    setHTML(pie, `<p class="section-sub">${esc(t('chart.empty'))}</p>`);
    return;
  }
  const pctCompleto = (s.completos / total) * 100;
  setHTML(pie, `
    <div class="pie" style="background: conic-gradient(var(--accent) 0% ${pctCompleto}%, var(--accent-2) ${pctCompleto}% 100%);"></div>
    <div class="pie-legend">
      <span><span class="dot" style="background:var(--accent);"></span>${esc(t('turno.Completo'))} — ${s.completos} (${Math.round(pctCompleto)}%)</span>
      <span><span class="dot" style="background:var(--accent-2);"></span>${esc(t('turno.Meio'))} — ${s.meios} (${Math.round(100 - pctCompleto)}%)</span>
    </div>
  `);
}

function renderChart12m() {
  const months = sel.last12();
  const max = Math.max(...months.map((m) => m.ganho), 1);
  const short = monthShort();
  setHTML($('chart-12m'), months.map((m) => {
    const h = Math.max((m.ganho / max) * 100, m.ganho > 0 ? 3 : 0);
    return `<div class="bar-col" title="${esc(short[m.month] + '/' + m.year + ': ' + money(m.ganho))}">
      <div class="bar" style="height:${h}%;"></div>
      <div class="bar-label">${esc(short[m.month])}</div>
    </div>`;
  }).join(''));
}

function renderStatsGrid() {
  const st = sel.extra();
  const items = [
    [t('statsx.maxDay'), money(st.maiorGanhoDia)],
    [t('statsx.minDay'), money(st.menorGanhoDia)],
    [t('statsx.streak'), t('statsx.days', { n: st.maiorSequencia })],
    [t('statsx.gap'), t('statsx.days', { n: st.maiorIntervalo })],
    [t('statsx.fridays'), String(st.qtdSextas)],
    [t('statsx.saturdays'), String(st.qtdSabados)],
    [t('statsx.weekAvg'), money(st.mediaSemanal)],
    [t('statsx.monthAvg'), money(st.mediaMensal)]
  ];
  setHTML($('stats-mini-grid'), items.map(([label, value]) =>
    `<div class="stats-mini"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`
  ).join(''));
}
