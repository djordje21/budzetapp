// Brzi unos troška za stavku/kategoriju iz plana: samo iznos (i po želji "gde").
import * as S from '../store.js?v=20261108082000';
import { summarize } from '../calc.js?v=20261108082000';
import { esc, fmt, fmtNum, todayISO, currentMonthKey } from '../util.js?v=20261108082000';
import { openSheet, toast, moneyInput, pct, animateBars } from '../ui.js?v=20261108082000';
import { openEntrySheet } from './entry.js?v=20261108082000';

export function openQuickEntry({ categoryId, name = null, key = currentMonthKey() }) {
  const c = S.cat(categoryId);
  const title = name || c.name;
  const st = () => summarize(key).cats.find((x) => x.cat.id === categoryId) || { plan: 0, actual: 0 };
  const r = st();
  const left = r.plan - r.actual;
  const me = S.getState().settings.currentUser || 'dj';
  const date = key === currentMonthKey() ? todayISO() : `${key}-01`;
  const chips = r.plan >= 30000 ? [1000, 2000, 5000, 10000] : r.plan >= 8000 ? [500, 1000, 2000, 5000] : [200, 500, 1000, 2000];
  const v = { amount: '' };

  openSheet({
    title,
    body: `
      <div class="q-head">
        <span class="cat-ico" style="--c:${c.color}">${c.icon}</span>
        <div class="grow">
          ${r.plan ? `<div class="q-left ${left < 0 ? 't-red' : ''}">${left >= 0 ? `Ostalo <b>${fmtNum(left)}</b>` : `Preko plana <b>${fmtNum(-left)}</b>`}</div>
          <div class="cd-sub">plan ${fmtNum(r.plan)} · potrošeno ${fmtNum(r.actual)}</div>` : `<div class="cd-sub">${esc(c.name)} · nije u planu</div>`}
        </div>
      </div>
      ${r.plan ? `<div class="bar bar-sm mt"><div class="bar-fill ${left < 0 ? 'is-over' : ''}" style="--c:${c.color}" data-w="${pct(r.actual, r.plan)}"></div></div>` : ''}

      <label class="amount-field"><input id="q-amount" inputmode="numeric" placeholder="0" aria-label="Iznos"><span>RSD</span></label>
      <div class="q-chips">${chips.map((n) => `<button class="chip" data-n="${n}">${fmtNum(n)}</button>`).join('')}</div>

      <input class="input mt" id="q-note" maxlength="80" placeholder="Gde? (opciono)">
      <p class="q-after muted small" id="q-after"></p>

      <div class="btn-row sticky-actions">
        <button class="btn btn-ghost" id="q-more">Više opcija</button>
        <button class="btn btn-primary" id="q-save">Unesi</button>
      </div>`,
    onMount(el, close) {
      animateBars(el);
      const inp = el.querySelector('#q-amount');
      const note = el.querySelector('#q-note');
      const after = el.querySelector('#q-after');
      const paintAfter = () => {
        const n = Number(v.amount);
        if (!n || !r.plan) { after.textContent = ''; return; }
        const rest = left - n;
        after.innerHTML = rest >= 0 ? `Posle unosa ostaje <b>${fmtNum(rest)}</b> od plana.` : `<span class="t-red">Posle unosa: ${fmtNum(-rest)} preko plana.</span>`;
      };
      moneyInput(inp, (d) => { v.amount = d; paintAfter(); }, 10);
      setTimeout(() => inp.focus(), 280);
      el.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => {
        v.amount = b.dataset.n;
        inp.value = fmtNum(v.amount);
        paintAfter();
      }));

      const save = async () => {
        const amount = Number(v.amount);
        if (!amount) { toast('Upiši iznos', 'warn'); inp.focus(); return; }
        await S.addTransaction({ kind: c.kind, categoryId, amount, date, note: note.value.trim() || (name && name !== c.name ? name : ''), by: me, account: me });
        close();
        const now = st();
        const l = now.plan - now.actual;
        toast(`<b>✓ ${esc(title)}</b> −${fmtNum(amount)}${now.plan ? `<br><small>${l >= 0 ? `Ostalo ${fmt(l)}` : `Preko plana ${fmt(-l)}`}</small>` : ''}`, l < 0 ? 'warn' : 'ok', 3200);
      };
      el.querySelector('#q-save').onclick = save;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      el.querySelector('#q-more').onclick = () => {
        close();
        setTimeout(() => openEntrySheet({ categoryId, date: date === todayISO() ? null : date, prefill: { amount: v.amount || null, note: note.value.trim() || (name && name !== c.name ? name : '') } }), 220);
      };
    },
  });
}
