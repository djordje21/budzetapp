// Stanje na računima: Đorđe (OTP), Maksijana (OTP), Keš i zbir.
import * as S from '../store.js?v=20261108090443';
import * as Sync from '../sync.js?v=20261108090443';
import { esc, fmt, fmtNum, digitsOnly, todayISO, dayLabel, currentMonthKey, daysInMonth } from '../util.js?v=20261108090443';
import { openEntrySheet } from './entry.js?v=20261108090443';
import { openSheet, toast, confirmSheet, countUp, moneyInput, dateInputHTML, syncDateShow } from '../ui.js?v=20261108090443';

const signed = (n) => (n < 0 ? '−' : '') + fmtNum(Math.abs(n));

function ago(iso) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  if (days <= 0) return 'danas';
  if (days === 1) return 'juče';
  return `pre ${days} ${days < 5 ? 'dana' : 'dana'}`;
}

export function totals() {
  const rows = S.ACCOUNTS.map((a) => ({ a, b: S.balanceOf(a.id) }));
  const known = rows.filter((r) => r.b);
  return { rows, total: known.reduce((s, r) => s + r.b.amount, 0), known: known.length };
}

// ---- Kartica na Pregledu ----
export function accountsBlock() {
  const { rows, total, known } = totals();
  const warn = Sync.enabled && !Sync.isAvailable('accounts')
    ? '<div class="hint hint-warn">Stanja se za sada čuvaju samo na ovom telefonu. Za zajedničko čuvanje pokreni SQL iz <b>supabase/migrations/004_accounts.sql</b>.</div>' : '';
  if (!known) {
    return `${warn}<button class="card acc-empty" data-acc-open>
      <span class="acc-empty-ico">🏦</span>
      <span class="grow"><b>Stanje na računima</b><br><span class="muted small">Upiši koliko imate na računima i u kešu — dalje se računa samo.</span></span>
      <span class="chev">›</span></button>`;
  }
  return `${warn}<button class="card acc-card" data-acc-open>
    <div class="acc-head"><span>Ukupno na računima</span><span class="chev">›</span></div>
    <div class="acc-total ${total < 0 ? 't-red' : ''}" id="acc-total">${fmt(total)}</div>
    ${accountWarnings().map((w) => `<div class="acc-warn">${w}</div>`).join('')}
    <div class="acc-rows">
      ${rows.map(({ a, b }) => `<div class="acc-row">
        <i style="background:${a.color}"></i><span>${esc(a.name)}</span>
        <b class="${b && b.amount < 0 ? 't-red' : ''}">${b ? signed(b.amount) : '—'}</b>
      </div>`).join('')}
    </div>
  </button>`;
}

export function bindAccounts(el) {
  el.querySelectorAll('[data-acc-open]').forEach((b) => (b.onclick = () => openAccounts()));
  const t = el.querySelector('#acc-total');
  if (t) countUp(t, 'acc-total', totals().total, (n) => fmt(n));
}

// ---- Pregled svih računa ----
export function openAccounts() {
  const { rows, total, known } = totals();
  const transfers = [...(S.getState().transfers || [])].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6);
  openSheet({
    title: 'Stanje na računima',
    body: `
      ${known ? `<div class="acc-sheet-total"><span>Ukupno</span><b class="${total < 0 ? 't-red' : ''}">${fmt(total)}</b></div>` : ''}
      <section class="list">
        ${rows.map(({ a, b }) => `
          <div class="acc-item">
            <span class="cat-ico" style="--c:${a.color}">${a.icon}</span>
            <div class="grow">
              <div class="acc-item-top"><b>${esc(a.name)}</b><span class="muted small">${esc(a.bank)}</span></div>
              <div class="acc-item-amt ${b && b.amount < 0 ? 't-red' : ''}">${b ? fmt(b.amount) : 'stanje nije upisano'}</div>
              ${b ? `<div class="muted small">Upisano ${ago(b.check.at)}: ${signed(b.check.amount)}${b.count ? ` · ${b.delta >= 0 ? '+' : '−'}${fmtNum(Math.abs(b.delta))} iz ${b.count} ${b.count === 1 ? 'unosa' : 'unosa'}` : ''}</div>` : ''}
            </div>
            <button class="pay-btn" data-check="${a.id}">${b ? 'Proveri' : 'Upiši'}</button>
          </div>`).join('')}
      </section>
      <p class="muted small mt">Stanje je procena: poslednje upisano stanje iz OTP aplikacije + unosi posle toga. Kad pogledaš OTP aplikaciju, dodirni <b>Proveri</b> i upiši tačan iznos — videćeš da li je nešto promaklo.</p>

      <div class="cd-actions" style="grid-template-columns:1fr">
        <button class="btn btn-soft btn-sm" id="acc-transfer">⇄ Prebaci između računa (npr. bankomat)</button>
      </div>

      ${transfers.length ? `<div class="field-label">Poslednja prebacivanja</div>
      <section class="list">${transfers.map((x) => `
        <div class="tx-row">
          <span class="cat-ico" style="--c:#64748b">⇄</span>
          <span class="tx-main"><span class="tx-title">${esc(S.account(x.from).name)} → ${esc(S.account(x.to).name)}</span>
            <span class="tx-sub">${dayLabel(x.date)}${x.note ? ' · ' + esc(x.note) : ''}</span></span>
          <span class="tx-amt">${fmtNum(x.amount)}</span>
          <button class="icon-btn" data-tr-del="${x.id}" aria-label="Obriši">✕</button>
        </div>`).join('')}</section>` : ''}`,
    onMount(el, close) {
      const then = (fn) => () => { close(); setTimeout(fn, 200); };
      el.querySelectorAll('[data-check]').forEach((b) => (b.onclick = then(() => openCheckForm(b.dataset.check))));
      el.querySelector('#acc-transfer').onclick = then(() => openTransferForm({ to: 'kes' }));
      el.querySelectorAll('[data-tr-del]').forEach((b) => (b.onclick = async () => {
        if (!(await confirmSheet({ title: 'Obriši prebacivanje?', text: 'Stanja računa će se preračunati.', ok: 'Obriši', danger: true }))) return;
        await S.deleteTransfer(b.dataset.trDel);
        toast('Prebacivanje obrisano', 'ok');
        close();
      }));
    },
  });
}

// ---- Upis tačnog stanja ----
export function openCheckForm(accId) {
  const a = S.account(accId);
  const est = S.balanceOf(accId);
  const v = { amount: '', minus: false };
  openSheet({
    title: `${a.name} · tačno stanje`,
    body: `
      <p class="sheet-text">Otvori ${a.id === 'kes' ? 'novčanik' : 'OTP aplikaciju'} i upiši koliko trenutno ${a.id === 'kes' ? 'imaš u kešu' : 'piše na računu'}.</p>
      ${est ? `<div class="dd-meta"><div><span>Procena aplikacije</span><span><b>${fmt(est.amount)}</b></span></div></div>` : ''}
      <label class="amount-field"><input id="c-amount" inputmode="numeric" placeholder="0" aria-label="Stanje"><span>RSD</span></label>
      ${a.id !== 'kes' ? '<label class="check"><input type="checkbox" id="c-minus"><span>Račun je u minusu (dozvoljeni minus)</span></label>' : ''}
      <div class="btn-row sticky-actions"><button class="btn btn-primary" id="c-save">Sačuvaj stanje</button></div>`,
    onMount(el, close) {
      const inp = el.querySelector('#c-amount');
      moneyInput(inp, (d) => (v.amount = d));
      setTimeout(() => inp.focus(), 280);
      el.querySelector('#c-save').onclick = async () => {
        if (v.amount === '') { toast('Upiši stanje (može i 0)', 'warn'); return; }
        const amount = Number(v.amount) * (el.querySelector('#c-minus')?.checked ? -1 : 1);
        const chk = await S.addBalanceCheck(accId, amount);
        close();
        if (!est) { toast(`✅ Stanje upisano: ${esc(a.name)} ${signed(amount)}`, 'ok'); return; }
        const diff = amount - est.amount;
        if (Math.abs(diff) < 1) { toast('✅ Tačno se poklapa sa procenom. Sve je uneto!', 'ok', 3500); return; }
        setTimeout(() => openDiffSheet(a, chk, diff), 260);
      };
    },
  });
}

// ---- Prebacivanje između računa ----
export function openTransferForm({ amount = '', tr = null, to = null } = {}) {
  const me = S.getState().settings.currentUser || 'dj';
  const v = tr
    ? { from: tr.from, to: tr.to, amount: String(Math.round(tr.amount)), date: tr.date }
    : { from: me, to: to || (me === 'm' ? 'dj' : 'm'), amount: amount || '', date: todayISO() };
  const seg = (k) => `<div class="seg seg-3" data-k="${k}">${S.ACCOUNTS.map((a) => `<button data-v="${a.id}">${esc(a.name)}</button>`).join('')}</div>`;
  openSheet({
    title: tr ? 'Izmena prebacivanja' : 'Prebaci između računa',
    body: `
      <label class="amount-field"><input id="t-amount" inputmode="numeric" placeholder="0" aria-label="Iznos"><span>RSD</span></label>
      <div class="field-label">Sa računa</div>${seg('from')}
      <div class="field-label">Na račun</div>${seg('to')}
      <div class="field-label">Napomena <span class="muted">(opciono)</span></div>
      <input class="input" id="t-note" maxlength="60" placeholder="npr. Bankomat">
      <div class="field-label">Datum</div>
      ${dateInputHTML('t-date', v.date)}
      <p class="muted small mt">Prebacivanje nije trošak — ne ulazi u plan ni u izveštaje, samo menja stanje računa.</p>
      <div class="btn-row sticky-actions">${tr ? '<button class="btn btn-ghost btn-danger-text" id="t-del">Obriši</button>' : ''}<button class="btn btn-primary" id="t-save">${tr ? 'Sačuvaj izmene' : 'Prebaci'}</button></div>`,
    onMount(el, close) {
      const paint = () => ['from', 'to'].forEach((k) => el.querySelectorAll(`[data-k="${k}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v[k])));
      el.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { v[b.closest('.seg').dataset.k] = b.dataset.v; paint(); }));
      paint();
      const inp = el.querySelector('#t-amount');
      moneyInput(inp, (d) => (v.amount = d));
      el.querySelector('#t-date').addEventListener('change', () => syncDateShow(el, 't-date'));
      if (v.amount) inp.value = fmtNum(v.amount);
      if (tr) el.querySelector('#t-note').value = tr.note || '';
      el.querySelector('#t-del')?.addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Obriši prebacivanje?', text: 'Stanja računa će se preračunati.', ok: 'Obriši', danger: true }))) return;
        await S.deleteTransfer(tr.id);
        toast('Prebacivanje obrisano', 'ok');
        close();
      });
      setTimeout(() => inp.focus(), 280);
      el.querySelector('#t-save').onclick = async () => {
        const amount = Number(v.amount);
        if (!amount) { toast('Upiši iznos', 'warn'); return; }
        if (v.from === v.to) { toast('Izaberi dva različita računa', 'warn'); return; }
        const data = { from: v.from, to: v.to, amount, date: el.querySelector('#t-date').value || todayISO(), note: el.querySelector('#t-note').value.trim() };
        if (tr) await S.updateTransfer(tr.id, data);
        else await S.addTransfer(data);
        toast(`⇄ ${esc(S.account(v.from).name)} → ${esc(S.account(v.to).name)} · ${fmtNum(amount)}`, 'ok');
        close();
      };
    },
  });
}

// ---- Razlika posle provere: objasni je ili je evidentiraj kao "iscurelo" ----
function openDiffSheet(a, chk, diff) {
  const short = diff < 0;
  const abs = Math.abs(diff);
  const pre = S.beforeCheck(chk);
  const today = todayISO();
  openSheet({
    title: short ? `Nedostaje ${fmtNum(abs)} RSD` : `Višak ${fmtNum(abs)} RSD`,
    body: `
      <div class="diff-ico">${short ? '💧' : '🤔'}</div>
      <p class="sheet-text center">${short
        ? `Na računu <b>${esc(a.name)}</b> je manje nego što su unosi pokazivali. Verovatno neki trošak nije unet.`
        : `Na računu <b>${esc(a.name)}</b> je više nego što su unosi pokazivali. Možda prihod nije unet, ili je neki trošak unet dvaput.`}</p>
      <div class="dd-actions">
        ${short ? `
          <button class="btn btn-primary" id="d-add">Setio sam se — dodaj trošak</button>
          <button class="btn btn-soft" id="d-leak">💧 Iscurelo — ne znam gde</button>`
        : `
          <button class="btn btn-primary" id="d-add">Dodaj prihod</button>
          <button class="btn btn-soft" id="d-leak">Evidentiraj kao nepoznat priliv</button>`}
        <button class="btn btn-ghost" id="d-skip">Ostavi tako</button>
      </div>
      <p class="muted small center mt">Stanje računa je u svakom slučaju ažurirano na ${fmt(chk.amount)}.</p>`,
    onMount(el, close) {
      const then = (fn) => () => { close(); setTimeout(fn, 220); };
      el.querySelector('#d-skip').onclick = () => close();
      el.querySelector('#d-add').onclick = then(() => openEntrySheet({
        kind: short ? 'expense' : 'income',
        prefill: { amount: abs, account: a.id, createdAt: pre },
      }));
      el.querySelector('#d-leak').onclick = async () => {
        await S.addTransaction(short
          ? { kind: 'expense', categoryId: 'iscurelo', amount: abs, date: today, note: `Razlika pri proveri · ${a.name}`, account: a.id, createdAt: pre }
          : { kind: 'income', categoryId: 'dodatno', amount: abs, date: today, note: `Nepoznat priliv · ${a.name}`, account: a.id, createdAt: pre });
        close();
        if (short) {
          const key = currentMonthKey();
          const month = S.leakedIn(`${key}-01`, `${key}-${daysInMonth(key)}`);
          toast(`💧 Evidentirano kao iscurelo: ${fmtNum(abs)} RSD${month > abs ? `<br><small>Ovog meseca ukupno iscurelo: ${fmtNum(month)} RSD</small>` : ''}`, 'warn', 4500);
        } else toast(`Evidentirano kao priliv: ${fmtNum(abs)} RSD`, 'ok');
      };
    },
  });
}

// ---- Upozorenja za karticu na Pregledu ----
function accountWarnings() {
  const out = [];
  for (const a of S.ACCOUNTS) {
    const c = S.lastCheck(a.id);
    if (!c) continue;
    const days = Math.floor((Date.now() - Date.parse(c.at)) / 864e5);
    if (days >= 7) out.push(`⏰ ${esc(a.name)}: stanje nije provereno ${days} dana`);
  }
  const key = currentMonthKey();
  const leak = S.leakedIn(`${key}-01`, `${key}-${daysInMonth(key)}`);
  if (leak > 0) out.push(`💧 Ovog meseca iscurelo: <b>${fmtNum(leak)} RSD</b>`);
  return out;
}
