/* Aba Config: preferências, backup/exportação, zona de risco e "sobre". */

import { $, on, setText, esc, setHTML } from './dom.js';
import { t, setLocale, applyStaticTranslations } from '../i18n.js';
import { state, setHideValues, estimateLocalBytes, syncFormatConfig } from '../state.js';
import { CURRENCIES, LOCALES, LS, APP_VERSION } from '../constants.js';
import { relativeFromNow } from '../format.js';
import { persistParams, replaceAll, wipeAllEntries } from '../actions.js';
import { normalizeParams } from '../merge.js';
import { activeEntries } from '../calc.js';
import { exportBackupJson, readBackupFile, exportCsv, exportXlsx, exportPdf } from '../export.js';
import { showToast } from './toast.js';
import { confirmDialog, alertDialog } from './dialog.js';
import { flashSaved } from './params.js';
import { fillLocalizedSelects } from './entries.js';
import { refreshAll, updatePrivacyIcon } from './render.js';

const LOCALE_LABELS = {
  'pt-BR': 'Português (Brasil)',
  en: 'English',
  es: 'Español'
};

let mediaQuery = null;

export function applyTheme() {
  let tema = state.params.tema || 'escuro';
  if (tema === 'sistema') {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    tema = prefersLight ? 'claro' : 'escuro';
  }
  document.documentElement.setAttribute('data-theme', tema);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'claro' ? '#F4F5F8' : '#0D1017');

  // Trocar o tema do sistema com o app aberto agora repinta na hora.
  if (!mediaQuery && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const listener = () => {
      if (state.params.tema === 'sistema') applyTheme();
    };
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', listener);
    else if (mediaQuery.addListener) mediaQuery.addListener(listener);
  }
}

function fillSelects() {
  const cur = $('cfg-moeda');
  if (cur && !cur.dataset.filled) {
    setHTML(cur, Object.entries(CURRENCIES)
      .map(([code, symbol]) => `<option value="${esc(code)}">${esc(symbol)} — ${esc(code)}</option>`)
      .join(''));
    cur.dataset.filled = '1';
  }
  const lang = $('cfg-idioma');
  if (lang && !lang.dataset.filled) {
    setHTML(lang, LOCALES.map((code) =>
      `<option value="${esc(code)}">${esc(LOCALE_LABELS[code] || code)}</option>`).join(''));
    lang.dataset.filled = '1';
  }
}

export function renderConfig() {
  if (!$('cfg-moeda')) return;
  fillSelects();
  $('cfg-moeda').value = state.params.moeda;
  $('cfg-idioma').value = state.params.idioma;
  $('cfg-tema').value = state.params.tema;
  $('cfg-hide-default').checked = state.hideValues;
  $('cfg-export-auto').checked = Boolean(state.params.exportAuto);

  const last = Number(localStorage.getItem(LS.lastAutoExport)) || 0;
  setText($('backup-msg'), last ? t('backup.lastLocal', { when: relativeFromNow(last) }) : t('backup.never'));

  const kb = Math.max(1, Math.round(estimateLocalBytes() / 1024));
  setText($('about-storage'), t('config.storageUsed', { n: activeEntries(state.entries).length, kb }));
  setText($('about-version'), t('config.version', { v: APP_VERSION }));
}

function showBackupMsg(text, isError) {
  const el = $('backup-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--danger)' : 'var(--accent-2)';
}

export function wireConfig() {
  on($('btn-save-config'), 'click', async () => {
    const nextLocale = $('cfg-idioma').value;
    const localeChanged = nextLocale !== state.params.idioma;

    setHideValues($('cfg-hide-default').checked);
    await persistParams({
      ...state.params,
      moeda: $('cfg-moeda').value,
      idioma: nextLocale,
      tema: $('cfg-tema').value,
      exportAuto: $('cfg-export-auto').checked
    });

    if (localeChanged) {
      setLocale(nextLocale);
      syncFormatConfig();
      applyStaticTranslations();
      fillLocalizedSelects();
    }
    applyTheme();
    updatePrivacyIcon();
    refreshAll();
    flashSaved('config-save-msg');
  });

  on($('btn-export'), 'click', () => {
    exportBackupJson();
    showBackupMsg(t('backup.done'), false);
  });

  on($('btn-import'), 'click', () => $('input-import').click());

  on($('input-import'), 'change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const parsed = await readBackupFile(file);
      const ok = await confirmDialog(t('backup.confirmImport', { n: parsed.entries.length }), {
        confirmLabel: t('backup.import'),
        danger: true
      });
      if (!ok) {
        ev.target.value = '';
        return;
      }
      const kept = await replaceAll(parsed.entries, normalizeParams(parsed.params));
      const discarded = parsed.entries.length - kept;
      setLocale(state.params.idioma);
      syncFormatConfig();
      applyStaticTranslations();
      fillLocalizedSelects();
      applyTheme();
      refreshAll();
      renderConfig();
      showBackupMsg(
        discarded > 0 ? t('backup.restoredPartial', { n: discarded }) : t('backup.restored'),
        false
      );
    } catch (err) {
      showBackupMsg(t('backup.importFail', { msg: err.message || '' }), true);
    }
    ev.target.value = '';
  });

  on($('btn-export-csv'), 'click', () => {
    exportCsv();
    showBackupMsg(t('backup.csvDone'), false);
  });

  on($('btn-export-excel'), 'click', async () => {
    try {
      await exportXlsx();
      showBackupMsg(t('backup.xlsxDone'), false);
    } catch (_) {
      showBackupMsg(t('backup.xlsxFail'), true);
    }
  });

  on($('btn-export-pdf'), 'click', exportPdf);

  on($('btn-wipe'), 'click', async () => {
    const n = activeEntries(state.entries).length;
    if (!n) return;
    const ok = await confirmDialog(t('config.wipeConfirm', { n }), {
      confirmLabel: t('config.wipe'),
      danger: true
    });
    if (!ok) return;
    await wipeAllEntries();
    renderConfig();
  });
}

/** Backup automático semanal, se ligado nas configurações. */
export function checkAutoExport() {
  if (!state.params.exportAuto) return;
  const last = Number(localStorage.getItem(LS.lastAutoExport)) || 0;
  if (last && Date.now() - last < 7 * 86400000) return;
  if (!activeEntries(state.entries).length) return;
  exportBackupJson();
  showToast(t('backup.done'));
}

export { alertDialog };
