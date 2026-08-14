/* Aba Calendário + modal do dia (também usado pelo botão flutuante e pelo
   heatmap do Resumo). */

import { $, esc, setHTML, setText, on, delegate, focusTrap } from './dom.js';
import { t } from '../i18n.js';
import { state, sel } from '../state.js';
import { money, todayISO, monthTitle, weekdayNames, dateLong } from '../format.js';
import { calcValor, hasCustom } from '../calc.js';
import { addEntry, deleteEntry } from '../actions.js';
import { alertDialog } from './dialog.js';

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let modalDate = null;
let releaseTrap = null;
let lastFocused = null;

const ICON_TRASH = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

function entriesForDate(dateStr) {
  return sel.live().filter((e) => e.date === dateStr);
}

export function renderCalendar() {
  const titleEl = $('cal-title');
  if (!titleEl) return;
  setText(titleEl, monthTitle(calYear, calMonth));

  const wd = $('cal-weekdays');
  if (wd) setHTML(wd, weekdayNames('short').map((n) => `<span>${esc(n)}</span>`).join(''));

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const todayStr = todayISO();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  let monthTotal = 0;
  let monthShifts = 0;

  const html = cells.map((day) => {
    if (day === null) return '<div class="cal-cell empty"></div>';
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEntries = entriesForDate(dateStr);
    const total = dayEntries.reduce((s, e) => s + calcValor(e, state.params), 0);
    monthTotal += total;
    monthShifts += dayEntries.length;
    const isToday = dateStr === todayStr;
    return `<button type="button" class="cal-cell ${dayEntries.length ? 'has-entry' : ''} ${isToday ? 'today' : ''}"
      data-date="${esc(dateStr)}" aria-label="${esc(dateLong(dateStr))}${dayEntries.length ? ' · ' + esc(money(total)) : ''}">
      <span class="cal-day-num">${day}</span>
      ${dayEntries.length ? `<span class="cal-value">${esc(money(total))}</span>` : ''}
      ${dayEntries.length > 1 ? '<span class="cal-dot"></span>' : ''}
    </button>`;
  }).join('');

  setHTML($('cal-grid'), html);
  setText($('cal-total'), t('cal.monthTotal', { v: money(monthTotal), n: monthShifts }));
}

export function goToToday() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

export function openDayModal(dateStr) {
  modalDate = dateStr;
  lastFocused = document.activeElement;
  setText($('modal-title'), dateLong(dateStr));
  const custom = $('modal-custom');
  const note = $('modal-note');
  if (custom) custom.value = '';
  if (note) note.value = '';
  const turno = $('modal-turno');
  if (turno) turno.value = 'Completo';
  renderModalEntries();
  const modal = $('day-modal');
  modal.classList.add('open');
  releaseTrap = focusTrap(modal);
  requestAnimationFrame(() => {
    if (turno) turno.focus();
  });
}

export function closeDayModal() {
  const modal = $('day-modal');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  modalDate = null;
  if (releaseTrap) {
    releaseTrap();
    releaseTrap = null;
  }
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

export function isDayModalOpen() {
  const modal = $('day-modal');
  return Boolean(modal && modal.classList.contains('open'));
}

export function renderModalEntries() {
  const container = $('modal-entries');
  if (!container || !modalDate) return;
  const dayEntries = entriesForDate(modalDate);
  if (!dayEntries.length) {
    setHTML(container, `<p class="section-sub">${esc(t('cal.noEntries'))}</p>`);
    return;
  }
  setHTML(container, dayEntries.map((e) => `
    <div class="modal-entry" data-id="${esc(e.id)}">
      <span class="chip ${e.turno === 'Completo' ? 'completo' : 'meio'}">${esc(t('turno.' + e.turno))}</span>
      <span class="entry-value">${esc(money(calcValor(e, state.params)))}${hasCustom(e) ? `<span class="entry-custom-tag">${esc(t('list.customTag'))}</span>` : ''}</span>
      ${e.note ? `<span class="entry-note">${esc(e.note)}</span>` : ''}
      <div class="row-actions">
        <button type="button" class="icon-btn modal-del-btn" title="${esc(t('list.delete'))}" aria-label="${esc(t('list.delete'))}">${ICON_TRASH}</button>
      </div>
    </div>`).join(''));
}

export function wireCalendar() {
  on($('cal-prev'), 'click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  on($('cal-next'), 'click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
  on($('cal-today'), 'click', goToToday);

  delegate($('cal-grid'), 'click', '.cal-cell:not(.empty)', (ev, cell) => {
    openDayModal(cell.dataset.date);
  });

  on($('modal-close'), 'click', closeDayModal);
  on($('day-modal'), 'click', (ev) => {
    if (ev.target.id === 'day-modal') closeDayModal();
  });

  delegate($('modal-entries'), 'click', '.modal-del-btn', (ev, btn) => {
    const id = btn.closest('.modal-entry').dataset.id;
    // O "Desfazer" precisa repintar a modal aberta — antes ela ficava com o
    // estado velho depois de restaurar o lançamento.
    deleteEntry(id, renderModalEntries);
    renderModalEntries();
  });

  on($('modal-add-btn'), 'click', async () => {
    if (!modalDate) return;
    const customEl = $('modal-custom');
    const raw = customEl.value;
    let custom = null;
    if (raw !== '') {
      const n = Number(raw);
      if (isNaN(n) || n < 0) {
        await alertDialog(t('entries.badCustom'));
        return;
      }
      custom = n;
    }
    const noteEl = $('modal-note');
    await addEntry({
      date: modalDate,
      turno: $('modal-turno').value,
      custom,
      note: noteEl ? noteEl.value.trim() : ''
    });
    customEl.value = '';
    if (noteEl) noteEl.value = '';
    renderModalEntries();
  });
}
