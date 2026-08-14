/* Formatação de datas, números e moeda. Só depende de Intl — nada de DOM,
   nada de estado global mutável fora do `config` explícito. Isso deixa o
   módulo testável em Node e evita import circular com state.js. */

const config = {
  locale: 'pt-BR',
  currency: 'BRL',
  hidden: false
};

export function configureFormat(next) {
  if (next.locale) config.locale = next.locale;
  if (next.currency) config.currency = next.currency;
  if (typeof next.hidden === 'boolean') config.hidden = next.hidden;
}

export function isHidden() {
  return config.hidden;
}

const memo = new Map();
function cached(key, build) {
  const full = config.locale + '|' + key;
  if (!memo.has(full)) memo.set(full, build());
  return memo.get(full);
}

/** Data local em ISO (YYYY-MM-DD). toISOString() usaria UTC e, à noite, no
 *  Brasil, já apontava para o dia seguinte — era o bug do "hoje" errado. */
export function toLocalISO(d) {
  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function todayISO() {
  return toLocalISO(new Date());
}

/** ISO → Date à meia-noite LOCAL (nunca UTC). */
export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = parseISO(iso);
  return !isNaN(d.getTime()) && toLocalISO(d) === iso;
}

export function addDays(iso, days) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}

/** Índice do dia da semana com a semana começando na segunda (0=seg … 6=dom). */
export function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - mondayIndex(d));
  return d;
}

export function money(value) {
  const n = Number(value) || 0;
  if (config.hidden) return '••••••';
  return cached('cur:' + config.currency, () =>
    new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  ).format(Math.round(n * 100) / 100);
}

/** Moeda sem mascarar — para arquivos exportados, que são do próprio usuário. */
export function moneyRaw(value) {
  const n = Number(value) || 0;
  return cached('curRaw:' + config.currency, () =>
    new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  ).format(Math.round(n * 100) / 100);
}

export function number(value, digits) {
  return new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: digits || 0,
    maximumFractionDigits: digits === undefined ? 0 : digits
  }).format(Number(value) || 0);
}

export function percent(ratio) {
  return Math.round((Number(ratio) || 0) * 100);
}

export function currencyCode() {
  return config.currency;
}

/** Símbolo da moeda no locale ativo (R$, US$, €, £) — para rótulos de campo. */
export function currencySymbol() {
  return cached('symbol:' + config.currency, () => {
    const parts = new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency
    }).formatToParts(0);
    const part = parts.find((p) => p.type === 'currency');
    return part ? part.value : config.currency;
  });
}

export function monthNames() {
  return cached('months', () => {
    const fmt = new Intl.DateTimeFormat(config.locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => capitalize(fmt.format(new Date(2021, i, 1))));
  });
}

export function monthShort() {
  return cached('monthsShort', () => {
    const fmt = new Intl.DateTimeFormat(config.locale, { month: 'short' });
    return Array.from({ length: 12 }, (_, i) =>
      capitalize(fmt.format(new Date(2021, i, 1)).replace('.', ''))
    );
  });
}

/** Nomes dos dias começando na segunda-feira. */
export function weekdayNames(style) {
  return cached('weekdays:' + (style || 'long'), () => {
    const fmt = new Intl.DateTimeFormat(config.locale, { weekday: style || 'long' });
    // 2021-03-01 foi uma segunda-feira.
    return Array.from({ length: 7 }, (_, i) =>
      capitalize(fmt.format(new Date(2021, 2, 1 + i)).replace('.', ''))
    );
  });
}

/** Nome do dia da semana a partir do getDay() do JS (0=dom). */
export function weekdayNameFromDow(dow, style) {
  const names = weekdayNames(style);
  return names[(dow + 6) % 7];
}

export function dateShort(iso) {
  return new Intl.DateTimeFormat(config.locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(parseISO(iso));
}

export function dateLong(iso) {
  return capitalize(
    new Intl.DateTimeFormat(config.locale, {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    }).format(parseISO(iso))
  );
}

export function monthTitle(year, month) {
  return capitalize(
    new Intl.DateTimeFormat(config.locale, { month: 'long', year: 'numeric' })
      .format(new Date(year, month, 1))
  );
}

export function dateTimeNow() {
  const now = new Date();
  return new Intl.DateTimeFormat(config.locale, {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(now);
}

export function relativeFromNow(timestamp) {
  const diffMs = Date.now() - Number(timestamp);
  const days = Math.round(diffMs / 86400000);
  const rtf = new Intl.RelativeTimeFormat(config.locale, { numeric: 'auto' });
  if (Math.abs(days) >= 1) return rtf.format(-days, 'day');
  const hours = Math.round(diffMs / 3600000);
  if (Math.abs(hours) >= 1) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(diffMs / 60000), 'minute');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
