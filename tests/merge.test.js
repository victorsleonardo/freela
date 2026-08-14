import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEntry, normalizeEntries, normalizeParams, readEntriesDoc,
  writeEntriesDoc, readParamsDoc, mergeEntries, mergeParams, purgeTombstones, newEntryId
} from '../assets/js/merge.js';
import { TOMBSTONE_TTL_DAYS } from '../assets/js/constants.js';

const e = (id, date, updatedAt, extra = {}) => ({
  id, date, turno: 'Completo', custom: null, note: '', updatedAt, deleted: false, ...extra
});

/* -------------------------------------------------------------------------- */
/* Saneamento — a nuvem também é entrada não confiável                        */
/* -------------------------------------------------------------------------- */

test('registro sem data válida é descartado', () => {
  assert.equal(normalizeEntry({ date: 'ontem' }), null);
  assert.equal(normalizeEntry(null), null);
  assert.equal(normalizeEntry({ date: '2025-02-31' }), null);
});

test('turno fora da lista branca cai no padrão', () => {
  assert.equal(normalizeEntry({ date: '2025-03-05', turno: '<script>' }).turno, 'Completo');
  assert.equal(normalizeEntry({ date: '2025-03-05', turno: 'Meio' }).turno, 'Meio');
});

test('id recebe limpeza e nunca fica vazio', () => {
  const dirty = normalizeEntry({ id: 'a"><img src=x>', date: '2025-03-05' });
  assert.ok(!/[<>"]/.test(dirty.id));
  const missing = normalizeEntry({ date: '2025-03-05' });
  assert.ok(missing.id.length > 1);
});

test('observação é limitada e valores negativos viram zero', () => {
  const long = normalizeEntry({ date: '2025-03-05', note: 'x'.repeat(1000) });
  assert.equal(long.note.length, 280);
  assert.equal(normalizeEntry({ date: '2025-03-05', custom: -50 }).custom, 0);
  assert.equal(normalizeEntry({ date: '2025-03-05', custom: '' }).custom, null);
});

test('ids repetidos no mesmo arquivo colapsam no mais novo', () => {
  const out = normalizeEntries([
    { id: 'dup', date: '2025-03-05', updatedAt: 10 },
    { id: 'dup', date: '2025-03-06', updatedAt: 20 }
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].date, '2025-03-06');
});

test('newEntryId não repete', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newEntryId()));
  assert.equal(ids.size, 500);
});

/* -------------------------------------------------------------------------- */
/* Compatibilidade com o formato antigo                                        */
/* -------------------------------------------------------------------------- */

test('lê tanto o array cru da v1 quanto o documento da v2', () => {
  const v1 = [{ id: 'e1', date: '2025-03-05', turno: 'Meio', custom: null }];
  assert.equal(readEntriesDoc(v1).length, 1);

  const v2 = writeEntriesDoc([e('e1', '2025-03-05', 5)]);
  assert.equal(readEntriesDoc(v2).length, 1);
  assert.equal(readEntriesDoc(v2)[0].id, 'e1');
});

test('moeda antiga (símbolo) vira código ISO', () => {
  assert.equal(normalizeParams({ moeda: 'R$' }).moeda, 'BRL');
  assert.equal(normalizeParams({ moeda: '€' }).moeda, 'EUR');
  assert.equal(normalizeParams({ moeda: 'BRL' }).moeda, 'BRL');
  assert.equal(normalizeParams({ moeda: 'inventada' }).moeda, 'BRL');
});

test('o antigo "ano de referência" some dos parâmetros', () => {
  assert.equal(normalizeParams({ ano: 2026 }).ano, undefined);
});

test('parâmetros inválidos voltam ao padrão', () => {
  const p = normalizeParams({ meio: -5, completoSemana: 'abc', idioma: 'klingon', tema: 'roxo' });
  assert.equal(p.meio, 125);
  assert.equal(p.completoSemana, 225);
  assert.equal(p.idioma, 'pt-BR');
  assert.equal(p.tema, 'escuro');
});

test('dias premium são normalizados e ordenados', () => {
  assert.deepEqual(normalizeParams({ diasFDS: [6, 5, 5, 99, -1] }).diasFDS, [5, 6]);
});

/* -------------------------------------------------------------------------- */
/* Merge — a regressão que fazia um aparelho apagar o outro                    */
/* -------------------------------------------------------------------------- */

test('lançamentos criados em aparelhos diferentes coexistem', () => {
  const local = [e('a', '2025-03-01', 100)];
  const remote = [e('b', '2025-03-02', 90)];
  const { entries } = mergeEntries(local, remote);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((x) => x.id).sort(), ['a', 'b']);
});

test('a edição mais recente vence, venha de onde vier', () => {
  const local = [e('a', '2025-03-01', 100, { note: 'local' })];
  const remoteNewer = [e('a', '2025-03-01', 200, { note: 'remoto' })];
  assert.equal(mergeEntries(local, remoteNewer).entries[0].note, 'remoto');

  const remoteOlder = [e('a', '2025-03-01', 50, { note: 'remoto' })];
  assert.equal(mergeEntries(local, remoteOlder).entries[0].note, 'local');
});

test('empate de carimbo fica com o local, para não ficar oscilando', () => {
  const local = [e('a', '2025-03-01', 100, { note: 'local' })];
  const remote = [e('a', '2025-03-01', 100, { note: 'remoto' })];
  assert.equal(mergeEntries(local, remote).entries[0].note, 'local');
});

test('exclusão feita em outro aparelho não ressuscita', () => {
  const local = [e('a', '2025-03-01', 100)];
  const remote = [e('a', '2025-03-01', 200, { deleted: true })];
  const merged = mergeEntries(local, remote).entries;
  assert.equal(merged[0].deleted, true);
});

test('lançamento novo vence tombstone antigo do mesmo id', () => {
  const local = [e('a', '2025-03-01', 300)];
  const remote = [e('a', '2025-03-01', 200, { deleted: true })];
  assert.equal(mergeEntries(local, remote).entries[0].deleted, false);
});

test('merge conta quantos vieram de fora', () => {
  const local = [e('a', '2025-03-01', 100)];
  const remote = [e('a', '2025-03-01', 100), e('b', '2025-03-02', 100), e('c', '2025-03-03', 100)];
  assert.equal(mergeEntries(local, remote).pulled, 2);
});

test('merge sobre lista vazia (primeira carga) traz tudo', () => {
  const remote = [e('a', '2025-03-01', 100), e('b', '2025-03-02', 100)];
  const { entries, pulled } = mergeEntries([], remote);
  assert.equal(entries.length, 2);
  assert.equal(pulled, 2);
});

test('resultado do merge sai ordenado por data', () => {
  const { entries } = mergeEntries(
    [e('c', '2025-03-09', 1), e('a', '2025-03-01', 1)],
    [e('b', '2025-03-05', 1)]
  );
  assert.deepEqual(entries.map((x) => x.date), ['2025-03-01', '2025-03-05', '2025-03-09']);
});

test('params ficam com o documento de carimbo mais novo', () => {
  const localDoc = { params: normalizeParams({ meta: 1000 }), updatedAt: 10 };
  const remoteDoc = { params: normalizeParams({ meta: 2000 }), updatedAt: 20 };
  assert.equal(mergeParams(localDoc, remoteDoc).params.meta, 2000);
  assert.equal(mergeParams(remoteDoc, localDoc).params.meta, 2000);
});

test('readParamsDoc aceita o formato antigo (objeto solto)', () => {
  const legacy = readParamsDoc({ meta: 3000, moeda: 'R$' });
  assert.equal(legacy.params.meta, 3000);
  assert.equal(legacy.params.moeda, 'BRL');
});

/* -------------------------------------------------------------------------- */
/* Tombstones                                                                  */
/* -------------------------------------------------------------------------- */

test('tombstone velho é varrido, o recente permanece', () => {
  const now = Date.now();
  const old = e('a', '2025-01-01', now - (TOMBSTONE_TTL_DAYS + 5) * 86400000, { deleted: true });
  const fresh = e('b', '2025-01-02', now - 86400000, { deleted: true });
  const alive = e('c', '2025-01-03', now);
  const kept = purgeTombstones([old, fresh, alive], now);
  assert.deepEqual(kept.map((x) => x.id), ['b', 'c']);
});
