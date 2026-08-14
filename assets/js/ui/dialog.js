/* Diálogos do próprio app, no lugar de alert()/confirm() nativos — que travam
   a aba, ignoram o tema e ficam feios num app instalado na tela inicial. */

import { esc, focusTrap } from './dom.js';
import { t } from '../i18n.js';

function build({ title, message, confirmLabel, cancelLabel, danger, kind }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop open dialog-backdrop';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="glass modal-box dialog-box">
      <h3 class="dialog-title">${esc(title || t('dialog.attention'))}</h3>
      <p class="dialog-msg">${esc(message)}</p>
      <div class="dialog-actions">
        ${kind === 'confirm' ? `<button type="button" class="secondary dialog-cancel">${esc(cancelLabel || t('dialog.cancel'))}</button>` : ''}
        <button type="button" class="dialog-ok ${danger ? 'danger' : ''}">${esc(confirmLabel || (kind === 'confirm' ? t('dialog.confirm') : t('dialog.ok')))}</button>
      </div>
    </div>`;
  return wrap;
}

function present(opts) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const wrap = build(opts);
    document.body.appendChild(wrap);
    const releaseTrap = focusTrap(wrap);

    function close(result) {
      releaseTrap();
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    }
    function onKey(ev) {
      if (ev.key === 'Escape') close(false);
      if (ev.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'BUTTON') {
        close(true);
      }
    }

    wrap.querySelector('.dialog-ok').addEventListener('click', () => close(true));
    const cancel = wrap.querySelector('.dialog-cancel');
    if (cancel) cancel.addEventListener('click', () => close(false));
    wrap.addEventListener('click', (ev) => {
      if (ev.target === wrap) close(false);
    });
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => {
      const target = wrap.querySelector(opts.kind === 'confirm' && opts.danger ? '.dialog-cancel' : '.dialog-ok');
      if (target) target.focus();
    });
  });
}

export function confirmDialog(message, opts) {
  return present({ ...(opts || {}), message, kind: 'confirm' });
}

export function alertDialog(message, opts) {
  return present({ ...(opts || {}), message, kind: 'alert' });
}
