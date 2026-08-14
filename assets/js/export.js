/* Exportação e importação. O usuário é dono dos dados dele: sai em JSON (para
   restaurar), CSV e XLSX (para planilha) e PDF (para imprimir/enviar). */

import { state, sel } from './state.js';
import { t } from './i18n.js';
import { esc } from './ui/dom.js';
import {
  moneyRaw, dateShort, todayISO, monthNames, weekdayNameFromDow, parseISO, dateTimeNow
} from './format.js';
import { calcValor, hasCustom, activeEntries } from './calc.js';
import { LS, APP_VERSION } from './constants.js';

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
      s.src = 'vendor/xlsx.mini.min.js';
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
  const months = monthNames();

  const rows = sortedEntries(false).map((e) => ({
    [t('entries.date')]: dateShort(e.date),
    [t('weekday.title')]: weekdayNameFromDow(parseISO(e.date).getDay()),
    [t('entries.turno')]: t('turno.' + e.turno),
    Valor: calcValor(e, state.params),
    [t('list.customTag')]: hasCustom(e) ? t('dialog.confirm') : '—',
    [t('entries.note')]: e.note || ''
  }));
  const wsEntries = XLSX.utils.json_to_sheet(rows);

  const totals = sel.totals();
  const year = sel.year(state.anoSelecionado);
  const resumo = [
    [t('statsx.title'), ''],
    [t('stats.total'), totals.total],
    [t('stats.dias'), totals.diasUnicos],
    [t('stats.media'), Math.round(totals.mediaTurno * 100) / 100],
    [t('stats.completo'), totals.completos],
    [t('stats.meio'), totals.meios],
    [],
    [String(year.year), t('chart.byMonth')],
    ...year.monthly.map((m, i) => [months[i], m.ganho])
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumo, t('nav.resumo').slice(0, 31));
  XLSX.utils.book_append_sheet(wb, wsEntries, t('nav.lancamentos').slice(0, 31));
  XLSX.writeFile(wb, `freelancer-${todayISO()}.xlsx`);
}

/* -------------------------------------------------------------------------- */
/* PDF (via impressão do navegador)                                            */
/* -------------------------------------------------------------------------- */

export function exportPdf() {
  const totals = sel.totals();
  const st = sel.extra();
  const p = sel.period();
  const year = sel.year(state.anoSelecionado);
  const months = monthNames();
  const list = sortedEntries(true);

  // moneyRaw: um relatório com "••••••" no lugar dos valores não serve para nada.
  const monthlyRows = year.monthly.map((m, i) =>
    `<tr><td>${esc(months[i])}</td><td>${esc(moneyRaw(m.ganho))}</td><td>${m.turnos}</td><td>${m.dias}</td></tr>`
  ).join('');

  const entryRows = list.map((e) =>
    `<tr><td>${esc(dateShort(e.date))}</td><td>${esc(t('turno.' + e.turno))}</td><td>${esc(moneyRaw(calcValor(e, state.params)))}</td><td>${esc(e.note || '')}</td></tr>`
  ).join('');

  const statCell = (value, label) => `<div class="pr-stat"><b>${esc(value)}</b>${esc(label)}</div>`;

  document.getElementById('print-report').innerHTML = `
    <div class="pr-title">${esc(t('app.name'))}</div>
    <div class="pr-sub">${esc(dateTimeNow())}</div>

    <div class="pr-section-title">${esc(t('nav.resumo'))}</div>
    <div class="pr-stats">
      ${statCell(moneyRaw(totals.total), t('stats.total'))}
      ${statCell(String(totals.diasUnicos), t('stats.dias'))}
      ${statCell(moneyRaw(totals.mediaTurno), t('stats.media'))}
      ${statCell(String(totals.completos), t('stats.completo'))}
      ${statCell(String(totals.meios), t('stats.meio'))}
    </div>

    <div class="pr-section-title">${esc(t('period.month'))}</div>
    <div class="pr-stats">
      ${statCell(moneyRaw(p.ganhoMes), t('period.month'))}
      ${statCell(moneyRaw(p.meta), t('period.goal'))}
      ${statCell(moneyRaw(p.previsao), t('period.forecast'))}
      ${statCell(String(p.turnosMes), t('nav.lancamentos'))}
    </div>

    <div class="pr-section-title">${esc(t('statsx.title'))}</div>
    <div class="pr-stats">
      ${statCell(moneyRaw(st.maiorGanhoDia), t('statsx.maxDay'))}
      ${statCell(moneyRaw(st.menorGanhoDia), t('statsx.minDay'))}
      ${statCell(String(st.maiorSequencia), t('statsx.streak'))}
      ${statCell(String(st.maiorIntervalo), t('statsx.gap'))}
      ${statCell(moneyRaw(st.mediaSemanal), t('statsx.weekAvg'))}
      ${statCell(moneyRaw(st.mediaMensal), t('statsx.monthAvg'))}
    </div>

    <div class="pr-section-title">${esc(t('monthly.title'))} — ${year.year}</div>
    <table>
      <thead><tr><th>${esc(t('filters.month'))}</th><th>${esc(t('stats.total'))}</th><th>${esc(t('nav.lancamentos'))}</th><th>${esc(t('stats.dias'))}</th></tr></thead>
      <tbody>${monthlyRows}</tbody>
    </table>

    <div class="pr-section-title">${esc(t('list.title'))} (${list.length})</div>
    <table>
      <thead><tr><th>${esc(t('entries.date'))}</th><th>${esc(t('entries.turno'))}</th><th>${esc(t('stats.total'))}</th><th>${esc(t('entries.note'))}</th></tr></thead>
      <tbody>${entryRows}</tbody>
    </table>
  `;
  window.print();
}
