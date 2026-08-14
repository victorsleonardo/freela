/* Ponto único de re-renderização. Os módulos de ação chamam `refreshAll()` sem
   precisar conhecer cada tela. */

import { $, setHTML } from './dom.js';
import { state } from '../state.js';
import { renderResumo } from './resumo.js';
import { renderEntries } from './entries.js';
import { renderCalendar, renderModalEntries, isDayModalOpen } from './calendar.js';
import { renderObjetivos } from './goals.js';
import { renderParametros } from './params.js';

const ICON_EYE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61C3.35 8.36 1 12 1 12s4 8 11 8a9.26 9.26 0 0 0 5.39-1.61M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

export function updatePrivacyIcon() {
  const btn = $('btn-toggle-privacy');
  if (btn) {
    setHTML(btn, state.hideValues ? ICON_EYE_OFF : ICON_EYE);
    btn.setAttribute('aria-pressed', state.hideValues ? 'true' : 'false');
  }
}

export function refreshAll() {
  renderResumo();
  renderEntries();
  renderCalendar();
  renderObjetivos();
  renderParametros();
  if (isDayModalOpen()) renderModalEntries();
}

export function showSkeletons() {
  setHTML($('stat-grid'), Array.from({ length: 5 }).map(() =>
    '<div class="glass stat-card"><div class="skeleton" style="height:11px; width:60%; margin-bottom:10px;"></div><div class="skeleton" style="height:20px; width:80%;"></div></div>'
  ).join(''));
  setHTML($('period-grid'), Array.from({ length: 4 }).map(() =>
    '<div class="glass period-card"><div class="skeleton" style="height:11px; width:50%; margin-bottom:10px;"></div><div class="skeleton" style="height:22px; width:70%;"></div></div>'
  ).join(''));
  setHTML($('entries-list'), Array.from({ length: 6 }).map(() =>
    '<div class="entry-row"><div class="skeleton" style="height:14px; width:100%;"></div></div>'
  ).join(''));
}
