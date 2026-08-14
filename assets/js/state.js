/* Estado da aplicação + seletores memoizados + cache local.
 *
 * Toda escrita passa por `bump()`, que invalida a memoização. Antes, cada save
 * disparava uma re-renderização completa que varria a lista de lançamentos umas
 * oito vezes (uma por função de estatística); agora cada agregado é calculado
 * no máximo uma vez por revisão do estado.
 */

import { DEFAULT_PARAMS, LS } from './constants.js';
import { configureFormat } from './format.js';
import {
  computeTotals, computeYear, computeCurrentPeriod, computeLast12Months,
  computeAnnual, computeExtraStats, computeInsights, activeEntries
} from './calc.js';
import { normalizeParams, readEntriesDoc, purgeTombstones } from './merge.js';

export const state = {
  entries: [],
  params: { ...DEFAULT_PARAMS },
  paramsUpdatedAt: 0,
  session: null,
  hideValues: false,
  /** Ano do Resumo/heatmap. Substitui o antigo params.ano, que era fixo e
   *  divergia do ano real usado pelos cards de período e pelas metas. */
  anoSelecionado: new Date().getFullYear(),
  rev: 0,
  loadFailed: false,
  pendingSync: false
};

export function bump() {
  state.rev++;
  memo.clear();
}

const memo = new Map();
function select(key, build) {
  const k = key + '@' + state.rev;
  if (!memo.has(k)) {
    memo.clear();
    memo.set(k, build());
  }
  return memo.get(k);
}

export const sel = {
  live: () => select('live', () => activeEntries(state.entries)),
  totals: () => select('totals', () => computeTotals(state.entries, state.params)),
  year: (y) => select('year:' + y, () => computeYear(state.entries, state.params, y)),
  period: () => select('period', () => computeCurrentPeriod(state.entries, state.params)),
  last12: () => select('last12', () => computeLast12Months(state.entries, state.params)),
  annual: () => select('annual', () => computeAnnual(state.entries, state.params)),
  extra: () => select('extra', () => computeExtraStats(state.entries, state.params)),
  insights: () => select('insights', () => computeInsights(state.entries, state.params))
};

export function setEntries(entries) {
  state.entries = entries;
  bump();
}

export function setParams(params, updatedAt) {
  state.params = normalizeParams(params);
  if (updatedAt) state.paramsUpdatedAt = updatedAt;
  syncFormatConfig();
  bump();
}

export function setHideValues(hidden) {
  state.hideValues = hidden;
  try { localStorage.setItem(LS.hide, hidden ? '1' : '0'); } catch (_) {}
  syncFormatConfig();
  bump();
}

export function syncFormatConfig() {
  configureFormat({
    locale: state.params.idioma,
    currency: state.params.moeda,
    hidden: state.hideValues
  });
}

/* -------------------------------------------------------------------------- */
/* Cache local — é o que faz a promessa de offline ser verdade                 */
/* -------------------------------------------------------------------------- */

export function saveLocalCache() {
  try {
    localStorage.setItem(
      LS.cacheEntries,
      JSON.stringify({ entries: state.entries, savedAt: Date.now() })
    );
    localStorage.setItem(
      LS.cacheParams,
      JSON.stringify({ params: state.params, updatedAt: state.paramsUpdatedAt })
    );
    localStorage.setItem(LS.dirty, state.pendingSync ? '1' : '0');
  } catch (_) {
    /* cota cheia ou modo privado: seguimos sem cache */
  }
}

export function loadLocalCache() {
  try {
    const rawE = localStorage.getItem(LS.cacheEntries) || localStorage.getItem(LS.cacheLegacyEntries);
    if (!rawE) return null;
    const parsedE = JSON.parse(rawE);
    const entries = purgeTombstones(readEntriesDoc(parsedE, 0));

    const rawP = localStorage.getItem(LS.cacheParams) || localStorage.getItem(LS.cacheLegacyParams);
    let params = {};
    let updatedAt = 0;
    if (rawP) {
      const parsedP = JSON.parse(rawP);
      params = parsedP && parsedP.params ? parsedP.params : parsedP;
      updatedAt = Number(parsedP && parsedP.updatedAt) || 0;
    }
    return { entries, params: normalizeParams(params), paramsUpdatedAt: updatedAt };
  } catch (_) {
    return null;
  }
}

export function hasPendingLocalWork() {
  try { return localStorage.getItem(LS.dirty) === '1'; } catch (_) { return false; }
}

export function estimateLocalBytes() {
  try {
    return (localStorage.getItem(LS.cacheEntries) || '').length +
           (localStorage.getItem(LS.cacheParams) || '').length;
  } catch (_) { return 0; }
}
