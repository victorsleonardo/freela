/* Atalhos de teclado — o app é bem mais rápido de operar no computador assim. */

import { $, esc, on } from './dom.js';
import { t } from '../i18n.js';
import { switchTab, TABS } from './tabs.js';
import { openDayModal, closeDayModal, isDayModalOpen, goToToday } from './calendar.js';
import { focusSearch } from './entries.js';
import { todayISO } from '../format.js';

const MAP = [
  ['N', 'sc.new'],
  ['/', 'sc.search'],
  ['1 – 6', 'sc.tabs'],
  ['H', 'sc.privacy'],
  ['T', 'sc.today'],
  ['Esc', 'sc.close'],
  ['?', 'sc.help']
];

function isTyping(target) {
  const tag = target && target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable);
}

export function toggleShortcutHelp(force) {
  const el = $('shortcut-help');
  if (!el) return;
  const open = force === undefined ? !el.classList.contains('open') : force;
  el.classList.toggle('open', open);
  if (open && !el.dataset.filled) {
    el.querySelector('.sc-list').innerHTML = MAP.map(([keys, key]) =>
      `<div class="sc-row"><kbd>${esc(keys)}</kbd><span>${esc(t(key))}</span></div>`).join('');
    el.dataset.filled = '1';
  }
}

export function wireShortcuts(handlers) {
  on($('sc-close'), 'click', () => toggleShortcutHelp(false));
  on($('shortcut-help'), 'click', (ev) => {
    if (ev.target.id === 'shortcut-help') toggleShortcutHelp(false);
  });
  on($('btn-shortcuts'), 'click', () => toggleShortcutHelp(true));

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (isDayModalOpen()) closeDayModal();
      toggleShortcutHelp(false);
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (isTyping(ev.target)) return;
    if ($('app-shell') && $('app-shell').style.display === 'none') return;

    const k = ev.key.toLowerCase();
    if (k === 'n') {
      ev.preventDefault();
      openDayModal(todayISO());
    } else if (ev.key === '/') {
      ev.preventDefault();
      switchTab('lancamentos');
      focusSearch();
    } else if (k === 'h') {
      ev.preventDefault();
      handlers.togglePrivacy();
    } else if (k === 't') {
      ev.preventDefault();
      switchTab('calendario');
      goToToday();
    } else if (ev.key === '?') {
      ev.preventDefault();
      toggleShortcutHelp();
    } else if (/^[1-6]$/.test(ev.key)) {
      ev.preventDefault();
      switchTab(TABS[Number(ev.key) - 1]);
    }
  });
}
