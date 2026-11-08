// Plan za mesec: očekivani prihodi, troškovi i štednja.
import * as S from '../store.js?v=20261108053932';
import { summarize } from '../calc.js?v=20261108053932';
import { esc, fmt, fmtNum, fmtSigned, monthLabel, addMonths, digitsOnly, MONTH_GEN } from '../util.js?v=20261108053932';
import { openSheet, toast, confirmSheet, moneyInput } from '../ui.js?v=20261108053932';
import { isPayable, paidTx, payItem, PAY_LABELS } from '../pay.js?v=20261108053932';
import { openEntrySheet } from './entry.js?v=20261108053932';
import { openQuickEntry } from './quick.js?v=20261108053932';
import { monthPhase } from '../calc.js?v=20261108053932';

export function renderPlan(el, ctx) {
  const key = ctx.month;
  const sum = summarize(key);
  const plan = sum.plan;
  const prevKey = addMonths(key, -1);
  const isDec = key.endsWith('-12');
  const unassigned = sum.balancePlan;

  const section = (kind) => {
    const items = plan.filter((p) => S.cat(p.categoryId).kind === kind);
    const total = items.reduce((s, p) => s + Number(p.amount), 0);
    let rows = '';
    if (kind === 'expense') {
      const byCat = new Map();
      for (const p of items) {
        if (!byCat.has(p.categoryId)) byCat.set(p.categoryId, []);
        byCat.get(p.categoryId).push(p);
      }
      rows = [...byCat.entries()]
        .sort((a, b) => sumOf(b[1]) - sumOf(a[1]))
        .map(([cid, arr]) => {
          const c = S.cat(cid);
          return `<div class="plan-group">
            <div class="plan-group-head"><span>${c.icon} ${esc(c.name)}</span><span>${fmtNum(sumOf(arr))}</span></div>
            ${arr.map((p) => itemRow(p, key)).join('')}
          </div>`;
        }).join('');
    } else rows = items.map((p) => itemRow(p, key)).join('');

    return `
      <div class="section-head"><h3>${S.KINDS[kind].plural}</h3><span class="t-${kind === 'income' ? 'green' : kind === 'saving' ? 'cyan' : 'red'}"><b>${fmtNum(total)}</b></span></div>
      <section class="card list">
        ${rows || '<div class="empty-mini">Nema stavki.</div>'}
        <button class="add-line" data-add="${kind}">+ Dodaj ${S.KINDS[kind].acc}</button>
      </section>`;
  };

  el.innerHTML = `
    <section class="card plan-summary">
      <div class="ps-row"><span>Planirani prihodi</span><b class="t-green">${fmtNum(sum.tot.income.plan)}</b></div>
      <div class="ps-row"><span>Planirani troškovi</span><b class="t-red">${sum.tot.expense.plan ? '−' : ''}${fmtNum(sum.tot.expense.plan)}</b></div>
      <div class="ps-row"><span>Štednja i investicije</span><b class="t-cyan">${sum.tot.saving.plan ? '−' : ''}${fmtNum(sum.tot.saving.plan)}</b></div>
      <div class="ps-row ps-total"><span>Neraspoređeno</span><b class="${unassigned < 0 ? 't-red' : 't-accent'}">${fmtSigned(unassigned)} RSD</b></div>
      ${planHint(sum)}
    </section>

    ${!plan.length && S.hasPlan(prevKey) ? `<button class="btn btn-primary btn-block" id="copy-prev">Kopiraj plan iz ${MONTH_GEN[Number(prevKey.slice(5)) - 1]}</button>` : ''}

    ${section('income')}
    ${section('expense')}
    ${section('saving')}

    <div class="section-head"><h3>Alati</h3></div>
    <section class="card list">
      ${S.hasPlan(prevKey) && plan.length ? `<button class="tool-row" id="copy-prev2">📋 Zameni plan planom iz ${MONTH_GEN[Number(prevKey.slice(5)) - 1]}</button>` : ''}
      ${!isDec && plan.length ? `<button class="tool-row" id="copy-fwd">⏭️ Kopiraj ovaj plan na sve mesece do kraja ${key.slice(0, 4)}.</button>` : ''}
    </section>
  `;

  el.querySelectorAll('[data-item]').forEach((r) => (r.onclick = () => {
    const item = plan.find((p) => p.id === r.dataset.item);
    if (item) openPlanItemActions(key, item);
  }));
  el.querySelectorAll('[data-quick]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const item = plan.find((p) => p.id === b.dataset.quick);
    if (item) openQuickEntry({ categoryId: item.categoryId, name: item.name, key });
  }));
  el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const item = plan.find((p) => p.id === b.dataset.pay);
    if (item) payItem(key, item);
  }));
  el.querySelectorAll('[data-paid]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const tx = S.getState().transactions.find((t) => t.id === b.dataset.paid);
    if (tx) openEntrySheet({ tx });
  }));
  el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => openPlanItemSheet(key, null, b.dataset.add)));

  const copyPrev = async (replace) => {
    if (replace && !(await confirmSheet({ title: 'Zameni plan?', text: `Trenutni plan za ${esc(monthLabel(key).toLowerCase())} biće zamenjen planom iz ${MONTH_GEN[Number(prevKey.slice(5)) - 1]}.`, ok: 'Zameni' }))) return;
    await S.copyPlan(prevKey, key);
    toast('Plan kopiran', 'ok');
  };
  el.querySelector('#copy-prev')?.addEventListener('click', () => copyPrev(false));
  el.querySelector('#copy-prev2')?.addEventListener('click', () => copyPrev(true));
  el.querySelector('#copy-fwd')?.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: 'Kopiraj do kraja godine?',
      text: `Plan za sve mesece posle ${MONTH_GEN[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}. biće zamenjen ovim planom. Stvarni unosi se ne diraju.`,
      ok: 'Kopiraj',
    });
    if (!ok) return;
    await S.copyPlanToRestOfYear(key);
    toast('Plan kopiran do decembra', 'ok');
  });
}

const sumOf = (arr) => arr.reduce((s, p) => s + Number(p.amount), 0);

function itemRow(p, key) {
  const o = S.member(p.owner);
  let pay = '';
  const c0 = S.cat(p.categoryId);
  if (c0.kind === 'expense' && !c0.fixed && monthPhase(key) !== 'future') {
    pay = `<button class="pay-btn" data-quick="${p.id}">+ Unesi</button>`;
  } else if (isPayable(p) && monthPhase(key) !== 'future') {
    const kind = S.cat(p.categoryId).kind;
    const tx = paidTx(key, p);
    pay = tx
      ? `<button class="pay-btn paid" data-paid="${tx.id}" title="Otvori unos">✓ ${PAY_LABELS[kind].done}</button>`
      : `<button class="pay-btn" data-pay="${p.id}">${PAY_LABELS[kind].act}</button>`;
  }
  return `<div class="plan-item" role="button" tabindex="0" data-item="${p.id}">
    <span class="pi-name">${esc(p.name)}</span>
    ${p.owner && p.owner !== 'zaj' ? `<span class="who" style="--c:${o.color}">${o.short}</span>` : ''}
    <span class="pi-amt">${fmtNum(p.amount)}</span>
    ${pay}
  </div>`;
}

function planHint(sum) {
  const inc = sum.tot.income.plan;
  if (!inc) return '';
  const u = sum.balancePlan;
  const rate = sum.tot.saving.plan / inc;
  if (u < 0) return `<div class="hint hint-bad">Plan je u minusu ${fmt(-u)}. Smanji troškove ili štednju da se plan zatvori.</div>`;
  if (u > inc * 0.1)
    return `<div class="hint hint-warn">💡 ${fmt(u)} (${Math.round((u / inc) * 100)}% prihoda) nema namenu. Novac bez namene se obično potroši — dodeli ga štednji, rezervi ili kategoriji kao što su izlasci ili odeća.</div>`;
  if (rate >= 0.2) return `<div class="hint hint-good">✅ Štedite ${Math.round(rate * 100)}% prihoda — odličan plan.</div>`;
  return `<div class="hint">Štednja je ${Math.round(rate * 100)}% prihoda.</div>`;
}

export function openPlanItemSheet(key, item, kind = null, presetCat = null) {
  kind = item ? S.cat(item.categoryId).kind : presetCat ? S.cat(presetCat).kind : kind;
  const cats = S.categoriesOf(kind);
  const v = {
    name: item?.name || '',
    categoryId: item?.categoryId || presetCat || cats[0]?.id,
    amount: item ? String(Math.round(item.amount)) : '',
    owner: item?.owner || 'zaj',
  };
  const isDec = key.endsWith('-12');

  openSheet({
    title: item ? '✏️ Izmena plana' : `Nova stavka plana — ${S.KINDS[kind].label.toLowerCase()}`,
    body: `
      <div class="hint hint-warn plan-edit-hint">Menjaš koliko je <b>planirano</b> za mesec — ovo <b>nije unos troška</b>.
        ${item && kind === 'expense' ? '<button class="link" id="p-to-entry">Hteo si da uneseš trošak? →</button>' : ''}</div>
      <div class="field-label">Naziv</div>
      <input class="input" id="p-name" maxlength="40" placeholder="${kind === 'income' ? 'npr. Plata Đ' : kind === 'saving' ? 'npr. Mesečna štednja' : 'npr. Struja, Kredit, Namirnice'}">

      <div class="field-label">Iznos</div>
      <label class="amount-field amount-sm"><input id="p-amount" inputmode="numeric" placeholder="0"><span>RSD</span></label>

      <div class="field-label">Kategorija</div>
      <select class="input" id="p-cat">
        ${cats.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}
      </select>

      <div class="field-label">Čije je</div>
      <div class="seg seg-3" id="p-owner">
        ${S.OWNERS.map((o) => `<button data-v="${o.id}">${esc(o.name)}</button>`).join('')}
      </div>

      ${!isDec ? `<label class="check"><input type="checkbox" id="p-fwd" ${item ? '' : 'checked'}>
        <span>${item ? 'Primeni izmenu i na naredne mesece' : 'Dodaj i u naredne mesece'} do kraja ${key.slice(0, 4)}.</span></label>` : ''}

      <div class="btn-row sticky-actions">
        ${item ? '<button class="btn btn-ghost btn-danger-text" id="p-del">Obriši</button>' : ''}
        <button class="btn btn-primary" id="p-save">Sačuvaj</button>
      </div>`,
    onMount(el, close) {
      const $ = (s) => el.querySelector(s);
      $('#p-name').value = v.name;
      $('#p-cat').value = v.categoryId;
      const amt = $('#p-amount');
      amt.value = v.amount ? fmtNum(v.amount) : '';
      moneyInput(amt, (d) => (v.amount = d), 10);
      const paintOwner = () => el.querySelectorAll('#p-owner button').forEach((b) => b.classList.toggle('on', b.dataset.v === v.owner));
      el.querySelectorAll('#p-owner button').forEach((b) => (b.onclick = () => { v.owner = b.dataset.v; paintOwner(); }));
      paintOwner();
      if (!item) setTimeout(() => $('#p-name').focus(), 280);

      $('#p-to-entry')?.addEventListener('click', () => { close(); setTimeout(() => openQuickEntry({ categoryId: item.categoryId, name: item.name, key }), 220); });
      $('#p-save').onclick = async () => {
        const name = $('#p-name').value.trim() || S.cat($('#p-cat').value).name;
        const amount = Number(v.amount);
        if (!amount) { toast('Upiši iznos', 'warn'); amt.focus(); return; }
        const applyForward = !!$('#p-fwd')?.checked;
        const snap = S.plansSnapshot();
        await S.savePlanItem(key, { ...(item ? { id: item.id } : {}), name, amount, categoryId: $('#p-cat').value, owner: v.owner }, { applyForward });
        const what = item && Number(item.amount) !== amount ? `${esc(name)}: ${fmtNum(item.amount)} → <b>${fmtNum(amount)}</b>` : `${esc(name)} · ${fmtNum(amount)}`;
        toast(`Plan ${item ? 'izmenjen' : 'dopunjen'}: ${what}${applyForward ? '<br><small>i za naredne mesece</small>' : ''}`, 'ok', 6000,
          { label: 'Poništi', onClick: async () => { await S.restorePlans(snap); toast('Izmena plana poništena', 'ok'); } });
        close();
      };
      $('#p-del')?.addEventListener('click', async () => {
        const applyForward = !!$('#p-fwd')?.checked;
        const ok = await confirmSheet({ title: 'Obriši stavku?', text: `${esc(item.name)}${applyForward ? ' — i iz narednih meseci' : ''}`, ok: 'Obriši', danger: true });
        if (!ok) return;
        const snap = S.plansSnapshot();
        await S.deletePlanItem(key, item.id, { applyForward });
        toast(`Iz plana obrisano: ${esc(item.name)}`, 'ok', 6000, { label: 'Poništi', onClick: async () => { await S.restorePlans(snap); toast('Brisanje poništeno', 'ok'); } });
        close();
      });
    },
  });
}

// Dodir na stavku plana: jasan izbor između UNOSA troška i IZMENE plana.
export function openPlanItemActions(key, item) {
  const c = S.cat(item.categoryId);
  const future = monthPhase(key) === 'future';
  const payable = isPayable(item);
  const paid = payable ? paidTx(key, item) : null;
  const r = summarize(key).cats.find((x) => x.cat.id === c.id) || { plan: 0, actual: 0 };
  const L = PAY_LABELS[c.kind];
  let primary = '';
  if (!future) {
    if (!payable) primary = `<button class="btn btn-primary" id="a-quick">+ Unesi trošak</button>`;
    else if (paid) primary = `<button class="btn btn-soft" id="a-paid">✓ ${L.done} · ${fmtNum(paid.amount)} — otvori unos</button>`;
    else primary = `<button class="btn btn-primary" id="a-pay">${L.act} ${fmtNum(item.amount)} RSD</button>`;
  }
  openSheet({
    title: item.name,
    body: `
      <div class="cd-head">
        <span class="cat-ico" style="--c:${c.color}">${c.icon}</span>
        <div class="grow">
          <div class="cd-big">${fmt(item.amount)}</div>
          <div class="cd-sub">planirano · ${esc(c.name)}${!payable && r.plan ? ` · potrošeno ${fmtNum(r.actual)} od ${fmtNum(r.plan)}` : ''}</div>
        </div>
      </div>
      <div class="dd-actions">
        ${primary}
        ${future ? '<p class="muted small center">Budući mesec — trošak se unosi kad mesec počne.</p>' : ''}
        <button class="btn btn-ghost" id="a-edit">✏️ Izmeni plan (iznos, naziv)</button>
      </div>`,
    onMount(el, close) {
      const then = (fn) => () => { close(); setTimeout(fn, 220); };
      el.querySelector('#a-quick')?.addEventListener('click', then(() => openQuickEntry({ categoryId: item.categoryId, name: item.name, key })));
      el.querySelector('#a-pay')?.addEventListener('click', () => { close(); payItem(key, item); });
      el.querySelector('#a-paid')?.addEventListener('click', then(() => openEntrySheet({ tx: paid })));
      el.querySelector('#a-edit').onclick = then(() => openPlanItemSheet(key, item));
    },
  });
}
