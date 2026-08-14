/* Service worker + convite de instalação do PWA. */

import { $, on, show } from './dom.js';
import { t } from '../i18n.js';
import { showToast } from './toast.js';

let deferredPrompt = null;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// não tem service worker; o app precisa ser servido por http(s).
  if (location.protocol === 'file:') return;

  // Guardado ANTES do register: `clients.claim()` na primeira visita dispara
  // controllerchange, e sem isso o app se recarregava sozinho logo na abertura.
  const hadController = Boolean(navigator.serviceWorker.controller);

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });

      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // Só avisa quando havia uma versão anterior: na primeira visita não
          // existe "atualização", existe instalação.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            showToast(t('toast.updateReady'), {
              duration: 15000,
              actionLabel: t('toast.updateNow'),
              onAction: () => {
                sw.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || refreshing) return; // primeira visita não recarrega
        refreshing = true;
        window.location.reload();
      });
    } catch (_) {
      /* sem SW o app continua funcionando, só perde o offline */
    }
  });
}

export function wireInstallPrompt() {
  const btn = $('btn-install');
  show(btn, false);

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferredPrompt = ev;
    show(btn, true);
  });

  on(btn, 'click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    show(btn, false);
    if (choice && choice.outcome === 'accepted') showToast(t('toast.installed'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    show(btn, false);
  });
}
