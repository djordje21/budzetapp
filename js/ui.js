// UI pomoćnici: donji panel (sheet), potvrda, obaveštenja, animacija brojeva.
import { esc } from './util.js?v=20261107214139';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Toast ----
export function toast(msg, type = 'ok', ms = 2600) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---- Sheet ----
let openCount = 0;
export function openSheet({ title, body, onMount, onClose }) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-handle"></div>
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn sheet-x" aria-label="Zatvori">✕</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>`;
  root.appendChild(wrap);
  openCount++;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      wrap.remove();
      if (--openCount === 0) document.body.classList.remove('no-scroll');
    }, 260);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  wrap.querySelector('.sheet-backdrop').onclick = close;
  wrap.querySelector('.sheet-x').onclick = close;

  const el = wrap.querySelector('.sheet-body');
  onMount?.(el, close);
  return { el, close };
}

export function confirmSheet({ title, text, ok = 'Potvrdi', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title,
      body: `<p class="sheet-text">${text}</p>
        <div class="btn-row">
          <button class="btn btn-ghost" data-a="no">Odustani</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="yes">${esc(ok)}</button>
        </div>`,
      onMount(el, close) {
        el.querySelector('[data-a=no]').onclick = () => { answered = true; resolve(false); close(); };
        el.querySelector('[data-a=yes]').onclick = () => { answered = true; resolve(true); close(); };
      },
      onClose() { if (!answered) resolve(false); },
    });
  });
}

// ---- Brojevi koji "odbroje" do vrednosti ----
const lastValues = new Map();
export function countUp(el, key, to, format) {
  const from = lastValues.has(key) ? lastValues.get(key) : 0;
  lastValues.set(key, to);
  if (reduceMotion() || from === to) {
    el.textContent = format(to);
    return;
  }
  const dur = 650;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Trake napretka: postavi širinu posle iscrtavanja da bi se videla animacija.
export function animateBars(root) {
  const bars = root.querySelectorAll('[data-w]');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bars.forEach((b) => (b.style.width = b.dataset.w + '%'));
  }));
}

export const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : a > 0 ? 100 : 0);
