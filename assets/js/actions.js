/* Mutações de dados. Toda alteração carimba `updatedAt` — é isso que permite
   ao merge decidir quem ganha quando dois aparelhos mexem no mesmo lançamento. */

import { state, setEntries, setParams, saveLocalCache, bump } from './state.js';
import { newEntryId, normalizeEntry } from './merge.js';
import { saveEntries, saveParams } from './db.js';
import { addDays } from './format.js';
import { UNDO_WINDOW_MS } from './constants.js';
import { showToast } from './ui/toast.js';
import { t } from './i18n.js';
import { refreshAll } from './ui/render.js';

function makeEntry(data) {
  return normalizeEntry(
    {
      id: newEntryId(),
      date: data.date,
      turno: data.turno,
      custom: data.custom,
      note: data.note,
      updatedAt: Date.now(),
      deleted: false
    },
    Date.now()
  );
}

export async function addEntry(data) {
  const entry = makeEntry(data);
  if (!entry) return null;
  state.entries = [...state.entries, entry];
  bump();
  refreshAll();
  showToast(t('toast.added'));
  await saveEntries();
  return entry;
}

/** Lançar o mesmo turno nas próximas N semanas, no mesmo dia da semana. */
export async function addSeries(data, weeks) {
  const created = [];
  for (let i = 0; i < weeks; i++) {
    const entry = makeEntry({ ...data, date: addDays(data.date, i * 7) });
    if (entry) created.push(entry);
  }
  if (!created.length) return [];
  state.entries = [...state.entries, ...created];
  bump();
  refreshAll();
  showToast(created.length === 1 ? t('toast.added') : t('toast.addedMany', { n: created.length }));
  await saveEntries();
  return created;
}

export async function updateEntry(id, patch) {
  const idx = state.entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const merged = normalizeEntry(
    { ...state.entries[idx], ...patch, id, updatedAt: Date.now() },
    Date.now()
  );
  if (!merged) return;
  const next = [...state.entries];
  next[idx] = merged;
  setEntries(next);
  refreshAll();
  showToast(t('toast.updated'));
  await saveEntries();
}

/**
 * Exclusão vira tombstone e é gravada na hora. O modelo antigo segurava a
 * gravação por 5s para permitir o "Desfazer": fechar a aba nesse intervalo
 * ressuscitava o lançamento na próxima abertura.
 */
export async function deleteEntry(id, onUndo) {
  const idx = state.entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const next = [...state.entries];
  next[idx] = { ...next[idx], deleted: true, updatedAt: Date.now() };
  setEntries(next);
  refreshAll();

  showToast(t('toast.deleted'), {
    duration: UNDO_WINDOW_MS,
    actionLabel: t('toast.undo'),
    onAction: async () => {
      const i = state.entries.findIndex((e) => e.id === id);
      if (i === -1) return;
      const restored = [...state.entries];
      restored[i] = { ...restored[i], deleted: false, updatedAt: Date.now() };
      setEntries(restored);
      refreshAll();
      if (onUndo) onUndo();
      showToast(t('toast.undone'));
      await saveEntries();
    }
  });

  await saveEntries();
}

export async function wipeAllEntries() {
  const now = Date.now();
  setEntries(state.entries.map((e) => ({ ...e, deleted: true, updatedAt: now })));
  refreshAll();
  await saveEntries();
  showToast(t('config.wipeDone'));
}

export async function replaceAll(entries, params) {
  const now = Date.now();
  // Import de backup: os ids antigos são preservados quando válidos, mas tudo
  // recebe carimbo novo para vencer o que estiver na nuvem.
  const normalized = entries
    .map((e) => normalizeEntry({ ...e, updatedAt: now }, now))
    .filter(Boolean);

  // Os lançamentos que existiam e não vieram no backup viram tombstone, senão
  // o merge com a nuvem os traria de volta na próxima sincronização.
  const keep = new Set(normalized.map((e) => e.id));
  const tombstones = state.entries
    .filter((e) => !keep.has(e.id) && !e.deleted)
    .map((e) => ({ ...e, deleted: true, updatedAt: now }));

  setEntries([...normalized, ...tombstones]);
  if (params) setParams(params, now);
  saveLocalCache();
  refreshAll();
  await saveEntries();
  await saveParams();
  return normalized.length;
}

export async function persistParams(nextParams) {
  setParams(nextParams, Date.now());
  await saveParams();
}
