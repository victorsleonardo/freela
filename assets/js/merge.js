/* Núcleo da sincronização, em funções puras.
 *
 * O modelo antigo era "manda o array inteiro e reza": dois aparelhos editando
 * o mesmo dia faziam o último a salvar apagar o trabalho do outro. Agora cada
 * lançamento carrega `updatedAt`, exclusão vira tombstone (`deleted: true`) e
 * a gravação é ler-mesclar-escrever: ninguém perde o que o outro lançou.
 */

import { DATA_VERSION, TURNOS, LEGACY_CURRENCY_MAP, CURRENCIES, DEFAULT_PARAMS, TOMBSTONE_TTL_DAYS, LOCALES } from './constants.js';
import { isValidISO } from './format.js';

const MAX_NOTE = 280;

export function newEntryId() {
  // Contador sequencial ("e42") colidia entre aparelhos offline e fazia editar
  // ou excluir o lançamento errado depois do merge.
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return 'e' + c.randomUUID();
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * Põe um lançamento de qualquer origem (nuvem, cache, backup) na forma
 * canônica. Retorna null se o registro for irrecuperável.
 */
export function normalizeEntry(raw, fallbackTs) {
  if (!raw || typeof raw !== 'object') return null;
  if (!isValidISO(raw.date)) return null;

  const custom =
    raw.custom === null || raw.custom === undefined || raw.custom === '' || isNaN(Number(raw.custom))
      ? null
      : Math.max(0, Number(raw.custom));

  const id =
    typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().replace(/[^\w-]/g, '').slice(0, 64) : '';

  return {
    id: id || newEntryId(),
    date: raw.date,
    turno: TURNOS.includes(raw.turno) ? raw.turno : 'Completo',
    custom,
    note: typeof raw.note === 'string' ? raw.note.slice(0, MAX_NOTE) : '',
    updatedAt: Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : (fallbackTs || 0),
    deleted: raw.deleted === true
  };
}

export function normalizeEntries(list, fallbackTs) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  list.forEach((raw) => {
    const e = normalizeEntry(raw, fallbackTs);
    if (!e) return;
    // Dois registros com o mesmo id (backup remendado à mão): fica o mais novo.
    if (seen.has(e.id)) {
      const idx = out.findIndex((x) => x.id === e.id);
      if (idx >= 0 && e.updatedAt > out[idx].updatedAt) out[idx] = e;
      return;
    }
    seen.add(e.id);
    out.push(e);
  });
  return out;
}

/** Aceita tanto o documento v2 quanto o array cru da v1. */
export function readEntriesDoc(value, fallbackTs) {
  if (Array.isArray(value)) return normalizeEntries(value, fallbackTs);
  if (value && typeof value === 'object' && Array.isArray(value.entries)) {
    return normalizeEntries(value.entries, fallbackTs);
  }
  return [];
}

export function writeEntriesDoc(entries) {
  return { v: DATA_VERSION, entries, savedAt: Date.now() };
}

export function readParamsDoc(value) {
  const raw = value && typeof value === 'object' && value.params && typeof value.params === 'object'
    ? value.params
    : (value && typeof value === 'object' ? value : {});
  return {
    params: normalizeParams(raw),
    updatedAt: Number(value && value.updatedAt) || 0
  };
}

export function writeParamsDoc(params, updatedAt) {
  return { v: DATA_VERSION, params, updatedAt: updatedAt || Date.now() };
}

export function normalizeParams(raw) {
  const p = { ...DEFAULT_PARAMS, ...(raw && typeof raw === 'object' ? raw : {}) };

  // Antes gravava o símbolo ("R$"); agora é código ISO, que o Intl entende.
  if (!CURRENCIES[p.moeda]) p.moeda = LEGACY_CURRENCY_MAP[p.moeda] || 'BRL';
  if (!LOCALES.includes(p.idioma)) p.idioma = 'pt-BR';
  if (!['escuro', 'claro', 'sistema'].includes(p.tema)) p.tema = 'escuro';

  ['meio', 'completoSemana', 'completoFDS', 'meta', 'metaAnual', 'metaTurnos', 'metaDias'].forEach((k) => {
    const n = Number(p[k]);
    p[k] = isNaN(n) || n < 0 ? DEFAULT_PARAMS[k] : n;
  });

  p.exportAuto = p.exportAuto === true;

  const dias = Array.isArray(p.diasFDS)
    ? [...new Set(p.diasFDS.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : DEFAULT_PARAMS.diasFDS;
  p.diasFDS = dias.sort((a, b) => a - b);

  // `ano` era um "ano de referência" fixo que brigava com o ano real em metade
  // das telas. O seletor de ano do Resumo tomou o lugar dele.
  delete p.ano;

  return p;
}

/**
 * Une duas listas por id, ganhando sempre a versão com `updatedAt` maior.
 * Empate fica com o local (evita ficar trocando de valor a cada sincronização).
 */
export function mergeEntries(local, remote) {
  const localById = new Map((local || []).map((e) => [e.id, e]));
  const byId = new Map(localById);
  let pulled = 0;

  (remote || []).forEach((r) => {
    const l = localById.get(r.id);
    if (!l || (l.updatedAt || 0) < (r.updatedAt || 0)) {
      byId.set(r.id, r);
      // Só conta como "veio de fora" o que o usuário ainda não tinha aqui.
      if (!l || !r.deleted) pulled++;
    }
  });

  const merged = [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { entries: merged, pulled };
}

/** Params são um objeto pequeno: vence o documento com carimbo mais novo. */
export function mergeParams(localDoc, remoteDoc) {
  const l = localDoc || { params: normalizeParams({}), updatedAt: 0 };
  const r = remoteDoc || { params: normalizeParams({}), updatedAt: 0 };
  return (r.updatedAt || 0) > (l.updatedAt || 0) ? r : l;
}

/** Tombstone velho já cumpriu seu papel: some para o documento não inchar. */
export function purgeTombstones(entries, now) {
  const limit = (now || Date.now()) - TOMBSTONE_TTL_DAYS * 86400000;
  return (entries || []).filter((e) => !(e.deleted && (e.updatedAt || 0) < limit));
}

export function touch(entry) {
  return { ...entry, updatedAt: Date.now() };
}
