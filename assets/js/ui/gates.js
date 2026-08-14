/* Telas de porta: conectar ao projeto Supabase e entrar na conta. */

import { $, on, setText, show } from './dom.js';
import { t } from '../i18n.js';
import {
  initClient, storeConfig, clearConfig, validateConfig,
  signIn, signUp, resetPassword, getSession, errorKey, libAvailable
} from '../db.js';

let authMode = 'signin';
let onReady = () => {};

export function showGate(which) {
  show($('gate-connect'), which === 'connect');
  show($('gate-auth'), which === 'auth');
  show($('app-shell'), which === 'app');
  if (which === 'connect') {
    const el = $('cfg-url');
    if (el) setTimeout(() => el.focus(), 50);
  } else if (which === 'auth') {
    const el = $('auth-email');
    if (el) setTimeout(() => el.focus(), 50);
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const signin = mode === 'signin';
  setText($('auth-title'), t(signin ? 'gate.auth.signin' : 'gate.auth.signup'));
  setText($('btn-auth-submit'), t(signin ? 'gate.auth.signin' : 'gate.auth.signup'));
  setText($('auth-switch-text'), t(signin ? 'gate.auth.noAccount' : 'gate.auth.hasAccount'));
  setText($('auth-switch-link'), t(signin ? 'gate.auth.signup' : 'gate.auth.signin'));
  setText($('auth-error'), '');
  const pass = $('auth-pass');
  if (pass) pass.setAttribute('autocomplete', signin ? 'current-password' : 'new-password');
}

function busy(button, isBusy) {
  if (!button) return;
  button.disabled = isBusy;
  button.classList.toggle('busy', isBusy);
}

export function wireGates(readyCallback) {
  onReady = readyCallback;
  setAuthMode('signin');

  on($('btn-connect'), 'click', async () => {
    const url = $('cfg-url').value.trim().replace(/\/+$/, '');
    const key = $('cfg-key').value.trim();
    const err = $('connect-error');
    setText(err, '');

    const problem = validateConfig(url, key);
    if (problem) {
      setText(err, t(problem));
      return;
    }
    if (!libAvailable()) {
      setText(err, t('err.noLib'));
      return;
    }

    busy($('btn-connect'), true);
    try {
      initClient(url, key);
      await getSession(); // falha limpa se a URL/chave não prestarem
      storeConfig(url, key);
      showGate('auth');
    } catch (e) {
      setText(err, t('gate.connect.fail'));
    } finally {
      busy($('btn-connect'), false);
    }
  });

  on($('auth-switch-link'), 'click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));

  on($('btn-auth-submit'), 'click', async () => {
    const email = $('auth-email').value.trim();
    const pass = $('auth-pass').value;
    const err = $('auth-error');
    setText(err, '');

    if (!email || !pass) {
      setText(err, t('gate.auth.empty'));
      return;
    }
    if (pass.length < 6) {
      setText(err, t('gate.auth.shortPass'));
      return;
    }

    busy($('btn-auth-submit'), true);
    try {
      if (authMode === 'signin') {
        const session = await signIn(email, pass);
        await onReady(session);
      } else {
        const session = await signUp(email, pass);
        if (session) await onReady(session);
        else setText(err, t('gate.auth.confirmEmail'));
      }
    } catch (e) {
      const key = errorKey(e);
      setText(err, key === 'err.server' ? (e.message || t('gate.auth.fail')) : t(key));
    } finally {
      busy($('btn-auth-submit'), false);
    }
  });

  ['auth-email', 'auth-pass'].forEach((id) => {
    on($(id), 'keydown', (ev) => {
      if (ev.key === 'Enter') $('btn-auth-submit').click();
    });
  });
  ['cfg-url', 'cfg-key'].forEach((id) => {
    on($(id), 'keydown', (ev) => {
      if (ev.key === 'Enter') $('btn-connect').click();
    });
  });

  on($('btn-forgot'), 'click', async () => {
    const email = $('auth-email').value.trim();
    const err = $('auth-error');
    if (!email) {
      setText(err, t('gate.auth.resetNeedEmail'));
      return;
    }
    try {
      await resetPassword(email);
    } catch (_) {
      /* resposta idêntica com ou sem conta: não revela quem tem cadastro */
    }
    setText(err, t('gate.auth.resetSent'));
  });

  on($('btn-reconfigure'), 'click', () => {
    clearConfig();
    $('cfg-url').value = '';
    $('cfg-key').value = '';
    showGate('connect');
  });
}
