import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcValor, activeEntries, isPremiumDay, computeTotals, computeYear,
  computeCurrentPeriod, computeLast12Months, computeExtraStats,
  heatmapThresholds, heatmapLevel, findDuplicates, computeInsights
} from '../assets/js/calc.js';
import { DEFAULT_PARAMS } from '../assets/js/constants.js';
import { toLocalISO, parseISO, isValidISO, addDays, startOfWeek } from '../assets/js/format.js';

const params = { ...DEFAULT_PARAMS, meio: 100, completoSemana: 200, completoFDS: 300 };

const entry = (date, turno = 'Completo', extra = {}) => ({
  id: 'e' + date + turno,
  date,
  turno,
  custom: null,
  note: '',
  updatedAt: 1,
  deleted: false,
  ...extra
});

/* -------------------------------------------------------------------------- */
/* Datas — o bug original: toISOString() jogava o "hoje" para o dia seguinte   */
/* -------------------------------------------------------------------------- */

test('toLocalISO usa a data local, não UTC', () => {
  // 23h de 31/12 em UTC-3 é 02h de 01/01 em UTC. Tem que continuar sendo dia 31.
  const lateNight = new Date(2025, 11, 31, 23, 30, 0);
  assert.equal(toLocalISO(lateNight), '2025-12-31');
});

test('parseISO devolve meia-noite local, sem deslocar o dia', () => {
  const d = parseISO('2025-03-09');
  assert.equal(d.getFullYear(), 2025);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 9);
});

test('isValidISO rejeita datas que não existem', () => {
  assert.equal(isValidISO('2025-02-30'), false);
  assert.equal(isValidISO('2025-13-01'), false);
  assert.equal(isValidISO('25-01-01'), false);
  assert.equal(isValidISO('2025-02-28'), true);
});

test('addDays atravessa virada de mês e ano', () => {
  assert.equal(addDays('2025-12-30', 3), '2026-01-02');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); // bissexto
});

test('startOfWeek começa na segunda-feira', () => {
  // 2025-03-09 é um domingo; a semana dele começa em 03/03.
  assert.equal(toLocalISO(startOfWeek(parseISO('2025-03-09'))), '2025-03-03');
  // 2025-03-10 é segunda: começa nela mesma.
  assert.equal(toLocalISO(startOfWeek(parseISO('2025-03-10'))), '2025-03-10');
});

/* -------------------------------------------------------------------------- */
/* Valor do turno                                                              */
/* -------------------------------------------------------------------------- */

test('turno Meio vale o mesmo em qualquer dia', () => {
  assert.equal(calcValor(entry('2025-03-05', 'Meio'), params), 100); // quarta
  assert.equal(calcValor(entry('2025-03-07', 'Meio'), params), 100); // sexta
});

test('turno Completo cobra tarifa premium em sexta e sábado', () => {
  assert.equal(calcValor(entry('2025-03-05'), params), 200); // quarta
  assert.equal(calcValor(entry('2025-03-07'), params), 300); // sexta
  assert.equal(calcValor(entry('2025-03-08'), params), 300); // sábado
  assert.equal(calcValor(entry('2025-03-09'), params), 200); // domingo
});

test('dias premium são configuráveis', () => {
  const domingoPremium = { ...params, diasFDS: [0] };
  assert.equal(calcValor(entry('2025-03-09'), domingoPremium), 300); // domingo
  assert.equal(calcValor(entry('2025-03-07'), domingoPremium), 200); // sexta
  assert.equal(isPremiumDay('2025-03-09', domingoPremium), true);
});

test('valor personalizado tem prioridade, inclusive quando é zero', () => {
  assert.equal(calcValor(entry('2025-03-07', 'Completo', { custom: 42.5 }), params), 42.5);
  assert.equal(calcValor(entry('2025-03-07', 'Completo', { custom: 0 }), params), 0);
});

/* -------------------------------------------------------------------------- */
/* Agregados                                                                   */
/* -------------------------------------------------------------------------- */

test('lançamentos excluídos não entram em nenhuma conta', () => {
  const list = [entry('2025-03-05'), entry('2025-03-06', 'Completo', { deleted: true })];
  assert.equal(activeEntries(list).length, 1);
  assert.equal(computeTotals(list, params).total, 200);
});

test('dias trabalhados conta datas distintas; turnos conta lançamentos', () => {
  const list = [
    entry('2025-03-05', 'Completo'),
    entry('2025-03-05', 'Meio'),
    entry('2025-03-06', 'Completo')
  ];
  const totals = computeTotals(list, params);
  assert.equal(totals.turnos, 3);
  assert.equal(totals.diasUnicos, 2);
  assert.equal(totals.total, 500);
  assert.equal(totals.mediaTurno, 500 / 3);
  assert.equal(totals.mediaDia, 250);
});

test('computeYear separa por ano e agrega por mês', () => {
  const list = [entry('2025-01-15'), entry('2025-01-20'), entry('2024-01-15')];
  const y = computeYear(list, params, 2025);
  assert.equal(y.monthly[0].turnos, 2);
  assert.equal(y.monthly[0].ganho, 400);
  assert.equal(y.monthly[1].turnos, 0);
  assert.equal(y.valueByDate['2024-01-15'], undefined);
});

test('período atual calcula meta, previsão e semana', () => {
  const now = new Date(2025, 2, 10, 12, 0, 0); // segunda, 10/03/2025
  const list = [
    entry('2025-03-03'), // semana anterior
    entry('2025-03-10'), // esta semana
    entry('2025-02-25')  // mês anterior
  ];
  const p = computeCurrentPeriod(list, { ...params, meta: 1000 }, now);
  assert.equal(p.ganhoMes, 400);
  assert.equal(p.turnosMes, 2);
  assert.equal(p.ganhoSemana, 200);
  assert.equal(p.diasRestantes, 21);
  assert.equal(p.restanteMeta, 600);
  assert.equal(p.pctMeta, 0.4);
});

test('meta batida vira excedente, não resto negativo', () => {
  const now = new Date(2025, 2, 10, 12, 0, 0);
  // 01/03/2025 é sábado (tarifa premium, 300) e 02/03 é domingo (200) = 500.
  const p = computeCurrentPeriod([entry('2025-03-01'), entry('2025-03-02')],
    { ...params, meta: 300 }, now);
  assert.equal(p.restanteMeta, 0);
  assert.equal(p.excedenteMeta, 200);
});

test('últimos 12 meses terminam no mês atual', () => {
  const now = new Date(2025, 2, 15);
  const months = computeLast12Months([entry('2025-03-01'), entry('2024-04-01')], params, now);
  assert.equal(months.length, 12);
  assert.equal(months[11].month, 2);
  assert.equal(months[11].year, 2025);
  assert.equal(months[0].month, 3);
  assert.equal(months[0].year, 2024);
  assert.equal(months[0].turnos, 1);
});

test('sequência e intervalo do histórico', () => {
  const list = [
    entry('2025-03-01'), entry('2025-03-02'), entry('2025-03-03'),
    entry('2025-03-10')
  ];
  const st = computeExtraStats(list, params);
  assert.equal(st.maiorSequencia, 3);
  assert.equal(st.maiorIntervalo, 6);
});

/* -------------------------------------------------------------------------- */
/* Heatmap por quantil                                                         */
/* -------------------------------------------------------------------------- */

test('um dia excepcional não achata o heatmap inteiro', () => {
  const valueByDate = {};
  for (let i = 1; i <= 20; i++) valueByDate[`2025-01-${String(i).padStart(2, '0')}`] = 200;
  valueByDate['2025-02-01'] = 100000; // outlier

  const th = heatmapThresholds(valueByDate);
  // Com escala pelo máximo absoluto, 200/100000 cairia sempre no nível 1.
  assert.ok(heatmapLevel(200, th) >= 2, 'dias típicos precisam ter cor visível');
  assert.equal(heatmapLevel(100000, th), 4);
  assert.equal(heatmapLevel(0, th), 0);
});

/* -------------------------------------------------------------------------- */
/* Duplicatas e leituras                                                       */
/* -------------------------------------------------------------------------- */

test('detecta o mesmo turno lançado duas vezes no mesmo dia', () => {
  const list = [
    { ...entry('2025-03-05'), id: 'a' },
    { ...entry('2025-03-05'), id: 'b' },
    { ...entry('2025-03-05', 'Meio'), id: 'c' }
  ];
  assert.equal(findDuplicates(list).length, 1);
});

test('sem lançamentos, a leitura é o convite para começar', () => {
  const out = computeInsights([], params, new Date(2025, 2, 10));
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'insights.noData');
});

test('abaixo da meta, a leitura diz quanto falta por dia', () => {
  const now = new Date(2025, 2, 10, 12, 0, 0);
  const out = computeInsights([entry('2025-03-01')], { ...params, meta: 10000 }, now);
  const behind = out.find((i) => i.key === 'insights.behind');
  assert.ok(behind, 'esperava a leitura de ritmo abaixo da meta');
  assert.equal(behind.vars.v, 9700); // 10000 - 300 (sábado premium)
  assert.equal(behind.vars.n, 21);
});
