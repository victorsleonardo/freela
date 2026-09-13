import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOfWeek, turnoValorCents, reembolsoUberCents, resultadoUberCents,
  turnoLiquidoCents, resumoTurnos, REEMBOLSO_UM_CENTS, REEMBOLSO_IDA_VOLTA_CENTS,
} from './shift-extras.js';

// params reais, tirados do freelancer_data/params do Victor
const params = { meio: 125, completoFDS: 250, completoSemana: 225, diasFDS: [5, 6] };

test('dayOfWeek acerta sexta, sabado e domingo sem depender do fuso', () => {
  assert.equal(dayOfWeek('2026-09-11'), 5); // sexta
  assert.equal(dayOfWeek('2026-09-12'), 6); // sabado
  assert.equal(dayOfWeek('2026-09-13'), 0); // domingo
});

// --- valor do turno, batendo com a semana real do Victor -----------------

test('Meio vale 125 em qualquer dia', () => {
  assert.equal(turnoValorCents({ date: '2026-09-11', turno: 'Meio' }, params), 12500);
  assert.equal(turnoValorCents({ date: '2026-09-13', turno: 'Meio' }, params), 12500);
});

test('Completo no sabado usa completoFDS (250)', () => {
  assert.equal(turnoValorCents({ date: '2026-09-12', turno: 'Completo' }, params), 25000);
});

test('Completo no domingo usa completoSemana (225), nao completoFDS', () => {
  assert.equal(turnoValorCents({ date: '2026-09-13', turno: 'Completo' }, params), 22500);
});

test('custom sobrescreve a regra padrao', () => {
  assert.equal(turnoValorCents({ date: '2026-08-09', turno: 'Completo', custom: 175 }, params), 17500);
});

// --- Uber ------------------------------------------------------------------

test('reembolso zero sem uber', () => {
  assert.equal(reembolsoUberCents(null), 0);
  assert.equal(reembolsoUberCents('nenhum'), 0);
});

test('reembolso de um trajeto e de ida e volta', () => {
  assert.equal(reembolsoUberCents('um'), REEMBOLSO_UM_CENTS);
  assert.equal(reembolsoUberCents('idaEvolta'), REEMBOLSO_IDA_VOLTA_CENTS);
});

test('resultadoUber: sobra quando gasta menos que o reembolso', () => {
  // quinta 11/09: ida e volta reembolsada (35), gastou 17,50 real -> sobrou 17,50
  const e = { uberMode: 'idaEvolta', uberGastoCents: 1750 };
  assert.equal(resultadoUberCents(e), 1750);
});

test('resultadoUber: prejuizo quando gasta mais que o reembolso', () => {
  // sabado 12/09 real: ida 16,90 + volta 21,94 = 38,84, reembolso 35 -> -3,84
  const e = { uberMode: 'idaEvolta', uberGastoCents: 3884 };
  assert.equal(resultadoUberCents(e), 3500 - 3884);
});

// --- liquido do dia, contra os numeros reais que o Victor passou no chat ---

test('sexta 11/09: turno 125 + uber neutro - consumo 0', () => {
  // ida 13,70 + volta 19,96 = 33,66 real; reembolso 35 -> sobra 1,34
  const e = {
    date: '2026-09-11', turno: 'Meio',
    uberMode: 'idaEvolta', uberGastoCents: 3366,
    consumoCents: 0,
  };
  assert.equal(turnoLiquidoCents(e, params), 12500 + (3500 - 3366) - 0);
});

test('domingo 13/09 como Completo (o que esta gravado) x Meio (o que o Victor falou)', () => {
  const base = {
    date: '2026-09-13',
    uberMode: 'idaEvolta', uberGastoCents: 3130, // 16,90+14,40
    consumoCents: 2300,
  };
  const comoCompleto = turnoLiquidoCents({ ...base, turno: 'Completo' }, params);
  const comoMeio = turnoLiquidoCents({ ...base, turno: 'Meio' }, params);
  assert.equal(comoCompleto, 22500 + (3500 - 3130) - 2300); // 22.070
  assert.equal(comoMeio, 12500 + (3500 - 3130) - 2300);      // 12.070
  assert.equal(comoCompleto - comoMeio, 10000); // diferença exata de R$100
});

// --- resumo da semana --------------------------------------------------

test('resumoTurnos soma a semana e ignora apagados', () => {
  const semana = [
    { date: '2026-09-09', turno: 'Meio', deleted: false }, // quarta, sem uber
    { date: '2026-09-10', turno: 'Meio', deleted: true },  // apagado: nao conta
    {
      date: '2026-09-11', turno: 'Meio', deleted: false,
      uberMode: 'idaEvolta', uberGastoCents: 3366, consumoCents: 0,
    },
    {
      date: '2026-09-12', turno: 'Completo', deleted: false,
      uberMode: 'idaEvolta', uberGastoCents: 3884, consumoCents: 0,
    },
    {
      date: '2026-09-13', turno: 'Meio', deleted: false,
      uberMode: 'idaEvolta', uberGastoCents: 3130, consumoCents: 2300,
    },
  ];
  const r = resumoTurnos(semana, params);
  assert.equal(r.dias, 4);
  assert.equal(r.turnoCents, 12500 + 12500 + 25000 + 12500);
  assert.equal(r.uberReembolsoCents, 3500 * 3);
  assert.equal(r.uberGastoCents, 3366 + 3884 + 3130);
  assert.equal(r.consumoCents, 2300);
});

test('resumoTurnos com lista vazia nao quebra', () => {
  const r = resumoTurnos([], params);
  assert.equal(r.dias, 0);
  assert.equal(r.liquidoCents, 0);
});

test('entry antigo sem os campos novos calcula uber e consumo como zero', () => {
  const antigo = { date: '2026-01-17', turno: 'Completo', deleted: false };
  const liquido = turnoLiquidoCents(antigo, params);
  assert.equal(liquido, turnoValorCents(antigo, params));
});
