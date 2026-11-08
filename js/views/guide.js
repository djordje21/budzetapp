// Vodič za prvi put: 4 koraka koji se sami čekiraju.
import * as S from '../store.js?v=20261108120001';
import { openPlanItemSheet } from './plan.js?v=20261108120001';
import { openEntrySheet } from './entry.js?v=20261108120001';
import { openAccounts } from './accounts.js?v=20261108120001';

const HIDE_KEY = 'budzet_guide_hidden';
const hidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

function steps(key) {
  const st = S.getState();
  const plan = S.planOf(key);
  const kindOf = (p) => S.cat(p.categoryId).kind;
  return [
    { id: 'inc', done: plan.some((p) => kindOf(p) === 'income'), title: 'Upišite prihode', text: 'Plate i ostalo što očekujete ovog meseca.' },
    { id: 'exp', done: plan.some((p) => kindOf(p) === 'expense'), title: 'Napravite plan troškova', text: 'Računi, rate, hrana, gorivo — koliko planirate da potrošite.' },
    { id: 'tx', done: st.transactions.length > 0, title: 'Unesite prvi trošak', text: 'Kad nešto platite, dodirnite veliko dugme + dole.' },
    { id: 'acc', done: (st.balanceChecks || []).length > 0, title: 'Upišite stanje na računima', text: 'Koliko imate na računima i u kešu (nije obavezno).' },
  ];
}

export function guideBlock(key) {
  if (hidden()) return '';
  const list = steps(key);
  if (list.every((s) => s.done)) return '';
  const n = list.filter((s) => s.done).length;
  return `<section class="card guide">
    <div class="guide-head"><b>👋 Kako da počnete</b><span class="muted small">${n} od ${list.length}</span></div>
    <p class="guide-intro">Ideja je jednostavna: <b>plan</b> je koliko očekujete da zaradite i potrošite ovog meseca, a onda <b>unosite stvarne troškove</b> i aplikacija pokazuje da li ste u planu.</p>
    ${list.map((s, i) => `<button class="guide-step ${s.done ? 'done' : ''}" data-step="${s.id}">
      <span class="gs-num">${s.done ? '✓' : i + 1}</span>
      <span class="grow"><b>${s.title}</b><br><span class="muted small">${s.text}</span></span>
      ${s.done ? '' : '<span class="chev">›</span>'}
    </button>`).join('')}
    <button class="guide-hide" id="guide-hide">Sakrij vodič</button>
  </section>`;
}

export function bindGuide(el, key) {
  el.querySelector('[data-step="inc"]')?.addEventListener('click', () => openPlanItemSheet(key, null, 'income'));
  el.querySelector('[data-step="exp"]')?.addEventListener('click', () => (location.hash = '#/plan'));
  el.querySelector('[data-step="tx"]')?.addEventListener('click', () => openEntrySheet());
  el.querySelector('[data-step="acc"]')?.addEventListener('click', () => openAccounts());
  el.querySelector('#guide-hide')?.addEventListener('click', () => {
    try { localStorage.setItem(HIDE_KEY, '1'); } catch {}
    el.querySelector('.guide')?.remove();
  });
}
