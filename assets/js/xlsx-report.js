/* Construção do relatório .xlsx com aparência de relatório financeiro de
 * verdade: cabeçalho de marca, cartões de indicadores, tabelas com zebra e
 * status colorido, moeda formatada nativamente, fórmulas de soma.
 *
 * Precisa do xlsx-js-style (vendor/xlsx.style.min.js) — a edição community do
 * SheetJS não escreve estilo nenhum no arquivo; esse fork restaura o escritor
 * de estilos mantendo a mesma API `XLSX.utils.*`.
 */

const ARGB = {
  brandDark: 'FF1E2233',
  brandMed: 'FF2E3348',
  accent: 'FF33D9AF',
  accentDark: 'FF0F8F6E',
  warn: 'FFC77D22',
  warnBg: 'FFFDF1E0',
  warnText: 'FF8A5A17',
  goodBg: 'FFE3F8EF',
  goodText: 'FF0F7A57',
  text: 'FF1E2233',
  muted: 'FF6B7280',
  faint: 'FF9CA3AF',
  border: 'FFE2E5EC',
  zebra: 'FFF7F8FA',
  white: 'FFFFFFFF'
};

const thin = { style: 'thin', color: { rgb: ARGB.border } };
const box = { top: thin, bottom: thin, left: thin, right: thin };

function titleStyle() {
  return {
    font: { bold: true, sz: 16, color: { rgb: ARGB.white }, name: 'Calibri' },
    fill: { fgColor: { rgb: ARGB.brandDark } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 }
  };
}
function subtitleStyle() {
  return {
    font: { italic: true, sz: 10, color: { rgb: ARGB.faint }, name: 'Calibri' },
    fill: { fgColor: { rgb: ARGB.brandDark } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 }
  };
}
function sectionStyle() {
  return {
    font: { bold: true, sz: 12, color: { rgb: ARGB.brandDark }, name: 'Calibri' },
    border: { bottom: { style: 'medium', color: { rgb: ARGB.accent } } },
    alignment: { vertical: 'center' }
  };
}
function kpiLabelStyle() {
  return {
    font: { sz: 9, bold: true, color: { rgb: ARGB.muted }, name: 'Calibri' },
    fill: { fgColor: { rgb: ARGB.zebra } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
    border: { ...box, bottom: { style: 'none' } }
  };
}
function kpiValueStyle(color) {
  return {
    font: { sz: 15, bold: true, color: { rgb: color || ARGB.brandDark }, name: 'Calibri' },
    fill: { fgColor: { rgb: ARGB.zebra } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
    border: { ...box, top: { style: 'none' } }
  };
}
function tableHeaderStyle() {
  return {
    font: { bold: true, sz: 10, color: { rgb: ARGB.white }, name: 'Calibri' },
    fill: { fgColor: { rgb: ARGB.brandMed } },
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
    border: box
  };
}
function cellStyle(opts) {
  const o = opts || {};
  return {
    font: { sz: 10.5, name: 'Calibri', bold: !!o.bold, italic: !!o.italic, color: { rgb: o.color || ARGB.text } },
    fill: { fgColor: { rgb: o.bg || ARGB.white } },
    alignment: { horizontal: o.align || 'left', vertical: 'center', indent: o.align === 'left' ? 1 : 0 },
    border: box
  };
}
function totalRowStyle(align) {
  return {
    font: { bold: true, sz: 10.5, color: { rgb: ARGB.brandDark }, name: 'Calibri' },
    fill: { fgColor: { rgb: ARGB.zebra } },
    alignment: { horizontal: align || 'left', vertical: 'center', indent: align === 'left' ? 1 : 0 },
    border: { ...box, top: { style: 'medium', color: { rgb: ARGB.brandDark } } }
  };
}

function moneyFmt(symbol) {
  return `"${symbol}" #,##0.00;[RED]-"${symbol}" #,##0.00`;
}

function set(ws, addr, value, style, opts) {
  if (value === null || value === undefined) {
    ws[addr] = { t: 'z', s: style };
    return;
  }
  const cell = { v: value, s: style };
  if (opts && opts.z) cell.z = opts.z;
  if (typeof value === 'number') cell.t = 'n';
  else if (typeof value === 'string') cell.t = 's';
  ws[addr] = cell;
}

/* Linhas de total levam o valor já somado em JS, não uma fórmula SUM() do
 * Excel: o writer de estilos, ao ver qualquer `f`, emite um xl/metadata.xml
 * de "dynamic array" que nenhuma célula referencia. O Excel ignora esse
 * órfão, mas o LibreOffice recusa o arquivo inteiro — "source file could
 * not be loaded". Um relatório "profissional" antes de tudo precisa abrir
 * em qualquer programa; o número final é idêntico de qualquer forma. */

const col = (i) => String.fromCharCode(65 + i);

function kpiRow(ws, rowLabel, rowValue, items) {
  items.forEach((item, i) => {
    const c = col(i);
    set(ws, c + rowLabel, item.label, kpiLabelStyle());
    set(ws, c + rowValue, item.value, kpiValueStyle(item.color), item.z ? { z: item.z } : undefined);
  });
}

/**
 * Monta o workbook completo. Recebe dados já calculados (nada de lógica de
 * negócio aqui) e devolve o objeto `wb` pronto para `XLSX.writeFile`.
 */
export function buildWorkbook(XLSX, data) {
  const {
    appName, generatedAt, currencySymbol,
    totals, period, year, weekday, stats, entries, labels
  } = data;

  const wb = XLSX.utils.book_new();
  const moneyZ = moneyFmt(currencySymbol);

  /* ============================== Resumo ============================== */
  const ws1 = {};
  let r = 1;

  set(ws1, 'A' + r, appName + ' — ' + labels.resumo, titleStyle());
  for (let i = 1; i < 6; i++) set(ws1, col(i) + r, '', titleStyle());
  r++;
  set(ws1, 'A' + r, generatedAt, subtitleStyle());
  for (let i = 1; i < 6; i++) set(ws1, col(i) + r, '', subtitleStyle());
  r += 2;

  set(ws1, 'A' + r, labels.statsTitle, sectionStyle());
  for (let i = 1; i < 6; i++) set(ws1, col(i) + r, '', sectionStyle());
  r++;
  const kpiLabelRow = r;
  const kpiValueRow = r + 1;
  kpiRow(ws1, kpiLabelRow, kpiValueRow, [
    { label: labels.total, value: totals.total, z: moneyZ, color: ARGB.accentDark },
    { label: labels.dias, value: totals.diasUnicos },
    { label: labels.media, value: Math.round(totals.mediaTurno * 100) / 100, z: moneyZ },
    { label: labels.completo, value: totals.completos },
    { label: labels.meio, value: totals.meios },
    { label: labels.metaMes, value: (period.pctMeta * 100).toFixed(0) + '%', color: period.pctMeta >= 1 ? ARGB.accentDark : ARGB.warn }
  ]);
  r = kpiValueRow + 2;

  set(ws1, 'A' + r, labels.monthly + ' — ' + year.year, sectionStyle());
  for (let i = 1; i < 6; i++) set(ws1, col(i) + r, '', sectionStyle());
  r++;
  const monthHeader = ['A' + r, 'B' + r, 'C' + r, 'D' + r, 'E' + r, 'F' + r];
  const monthCols = [labels.month, labels.shifts, labels.days, labels.total, '% ' + labels.metaMes, labels.status];
  monthCols.forEach((h, i) => set(ws1, monthHeader[i], h, tableHeaderStyle()));
  r++;
  year.monthly.forEach((m, i) => {
    const meta = Number(period.meta) || 0;
    const pct = meta > 0 ? m.ganho / meta : 0;
    const hit = meta > 0 && pct >= 1;
    const zebra = i % 2 === 1;
    const statusColor = hit ? ARGB.goodText : (meta > 0 ? ARGB.warnText : ARGB.faint);
    const statusBg = hit ? ARGB.goodBg : (meta > 0 ? ARGB.warnBg : (zebra ? ARGB.zebra : ARGB.white));
    const bg = zebra ? ARGB.zebra : ARGB.white;
    set(ws1, 'A' + r, labels.monthNames[i], cellStyle({ bg }));
    set(ws1, 'B' + r, m.turnos, cellStyle({ bg, align: 'right' }));
    set(ws1, 'C' + r, m.dias, cellStyle({ bg, align: 'right' }));
    set(ws1, 'D' + r, m.ganho, cellStyle({ bg, align: 'right' }), { z: moneyZ });
    set(ws1, 'E' + r, meta > 0 ? pct : null, cellStyle({ bg, align: 'right' }), meta > 0 ? { z: '0%' } : undefined);
    set(ws1, 'F' + r, meta === 0 ? '—' : (hit ? labels.goalHit : labels.inProgress),
      { ...cellStyle({ align: 'left' }), fill: { fgColor: { rgb: statusBg } }, font: { sz: 10, bold: true, color: { rgb: statusColor }, name: 'Calibri' } });
    r++;
  });
  set(ws1, 'A' + r, labels.total, totalRowStyle('left'));
  set(ws1, 'B' + r, totals.completos + totals.meios, totalRowStyle('right'));
  set(ws1, 'C' + r, totals.diasUnicos, totalRowStyle('right'));
  set(ws1, 'D' + r, year.monthly.reduce((s, m) => s + m.ganho, 0), totalRowStyle('right'), { z: moneyZ });
  set(ws1, 'E' + r, '', totalRowStyle('right'));
  set(ws1, 'F' + r, '', totalRowStyle('left'));
  r += 2;

  set(ws1, 'A' + r, labels.weekday, sectionStyle());
  for (let i = 1; i < 3; i++) set(ws1, col(i) + r, '', sectionStyle());
  for (let i = 3; i < 6; i++) set(ws1, col(i) + r, '', {});
  r++;
  ['A' + r, 'B' + r, 'C' + r].forEach((addr, i) => set(ws1, addr, [labels.weekdayCol, labels.shifts, labels.total][i], tableHeaderStyle()));
  r++;
  weekday.forEach((w, i) => {
    const zebra = i % 2 === 1;
    const bg = zebra ? ARGB.zebra : ARGB.white;
    const peak = w.ganho === weekday.reduce((m, x) => Math.max(m, x.ganho), 0) && w.ganho > 0;
    set(ws1, 'A' + r, w.name + (peak ? '  ★' : ''), cellStyle({ bg, bold: peak, color: peak ? ARGB.accentDark : ARGB.text }));
    set(ws1, 'B' + r, w.turnos, cellStyle({ bg, align: 'right' }));
    set(ws1, 'C' + r, w.ganho, cellStyle({ bg, align: 'right', bold: peak, color: peak ? ARGB.accentDark : ARGB.text }), { z: moneyZ });
    r++;
  });
  r += 1;

  set(ws1, 'A' + r, labels.statsTitle2, sectionStyle());
  for (let i = 1; i < 6; i++) set(ws1, col(i) + r, '', sectionStyle());
  r++;
  kpiRow(ws1, r, r + 1, [
    { label: labels.maxDay, value: stats.maiorGanhoDia, z: moneyZ },
    { label: labels.minDay, value: stats.menorGanhoDia, z: moneyZ },
    { label: labels.streak, value: stats.maiorSequencia },
    { label: labels.gap, value: stats.maiorIntervalo }
  ]);
  r += 2;
  kpiRow(ws1, r, r + 1, [
    { label: labels.fridays, value: stats.qtdSextas },
    { label: labels.saturdays, value: stats.qtdSabados },
    { label: labels.weekAvg, value: stats.mediaSemanal, z: moneyZ },
    { label: labels.monthAvg, value: stats.mediaMensal, z: moneyZ }
  ]);
  r += 3;

  set(ws1, 'A' + r, labels.footer, { font: { italic: true, sz: 8.5, color: { rgb: ARGB.faint }, name: 'Calibri' } });

  ws1['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
  ws1['!rows'] = { 0: { hpt: 26 }, 1: { hpt: 16 } };
  ws1['!ref'] = 'A1:F' + r;
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
  ];
  XLSX.utils.book_append_sheet(wb, ws1, labels.resumo.slice(0, 31));

  /* ============================ Lançamentos ============================ */
  const ws2 = {};
  let r2 = 1;
  set(ws2, 'A' + r2, labels.entriesTitle, titleStyle());
  for (let i = 1; i < 6; i++) set(ws2, col(i) + r2, '', titleStyle());
  r2++;
  set(ws2, 'A' + r2, labels.entriesSub, subtitleStyle());
  for (let i = 1; i < 6; i++) set(ws2, col(i) + r2, '', subtitleStyle());
  r2 += 2;

  const headerRow2 = r2;
  const cols2 = [labels.date, labels.weekdayCol, labels.turno, labels.value, labels.custom, labels.note];
  cols2.forEach((h, i) => set(ws2, col(i) + r2, h, tableHeaderStyle()));
  r2++;
  entries.forEach((e, i) => {
    const zebra = i % 2 === 1;
    const bg = zebra ? ARGB.zebra : ARGB.white;
    const customStyle = e.custom ? { bold: true, color: ARGB.accentDark } : {};
    set(ws2, 'A' + r2, e.dateLabel, cellStyle({ bg }));
    set(ws2, 'B' + r2, e.weekdayLabel, cellStyle({ bg }));
    set(ws2, 'C' + r2, e.turnoLabel, cellStyle({ bg }));
    set(ws2, 'D' + r2, e.value, cellStyle({ bg, align: 'right', ...customStyle }), { z: moneyZ });
    set(ws2, 'E' + r2, e.custom ? labels.yes : '—', cellStyle({ bg, align: 'center', color: e.custom ? ARGB.accentDark : ARGB.faint }));
    set(ws2, 'F' + r2, e.note || '', cellStyle({ bg, italic: !e.note, color: e.note ? ARGB.text : ARGB.faint }));
    r2++;
  });
  set(ws2, 'A' + r2, labels.total, totalRowStyle('left'));
  set(ws2, 'B' + r2, '', totalRowStyle('left'));
  set(ws2, 'C' + r2, entries.length + ' ' + labels.records, totalRowStyle('left'));
  set(ws2, 'D' + r2, entries.reduce((s, e) => s + e.value, 0), totalRowStyle('right'), { z: moneyZ });
  set(ws2, 'E' + r2, '', totalRowStyle('center'));
  set(ws2, 'F' + r2, '', totalRowStyle('left'));

  ws2['!cols'] = [{ wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 15 }, { wch: 14 }, { wch: 34 }];
  ws2['!rows'] = { 0: { hpt: 26 }, 1: { hpt: 16 }, [headerRow2 - 1]: { hpt: 20 } };
  ws2['!ref'] = 'A1:F' + r2;
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
  ];
  ws2['!autofilter'] = { ref: `A${headerRow2}:F${r2 - 1}` };
  XLSX.utils.book_append_sheet(wb, ws2, labels.entriesTitle.slice(0, 31));

  return wb;
}
