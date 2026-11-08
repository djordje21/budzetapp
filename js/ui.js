// UI pomoćnici: donji panel (sheet), potvrda, obaveštenja, animacija brojeva.
import { esc, fmtNum, digitsOnly } from './util.js?v=20261108082000';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Toast ----
export function toast(msg, type = 'ok', ms = 2600, action = null) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}${action ? ' has-action' : ''}`;
  el.innerHTML = `<span class="toast-msg">${msg}</span>`;
  const hide = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); };
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-btn';
    b.textContent = action.label;
    b.onclick = () => { hide(); action.onClick(); };
    el.appendChild(b);
  }
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(hide, action ? Math.max(ms, 6000) : ms);
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

// Polje za iznos sa tačkama hiljada (2.000). Bezbedno za Android tastature (Samsung, Gboard):
// dok traje "kompozicija" teksta ne diramo vrednost, inače tastatura poništi otkucani broj.
export function moneyInput(inp, onChange, maxLen = 11) {
  let composing = false;
  const format = () => {
    const d = digitsOnly(inp.value).slice(0, maxLen);
    const f = d ? fmtNum(d) : '';
    if (inp.value !== f) {
      inp.value = f;
      try { inp.setSelectionRange(f.length, f.length); } catch {}
    }
    onChange(d);
  };
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('autocorrect', 'off');
  inp.setAttribute('spellcheck', 'false');
  inp.addEventListener('compositionstart', () => { composing = true; });
  inp.addEventListener('compositionend', () => { composing = false; format(); });
  inp.addEventListener('input', (e) => {
    if (composing || e.isComposing) { onChange(digitsOnly(inp.value).slice(0, maxLen)); return; }
    format();
  });
  inp.addEventListener('blur', format);
}
