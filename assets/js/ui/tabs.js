/* Navegação entre abas (topo no desktop, barra inferior no celular). */

import { qsa, $ } from './dom.js';

export const TABS = ['resumo', 'calendario', 'lancamentos', 'parametros', 'objetivos', 'config'];

let current = 'resumo';

export function currentTab() {
  return current;
}

export function switchTab(tabName, opts) {
  if (!TABS.includes(tabName)) return;
  current = tabName;
  qsa('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  qsa('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tabName ? 'true' : 'false'));
  qsa('.bn-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  qsa('.panel').forEach((p) => p.classList.remove('active'));
  const panel = $('panel-' + tabName);
  if (panel) panel.classList.add('active');
  if (!opts || opts.scroll !== false) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'auto' : 'auto' });

  const url = new URL(window.location.href);
  url.searchParams.set('aba', tabName);
  window.history.replaceState({}, '', url);
}

export function wireTabs() {
  qsa('.tab, .bn-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
