/* Camada de nuvem: cliente Supabase, autenticação e a gravação com merge.
 *
 * A regra de ouro daqui: NUNCA gravar por cima do que não foi lido. Toda
 * escrita lê o documento remoto, mescla por `updatedAt` e só então grava.
 * Se a leitura falhar, a gravação não acontece — o histórico da nuvem fica
 * intocado e a alteração espera na fila local.
 */

import { LS } from './constants.js';
import {
  state, setEntries, setParams, saveLocalCache, loadLocalCache, bump
} from './state.js';
import {
  readEntriesDoc, writeEntriesDoc, readParamsDoc, writeParamsDoc,
  mergeEntries, mergeParams, purgeTombstones
} from './merge.js';

const TABLE = 'freelancer_data';

let sb = null;

/** Ganchos preenchidos pela UI — mantém db.js sem saber o que é um toast. */
export const events = {
  onSyncStart: () => {},
  onSyncEnd: () => {},
  onStatusChange: () => {},
  onPulled: () => {},
  onError: () => {}
};

export function getClient() {
  return sb;
}

export function isConfigured() {
  try {
    return Boolean(localStorage.getItem(LS.url) && localStorage.getItem(LS.key));
  } catch (_) {
    return false;
  }
}

export function libAvailable() {
  return typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function';
}

/** Erros de digitação e a confusão perigosa entre anon key e service_role. */
export function validateConfig(url, key) {
  if (!url || !key) return 'gate.connect.empty';
  if (!/^https:\/\/[\w.-]+\.\w+/.test(url)) return 'gate.connect.badUrl';
  if (!key.startsWith('eyJ') && !key.startsWith('sb_publishable_')) return 'gate.connect.badKey';
  try {
    const payload = JSON.parse(atob(key.split('.')[1] || ''));
    if (payload && payload.role === 'service_role') return 'gate.connect.serviceKey';
  } catch (_) {
    /* chave nova (sb_publishable_) não é JWT — sem payload para inspecionar */
  }
  return null;
}

export function initClient(url, key) {
  if (!libAvailable()) throw new Error('SUPABASE_LIB_MISSING');
  sb = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return sb;
}

export function initFromStorage() {
  const url = localStorage.getItem(LS.url);
  const key = localStorage.getItem(LS.key);
  if (!url || !key) return null;
  return initClient(url, key);
}

export function storeConfig(url, key) {
  localStorage.setItem(LS.url, url);
  localStorage.setItem(LS.key, key);
}

export function clearConfig() {
  localStorage.removeItem(LS.url);
  localStorage.removeItem(LS.key);
}

/* -------------------------------------------------------------------------- */
/* Autenticação                                                                */
/* -------------------------------------------------------------------------- */

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return (data && data.session) || null;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data.session || null;
}

export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split('?')[0]
  });
  if (error) throw error;
}

export async function signOut() {
  try {
    await sb.auth.signOut();
  } catch (_) {
    /* sem rede: a sessão local é limpa do mesmo jeito */
  }
}

export function onAuthStateChange(cb) {
  if (!sb) return;
  sb.auth.onAuthStateChange((event, sessionObj) => cb(event, sessionObj));
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

/** Há algo local que a nuvem ainda não tem (ou tem em versão mais velha)? */
function differs(merged, remote) {
  if (merged.length !== remote.length) return true;
  const byId = new Map(remote.map((e) => [e.id, e]));
  return merged.some((e) => {
    const r = byId.get(e.id);
    return !r || (r.updatedAt || 0) !== (e.updatedAt || 0);
  });
}

async function readRows() {
  const { data, error } = await sb.from(TABLE).select('key,value,updated_at');
  if (error) throw error;
  return data || [];
}

/**
 * Carga inicial. Se a nuvem responder, o resultado é a MESCLA do que veio de lá
 * com o que ficou pendente neste aparelho — nunca uma substituição cega.
 */
export async function loadAll() {
  const cache = loadLocalCache();

  let rows;
  try {
    rows = await readRows();
  } catch (err) {
    // Leitura falhou: seguir com o cache é aceitável, gravar por cima não é.
    if (cache) {
      state.entries = cache.entries;
      setParams(cache.params, cache.paramsUpdatedAt);
      setEntries(cache.entries);
      state.loadFailed = true;
      events.onStatusChange();
      return { source: 'cache', pulled: 0 };
    }
    state.loadFailed = true;
    throw err;
  }

  const entriesRow = rows.find((r) => r.key === 'entries');
  const paramsRow = rows.find((r) => r.key === 'params');

  const remoteEntries = entriesRow ? readEntriesDoc(entriesRow.value, 0) : [];
  const remoteParamsDoc = paramsRow
    ? readParamsDoc(paramsRow.value)
    : { params: null, updatedAt: 0 };

  const localEntries = cache ? cache.entries : [];
  const { entries, pulled } = mergeEntries(localEntries, remoteEntries);
  setEntries(purgeTombstones(entries));

  const localParamsDoc = cache
    ? { params: cache.params, updatedAt: cache.paramsUpdatedAt }
    : null;
  const winner = mergeParams(localParamsDoc, remoteParamsDoc.params ? remoteParamsDoc : null);
  setParams(winner.params || {}, winner.updatedAt);

  state.loadFailed = false;

  // Só publica quando o resultado do merge é diferente do que está na nuvem —
  // conta nova, ou trabalho local que ficou na fila. Abrir o app não deve
  // gerar escrita à toa.
  if (!entriesRow || differs(state.entries, remoteEntries)) {
    try { await pushEntries(); } catch (_) { markPending(); }
  }
  if (!paramsRow || (localParamsDoc && localParamsDoc.updatedAt > remoteParamsDoc.updatedAt)) {
    try { await pushParams(); } catch (_) { markPending(); }
  }

  saveLocalCache();
  events.onStatusChange();
  return { source: 'cloud', pulled };
}

/** Puxa mudanças feitas em outro aparelho sem gravar nada. */
export async function pullRemote() {
  if (!sb || !state.session || !navigator.onLine) return 0;
  const rows = await readRows();
  const entriesRow = rows.find((r) => r.key === 'entries');
  const paramsRow = rows.find((r) => r.key === 'params');
  let pulled = 0;

  if (entriesRow) {
    const remote = readEntriesDoc(entriesRow.value, 0);
    const merged = mergeEntries(state.entries, remote);
    if (merged.pulled > 0) {
      setEntries(purgeTombstones(merged.entries));
      pulled = merged.pulled;
    }
  }
  if (paramsRow) {
    const remoteDoc = readParamsDoc(paramsRow.value);
    const winner = mergeParams(
      { params: state.params, updatedAt: state.paramsUpdatedAt },
      remoteDoc
    );
    if (winner.updatedAt > state.paramsUpdatedAt) setParams(winner.params, winner.updatedAt);
  }
  if (pulled) {
    saveLocalCache();
    events.onPulled(pulled);
  }
  return pulled;
}

/* -------------------------------------------------------------------------- */
/* Escrita — sempre ler, mesclar, então gravar                                 */
/* -------------------------------------------------------------------------- */

async function upsert(key, value) {
  const payload = { key, value, updated_at: new Date().toISOString() };
  if (state.session && state.session.user) payload.user_id = state.session.user.id;
  const { error } = await sb.from(TABLE).upsert(payload, { onConflict: 'user_id,key' });
  if (error) throw error;
}

async function pushEntries() {
  const { data, error } = await sb.from(TABLE).select('value').eq('key', 'entries').maybeSingle();
  if (error) throw error;

  const remote = readEntriesDoc(data && data.value, 0);
  const { entries, pulled } = mergeEntries(state.entries, remote);
  const cleaned = purgeTombstones(entries);
  setEntries(cleaned);
  await upsert('entries', writeEntriesDoc(cleaned));
  if (pulled > 0) events.onPulled(pulled);
  return pulled;
}

async function pushParams() {
  const { data, error } = await sb.from(TABLE).select('value').eq('key', 'params').maybeSingle();
  if (error) throw error;

  const remoteDoc = readParamsDoc(data && data.value);
  const localDoc = { params: state.params, updatedAt: state.paramsUpdatedAt || Date.now() };
  const winner = mergeParams(localDoc, remoteDoc);
  if (winner !== localDoc) setParams(winner.params, winner.updatedAt);
  await upsert('params', writeParamsDoc(state.params, state.paramsUpdatedAt || Date.now()));
}

/* Fila serial: dois saves simultâneos não podem ler o mesmo remoto e um
   sobrescrever o merge do outro. */
let chain = Promise.resolve();
function enqueue(fn) {
  chain = chain.then(fn, fn);
  return chain;
}

let retryTimer = null;
let retryDelay = 5000;

function markPending() {
  state.pendingSync = true;
  saveLocalCache();
  events.onStatusChange();
  scheduleRetry();
}

function markSynced() {
  if (state.pendingSync) {
    state.pendingSync = false;
    saveLocalCache();
    events.onStatusChange();
  }
  retryDelay = 5000;
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (!state.pendingSync) return;
    if (!navigator.onLine) {
      scheduleRetry();
      return;
    }
    try {
      await enqueue(async () => {
        await pushEntries();
        await pushParams();
      });
      markSynced();
      events.onSyncEnd(true);
    } catch (_) {
      retryDelay = Math.min(retryDelay * 2, 5 * 60 * 1000);
      scheduleRetry();
    }
  }, retryDelay);
}

/** Salva os lançamentos: cache local primeiro (offline nunca perde), nuvem depois. */
export async function saveEntries() {
  saveLocalCache();
  events.onSyncStart();
  try {
    await enqueue(pushEntries);
    markSynced();
    saveLocalCache();
  } catch (err) {
    markPending();
    events.onError(err);
  } finally {
    events.onSyncEnd();
  }
}

export async function saveParams() {
  state.paramsUpdatedAt = Date.now();
  saveLocalCache();
  events.onSyncStart();
  try {
    await enqueue(pushParams);
    markSynced();
    saveLocalCache();
  } catch (err) {
    markPending();
    events.onError(err);
  } finally {
    events.onSyncEnd();
  }
}

export function retryNow() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelay = 1000;
  scheduleRetry();
}

/* -------------------------------------------------------------------------- */
/* Diagnóstico de erro                                                         */
/* -------------------------------------------------------------------------- */

export function errorKey(err) {
  const msg = (err && (err.message || err.error_description || String(err))) || '';
  const code = (err && (err.code || err.status)) || '';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'err.network';
  if (/network|fetch|failed to fetch/i.test(msg)) return 'err.network';
  if (/JWT|token|expired|refresh/i.test(msg)) return 'err.session';
  if (code === '42501' || /row-level security|permission denied|relation .* does not exist/i.test(msg)) {
    return 'err.rls';
  }
  if (code === '42P01' || /does not exist/i.test(msg)) return 'err.rls';
  return 'err.server';
}
