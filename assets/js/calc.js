/* Toda a matemática do painel, em funções puras: recebem lançamentos, params e
   (quando o resultado depende de "agora") uma data. Nada de DOM, nada de estado
   global — é isso que torna tudo verificável em tests/calc.test.js. */

import { parseISO, toLocalISO, mondayIndex, startOfWeek } from './format.js';

/** Lançamentos vivos: tombstones de exclusão não entram em nenhuma conta. */
export function activeEntries(entries) {
  return (entries || []).filter((e) => e && !e.deleted && typeof e.date === 'string');
}

export function isPremiumDay(dateStr, params) {
  const dias = (params && params.diasFDS) || [5, 6];
  return dias.includes(parseISO(dateStr).getDay());
}

export function calcValor(entry, params) {
  if (!entry || !entry.date || !entry.turno) return 0;
  const custom = entry.custom;
  if (custom !== null && custom !== undefined && custom !== '' && !isNaN(Number(custom))) {
    return Number(custom);
  }
  if (entry.turno === 'Meio') return Number(params.meio) || 0;
  if (entry.turno === 'Completo') {
    return isPremiumDay(entry.date, params)
      ? Number(params.completoFDS) || 0
      : Number(params.completoSemana) || 0;
  }
  return 0;
}

export function hasCustom(entry) {
  return entry.custom !== null && entry.custom !== undefined && entry.custom !== '';
}

/* -------------------------------------------------------------------------- */
/* Totais gerais                                                              */
/* -------------------------------------------------------------------------- */

export function computeTotals(entries, params) {
  const list = activeEntries(entries);
  const weekday = Array.from({ length: 7 }, () => ({ ganho: 0, turnos: 0 }));
  const dates = new Set();
  let total = 0;
  let completos = 0;
  let meios = 0;

  list.forEach((e) => {
    const valor = calcValor(e, params);
    total += valor;
    dates.add(e.date);
    if (e.turno === 'Completo') completos++;
    else if (e.turno === 'Meio') meios++;
    const dow = parseISO(e.date).getDay();
    weekday[dow].ganho += valor;
    weekday[dow].turnos += 1;
  });

  const turnos = list.length;
  const diasUnicos = dates.size;
  return {
    total,
    turnos,
    diasUnicos,
    mediaTurno: turnos > 0 ? total / turnos : 0,
    mediaDia: diasUnicos > 0 ? total / diasUnicos : 0,
    completos,
    meios,
    weekday
  };
}

/** Agregados de um ano civil: usado pelo heatmap e pelo Resumo Mensal. */
export function computeYear(entries, params, year) {
  const monthly = Array.from({ length: 12 }, () => ({ ganho: 0, turnos: 0, dias: new Set() }));
  const valueByDate = {};
  activeEntries(entries).forEach((e) => {
    const d = parseISO(e.date);
    if (d.getFullYear() !== year) return;
    const valor = calcValor(e, params);
    const m = d.getMonth();
    monthly[m].ganho += valor;
    monthly[m].turnos += 1;
    monthly[m].dias.add(e.date);
    valueByDate[e.date] = (valueByDate[e.date] || 0) + valor;
  });
  return {
    year,
    valueByDate,
    monthly: monthly.map((m) => ({ ganho: m.ganho, turnos: m.turnos, dias: m.dias.size }))
  };
}

/** Anos que têm pelo menos um lançamento, do mais novo para o mais antigo. */
export function yearsWithData(entries) {
  const years = new Set();
  activeEntries(entries).forEach((e) => years.add(parseISO(e.date).getFullYear()));
  return [...years].sort((a, b) => b - a);
}

/* -------------------------------------------------------------------------- */
/* Período atual                                                              */
/* -------------------------------------------------------------------------- */

export function computeCurrentPeriod(entries, params, now) {
  const today = now || new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = today.getDate();

  const monthDates = new Set();
  let ganhoMes = 0;
  let turnosMes = 0;

  const monday = startOfWeek(today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  let ganhoSemana = 0;
  let turnosSemana = 0;

  activeEntries(entries).forEach((e) => {
    const d = parseISO(e.date);
    const valor = calcValor(e, params);
    if (d.getFullYear() === year && d.getMonth() === month) {
      ganhoMes += valor;
      turnosMes += 1;
      monthDates.add(e.date);
    }
    if (d >= monday && d <= sunday) {
      ganhoSemana += valor;
      turnosSemana += 1;
    }
  });

  const mediaDiaria = dayOfMonth > 0 ? ganhoMes / dayOfMonth : 0;
  const diasRestantes = daysInMonth - dayOfMonth;
  const meta = Number(params.meta) || 0;

  return {
    today,
    year,
    month,
    daysInMonth,
    dayOfMonth,
    diasRestantes,
    ganhoMes,
    turnosMes,
    ganhoSemana,
    turnosSemana,
    mediaDiaria,
    previsao: ganhoMes + mediaDiaria * diasRestantes,
    diasTrabalhadosMes: monthDates.size,
    diasLivresMes: daysInMonth - monthDates.size,
    meta,
    pctMeta: meta > 0 ? ganhoMes / meta : 0,
    restanteMeta: Math.max(meta - ganhoMes, 0),
    excedenteMeta: Math.max(ganhoMes - meta, 0)
  };
}

export function computeLast12Months(entries, params, now) {
  const today = now || new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), ganho: 0, turnos: 0 });
  }
  activeEntries(entries).forEach((e) => {
    const d = parseISO(e.date);
    const bucket = months.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
    if (bucket) {
      bucket.ganho += calcValor(e, params);
      bucket.turnos += 1;
    }
  });
  return months;
}

export function computeAnnual(entries, params, now) {
  const year = (now || new Date()).getFullYear();
  let ganhoAno = 0;
  let turnosAno = 0;
  activeEntries(entries).forEach((e) => {
    if (parseISO(e.date).getFullYear() === year) {
      ganhoAno += calcValor(e, params);
      turnosAno += 1;
    }
  });
  return { year, ganhoAno, turnosAno };
}

/* -------------------------------------------------------------------------- */
/* Estatísticas do histórico                                                  */
/* -------------------------------------------------------------------------- */

export function computeExtraStats(entries, params) {
  const byDate = {};
  activeEntries(entries).forEach((e) => {
    byDate[e.date] = (byDate[e.date] || 0) + calcValor(e, params);
  });
  const dates = Object.keys(byDate).sort();
  const values = dates.map((d) => byDate[d]);

  let maiorSequencia = dates.length ? 1 : 0;
  let cur = dates.length ? 1 : 0;
  let maiorIntervalo = 0;
  for (let i = 1; i < dates.length; i++) {
    const diffDays = Math.round((parseISO(dates[i]) - parseISO(dates[i - 1])) / 86400000);
    if (diffDays === 1) {
      cur++;
      maiorSequencia = Math.max(maiorSequencia, cur);
    } else {
      cur = 1;
    }
    maiorIntervalo = Math.max(maiorIntervalo, diffDays - 1);
  }

  let qtdSextas = 0;
  let qtdSabados = 0;
  const weekKeys = new Set();
  const monthKeys = new Set();
  dates.forEach((iso) => {
    const dt = parseISO(iso);
    const dow = dt.getDay();
    if (dow === 5) qtdSextas++;
    if (dow === 6) qtdSabados++;
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - mondayIndex(dt));
    weekKeys.add(toLocalISO(monday));
    monthKeys.add(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'));
  });

  const total = values.reduce((a, b) => a + b, 0);
  return {
    maiorGanhoDia: values.length ? Math.max(...values) : 0,
    menorGanhoDia: values.length ? Math.min(...values) : 0,
    maiorSequencia,
    maiorIntervalo,
    qtdSextas,
    qtdSabados,
    mediaSemanal: weekKeys.size ? total / weekKeys.size : 0,
    mediaMensal: monthKeys.size ? total / monthKeys.size : 0
  };
}

/**
 * Níveis do heatmap por quantil, não por máximo absoluto: um único dia
 * excepcional deixava de achatar o ano inteiro em cinza.
 */
export function heatmapThresholds(valueByDate) {
  const values = Object.values(valueByDate).filter((v) => v > 0).sort((a, b) => a - b);
  if (!values.length) return [0, 0, 0, 0];
  const at = (q) => values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))];
  return [at(0.25), at(0.5), at(0.75), at(0.9)];
}

export function heatmapLevel(value, thresholds) {
  if (!value || value <= 0) return 0;
  if (value >= thresholds[3]) return 4;
  if (value >= thresholds[2]) return 3;
  if (value >= thresholds[1]) return 2;
  return 1;
}

/** Mesmo dia + mesmo turno lançado mais de uma vez: quase sempre é engano. */
export function findDuplicates(entries) {
  const seen = new Map();
  const dups = [];
  activeEntries(entries).forEach((e) => {
    const key = e.date + '|' + e.turno + '|' + (e.custom ?? '');
    if (seen.has(key)) dups.push(e);
    else seen.set(key, e);
  });
  return dups;
}

/* -------------------------------------------------------------------------- */
/* Leituras do mês (o app pensando junto com o usuário)                        */
/* -------------------------------------------------------------------------- */

export function computeInsights(entries, params, now) {
  const today = now || new Date();
  const p = computeCurrentPeriod(entries, params, today);
  const totals = computeTotals(entries, params);
  const out = [];

  if (!activeEntries(entries).length) {
    return [{ kind: 'empty', key: 'insights.noData', vars: {} }];
  }

  if (p.meta > 0) {
    if (p.ganhoMes >= p.meta) {
      out.push({ kind: 'good', key: 'insights.goalHit', vars: { v: p.excedenteMeta } });
    } else if (p.diasRestantes <= 0) {
      out.push({ kind: 'bad', key: 'insights.behindNoDays', vars: { v: p.restanteMeta } });
    } else if (p.previsao >= p.meta) {
      out.push({
        kind: 'good',
        key: 'insights.onTrack',
        vars: { v: p.mediaDiaria, total: p.previsao }
      });
    } else {
      out.push({
        kind: 'warn',
        key: 'insights.behind',
        vars: {
          v: p.restanteMeta,
          n: p.diasRestantes,
          perDay: p.restanteMeta / p.diasRestantes
        }
      });
      const valorCompleto = Number(params.completoSemana) || 0;
      if (valorCompleto > 0) {
        out.push({
          kind: 'info',
          key: 'insights.shiftsToGoal',
          vars: { n: Math.ceil(p.restanteMeta / valorCompleto) }
        });
      }
    }
  }

  // Comparação honesta: mesmo dia do mês, mês anterior.
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevDaysInMonth = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  const cutoff = Math.min(p.dayOfMonth, prevDaysInMonth);
  let prevGanho = 0;
  activeEntries(entries).forEach((e) => {
    const d = parseISO(e.date);
    if (
      d.getFullYear() === prev.getFullYear() &&
      d.getMonth() === prev.getMonth() &&
      d.getDate() <= cutoff
    ) {
      prevGanho += calcValor(e, params);
    }
  });
  if (prevGanho > 0) {
    const delta = (p.ganhoMes - prevGanho) / prevGanho;
    out.push({
      kind: delta >= 0 ? 'good' : 'warn',
      key: 'insights.vsLastMonth',
      vars: { pct: Math.abs(Math.round(delta * 100)), dirUp: delta >= 0, v: prevGanho }
    });
  }

  const bestDow = totals.weekday.reduce(
    (best, w, dow) => (w.ganho > (best.ganho || 0) ? { dow, ganho: w.ganho } : best),
    {}
  );
  if (bestDow.ganho > 0) {
    out.push({
      kind: 'info',
      key: 'insights.bestWeekday',
      vars: { dow: bestDow.dow, v: bestDow.ganho }
    });
  }

  const dups = findDuplicates(entries);
  if (dups.length) {
    out.push({ kind: 'warn', key: 'insights.dupWarning', vars: { n: dups.length } });
  }

  return out;
}
