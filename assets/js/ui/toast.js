/* Toasts com região aria-live: leitor de tela também recebe o aviso. */

import { $ } from './dom.js';

export function showToast(message, opts) {
  const options = opts || {};
  const duration = options.duration || 3200;
  const container = $('toast-container');
  if (!container) return () => {};

  const toast = document.createElement('div');
  toast.className = 'toast' + (options.tone ? ' tone-' + options.tone : '');
  toast.setAttribute('role', options.tone === 'error' ? 'alert' : 'status');

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  let dismissed = false;
  let timer = null;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 220);
  }

  if (options.actionLabel && options.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = options.actionLabel;
    btn.addEventListener('click', () => {
      options.onAction();
      dismiss();
    });
    toast.appendChild(btn);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'OK');
  close.innerHTML = '&times;';
  close.addEventListener('click', dismiss);
  toast.appendChild(close);

  container.appendChild(toast);
  timer = setTimeout(dismiss, duration);
  return dismiss;
}
