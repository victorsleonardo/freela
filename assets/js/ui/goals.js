/* Aba Objetivos: metas e progresso. */

import { $, esc, setHTML, on } from './dom.js';
import { t } from '../i18n.js';
import { state, sel } from '../state.js';
import { money, currencySymbol } from '../format.js';
import { persistParams } from '../actions.js';
import { flashSaved } from './params.js';
import { refreshAll } from './render.js';

function progressCard(label, atual, meta, valueText) {
  const pct = meta > 0 ? Math.min(atual / meta, 1) : 0;
  return `<div class="glass period-card">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(valueText)}</div>
    <div class="sub">${esc(meta > 0 ? t('goals.pct', { pct: Math.round(pct * 100) }) : t('goals.setGoal'))}</div>
    <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}">
      <div class="progress-fill ${pct >= 1 ? 'over' : ''}" style="width:${pct * 100}%;"></div>
    </div>
  </div>`;
}

export function renderObjetivos() {
  if (!$('obj-mensal')) return;
  $('obj-mensal').value = state.params.meta;
  $('obj-anual').value = state.params.metaAnual;
  $('obj-turnos').value = state.params.metaTurnos;
  $('obj-dias').value = state.params.metaDias;
  document.querySelectorAll('.currency-suffix').forEach((el) => {
    el.textContent = '(' + currencySymbol() + ')';
  });

  const p = sel.period();
  const a = sel.annual();

  setHTML($('objetivos-grid'),
    progressCard(t('goals.cardMonthly'), p.ganhoMes, state.params.meta,
      `${money(p.ganhoMes)} / ${money(state.params.meta)}`) +
    progressCard(t('goals.cardAnnual', { year: a.year }), a.ganhoAno, state.params.metaAnual,
      `${money(a.ganhoAno)} / ${money(state.params.metaAnual)}`) +
    progressCard(t('goals.cardShifts'), p.turnosMes, state.params.metaTurnos,
      t('goals.shiftsOf', { a: p.turnosMes, b: state.params.metaTurnos })) +
    progressCard(t('goals.cardDays'), p.diasTrabalhadosMes, state.params.metaDias,
      t('goals.daysOf', { a: p.diasTrabalhadosMes, b: state.params.metaDias }))
  );
}

export function wireGoals() {
  on($('btn-save-objetivos'), 'click', async () => {
    await persistParams({
      ...state.params,
      meta: Math.max(0, Number($('obj-mensal').value) || 0),
      metaAnual: Math.max(0, Number($('obj-anual').value) || 0),
      metaTurnos: Math.max(0, Number($('obj-turnos').value) || 0),
      metaDias: Math.max(0, Number($('obj-dias').value) || 0)
    });
    refreshAll();
    flashSaved('obj-save-msg');
  });
}
