// finance.js — toda a matemática do módulo financeiro.
// Puro: não toca no DOM, não lê estado global, não faz rede.
// É por isso que dá para testar direto no Node.

// ---------------------------------------------------------------------------
// Datas: trabalhamos sempre com "YYYY-MM" para competência e "YYYY-MM-DD"
// para vencimento. Nunca com objetos Date em cálculo — fuso horário já
// causou bug demais em app financeiro.
// ---------------------------------------------------------------------------

/** Quantos dias tem o mês. month é 1-12. */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026-09" -> { year: 2026, month: 9 }. Retorna null se inválido. */
export function parseMonth(ym) {
  if (typeof ym !== 'string') return null;
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** { year, month } -> "2026-09" */
export function formatMonth(year, month) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** Avança n meses a partir de "YYYY-MM". n pode ser negativo. */
export function addMonths(ym, n) {
  const p = parseMonth(ym);
  if (!p) return null;
  const total = p.year * 12 + (p.month - 1) + n;
  return formatMonth(Math.floor(total / 12), (total % 12) + 1);
}

/**
 * Monta a data de vencimento dentro de um mês, respeitando meses curtos.
 * Vencimento dia 31 em fevereiro vira dia 28 (ou 29).
 */
export function dueDate(ym, day) {
  const p = parseMonth(ym);
  if (!p) return null;
  const d = Math.min(Math.max(1, Math.trunc(day) || 1), daysInMonth(p.year, p.month));
  return `${ym}-${String(d).padStart(2, '0')}`;
}

/** Lista de meses de `from` até `count` meses à frente, inclusive. */
export function monthRange(from, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(addMonths(from, i));
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Dinheiro: centavos inteiros internamente. Float em parcela acumula erro —
// 10x de 152,30 em float não fecha 1523,00.
// ---------------------------------------------------------------------------

/** Reais (number) -> centavos (int). 152.3 -> 15230 */
export function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Centavos (int) -> reais (number). 15230 -> 152.3 */
export function toReais(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

/**
 * Divide um total em N parcelas sem perder centavo.
 * O resto vai na PRIMEIRA parcela, que é como banco costuma fazer.
 * splitInstallments(100000, 3) -> [33334, 33333, 33333]
 */
export function splitInstallments(totalCents, count) {
  const total = Math.round(Number(totalCents) || 0);
  const n = Math.trunc(count);
  if (n < 1) return [];
  const base = Math.floor(total / n);
  const rest = total - base * n;
  const out = new Array(n).fill(base);
  out[0] += rest;
  return out;
}

// ---------------------------------------------------------------------------
// Regra de fatura: uma compra entra na fatura que ainda não fechou.
// Se o cartão fecha dia 5 e você compra dia 6, cai na fatura do mês seguinte.
// ---------------------------------------------------------------------------

/**
 * Em que mês-competência cai uma compra feita em `purchaseDate`.
 * closingDay = dia de fechamento do cartão.
 * Compra NO dia do fechamento já entra na fatura seguinte (conservador:
 * erra para mais tarde, nunca para mais cedo).
 */
export function billingMonthFor(purchaseDate, closingDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(purchaseDate));
  if (!m) return null;
  const ym = `${m[1]}-${m[2]}`;
  const day = Number(m[3]);
  const close = Math.trunc(closingDay) || 1;
  return day >= close ? addMonths(ym, 1) : ym;
}

/**
 * Expande uma compra parcelada em lançamentos, um por parcela.
 *
 * purchase: {
 *   id, cardId, description, totalCents, installments,
 *   purchaseDate: "YYYY-MM-DD",
 *   firstBillingMonth?: "YYYY-MM"   // opcional: sobrescreve o cálculo
 * }
 * card: { id, name, closingDay, dueDay }
 */
export function expandPurchase(purchase, card) {
  if (!purchase || !card) return [];
  const n = Math.max(1, Math.trunc(purchase.installments) || 1);
  const amounts = splitInstallments(purchase.totalCents, n);
  const first =
    purchase.firstBillingMonth ||
    billingMonthFor(purchase.purchaseDate, card.closingDay);
  if (!first) return [];

  return amounts.map((cents, i) => {
    const ym = addMonths(first, i);
    return {
      kind: 'installment',
      purchaseId: purchase.id,
      cardId: card.id,
      cardName: card.name,
      description: purchase.description,
      billingMonth: ym,
      dueDate: dueDate(ym, card.dueDay),
      installment: i + 1,
      installments: n,
      amountCents: cents,
    };
  });
}

/**
 * Expande uma conta fixa recorrente dentro de um intervalo de meses.
 *
 * fixed: {
 *   id, name, amountCents, dueDay,
 *   cardId?: string|null,        // se cai no cartão, entra na fatura dele
 *   startMonth?: "YYYY-MM",      // desde quando vale
 *   endMonth?: "YYYY-MM"         // até quando (inclusive)
 * }
 */
export function expandFixed(fixed, months, cardsById = {}) {
  if (!fixed) return [];
  const card = fixed.cardId ? cardsById[fixed.cardId] : null;

  return months
    .filter((ym) => {
      if (fixed.startMonth && ym < fixed.startMonth) return false;
      if (fixed.endMonth && ym > fixed.endMonth) return false;
      return true;
    })
    .map((ym) => ({
      kind: 'fixed',
      fixedId: fixed.id,
      cardId: card ? card.id : null,
      cardName: card ? card.name : null,
      description: fixed.name,
      billingMonth: ym,
      dueDate: dueDate(ym, card ? card.dueDay : fixed.dueDay),
      amountCents: Math.round(Number(fixed.amountCents) || 0),
    }));
}

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

const alive = (x) => x && !x.deleted;

/**
 * Todos os lançamentos previstos num intervalo de meses.
 *
 * data: { cards: [], purchases: [], fixed: [] }
 * Retorna lançamentos ordenados por data de vencimento.
 */
export function buildEntries(data, fromMonth, monthCount) {
  const cards = (data.cards || []).filter(alive);
  const purchases = (data.purchases || []).filter(alive);
  const fixed = (data.fixed || []).filter(alive);

  const cardsById = Object.create(null);
  for (const c of cards) cardsById[c.id] = c;

  const months = monthRange(fromMonth, monthCount);
  const window = new Set(months);
  const out = [];

  for (const p of purchases) {
    const card = cardsById[p.cardId];
    if (!card) continue; // compra órfã: cartão apagado
    for (const e of expandPurchase(p, card)) {
      if (window.has(e.billingMonth)) out.push(e);
    }
  }

  for (const f of fixed) {
    out.push(...expandFixed(f, months, cardsById));
  }

  out.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return (a.description || '').localeCompare(b.description || '', 'pt-BR');
  });

  return out;
}

/**
 * Resumo por mês: total, quebra por cartão e lista de lançamentos.
 * É o que a aba "Meses" consome.
 */
export function monthlySummary(data, fromMonth, monthCount) {
  const entries = buildEntries(data, fromMonth, monthCount);
  const months = monthRange(fromMonth, monthCount);

  const byMonth = Object.create(null);
  for (const ym of months) {
    byMonth[ym] = { month: ym, totalCents: 0, byCard: Object.create(null), entries: [] };
  }

  for (const e of entries) {
    const bucket = byMonth[e.billingMonth];
    if (!bucket) continue;
    bucket.totalCents += e.amountCents;
    const key = e.cardName || 'Sem cartão';
    bucket.byCard[key] = (bucket.byCard[key] || 0) + e.amountCents;
    bucket.entries.push(e);
  }

  return months.map((ym) => byMonth[ym]);
}

/**
 * O que vence entre duas datas, inclusive. Base da aba "Hoje".
 * Olha uma janela ampla de meses para não perder vencimento de virada.
 */
export function dueBetween(data, startDate, endDate) {
  const fromMonth = addMonths(String(startDate).slice(0, 7), -1);
  const entries = buildEntries(data, fromMonth, 4);
  return entries.filter((e) => e.dueDate >= startDate && e.dueDate <= endDate);
}

/** Soma de centavos de uma lista de lançamentos. */
export function sumCents(entries) {
  return (entries || []).reduce((acc, e) => acc + (Number(e.amountCents) || 0), 0);
}

/**
 * Projeção de caixa: para cada mês, quanto entra, quanto sai e o que sobra.
 *
 * income: { "2026-09": 500000, ... }  // centavos, vindo do módulo de ganhos
 */
export function cashflow(data, income, fromMonth, monthCount) {
  const summary = monthlySummary(data, fromMonth, monthCount);
  let running = 0;

  return summary.map((m) => {
    const inCents = Math.round(Number((income || {})[m.month]) || 0);
    const net = inCents - m.totalCents;
    running += net;
    return {
      month: m.month,
      incomeCents: inCents,
      expenseCents: m.totalCents,
      netCents: net,
      accumulatedCents: running,
    };
  });
}

/**
 * Quando a meta é atingida, dada a projeção de sobra.
 * Retorna { month, accumulatedCents } ou null se não alcança na janela.
 */
export function goalForecast(flow, goalCents, startingCents = 0) {
  const goal = Math.round(Number(goalCents) || 0);
  let acc = Math.round(Number(startingCents) || 0);
  for (const m of flow) {
    acc += m.netCents;
    if (acc >= goal) return { month: m.month, accumulatedCents: acc };
  }
  return null;
}
