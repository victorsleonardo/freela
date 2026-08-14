/* Bootstrap: liga estado, nuvem e interface. */

import { LS } from './constants.js';
import { t, setLocale, applyStaticTranslations } from './i18n.js';
import { state, setHideValues, loadLocalCache, setParams, syncFormatConfig } from './state.js';
import * as db from './db.js';
import { $, on, setText, show, delegate, esc, setHTML } from './ui/dom.js';
import { showToast } from './ui/toast.js';
import { confirmDialog } from './ui/dialog.js';
import { showGate, wireGates } from './ui/gates.js';
import { wireTabs, switchTab, TABS } from './ui/tabs.js';
import { refreshAll, updatePrivacyIcon, showSkeletons } from './ui/render.js';
import { wireEntries, fillLocalizedSelects } from './ui/entries.js';
import { wireCalendar, openDayModal } from './ui/calendar.js';
import { wireParams } from './ui/params.js';
import { wireGoals } from './ui/goals.js';
import { wireConfig, renderConfig, applyTheme, checkAutoExport } from './ui/config.js';
import { wireShortcuts } from './ui/shortcuts.js';
import { registerServiceWorker, wireInstallPrompt } from './ui/install.js';
import { todayISO } from './format.js';
import { renderHeatmap } from './ui/resumo.js';

/* -------------------------------------------------------------------------- */
/* Indicadores de rede e sincronização                                        */
/* -------------------------------------------------------------------------- */

let syncCount = 0;

function updateOfflineBanner() {
  const el = $('offline-banner');
  const txt = $('offline-banner-text');
  if (!el) return;
  if (!navigator.onLine) {
    setText(txt, t('offline.off'));
    el.classList.add('show');
  } else if (state.pendingSync) {
    setText(txt, t('offline.pending'));
    el.classList.add('show');
  } else {
    el.classList.remove('show');
  }
}

function wireSyncEvents() {
  db.events.onSyncStart = () => {
    syncCount++;
    const el = $('sync-indicator');
    if (el) el.classList.add('show');
  };
  db.events.onSyncEnd = () => {
    syncCount = Math.max(0, syncCount - 1);
    if (syncCount === 0) {
      const el = $('sync-indicator');
      if (el) el.classList.remove('show');
    }
  };
  db.events.onStatusChange = updateOfflineBanner;
  db.events.onPulled = (n) => {
    refreshAll();
    showToast(t('toast.mergedRemote', { n }));
  };
  db.events.onError = (err) => {
    showToast(t(db.errorKey(err)), { tone: 'error' });
  };
}

/* -------------------------------------------------------------------------- */
/* Sessão                                                                      */
/* -------------------------------------------------------------------------- */

function showLoadError(err) {
  setHTML($('stat-grid'), `
    <div class="glass stat-card hero error-card">
      <div class="label">${esc(t('err.loadTitle'))}</div>
      <div class="value" style="font-size:15px;">${esc(t('err.loadBody'))}</div>
      <button type="button" class="secondary" id="btn-retry-load">${esc(t('err.retry'))}</button>
    </div>`);
  setHTML($('entries-list'), '');
  setHTML($('period-grid'), '');
  on($('btn-retry-load'), 'click', () => window.location.reload());
  showToast(t(db.errorKey(err)), { duration: 8000, tone: 'error' });
}

async function startApp(session) {
  state.session = session;
  showGate('app');
  setText($('account-email'), session.user.email || '');
  updatePrivacyIcon();
  applyTheme();
  updateOfflineBanner();
  showSkeletons();

  try {
    await db.loadAll();
  } catch (err) {
    showLoadError(err);
    return;
  }

  // Params podem ter trazido outro idioma/moeda da nuvem.
  setLocale(state.params.idioma);
  syncFormatConfig();
  applyStaticTranslations();
  fillLocalizedSelects();
  applyTheme();

  refreshAll();
  renderConfig();
  checkAutoExport();
  handleDeepLink();

  if (state.loadFailed) showToast(t('offline.usingCache'), { duration: 6000 });
}

async function logout() {
  const message = state.pendingSync ? t('top.confirmLogoutPending') : t('top.confirmLogout');
  const ok = await confirmDialog(message, { danger: state.pendingSync });
  if (!ok) return;
  await db.signOut();
  state.session = null;
  $('auth-email').value = '';
  $('auth-pass').value = '';
  showGate('auth');
}

/* -------------------------------------------------------------------------- */
/* Links diretos (?aba=, ?acao=novo — usados pelos atalhos do manifest)         */
/* -------------------------------------------------------------------------- */

function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const aba = params.get('aba');
  if (aba && TABS.includes(aba)) switchTab(aba);
  if (params.get('acao') === 'novo') openDayModal(todayISO());
}

/* -------------------------------------------------------------------------- */
/* Ligações gerais da interface                                                */
/* -------------------------------------------------------------------------- */

function wireChrome() {
  wireTabs();
  wireEntries();
  wireCalendar();
  wireParams();
  wireGoals();
  wireConfig();
  wireInstallPrompt();

  on($('btn-toggle-privacy'), 'click', togglePrivacy);
  on($('btn-logout'), 'click', logout);
  on($('fab-add'), 'click', () => openDayModal(todayISO()));

  on($('heat-prev'), 'click', () => {
    state.anoSelecionado--;
    renderHeatmap();
    refreshAll();
  });
  on($('heat-next'), 'click', () => {
    state.anoSelecionado++;
    renderHeatmap();
    refreshAll();
  });

  // Clicar num quadrado do heatmap abre o dia correspondente.
  delegate($('heatmap-grid'), 'click', '.hcell[data-date]', (ev, cell) => {
    openDayModal(cell.dataset.date);
  });

  wireShortcuts({ togglePrivacy });

  window.addEventListener('online', () => {
    updateOfflineBanner();
    if (state.pendingSync) db.retryNow();
    db.pullRemote().catch(() => {});
  });
  window.addEventListener('offline', updateOfflineBanner);

  // Voltar para a aba depois de mexer no celular: puxa o que mudou lá.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.session) {
      db.pullRemote().then((n) => { if (n) refreshAll(); }).catch(() => {});
    }
  });

  // Fechar com alterações na fila é o momento certo para avisar.
  window.addEventListener('beforeunload', (ev) => {
    if (state.pendingSync) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
}

function togglePrivacy() {
  setHideValues(!state.hideValues);
  updatePrivacyIcon();
  refreshAll();
  renderConfig();
}

/* -------------------------------------------------------------------------- */
/* Início                                                                      */
/* -------------------------------------------------------------------------- */

async function boot() {
  registerServiceWorker();

  // Preferências locais valem antes de qualquer rede: a primeira pintura já
  // sai no idioma e no tema certos, sem piscar.
  try { state.hideValues = localStorage.getItem(LS.hide) === '1'; } catch (_) {}
  const cache = loadLocalCache();
  if (cache) setParams(cache.params, cache.paramsUpdatedAt);
  setLocale(state.params.idioma);
  syncFormatConfig();
  applyStaticTranslations();
  applyTheme();

  wireSyncEvents();
  wireChrome();
  wireGates(startApp);

  if (!db.libAvailable()) {
    showGate('connect');
    setText($('connect-error'), t('err.noLib'));
    return;
  }

  if (!db.isConfigured()) {
    showGate('connect');
    return;
  }

  try {
    db.initFromStorage();
    const session = await db.getSession();
    if (session) await startApp(session);
    else showGate('auth');
  } catch (err) {
    showGate('auth');
    setText($('auth-error'), t(db.errorKey(err)));
  }
}

boot();
