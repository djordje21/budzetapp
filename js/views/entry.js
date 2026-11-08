// Brzi unos stvarnog troška / prihoda / štednje (i izmena postojećeg unosa).
import * as S from '../store.js?v=20261108053527';
import { openSheet, toast, confirmSheet, moneyInput } from '../ui.js?v=20261108053527';
import { esc, fmt, fmtNum, digitsOnly, todayISO, isoOf } from '../util.js?v=20261108053527';
import { summarize } from '../calc.js?v=20261108053527';
import { suggestCategory } from '../suggest.js?v=20261108053527';

const ICONS = ['📌', '☕', '🍕', '🎬', '✈️', '🐶', '👶', '📚', '💊', '🎮', '🔧', '💇'];
const COLORS = ['#0ea5e9', '#d946ef', '#f97316', '#22c55e', '#6366f1', '#f43f5e', '#14b8a6', '#eab308'];

export function openEntrySheet({ tx = null, kind = 'expense', date = null, categoryId = null, prefill = null } = {}) {
  const st = S.getState();
  const isEdit = !!tx;
  const v = {
    kind: tx?.kind || (categoryId ? S.cat(categoryId).kind : kind),
    categoryId: tx?.categoryId || categoryId || null,
    amount: tx ? String(Math.round(tx.amount)) : prefill?.amount ? String(Math.round(prefill.amount)) : '',
    date: tx?.date || date || todayISO(),
    note: tx?.note || prefill?.note || '',
    by: tx?.by || st.settings.currentUser || 'dj',
    showFixed: false,
    goalId: tx ? tx.goalId || null : prefill?.goalId || null,
    account: tx ? S.accountOf(tx) : prefill?.account || (st.settings.currentUser === 'm' ? 'm' : 'dj'),
    accountPicked: isEdit,
    picked: isEdit || !!categoryId, // korisnik je sam izabrao kategoriju → predlog je ne menja
  };
  if (v.categoryId && S.cat(v.categoryId).fixed) v.showFixed = true;
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return isoOf(d); })();

  const body = `
    <div class="seg seg-3" data-k="kind">
      ${Object.entries(S.KINDS).map(([k, x]) => `<button data-v="${k}">${x.label}</button>`).join('')}
    </div>

    ${isEdit ? '' : '<button class="scan-btn" id="e-scan"><span>📷</span> Skeniraj QR sa računa</button>'}

    <label class="amount-field">
      <input id="e-amount" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="Iznos">
      <span>RSD</span>
    </label>

    <div class="field-label">Gde / napomena</div>
    <input id="e-note" class="input" maxlength="80" autocomplete="off" placeholder="npr. Smokvica, Maxi, NIS pumpa…">
    <div id="e-suggest" class="suggest" hidden></div>

    <div class="field-label">Kategorija</div>
    <div class="cat-grid" id="e-cats"></div>
    <div id="e-newcat" hidden></div>
    <div id="e-goals"></div>

    <div class="field-label">Datum</div>
    <div class="date-row">
      <button class="chip" data-d="${todayISO()}">Danas</button>
      <button class="chip" data-d="${yesterday}">Juče</button>
      <input type="date" id="e-date" class="input input-date">
    </div>

    <div class="field-label">Uneo/la</div>
    <div class="seg seg-2" data-k="by">
      ${S.MEMBERS.map((m) => `<button data-v="${m.id}">${esc(m.name)}</button>`).join('')}
    </div>

    <div class="field-label" id="e-acc-label">Sa računa</div>
    <div class="seg seg-3" data-k="account">
      ${S.ACCOUNTS.map((a) => `<button data-v="${a.id}">${a.id === 'kes' ? '💵 ' : ''}${esc(a.name)}</button>`).join('')}
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
      const sugEl = $('#e-suggest');

      const paintSeg = (k) => el.querySelectorAll(`[data-k="${k}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v[k]));
      const paintDate = () => {
        dateEl.value = v.date;
        el.querySelectorAll('[data-d]').forEach((b) => b.classList.toggle('on', b.dataset.d === v.date));
      };

      const tile = (c) => `
        <button class="cat-pick ${c.id === v.categoryId ? 'on' : ''}" data-c="${c.id}" style="--c:${c.color}">
          <span class="cat-ico">${c.icon}</span><span>${esc(c.name)}</span>
        </button>`;

      const paintCats = () => {
        let cats = S.categoriesOf(v.kind);
        const sel = S.cat(v.categoryId);
        // Jednokratna (sakrivena) kategorija izabrana u ovom unosu ostaje vidljiva.
        if (v.categoryId && sel.archived && sel.kind === v.kind) cats = [...cats, sel];
        if (!cats.some((c) => c.id === v.categoryId)) v.categoryId = null;
        const fixed = cats.filter((c) => c.fixed);
        const main = cats.filter((c) => !c.fixed);
        $('#e-cats').innerHTML =
          main.map(tile).join('') +
          (v.showFixed ? fixed.map(tile).join('') : '') +
          (fixed.length && !v.showFixed ? `<button class="cat-pick cat-more" id="e-fixed"><span class="cat-ico">🧾</span><span>Rate i računi</span></button>` : '') +
          `<button class="cat-pick cat-more" id="e-add"><span class="cat-ico">＋</span><span>Nova kategorija</span></button>`;
        el.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => {
          v.categoryId = b.dataset.c;
          v.picked = true;
          paintCats();
          paintSuggest();
        }));
        $('#e-fixed')?.addEventListener('click', () => { v.showFixed = true; paintCats(); });
        $('#e-add').onclick = openNewCat;
      };

      // ---- Predlog kategorije ----
      let sug = null;
      const paintSuggest = () => {
        if (!sug || sug.categoryId === v.categoryId && v.picked) { sugEl.hidden = true; return; }
        const c = S.cat(sug.categoryId);
        const applied = v.categoryId === sug.categoryId;
        sugEl.hidden = false;
        sugEl.innerHTML = applied
          ? `<span>💡 <b>${esc(c.icon + ' ' + c.name)}</b> — ${esc(sug.reason)}</span>`
          : `<span>💡 Predlog: <b>${esc(c.icon + ' ' + c.name)}</b> — ${esc(sug.reason)}</span><button class="pay-btn" id="e-sug-ok">Primeni</button>`;
        $('#e-sug-ok')?.addEventListener('click', () => { v.categoryId = sug.categoryId; v.picked = true; paintCats(); paintSuggest(); });
      };
      let sugTimer;
      const runSuggest = () => {
        clearTimeout(sugTimer);
        sugTimer = setTimeout(() => {
          sug = suggestCategory(v.note, v.kind);
          // Automatski primeni dok korisnik sam nije birao.
          if (sug && !v.picked) { v.categoryId = sug.categoryId; paintCats(); }
          paintSuggest();
        }, 250);
      };

      // ---- Nova kategorija (jednokratna ili trajna) ----
      function openNewCat() {
        const box = $('#e-newcat');
        const nv = { icon: ICONS[0], keep: true };
        box.hidden = false;
        box.innerHTML = `
          <div class="newcat card">
            <div class="cat-form">
              <input class="input icon-input" id="n-icon" maxlength="4" value="${nv.icon}" aria-label="Ikonica">
              <input class="input grow" id="n-name" maxlength="30" placeholder="Naziv, npr. Đorđe — lično">
            </div>
            <div class="icon-row">${ICONS.map((i) => `<button class="icon-opt" data-i="${i}">${i}</button>`).join('')}</div>
            <div class="seg seg-2 mt" id="n-keep">
              <button data-v="1" class="on">Sačuvaj za ubuduće</button>
              <button data-v="0">Samo ovaj put</button>
            </div>
            <div class="btn-row">
              <button class="btn btn-ghost btn-sm" id="n-cancel">Odustani</button>
              <button class="btn btn-primary btn-sm" id="n-ok">Dodaj</button>
            </div>
          </div>`;
        const nameEl = box.querySelector('#n-name');
        const iconEl = box.querySelector('#n-icon');
        setTimeout(() => nameEl.focus(), 50);
        box.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { iconEl.value = b.dataset.i; }));
        box.querySelectorAll('#n-keep button').forEach((b) => (b.onclick = () => {
          nv.keep = b.dataset.v === '1';
          box.querySelectorAll('#n-keep button').forEach((x) => x.classList.toggle('on', x === b));
        }));
        box.querySelector('#n-cancel').onclick = () => { box.hidden = true; box.innerHTML = ''; };
        box.querySelector('#n-ok').onclick = async () => {
          const name = nameEl.value.trim();
          if (!name) { shake(nameEl); return; }
          const id = 'c-' + Math.random().toString(36).slice(2, 10);
          await S.saveCategory({
            id, kind: v.kind, name,
            icon: iconEl.value.trim() || '📌',
            color: COLORS[S.getState().categories.length % COLORS.length],
            fixed: false,
            archived: !nv.keep, // "samo ovaj put" = sakrivena kategorija, ostaje u istoriji
          });
          v.categoryId = id;
          v.picked = true;
          box.hidden = true;
          box.innerHTML = '';
          paintCats();
          paintSuggest();
          toast(nv.keep ? `Kategorija „${esc(name)}“ dodata` : `„${esc(name)}“ — samo za ovaj unos`, 'ok');
        };
      }

      el.querySelectorAll('.seg[data-k] button').forEach((b) => (b.onclick = () => {
        const k = b.closest('.seg').dataset.k;
        v[k] = b.dataset.v;
        paintSeg(k);
        if (k === 'kind') { v.picked = false; paintCats(); runSuggest(); paintAccLabel(); }
        if (k === 'account') v.accountPicked = true;
        // Ko unosi → podrazumevano njegov račun (dok račun nije ručno izabran).
        if (k === 'by' && !v.accountPicked && v.account !== 'kes') { v.account = v.by; paintSeg('account'); }
      }));
      el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { v.date = b.dataset.d; paintDate(); }));
      dateEl.onchange = () => { if (dateEl.value) { v.date = dateEl.value; paintDate(); } };

      amountEl.value = v.amount ? fmtNum(v.amount) : '';
      moneyInput(amountEl, (d) => (v.amount = d), 10);
      noteEl.value = v.note;
      noteEl.oninput = () => { v.note = noteEl.value; runSuggest(); };

      const paintGoals = () => {
        const box = $('#e-goals');
        const goals = S.goalsOf();
        if (v.kind !== 'saving' || !goals.length) { box.innerHTML = ''; return; }
        box.innerHTML = `<div class="field-label">Za cilj</div><div class="chips wrap">
          <button class="chip ${!v.goalId ? 'on' : ''}" data-g="">Bez cilja</button>
          ${goals.map((g) => `<button class="chip ${v.goalId === g.id ? 'on' : ''}" data-g="${g.id}">${g.icon || '🎯'} ${esc(g.name)}</button>`).join('')}</div>`;
        box.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { v.goalId = b.dataset.g || null; paintGoals(); }));
      };
      el.querySelectorAll('.seg[data-k="kind"] button').forEach((b) => b.addEventListener('click', paintGoals));
      paintGoals();

      function paintAccLabel() { $('#e-acc-label').textContent = v.kind === 'income' ? 'Na račun' : 'Sa računa'; }
      paintAccLabel();
      paintSeg('kind'); paintSeg('by'); paintSeg('account'); paintDate(); paintCats();
      if (v.note && !v.picked) runSuggest(); // npr. naziv prodavnice sa skeniranog računa
      $('#e-scan')?.addEventListener('click', () => {
        close();
        setTimeout(() => import('./scanner.js?v=20261108053527').then((m) => m.openScanner()), 220);
      });
      if (!isEdit) setTimeout(() => amountEl.focus(), 280);

      const save = async (again) => {
        const amount = Number(v.amount);
        if (!amount) { shake(amountEl.parentElement); toast('Upiši iznos', 'warn'); return; }
        if (!v.categoryId) { shake($('#e-cats')); toast('Izaberi kategoriju', 'warn'); return; }
        const data = { kind: v.kind, categoryId: v.categoryId, amount, date: v.date, note: v.note.trim(), by: v.by, account: v.account };
        if (!isEdit && prefill?.planLine) data.planLine = prefill.planLine;
        if (!isEdit && prefill?.createdAt) data.createdAt = prefill.createdAt;
        const g = v.kind === 'saving' && v.goalId ? S.goal(v.goalId) : null;
        if (g) data.goalId = g.id;
        else if (isEdit && tx.goalId) data.goalId = null; // skinuto sa cilja
        const wasDone = g ? S.goalSaved(g) >= g.target : true;
        if (isEdit) await S.updateTransaction(tx.id, data);
        else await S.addTransaction(data);
        feedback(data, isEdit);
        if (g && !wasDone && S.goalSaved(g) >= g.target) {
          import('./goals.js?v=20261108053527').then((m) => m.celebrate());
          setTimeout(() => toast(`🎉 <b>Cilj ostvaren: ${esc(g.name)}!</b>`, 'ok', 4500), 400);
        }
        if (again) {
          v.amount = ''; v.note = ''; v.picked = false; sug = null;
          amountEl.value = ''; noteEl.value = '';
          paintSuggest();
          amountEl.focus();
        } else close();
      };
      $('#e-save').onclick = () => save(false);
      $('#e-more')?.addEventListener('click', () => save(true));
      // Pažnja: handler ne sme da vrati false (to bi odbacilo taster) — zato if, a ne &&.
      amountEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); noteEl.focus(); } });
      noteEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(false); } });
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
