// shift-extras.js — composição do valor líquido de um turno da adega.
// Puro: sem DOM, sem rede. Estende o entry existente do Freela sem quebrar
// os dados antigos (todos os campos novos são opcionais).
//
// Formato do entry ampliado (campos NOVOS em relação ao que já existe):
//   {
//     ...campos atuais (id, date, note, turno, custom, deleted, updatedAt),
//     uberMode: 'nenhum' | 'um' | 'idaEvolta' | null,
//     uberGastoCents: number | null,   // quanto realmente saiu no Uber
//     consumoCents: number | null,     // quanto foi descontado na conta da adega
//   }
//
// Nada aqui apaga ou renomeia campo existente — um entry antigo, sem esses
// três campos, continua calculando normal (uber e consumo tratados como zero).

export const REEMBOLSO_UM_CENTS = 1750;       // R$ 17,50 — só ida ou só volta
export const REEMBOLSO_IDA_VOLTA_CENTS = 3500; // R$ 35,00 — ida e volta

/** "2026-09-13" -> 0..6 (domingo=0), sem depender do fuso do navegador. */
export function dayOfWeek(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCDay();
}

/**
 * Valor do turno em centavos, igual à regra que o app já usa:
 * - "custom" sobrescreve tudo (já é a regra atual do Freela)
 * - "Meio" é fixo, não depende do dia
 * - "Completo" depende de o dia estar na lista de fim de semana (params.diasFDS)
 *
 * params: { meio, completoFDS, completoSemana, diasFDS } — os mesmos nomes
 * já usados em freelancer_data/params, valores em REAIS (como estão salvos).
 */
export function turnoValorCents(entry, params) {
  if (entry.custom != null && entry.custom !== '') {
    return Math.round(Number(entry.custom) * 100);
  }
  const dow = dayOfWeek(entry.date);
  const diasFDS = params.diasFDS || [];
  if (entry.turno === 'Meio') {
    return Math.round(Number(params.meio) * 100);
  }
  if (entry.turno === 'Completo') {
    const valor = diasFDS.includes(dow) ? params.completoFDS : params.completoSemana;
    return Math.round(Number(valor) * 100);
  }
  return 0;
}

/** Quanto a adega reembolsa de Uber, dado o modo informado. */
export function reembolsoUberCents(uberMode) {
  if (uberMode === 'um') return REEMBOLSO_UM_CENTS;
  if (uberMode === 'idaEvolta') return REEMBOLSO_IDA_VOLTA_CENTS;
  return 0;
}

/**
 * Resultado do Uber no dia: positivo é sobra, negativo é o quanto saiu
 * do seu bolso além do reembolso.
 */
export function resultadoUberCents(entry) {
  const reembolso = reembolsoUberCents(entry.uberMode);
  const gasto = Math.round(Number(entry.uberGastoCents) || 0);
  return reembolso - gasto;
}

/**
 * Líquido do dia: valor do turno, mais/menos o resultado do Uber,
 * menos o que foi consumido e descontado na conta da adega.
 */
export function turnoLiquidoCents(entry, params) {
  const turno = turnoValorCents(entry, params);
  const uber = resultadoUberCents(entry);
  const consumo = Math.round(Number(entry.consumoCents) || 0);
  return turno + uber - consumo;
}

/**
 * Resumo de uma lista de entries (já filtrada por período, ex: uma semana).
 * Ignora entries com deleted:true.
 */
export function resumoTurnos(entries, params) {
  const vivos = (entries || []).filter((e) => e && !e.deleted);
  let turnoCents = 0, uberReembolsoCents_ = 0, uberGastoCents_ = 0, consumoCents_ = 0;

  for (const e of vivos) {
    turnoCents += turnoValorCents(e, params);
    uberReembolsoCents_ += reembolsoUberCents(e.uberMode);
    uberGastoCents_ += Math.round(Number(e.uberGastoCents) || 0);
    consumoCents_ += Math.round(Number(e.consumoCents) || 0);
  }

  const uberSaldoCents = uberReembolsoCents_ - uberGastoCents_;
  return {
    dias: vivos.length,
    turnoCents,
    uberReembolsoCents: uberReembolsoCents_,
    uberGastoCents: uberGastoCents_,
    uberSaldoCents,
    consumoCents: consumoCents_,
    liquidoCents: turnoCents + uberSaldoCents - consumoCents_,
  };
}
