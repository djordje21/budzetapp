// Brzi unos stvarnog troška / prihoda / štednje (i izmena postojećeg unosa).
import * as S from '../store.js';
import { openSheet, toast, confirmSheet } from '../ui.js';
import { esc, fmt, fmtNum, digitsOnly, todayISO, isoOf } from '../util.js';
import { summarize } from '../calc.js';

export function openEntrySheet({ tx = null, kind = 'expense', date = null } = {}) {
  const st = S.getState();
  const isEdit = !!tx;
  const v = {
    kind: tx?.kind || kind,
    categoryId: tx?.categoryId || null,
    amount: tx ? String(Math.round(tx.amount)) : '',
    date: tx?.date || date || todayISO(),
    note: tx?.note || '',
    by: tx?.by || st.settings.currentUser || 'dj',
  };
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return isoOf(d); })();

  const body = `
    <div class="seg seg-3" data-k="kind">
      ${Object.entries(S.KINDS).map(([k, x]) => `<button data-v="${k}">${x.label}</button>`).join('')}
    </div>

    <label class="amount-field">
      <input id="e-amount" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="Iznos">
      <span>RSD</span>
    </label>

    <div class="field-label">Kategorija</div>
    <div class="cat-grid" id="e-cats"></div>

    <div class="field-label">Datum</div>
    <div class="date-row">
      <button class="chip" data-d="${todayISO()}">Danas</button>
      <button class="chip" data-d="${yesterday}">Juče</button>
      <input type="date" id="e-date" class="input input-date">
    </div>

    <div class="field-label">Napomena <span class="muted">(opciono)</span></div>
    <input id="e-note" class="input" maxlength="80" placeholder="npr. Maxi, pijaca, servis...">

    <div class="field-label">Uneo/la</div>
    <div class="seg seg-2" data-k="by">
      ${S.MEMBERS.map((m) => `<button data-v="${m.id}">${esc(m.name)}</button>`).join('')}
    </div>

    <div class="btn-row sticky-actions">
      ${isEdit ? '<button class="btn btn-ghost btn-danger-text" id="e-del">Obriši</button>' : '<button class="btn btn-ghost" id="e-more">Sačuvaj i još</button>'}
      <button class="btn btn-primary" id="e-save">${isEdit ? 'Sačuvaj izmene' : 'Sačuvaj'}</button>
    </div>`;

  openSheet({
    title: isEdit ? 'Izmena unosa' : 'Novi unos',
    body,
    onMount(el, close) {
      const $ = (s) => el.querySelector(s);
      const amountEl = $('#e-amount');
      const dateEl = $('#e-date');
      const noteEl = $('#e-note');

      const paintSeg = (k) => el.querySelectorAll(`[data-k="${k}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v[k]));
      const paintDate = () => {
        dateEl.value = v.date;
        el.querySelectorAll('[data-d]').forEach((b) => b.classList.toggle('on', b.dataset.d === v.date));
      };
      const paintCats = () => {
        const cats = S.categoriesOf(v.kind);
        if (!cats.some((c) => c.id === v.categoryId)) v.categoryId = null;
        $('#e-cats').innerHTML = cats.map((c) => `
          <button class="cat-pick ${c.id === v.categoryId ? 'on' : ''}" data-c="${c.id}" style="--c:${c.color}">
            <span class="cat-ico">${c.icon}</span><span>${esc(c.name)}</span>
          </button>`).join('');
        el.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { v.categoryId = b.dataset.c; paintCats(); }));
      };

      el.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => {
        const k = b.closest('.seg').dataset.k;
        v[k] = b.dataset.v;
        paintSeg(k);
        if (k === 'kind') paintCats();
      }));
      el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { v.date = b.dataset.d; paintDate(); }));
      dateEl.onchange = () => { if (dateEl.value) { v.date = dateEl.value; paintDate(); } };

      amountEl.value = v.amount ? fmtNum(v.amount) : '';
      amountEl.oninput = () => {
        v.amount = digitsOnly(amountEl.value).slice(0, 10);
        amountEl.value = v.amount ? fmtNum(v.amount) : '';
      };
      noteEl.value = v.note;
      noteEl.oninput = () => (v.note = noteEl.value);

      paintSeg('kind'); paintSeg('by'); paintDate(); paintCats();
      if (!isEdit) setTimeout(() => amountEl.focus(), 280);

      const save = async (again) => {
        const amount = Number(v.amount);
        if (!amount) { shake(amountEl.parentElement); toast('Upiši iznos', 'warn'); return; }
        if (!v.categoryId) { shake($('#e-cats')); toast('Izaberi kategoriju', 'warn'); return; }
        const data = { kind: v.kind, categoryId: v.categoryId, amount, date: v.date, note: v.note.trim(), by: v.by };
        if (isEdit) await S.updateTransaction(tx.id, data);
        else await S.addTransaction(data);
        feedback(data, isEdit);
        if (again) {
          v.amount = ''; v.note = '';
          amountEl.value = ''; noteEl.value = '';
          amountEl.focus();
        } else close();
      };
      $('#e-save').onclick = () => save(false);
      $('#e-more')?.addEventListener('click', () => save(true));
      amountEl.onkeydown = (e) => e.key === 'Enter' && save(false);
      $('#e-del')?.addEventListener('click', async () => {
        if (await confirmSheet({ title: 'Obriši unos?', text: `${esc(S.cat(tx.categoryId).name)} · ${fmt(tx.amount)}`, ok: 'Obriši', danger: true })) {
          await S.deleteTransaction(tx.id);
          toast('Unos obrisan', 'ok');
          close();
        }
      });
    },
  });
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

// Poruka posle unosa — uz upozorenje ako je kategorija prešla plan.
function feedback(data, isEdit) {
  const c = S.cat(data.categoryId);
  const sign = data.kind === 'income' ? '+' : '−';
  let msg = `<b>${isEdit ? 'Izmenjeno' : 'Uneto'}</b> ${c.icon} ${esc(c.name)} ${sign}${fmtNum(data.amount)}`;
  let type = 'ok';
  if (data.kind === 'expense') {
    const r = summarize(data.date.slice(0, 7)).cats.find((x) => x.cat.id === c.id);
    if (r && r.plan > 0) {
      const left = r.plan - r.actual;
      if (left < 0) { msg += `<br><small>Prešli ste plan za ${esc(c.name)} za ${fmt(-left)}.</small>`; type = 'warn'; }
      else if (left / r.plan < 0.15) { msg += `<br><small>Ostalo još ${fmt(left)} od plana.</small>`; type = 'warn'; }
      else msg += `<br><small>Ostalo ${fmt(left)} od plana.</small>`;
    }
  }
  toast(msg, type, 3200);
}
