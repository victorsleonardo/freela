/* Exportação e importação. O usuário é dono dos dados dele: sai em JSON (para
   restaurar), CSV e XLSX (para planilha) e PDF (para imprimir/enviar). */

import { state, sel } from './state.js';
import { t } from './i18n.js';
import { esc } from './ui/dom.js';
import {
  moneyRaw, dateShort, todayISO, monthNames, weekdayNameFromDow, parseISO, dateTimeNow,
  currencySymbol
} from './format.js';
import { calcValor, hasCustom, activeEntries } from './calc.js';
import { LS, APP_VERSION } from './constants.js';
import { buildWorkbook } from './xlsx-report.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sortedEntries(desc) {
  const list = [...activeEntries(state.entries)];
  list.sort((a, b) => (a.date < b.date ? (desc ? 1 : -1) : a.date > b.date ? (desc ? -1 : 1) : 0));
  return list;
}

/* -------------------------------------------------------------------------- */
/* JSON                                                                        */
/* -------------------------------------------------------------------------- */

export function exportBackupJson() {
  const payload = {
    app: 'painel-freelancer',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: state.entries, // inclui tombstones: um restore não ressuscita exclusões
    params: state.params
  };
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `backup-freelancer-${todayISO()}.json`
  );
  try { localStorage.setItem(LS.lastAutoExport, String(Date.now())); } catch (_) {}
}

export async function readBackupFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.entries) || typeof parsed.params !== 'object') {
    throw new Error(t('backup.invalid'));
  }
  return parsed;
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

function csvCell(value) {
  const s = String(value ?? '');
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportCsv() {
  const header = [t('entries.date'), t('filters.month'), t('entries.turno'), 'Valor', t('entries.note')];
  const months = monthNames();
  const rows = sortedEntries(false).map((e) => {
    const d = parseISO(e.date);
    return [
      e.date,
      months[d.getMonth()] + '/' + d.getFullYear(),
      t('turno.' + e.turno),
      String(calcValor(e, state.params).toFixed(2)).replace('.', ','),
      e.note || ''
    ];
  });
  // ";" + BOM: é o que o Excel em pt-BR abre sem pedir importação manual.
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `freelancer-${todayISO()}.csv`);
}

/* -------------------------------------------------------------------------- */
/* XLSX — biblioteca carregada só na hora, não no boot                        */
/* -------------------------------------------------------------------------- */

let xlsxPromise = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.style.min.js';
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX')));
      s.onerror = () => {
        xlsxPromise = null;
        reject(new Error('XLSX'));
      };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

export async function exportXlsx() {
  const XLSX = await loadXlsx();
  const totals = sel.totals();
  const period = sel.period();
  const year = sel.year(state.anoSelecionado);
  const stats = sel.extra();
  const months = monthNames();

  const weekdayNames = [];
  const long = weekdayNameFromDow; // (dow) => nome
  for (let idx = 0; idx < 7; idx++) {
    const dow = (idx + 1) % 7; // 0=segunda no array de exibição
    weekdayNames.push({ name: long(dow), ganho: totals.weekday[dow].ganho, turnos: totals.weekday[dow].turnos });
  }

  const entries = sortedEntries(false).map((e) => ({
    dateLabel: dateShort(e.date),
    weekdayLabel: weekdayNameFromDow(parseISO(e.date).getDay()),
    turnoLabel: t('turno.' + e.turno),
    value: calcValor(e, state.params),
    custom: hasCustom(e),
    note: e.note || ''
  }));

  const wb = buildWorkbook(XLSX, {
    appName: t('app.name'),
    generatedAt: t('report.period', { date: dateTimeNow() }),
    currencySymbol: currencySymbol(),
    totals,
    period,
    year,
    weekday: weekdayNames,
    stats,
    entries,
    labels: {
      resumo: t('nav.resumo'),
      statsTitle: t('nav.resumo'),
      statsTitle2: t('statsx.title'),
      total: t('stats.total'),
      dias: t('stats.dias'),
      media: t('stats.media'),
      completo: t('stats.completo'),
      meio: t('stats.meio'),
      metaMes: t('period.goal'),
      monthly: t('monthly.title'),
      month: t('filters.month'),
      shifts: t('report.shifts'),
      days: t('stats.dias'),
      status: t('report.status'),
      goalHit: t('report.goalHit'),
      inProgress: t('report.inProgress'),
      monthNames: months,
      weekday: t('weekday.title'),
      weekdayCol: t('report.weekdayCol'),
      maxDay: t('statsx.maxDay'),
      minDay: t('statsx.minDay'),
      streak: t('statsx.streak'),
      gap: t('statsx.gap'),
      fridays: t('statsx.fridays'),
      saturdays: t('statsx.saturdays'),
      weekAvg: t('statsx.weekAvg'),
      monthAvg: t('statsx.monthAvg'),
      entriesTitle: t('list.title'),
      entriesSub: t('report.entriesSub', { n: entries.length }),
      date: t('entries.date'),
      turno: t('entries.turno'),
      value: t('report.value'),
      custom: t('report.customCol'),
      note: t('entries.note'),
      yes: t('report.yes'),
      records: t('report.records'),
      footer: t('report.footer')
    }
  });

  XLSX.writeFile(wb, `freelancer-${todayISO()}.xlsx`);
}

/* -------------------------------------------------------------------------- */
/* PDF (via impressão do navegador)                                            */
/* -------------------------------------------------------------------------- */

const INSIGHT_TONE_CLASS = { good: 'good', warn: 'warn', bad: 'bad', info: 'info', empty: 'info' };

function insightText(item) {
  const vars = { ...item.vars };
  if (typeof vars.v === 'number') vars.v = moneyRaw(vars.v);
  if (typeof vars.total === 'number') vars.total = moneyRaw(vars.total);
  if (typeof vars.perDay === 'number') vars.perDay = moneyRaw(vars.perDay);
  if (vars.dirUp !== undefined) vars.dir = t(vars.dirUp ? 'insights.up' : 'insights.down');
  if (vars.dow !== undefined) vars.day = weekdayNameFromDow(vars.dow);
  return t(item.key, vars);
}

function statTile(value, label, opts) {
  const o = opts || {};
  return `<div class="pr-kpi${o.hero ? ' hero' : ''}">
    <span class="pr-kpi-label">${esc(label)}</span>
    <span class="pr-kpi-value" style="${o.color ? `color:${o.color};` : ''}">${esc(value)}</span>
  </div>`;
}

/** Barrinha horizontal desenhada só com CSS — sem canvas nem imagem, imprime bem. */
function miniBar(pct, tone) {
  const w = Math.max(0, Math.min(100, Math.round(pct * 100)));
  return `<span class="pr-bar"><span class="pr-bar-fill ${tone || ''}" style="width:${w}%;"></span></span>`;
}

export function exportPdf() {
  const totals = sel.totals();
  const st = sel.extra();
  const p = sel.period();
  const year = sel.year(state.anoSelecionado);
  const insights = sel.insights();
  const months = monthNames();
  const list = sortedEntries(true);
  const meta = Number(state.params.meta) || 0;
  const maxMonthly = Math.max(...year.monthly.map((m) => m.ganho), 1);
  const maxWeekday = Math.max(...totals.weekday.map((w) => w.ganho), 1);

  const monthlyRows = year.monthly.map((m, i) => {
    const pct = meta > 0 ? m.ganho / meta : 0;
    const hit = meta > 0 && pct >= 1;
    return `<tr>
      <td>${esc(months[i])}</td>
      <td class="num">${m.turnos}</td>
      <td class="num">${m.dias}</td>
      <td class="num strong">${esc(moneyRaw(m.ganho))}</td>
      <td class="bar-cell">${miniBar(m.ganho / maxMonthly)}</td>
      <td>${meta === 0 ? '<span class="pr-muted">—</span>' : `<span class="pr-tag ${hit ? 'good' : 'warn'}">${esc(hit ? t('report.goalHit') : t('report.inProgress'))}</span>`}</td>
    </tr>`;
  }).join('');

  const weekdayRows = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const w = totals.weekday[dow];
    const peak = w.ganho === maxWeekday && w.ganho > 0;
    return `<tr>
      <td class="${peak ? 'strong' : ''}">${esc(weekdayNameFromDow(dow))}${peak ? ` <span class="pr-tag good sm">★ ${esc(t('report.peak'))}</span>` : ''}</td>
      <td class="num">${w.turnos}</td>
      <td class="num strong">${esc(moneyRaw(w.ganho))}</td>
      <td class="bar-cell">${miniBar(w.ganho / maxWeekday, peak ? 'accent' : '')}</td>
    </tr>`;
  }).join('');

  const entryRows = list.map((e, i) => {
    const custom = hasCustom(e);
    return `<tr class="${i % 2 === 1 ? 'zebra' : ''}">
      <td>${esc(dateShort(e.date))}</td>
      <td class="pr-muted">${esc(weekdayNameFromDow(parseISO(e.date).getDay()))}</td>
      <td>${esc(t('turno.' + e.turno))}</td>
      <td class="num ${custom ? 'strong accent' : ''}">${esc(moneyRaw(calcValor(e, state.params)))}</td>
      <td>${e.note ? esc(e.note) : '<span class="pr-muted">—</span>'}</td>
    </tr>`;
  }).join('');

  const insightRows = insights.map((item) =>
    `<li class="pr-insight ${INSIGHT_TONE_CLASS[item.kind] || 'info'}">${esc(insightText(item))}</li>`
  ).join('');

  const totalGeral = year.monthly.reduce((s, m) => s + m.ganho, 0);

  document.getElementById('print-report').innerHTML = `
    <div class="pr-page">
      <header class="pr-header">
        <p class="pr-brand">${esc(t('app.eyebrow'))}</p>
        <h1 class="pr-title">${esc(t('report.title'))}</h1>
        <p class="pr-meta">${esc(t('report.period', { date: dateTimeNow() }))}</p>
      </header>

      <section class="pr-kpis">
        ${statTile(moneyRaw(totals.total), t('stats.total'), { hero: true })}
        ${statTile(String(totals.diasUnicos), t('stats.dias'))}
        ${statTile(moneyRaw(totals.mediaTurno), t('stats.media'))}
        ${statTile(String(totals.completos), t('stats.completo'))}
        ${statTile(String(totals.meios), t('stats.meio'))}
        ${statTile((p.pctMeta * 100).toFixed(0) + '%', t('period.goal'), { color: p.pctMeta >= 1 ? 'var(--pr-good)' : 'var(--pr-warn)' })}
      </section>

      ${insights.length ? `
      <section class="pr-block">
        <h2 class="pr-section">${esc(t('report.insightsTitle'))}</h2>
        <ul class="pr-insights">${insightRows}</ul>
      </section>` : ''}

      <section class="pr-block">
        <h2 class="pr-section">${esc(t('monthly.title'))} — ${year.year}</h2>
        <table class="pr-table">
          <thead><tr>
            <th>${esc(t('filters.month'))}</th>
            <th class="num">${esc(t('report.shifts'))}</th>
            <th class="num">${esc(t('stats.dias'))}</th>
            <th class="num">${esc(t('stats.total'))}</th>
            <th></th>
            <th>${esc(t('report.status'))}</th>
          </tr></thead>
          <tbody>${monthlyRows}</tbody>
          <tfoot><tr>
            <td class="strong">${esc(t('stats.total'))}</td>
            <td class="num strong">${totals.completos + totals.meios}</td>
            <td class="num strong">${totals.diasUnicos}</td>
            <td class="num strong">${esc(moneyRaw(totalGeral))}</td>
            <td></td><td></td>
          </tr></tfoot>
        </table>
      </section>

      <section class="pr-block pr-avoid-break">
        <h2 class="pr-section">${esc(t('weekday.title'))}</h2>
        <table class="pr-table">
          <thead><tr>
            <th>${esc(t('report.weekdayCol'))}</th>
            <th class="num">${esc(t('report.shifts'))}</th>
            <th class="num">${esc(t('stats.total'))}</th>
            <th></th>
          </tr></thead>
          <tbody>${weekdayRows}</tbody>
        </table>
      </section>

      <section class="pr-block pr-avoid-break">
        <h2 class="pr-section">${esc(t('statsx.title'))}</h2>
        <div class="pr-stats-grid">
          ${statTile(moneyRaw(st.maiorGanhoDia), t('statsx.maxDay'))}
          ${statTile(moneyRaw(st.menorGanhoDia), t('statsx.minDay'))}
          ${statTile(String(st.maiorSequencia), t('statsx.streak'))}
          ${statTile(String(st.maiorIntervalo), t('statsx.gap'))}
          ${statTile(String(st.qtdSextas), t('statsx.fridays'))}
          ${statTile(String(st.qtdSabados), t('statsx.saturdays'))}
          ${statTile(moneyRaw(st.mediaSemanal), t('statsx.weekAvg'))}
          ${statTile(moneyRaw(st.mediaMensal), t('statsx.monthAvg'))}
        </div>
      </section>

      <section class="pr-block">
        <h2 class="pr-section">${esc(t('list.title'))} <span class="pr-count">${list.length}</span></h2>
        <table class="pr-table pr-entries">
          <thead><tr>
            <th>${esc(t('entries.date'))}</th>
            <th>${esc(t('report.weekdayCol'))}</th>
            <th>${esc(t('entries.turno'))}</th>
            <th class="num">${esc(t('report.value'))}</th>
            <th>${esc(t('entries.note'))}</th>
          </tr></thead>
          <tbody>${entryRows}</tbody>
        </table>
      </section>

      <footer class="pr-endnote">${esc(t('report.footer'))}</footer>
    </div>
  `;
  window.print();
}
