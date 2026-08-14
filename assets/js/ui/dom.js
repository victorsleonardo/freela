/* Utilitários de DOM.
 *
 * `esc()` é a peça mais importante do arquivo: praticamente toda a interface é
 * montada com template string + innerHTML, e antes só o caminho de importação
 * de backup era saneado. Qualquer texto que venha de fora (nuvem, backup,
 * digitação) passa por aqui antes de virar HTML. */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export const $ = (id) => document.getElementById(id);
export const qs = (sel, root) => (root || document).querySelector(sel);
export const qsa = (sel, root) => [...(root || document).querySelectorAll(sel)];

export function on(target, event, handler, opts) {
  if (!target) return;
  target.addEventListener(event, handler, opts);
}

/**
 * Delegação de evento: um listener no container em vez de um por linha.
 * A lista de lançamentos re-anexava dezenas de listeners a cada render.
 */
export function delegate(root, event, selector, handler) {
  if (!root) return;
  root.addEventListener(event, (ev) => {
    const match = ev.target.closest(selector);
    if (match && root.contains(match)) handler(ev, match);
  });
}

export function setHTML(el, html) {
  if (el) el.innerHTML = html;
}

export function setText(el, text) {
  if (el) el.textContent = text;
}

export function show(el, visible) {
  if (el) el.style.display = visible ? '' : 'none';
}

export function toggleClass(el, cls, cond) {
  if (el) el.classList.toggle(cls, Boolean(cond));
}

/** Debounce simples — usado no filtro de ano, que disparava a cada tecla. */
export function debounce(fn, wait) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Um único rAF por chave: evita render duplicado no mesmo frame. */
const frames = new Map();
export function scheduleFrame(key, fn) {
  if (frames.has(key)) cancelAnimationFrame(frames.get(key));
  frames.set(key, requestAnimationFrame(() => {
    frames.delete(key);
    fn();
  }));
}

export function focusTrap(container) {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function handle(ev) {
    if (ev.key !== 'Tab') return;
    const items = qsa(selector, container).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }
  container.addEventListener('keydown', handle);
  return () => container.removeEventListener('keydown', handle);
}
