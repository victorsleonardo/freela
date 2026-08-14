/* Constantes compartilhadas. Sem dependências — pode ser importado por qualquer
   módulo, inclusive pelos testes rodando em Node. */

export const APP_VERSION = '3.1.0';

/** Versão do documento salvo na nuvem. v1 = array cru de lançamentos. */
export const DATA_VERSION = 2;

export const LS = {
  url: 'freelancer_supabase_url',
  key: 'freelancer_supabase_key',
  hide: 'freelancer_hide_values',
  cacheEntries: 'freelancer_entries_v2',
  cacheParams: 'freelancer_params_v2',
  cacheLegacyEntries: 'freelancer_entries_v1',
  cacheLegacyParams: 'freelancer_params_v1',
  lastAutoExport: 'freelancer_last_autoexport',
  dirty: 'freelancer_pending_sync'
};

export const TURNOS = ['Completo', 'Meio'];

/** Moedas suportadas: código ISO → símbolo mostrado no seletor. */
export const CURRENCIES = {
  BRL: 'R$',
  USD: 'US$',
  EUR: '€',
  GBP: '£'
};

/** Compatibilidade: versões antigas gravavam o símbolo em vez do código. */
export const LEGACY_CURRENCY_MAP = {
  'R$': 'BRL',
  'US$': 'USD',
  'US $': 'USD',
  '€': 'EUR',
  '£': 'GBP'
};

export const LOCALES = ['pt-BR', 'en', 'es'];

export const DEFAULT_PARAMS = {
  meio: 125,
  completoSemana: 225,
  completoFDS: 250,
  meta: 2500,
  metaAnual: 24000,
  metaTurnos: 20,
  metaDias: 18,
  moeda: 'BRL',
  idioma: 'pt-BR',
  tema: 'escuro',
  exportAuto: false,
  /** Dias que valem tarifa de fim de semana (0=dom … 6=sáb). Antes era fixo em sex/sáb. */
  diasFDS: [5, 6]
};

/** Tombstones de exclusão viram lixo depois disso — aí somem de vez. */
export const TOMBSTONE_TTL_DAYS = 45;

/** Segundos que o "Desfazer" da exclusão fica disponível. */
export const UNDO_WINDOW_MS = 6000;
