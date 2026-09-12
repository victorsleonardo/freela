import test from 'node:test';
import assert from 'node:assert/strict';
import {
  daysInMonth, parseMonth, formatMonth, addMonths, dueDate, monthRange,
  toCents, toReais, splitInstallments, billingMonthFor,
  expandPurchase, expandFixed, buildEntries, monthlySummary,
  dueBetween, sumCents, cashflow, goalForecast,
} from './finance.js';

// --- datas ---------------------------------------------------------------

test('daysInMonth cobre fevereiro e bissexto', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 9), 30);
  assert.equal(daysInMonth(2026, 12), 31);
});

test('parseMonth rejeita lixo', () => {
  assert.deepEqual(parseMonth('2026-09'), { year: 2026, month: 9 });
  assert.equal(parseMonth('2026-13'), null);
  assert.equal(parseMonth('2026-9'), null);
  assert.equal(parseMonth(null), null);
});

test('addMonths vira o ano nos dois sentidos', () => {
  assert.equal(addMonths('2026-09', 4), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-09', 0), '2026-09');
});

test('dueDate encurta dia 31 em mes curto', () => {
  assert.equal(dueDate('2026-09', 21), '2026-09-21');
  assert.equal(dueDate('2026-02', 31), '2026-02-28');
  assert.equal(dueDate('2028-02', 31), '2028-02-29');
  assert.equal(dueDate('2026-09', 31), '2026-09-30');
});

test('monthRange devolve a janela na ordem', () => {
  assert.deepEqual(monthRange('2026-11', 3), ['2026-11', '2026-12', '2027-01']);
});

// --- dinheiro ------------------------------------------------------------

test('toCents nao perde centavo em float sujo', () => {
  assert.equal(toCents(152.3), 15230);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('89.99'), 8999);
  assert.equal(toCents(undefined), 0);
});

test('splitInstallments fecha a soma exata', () => {
  const parts = splitInstallments(100000, 3);
  assert.deepEqual(parts, [33334, 33333, 33333]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100000);
});

test('splitInstallments no caso real de 10x', () => {
  const parts = splitInstallments(152300 * 10 / 10 * 10, 10);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1523000);
});

test('splitInstallments com 1 parcela e com zero', () => {
  assert.deepEqual(splitInstallments(5000, 1), [5000]);
  assert.deepEqual(splitInstallments(5000, 0), []);
});

// --- regra de fatura -----------------------------------------------------

test('compra antes do fechamento cai no mes corrente', () => {
  assert.equal(billingMonthFor('2026-09-04', 5), '2026-09');
});

test('compra no dia do fechamento cai no mes seguinte', () => {
  assert.equal(billingMonthFor('2026-09-05', 5), '2026-10');
});

test('compra depois do fechamento vira o ano', () => {
  assert.equal(billingMonthFor('2026-12-20', 5), '2027-01');
});

// --- expansao ------------------------------------------------------------

const nubank = { id: 'c1', name: 'Nubank', closingDay: 5, dueDay: 14 };
const inter = { id: 'c2', name: 'Inter', closingDay: 10, dueDay: 18 };

test('expandPurchase gera uma parcela por mes com vencimento certo', () => {
  const compra = {
    id: 'p1', cardId: 'c1', description: 'Casas Bahia',
    totalCents: 152300 * 10, installments: 10,
    purchaseDate: '2026-03-21',
  };
  const out = expandPurchase(compra, nubank);
  assert.equal(out.length, 10);
  assert.equal(out[0].billingMonth, '2026-04');
  assert.equal(out[0].dueDate, '2026-04-14');
  assert.equal(out[9].billingMonth, '2027-01');
  assert.equal(out[9].installment, 10);
  assert.equal(sumCents(out), 1523000);
});

test('firstBillingMonth sobrescreve o calculo automatico', () => {
  const compra = {
    id: 'p2', cardId: 'c1', description: 'Ajuste manual',
    totalCents: 30000, installments: 3,
    purchaseDate: '2026-01-01', firstBillingMonth: '2026-09',
  };
  const out = expandPurchase(compra, nubank);
  assert.equal(out[0].billingMonth, '2026-09');
  assert.equal(out[2].billingMonth, '2026-11');
});

test('expandFixed respeita janela de vigencia', () => {
  const luz = { id: 'f1', name: 'Luz', amountCents: 20000, dueDay: 21, startMonth: '2026-10' };
  const out = expandFixed(luz, monthRange('2026-09', 3));
  assert.equal(out.length, 2);
  assert.equal(out[0].billingMonth, '2026-10');
  assert.equal(out[0].dueDate, '2026-10-21');
});

test('conta fixa no cartao usa o vencimento do cartao', () => {
  const barbearia = { id: 'f2', name: 'Barbearia', amountCents: 8999, dueDay: 30, cardId: 'c2' };
  const out = expandFixed(barbearia, ['2026-10'], { c2: inter });
  assert.equal(out[0].dueDate, '2026-10-18'); // vencimento do Inter, nao o dia 30
  assert.equal(out[0].cardName, 'Inter');
});

// --- agregacao -----------------------------------------------------------

const dataset = {
  cards: [nubank, inter],
  purchases: [
    { id: 'p1', cardId: 'c1', description: 'Mercado Livre',
      totalCents: 11390, installments: 3, purchaseDate: '2026-08-26' },
    { id: 'px', cardId: 'c1', description: 'Cancelada',
      totalCents: 50000, installments: 5, purchaseDate: '2026-08-01', deleted: true },
    { id: 'po', cardId: 'cZZ', description: 'Cartao apagado',
      totalCents: 9900, installments: 2, purchaseDate: '2026-08-01' },
  ],
  fixed: [
    { id: 'f2', name: 'Barbearia', amountCents: 8999, dueDay: 30, cardId: 'c2' },
    { id: 'f3', name: 'Agua', amountCents: 15000, dueDay: 21 },
  ],
};

test('buildEntries ignora apagados e compras orfas', () => {
  const out = buildEntries(dataset, '2026-09', 3);
  assert.ok(!out.some((e) => e.purchaseId === 'px'), 'deleted entrou');
  assert.ok(!out.some((e) => e.purchaseId === 'po'), 'orfa entrou');
});

test('buildEntries devolve ordenado por vencimento', () => {
  const out = buildEntries(dataset, '2026-09', 3);
  const dates = out.map((e) => e.dueDate);
  assert.deepEqual(dates, [...dates].sort());
});

test('monthlySummary soma e quebra por cartao', () => {
  const out = monthlySummary(dataset, '2026-09', 3);
  assert.equal(out.length, 3);
  const set = out.find((m) => m.month === '2026-09');
  assert.equal(set.byCard['Inter'], 8999);
  assert.equal(set.byCard['Sem cartão'], 15000);
  assert.equal(set.totalCents, sumCents(set.entries));
});

test('dueBetween pega vencimento na virada do mes', () => {
  const out = dueBetween(dataset, '2026-09-28', '2026-10-05');
  assert.ok(out.every((e) => e.dueDate >= '2026-09-28' && e.dueDate <= '2026-10-05'));
});

// --- projecao ------------------------------------------------------------

test('cashflow acumula sobra mes a mes', () => {
  const income = { '2026-09': 500000, '2026-10': 500000, '2026-11': 700000 };
  const flow = cashflow(dataset, income, '2026-09', 3);
  assert.equal(flow.length, 3);
  assert.equal(flow[0].netCents, flow[0].incomeCents - flow[0].expenseCents);
  assert.equal(
    flow[2].accumulatedCents,
    flow[0].netCents + flow[1].netCents + flow[2].netCents
  );
});

test('cashflow trata mes sem renda informada como zero', () => {
  const flow = cashflow(dataset, {}, '2026-09', 2);
  assert.equal(flow[0].incomeCents, 0);
  assert.ok(flow[0].netCents < 0);
});

test('goalForecast acha o mes da meta', () => {
  const flow = [
    { month: '2026-09', netCents: 80000 },
    { month: '2026-10', netCents: 70000 },
    { month: '2026-11', netCents: 200000 },
    { month: '2026-12', netCents: 450000 },
  ];
  const hit = goalForecast(flow, 700000);
  assert.equal(hit.month, '2026-12');
});

test('goalForecast devolve null se nao alcanca', () => {
  const flow = [{ month: '2026-09', netCents: 1000 }];
  assert.equal(goalForecast(flow, 1400000), null);
});

test('goalForecast considera o que ja esta guardado', () => {
  const flow = [{ month: '2026-09', netCents: 80000 }];
  assert.equal(goalForecast(flow, 100000, 50000).month, '2026-09');
});
