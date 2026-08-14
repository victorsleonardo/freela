/* Aba Lançamentos: formulário, filtros e a lista. */

import { $, esc, setHTML, setText, show, delegate, debounce, on } from './dom.js';
import { t } from '../i18n.js';
import { state, sel } from '../state.js';
import { money, dateShort, todayISO, weekdayNameFromDow, parseISO, monthNames } from '../format.js';
import { calcValor, hasCustom, isPremiumDay } from '../calc.js';
import { addEntry, addSeries, updateEntry, deleteEntry } from '../actions.js';
import { alertDialog, confirmDialog } from './dialog.js';

const PAGE_SIZE = 120;

const filters = {
  mes: 'todos',
  ano: '',
  inicio: '',
  fim: '',
  turno: 'todos',
  somentePersonalizados: false
};
let searchText = '';
let editingId = null;
let visibleCount = PAGE_SIZE;

const ICON_EDIT = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_TRASH = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

export function getFilteredEntries() {
  const q = searchText.toLowerCase();
  const months = monthNames();
  return sel.live().filter((e) => {
    const d = parseISO(e.date);
    if (filters.mes !== 'todos' && d.getMonth() !== Number(filters.mes)) return false;
    if (filters.ano !== '' && d.getFullYear() !== Number(filters.ano)) return false;
    if (filters.inicio && e.date < filters.inicio) return false;
    if (filters.fim && e.date > filters.fim) return false;
    if (filters.turno !== 'todos' && e.turno !== filters.turno) return false;
    if (filters.somentePersonalizados && !hasCustom(e)) return false;
    if (q) {
      const hay = `${dateShort(e.date)} ${e.date} ${months[d.getMonth()]} ${t('turno.' + e.turno)} ${e.note || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function hasActiveFilters() {
  return (
    filters.mes !== 'todos' || filters.ano !== '' || filters.inicio || filters.fim ||
    filters.turno !== 'todos' || filters.somentePersonalizados || searchText
  );
}

function rowHTML(e) {
  if (editingId === e.id) {
    return `<div class="entry-row editing" data-id="${esc(e.id)}">
      <div class="form-row" style="width:100%; margin:2px 0;">
        <div class="field"><label>${esc(t('entries.date'))}</label><input type="date" class="edit-data" value="${esc(e.date)}"></div>
        <div class="field"><label>${esc(t('entries.turno'))}</label>
          <select class="edit-turno">
            <option value="Completo"${e.turno === 'Completo' ? ' selected' : ''}>${esc(t('turno.Completo'))}</option>
            <option value="Meio"${e.turno === 'Meio' ? ' selected' : ''}>${esc(t('turno.Meio'))}</option>
          </select>
        </div>
        <div class="field"><label>${esc(t('entries.custom'))}</label><input type="number" step="0.01" min="0" class="edit-custom" value="${e.custom ?? ''}" placeholder="${esc(t('list.auto'))}"></div>
        <div class="field"><label>${esc(t('entries.note'))}</label><input type="text" class="edit-note" maxlength="280" value="${esc(e.note || '')}"></div>
        <button type="button" class="btn-save-row">${esc(t('list.save'))}</button>
        <button type="button" class="secondary btn-cancel-row">${esc(t('list.cancel'))}</button>
      </div>
    </div>`;
  }

  const valor = calcValor(e, state.params);
  const premium = isPremiumDay(e.date, state.params);
  const dow = weekdayNameFromDow(parseISO(e.date).getDay(), 'long');

  return `<div class="entry-row" data-id="${esc(e.id)}">
    <span class="entry-date">${esc(dateShort(e.date))}</span>
    <span class="entry-day">${esc(dow.toLowerCase())}</span>
    <span class="chip ${e.turno === 'Completo' ? 'completo' : 'meio'}">${esc(t('turno.' + e.turno))}${premium ? ' · ' + esc(t('list.fds')) : ''}</span>
    <span class="entry-value">${esc(money(valor))}${hasCustom(e) ? `<span class="entry-custom-tag">${esc(t('list.customTag'))}</span>` : ''}</span>
    ${e.note ? `<span class="entry-note" title="${esc(e.note)}">${esc(e.note)}</span>` : ''}
    <div class="row-actions">
      <button type="button" class="icon-btn btn-edit-row" title="${esc(t('list.edit'))}" aria-label="${esc(t('list.edit'))}">${ICON_EDIT}</button>
      <button type="button" class="icon-btn btn-del-row" title="${esc(t('list.delete'))}" aria-label="${esc(t('list.delete'))}">${ICON_TRASH}</button>
    </div>
  </div>`;
}

export function renderEntries() {
  const list = $('entries-list');
  if (!list) return;

  const filtered = getFilteredEntries();
  const sorted = [...filtered].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const empty = $('entries-empty');
  if (empty) {
    show(empty, sorted.length === 0);
    setText(empty, hasActiveFilters() ? t('list.emptyFiltered') : t('list.empty'));
  }

  const resultEl = $('filter-result');
  if (resultEl) {
    if (hasActiveFilters()) {
      const total = filtered.reduce((sum, e) => sum + calcValor(e, state.params), 0);
      setText(resultEl, t('filters.result', { n: filtered.length, v: money(total) }));
    } else {
      setText(resultEl, '');
    }
  }

  // Listas grandes: renderizar milhares de linhas travava o celular.
  const page = sorted.slice(0, visibleCount);
  const remaining = sorted.length - page.length;
  setHTML(list,
    page.map(rowHTML).join('') +
    (remaining > 0
      ? `<button type="button" class="secondary load-more" id="btn-load-more">${esc(t('list.loadMore', { n: Math.min(remaining, PAGE_SIZE) }))}</button>`
      : '')
  );
}

function readCustom(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return isNaN(n) || n < 0 ? undefined : n; // undefined = inválido
}

async function submitNewEntry() {
  const dateEl = $('in-data');
  const turnoEl = $('in-turno');
  const customEl = $('in-custom');
  const noteEl = $('in-note');
  const repeatEl = $('in-repeat');

  const date = dateEl.value;
  if (!date) {
    await alertDialog(t('entries.needDate'));
    dateEl.focus();
    return;
  }
  const custom = readCustom(customEl.value);
  if (custom === undefined) {
    await alertDialog(t('entries.badCustom'));
    customEl.focus();
    return;
  }
  if (date > todayISO()) {
    const ok = await confirmDialog(t('entries.futureWarn'));
    if (!ok) return;
  }

  const payload = { date, turno: turnoEl.value, custom, note: noteEl ? noteEl.value.trim() : '' };
  const weeks = repeatEl ? Number(repeatEl.value) || 1 : 1;
  if (weeks > 1) await addSeries(payload, weeks);
  else await addEntry(payload);

  customEl.value = '';
  if (noteEl) noteEl.value = '';
  if (repeatEl) repeatEl.value = '1';
}

/**
 * Preenche os selects cujas opções dependem do idioma (meses e turnos),
 * preservando o que estava escolhido. Chamado no boot e a cada troca de idioma.
 */
export function fillLocalizedSelects() {
  const months = monthNames();
  const mes = $('f-mes');
  if (mes) {
    const keep = mes.value || 'todos';
    setHTML(mes, `<option value="todos">${esc(t('filters.all'))}</option>` +
      months.map((name, i) => `<option value="${i}">${esc(name)}</option>`).join(''));
    mes.value = keep;
  }

  document.querySelectorAll('.turno-select').forEach((sel) => {
    const keep = sel.value;
    const withAll = sel.dataset.all === '1';
    setHTML(sel,
      (withAll ? `<option value="todos">${esc(t('filters.all'))}</option>` : '') +
      `<option value="Completo">${esc(t('turno.Completo'))}</option>` +
      `<option value="Meio">${esc(t('turno.Meio'))}</option>`);
    sel.value = keep || (withAll ? 'todos' : 'Completo');
  });

  const repeat = $('in-repeat');
  if (repeat) {
    [...repeat.options].forEach((opt) => {
      const n = Number(opt.value);
      if (n > 1) opt.textContent = t('entries.repeatWeeks', { n });
    });
  }
}

export function wireEntries() {
  fillLocalizedSelects();
  const dateInput = $('in-data');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  on($('btn-add'), 'click', submitNewEntry);
  ['in-data', 'in-custom', 'in-note'].forEach((id) => {
    on($(id), 'keydown', (ev) => {
      if (ev.key === 'Enter') submitNewEntry();
    });
  });

  const searchEl = $('search-input');
  on(searchEl, 'input', debounce((ev) => {
    searchText = ev.target.value.trim();
    visibleCount = PAGE_SIZE;
    renderEntries();
  }, 180));

  on($('f-mes'), 'change', (ev) => { filters.mes = ev.target.value; visibleCount = PAGE_SIZE; renderEntries(); });
  // Debounce: digitar "2026" filtrava (e esvaziava a lista) a cada dígito.
  on($('f-ano'), 'input', debounce((ev) => {
    filters.ano = ev.target.value.trim();
    visibleCount = PAGE_SIZE;
    renderEntries();
  }, 350));
  on($('f-inicio'), 'change', (ev) => { filters.inicio = ev.target.value; renderEntries(); });
  on($('f-fim'), 'change', (ev) => { filters.fim = ev.target.value; renderEntries(); });
  on($('f-turno'), 'change', (ev) => { filters.turno = ev.target.value; renderEntries(); });
  on($('f-personalizados'), 'change', (ev) => { filters.somentePersonalizados = ev.target.checked; renderEntries(); });

  on($('btn-clear-filters'), 'click', () => {
    filters.mes = 'todos';
    filters.ano = '';
    filters.inicio = '';
    filters.fim = '';
    filters.turno = 'todos';
    filters.somentePersonalizados = false;
    searchText = '';
    visibleCount = PAGE_SIZE;
    ['search-input', 'f-ano', 'f-inicio', 'f-fim'].forEach((id) => { if ($(id)) $(id).value = ''; });
    if ($('f-mes')) $('f-mes').value = 'todos';
    if ($('f-turno')) $('f-turno').value = 'todos';
    if ($('f-personalizados')) $('f-personalizados').checked = false;
    renderEntries();
  });

  // Um listener no container em vez de dois por linha renderizada.
  const list = $('entries-list');
  delegate(list, 'click', '.btn-edit-row', (ev, btn) => {
    editingId = btn.closest('.entry-row').dataset.id;
    renderEntries();
    const input = list.querySelector('.entry-row.editing .edit-data');
    if (input) input.focus();
  });
  delegate(list, 'click', '.btn-cancel-row', () => {
    editingId = null;
    renderEntries();
  });
  delegate(list, 'click', '.btn-save-row', async (ev, btn) => {
    const row = btn.closest('.entry-row');
    const id = row.dataset.id;
    const date = row.querySelector('.edit-data').value;
    if (!date) {
      await alertDialog(t('entries.needDate'));
      return;
    }
    const custom = readCustom(row.querySelector('.edit-custom').value);
    if (custom === undefined) {
      await alertDialog(t('entries.badCustom'));
      return;
    }
    const patch = {
      date,
      turno: row.querySelector('.edit-turno').value,
      custom,
      note: row.querySelector('.edit-note').value.trim()
    };
    editingId = null;
    await updateEntry(id, patch);
  });
  delegate(list, 'click', '.btn-del-row', (ev, btn) => {
    deleteEntry(btn.closest('.entry-row').dataset.id);
  });
  delegate(list, 'click', '#btn-load-more', () => {
    visibleCount += PAGE_SIZE;
    renderEntries();
  });
}

export function focusSearch() {
  const el = $('search-input');
  if (el) {
    el.focus();
    el.select();
  }
}

export function resetEditing() {
  editingId = null;
}
