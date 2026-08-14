/* Aba Parâmetros: quanto vale cada tipo de turno. */

import { $, esc, setHTML, on } from './dom.js';
import { t } from '../i18n.js';
import { state } from '../state.js';
import { weekdayNames, currencySymbol } from '../format.js';
import { persistParams } from '../actions.js';
import { alertDialog } from './dialog.js';
import { refreshAll } from './render.js';

function flashSaved(id) {
  const msg = $(id);
  if (!msg) return;
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 1800);
}

export function renderParametros() {
  if (!$('p-meio')) return;
  $('p-meio').value = state.params.meio;
  $('p-semana').value = state.params.completoSemana;
  $('p-fds').value = state.params.completoFDS;

  document.querySelectorAll('.currency-suffix').forEach((el) => {
    el.textContent = '(' + currencySymbol() + ')';
  });

  // Antes o bônus era fixo em sexta e sábado, escondido no código.
  const names = weekdayNames('short');
  setHTML($('p-fds-days'), names.map((name, idx) => {
    const dow = (idx + 1) % 7;
    const checked = state.params.diasFDS.includes(dow);
    return `<label class="day-toggle${checked ? ' on' : ''}">
      <input type="checkbox" class="p-fds-day" value="${dow}"${checked ? ' checked' : ''}>
      <span>${esc(name)}</span>
    </label>`;
  }).join(''));
}

export function wireParams() {
  on($('p-fds-days'), 'change', (ev) => {
    const label = ev.target.closest('.day-toggle');
    if (label) label.classList.toggle('on', ev.target.checked);
  });

  on($('btn-save-params'), 'click', async () => {
    const meio = Number($('p-meio').value);
    const semana = Number($('p-semana').value);
    const fds = Number($('p-fds').value);
    if ([meio, semana, fds].some((n) => isNaN(n) || n < 0)) {
      await alertDialog(t('params.negative'));
      return;
    }
    const diasFDS = [...document.querySelectorAll('.p-fds-day:checked')].map((el) => Number(el.value));
    await persistParams({
      ...state.params,
      meio,
      completoSemana: semana,
      completoFDS: fds,
      diasFDS
    });
    refreshAll();
    flashSaved('save-msg');
  });
}

export { flashSaved };
