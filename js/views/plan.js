// Plan za mesec: očekivani prihodi, troškovi i štednja.
import { ico } from '../icons.js?v=20261108141149';
import * as S from '../store.js?v=20261108141149';
import { summarize } from '../calc.js?v=20261108141149';
import { esc, fmt, fmtNum, fmtSigned, monthLabel, addMonths, digitsOnly, MONTH_GEN , dayLabel } from '../util.js?v=20261108141149';
import { openSheet, toast, confirmSheet, moneyInput } from '../ui.js?v=20261108141149';
import { isPayable, paidTx, payItem, PAY_LABELS } from '../pay.js?v=20261108141149';
import { openEntrySheet } from './entry.js?v=20261108141149';
import { openQuickEntry } from './quick.js?v=20261108141149';
import { monthPhase } from '../calc.js?v=20261108141149';

// Sekcija kao padajući meni: naslov sa zbirom uvek vidljiv; zatvorene sekcije se trajno pamte.
const SEC_KEY = 'budzet_sec_closed';
const closedSecs = () => { try { return new Set(JSON.parse(localStorage.getItem(SEC_KEY) || '["tools"]')); } catch { return new Set(['tools']); } };
function sec(id, title, right, body) {
  return `<details class="sec" data-sec="${id}" ${closedSecs().has(id) ? '' : 'open'}>
    <summary class="section-head sec-head"><h3>${title}</h3><span class="sec-right">${right}<i class="chev sec-chev">›</i></span></summary>
    ${body}
  </details>`;
}

// Kategorije koje su svakog meseca, ali se troše pomalo (hrana, gorivo, džeparac).
const REGULAR = new Set(['hrana', 'auto', 'licno-dj', 'licno-m']);

export function renderPlan(el, ctx) {
  const key = ctx.month;
  const sum = summarize(key);
  const plan = sum.plan;
  const prevKey = addMonths(key, -1);
  const isDec = key.endsWith('-12');
  const unassigned = sum.balancePlan;

  // Fiksni rashodi: rate, računi i štednja (isti iznos svakog meseca, plaća se jednom).
  const isBill = (p) => { const c = S.cat(p.categoryId); return (c.kind === 'expense' && c.fixed) || c.kind === 'saving'; };
  // Redovni mesečni troškovi (svakog meseca, ali se troše pomalo): u fiksnim rashodima, sa "+ Unesi".
  const isRegular = (p) => REGULAR.has(p.categoryId);
  const isFixedGroup = (p) => isBill(p) || isRegular(p);
  const section = (kind, title = S.KINDS[kind].plural) => {
    const items = plan.filter((p) => S.cat(p.categoryId).kind === kind && !isFixedGroup(p));
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
          // Jedna stavka u kategoriji: jedan red sa ikonicom (bez suvišnog naslova grupe).
          if (arr.length === 1) return `<div class="plan-single">${itemRow(arr[0], key, c)}</div>`;
          const w = arr.length < 5 ? 'stavke' : 'stavki';
          // Grupa sa više stavki: padajući meni (zatvoren), pamti se šta je otvoreno.
          return `<details class="plan-fold" data-fold="${c.id}" ${openFolds().has(c.id) ? 'open' : ''}>
            <summary class="plan-item fold-head">
              <span class="cat-ico" style="--c:${c.color}">${ico(c)}</span>
              <span class="pi-name">${esc(c.name)}<small>${arr.length} ${w}</small></span>
              <span class="pi-amt">${fmtNum(sumOf(arr))}</span>
              <span class="chev fold-chev">›</span>
            </summary>
            <div class="fold-body">${arr.map((p) => itemRow(p, key)).join('')}</div>
          </details>`;
        }).join('');
    } else rows = items.map((p) => itemRow(p, key)).join('');

    return sec(kind, title, `<b class="t-${kind === 'income' ? 'green' : kind === 'saving' ? 'cyan' : 'red'}">${fmtNum(total)}</b>`, `
      <section class="card list">
        ${rows || '<div class="empty-mini">Nema stavki.</div>'}
        <button class="add-line" data-add="${kind === 'expense' ? 'var' : kind}">+ Dodaj ${kind === 'expense' ? 'varijabilni rashod' : S.KINDS[kind].acc}</button>
      </section>`);
  };

  // Računi i rate: šta je ostalo za plaćanje, a šta je plaćeno (sklopljeno).
  const billsSection = () => {
    const bills = plan.filter(isBill).sort((a, b) => b.amount - a.amount);
    const regular = plan.filter(isRegular).sort((a, b) => b.amount - a.amount);
    if (!bills.length && !regular.length) return '';
    const future = monthPhase(key) === 'future';
    const unpaid = future ? bills : bills.filter((p) => !paidTx(key, p));
    const paid = future ? [] : bills.filter((p) => paidTx(key, p));
    const paidSum = paid.reduce((s, p) => s + Number(paidTx(key, p).amount), 0);
    const row = (p) => itemRow(p, key, S.cat(p.categoryId));
    return sec('bills', future || !unpaid.length ? 'Fiksni rashodi' : `Fiksni rashodi · još ${unpaid.length}`, `<b class="t-red">${fmtNum(sumOf(bills) + sumOf(regular))}</b>`, `
      <section class="card list">
        ${bills.length ? `<div class="sub-label">Plaća se jednom · rate, računi, štednja</div>` : ''}
        ${unpaid.length ? unpaid.map(row).join('') : bills.length ? '<div class="empty-mini all-paid">🎉 Sve rate, računi i štednja za ovaj mesec su plaćeni!</div>' : ''}
        ${regular.length ? `<div class="sub-label">Mesečni budžet · troši se pomalo</div>${regular.map(row).join('')}` : ''}
        <button class="add-line" data-add="out">+ Dodaj fiksni rashod</button>
      </section>
      ${paid.length ? `<details class="paid-box">
        <summary><span>✓ Plaćeno · ${paid.length}</span><span><b>${fmtNum(paidSum)}</b> RSD <i class="chev">›</i></span></summary>
        <section class="card list">${paid.map(row).join('')}</section>
      </details>` : ''}`);
  };

  const fixedSum = sumOf(plan.filter(isFixedGroup));
  const varSum = sumOf(plan.filter((p) => !isFixedGroup(p) && S.cat(p.categoryId).kind === 'expense'));
  const misplaced = findMisplacedPocket(plan);
  el.innerHTML = `
    ${misplaced.length ? `<div class="hint hint-warn fix-banner">
      <div>🧔👩 <b>Džeparac je u kategoriji „${esc(S.cat(misplaced[0].item.categoryId).name)}“.</b> Da bi se pravilno računao (po osobi, dnevni limit), treba da bude u kategoriji Džeparac.</div>
      <div class="fix-list">${misplaced.map((m) => `<span>${esc(m.item.name)} → ${esc(S.cat(m.to).name)}</span>`).join('')}</div>
      <button class="btn btn-primary btn-sm" id="fix-pocket">Prebaci</button>
    </div>` : ''}
    ${!plan.length ? '<div class="hint plan-intro">📋 <b>Plan</b> je koliko očekujete da <b>zaradite</b> i <b>potrošite</b> ovog meseca. Dodajte plate, račune, hranu, gorivo... Stvarne troškove kasnije unosite preko dugmeta <b>+</b>.</div>' : ''}
    <section class="card plan-summary">
      <div class="ps-row"><span>Prihodi</span><b class="t-green">${fmtNum(sum.tot.income.plan)}</b></div>
      <div class="ps-row"><span>Fiksni rashodi <span class="muted small">(svakog meseca)</span></span><b class="t-red">${fixedSum ? '−' : ''}${fmtNum(fixedSum)}</b></div>
      <div class="ps-row"><span>Varijabilni rashodi</span><b class="t-red">${varSum ? '−' : ''}${fmtNum(varSum)}</b></div>
      <div class="ps-row ps-total"><span>Ostaje bez namene</span><b class="${unassigned < 0 ? 't-red' : 't-accent'}">${fmtSigned(unassigned)} RSD</b></div>
      ${planHint(sum)}
    </section>

    ${!plan.length && S.hasPlan(prevKey) ? `<button class="btn btn-primary btn-block" id="copy-prev">Kopiraj plan iz ${MONTH_GEN[Number(prevKey.slice(5)) - 1]}</button>` : ''}

    ${section('income')}
    ${billsSection()}
    ${section('expense', 'Varijabilni rashodi')}

    ${sec('tools', 'Alati', '', `<section class="card list">
      ${S.hasPlan(prevKey) && plan.length ? `<button class="tool-row" id="copy-prev2">📋 Zameni plan planom iz ${MONTH_GEN[Number(prevKey.slice(5)) - 1]}</button>` : ''}
      ${!isDec && plan.length ? `<button class="tool-row" id="copy-fwd">⏭️ Kopiraj ovaj plan na sve mesece do kraja ${key.slice(0, 4)}.</button>` : ''}
    </section>`)}
  `;

  el.querySelectorAll('[data-item]').forEach((r) => (r.onclick = () => {
    const item = plan.find((p) => p.id === r.dataset.item);
    if (item) openPlanItemActions(key, item);
  }));
  el.querySelector('#fix-pocket')?.addEventListener('click', async () => {
    let moved = 0;
    for (const m of misplaced) moved += await S.moveLineToCategory(key, m.item.line, m.item.categoryId, m.to, m.item.name);
    toast(`✅ Džeparac prebačen${moved ? ` · i ${moved} ${moved === 1 ? 'unos' : 'unosa'}` : ''}`, 'ok', 3500);
  });
  el.querySelectorAll('.sec').forEach((d) => d.addEventListener('toggle', () => {
    const set = closedSecs();
    d.open ? set.delete(d.dataset.sec) : set.add(d.dataset.sec);
    try { localStorage.setItem(SEC_KEY, JSON.stringify([...set])); } catch {}
  }));
  el.querySelectorAll('.plan-fold').forEach((d) => d.addEventListener('toggle', () => {
    const set = openFolds();
    d.open ? set.add(d.dataset.fold) : set.delete(d.dataset.fold);
    try { sessionStorage.setItem('budzet_folds', JSON.stringify([...set])); } catch {}
  }));
  el.querySelectorAll('[data-quick]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const item = plan.find((p) => p.id === b.dataset.quick);
    if (item) openQuickEntry({ categoryId: item.categoryId, name: item.name, key });
  }));
  el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const item = plan.find((p) => p.id === b.dataset.pay);
    if (item) payItem(key, item, b);
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

function itemRow(p, key, single = null) {
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
  const sameName = single && p.name.trim().toLowerCase() === single.name.trim().toLowerCase();
  return `<div class="plan-item" role="button" tabindex="0" data-item="${p.id}">
    ${single ? `<span class="cat-ico" style="--c:${single.color}">${ico(single)}</span>` : ''}
    <span class="pi-name">${esc(p.name)}${single && !sameName ? `<small>${esc(single.name)}</small>` : ''}</span>
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
  const group = !item && !presetCat ? kind : null;
  kind = item ? S.cat(item.categoryId).kind : presetCat ? S.cat(presetCat).kind : kind === 'out' || kind === 'var' ? 'expense' : kind;
  let cats = S.categoriesOf(kind);
  if (group === 'out') cats = [...S.categoriesOf('expense').filter((c) => c.fixed), ...S.categoriesOf('saving'), ...S.categoriesOf('expense').filter((c) => !c.fixed)];
  if (group === 'var') cats = S.categoriesOf('expense').filter((c) => !c.fixed);
  if (item && kind !== 'income') cats = [...S.categoriesOf('expense'), ...S.categoriesOf('saving')];
  const v = {
    name: item?.name || '',
    categoryId: item?.categoryId || presetCat || cats[0]?.id,
    amount: item ? String(Math.round(item.amount)) : '',
    owner: item?.owner || 'zaj',
  };
  const isDec = key.endsWith('-12');

  openSheet({
    title: item ? '✏️ Izmena plana' : group === 'out' ? 'Novi fiksni rashod' : group === 'var' ? 'Novi varijabilni rashod' : `Nova stavka plana — ${S.KINDS[kind].label.toLowerCase()}`,
    body: `
      <div class="hint hint-warn plan-edit-hint">Menjaš koliko je <b>planirano</b> za mesec — ovo <b>nije unos troška</b>.
        ${item && kind === 'expense' ? '<button class="link" id="p-to-entry">Hteo si da uneseš trošak? →</button>' : ''}</div>
      <div class="field-label">Naziv</div>
      <input class="input" id="p-name" maxlength="40" placeholder="${kind === 'income' ? 'npr. Plata Đ' : kind === 'saving' ? 'npr. Mesečna štednja' : 'npr. Struja, Kredit, Namirnice'}">

      <div class="field-label">Iznos</div>
      <label class="amount-field amount-sm"><input id="p-amount" inputmode="numeric" placeholder="0"><span>RSD</span></label>

      <div class="field-label">Kategorija</div>
      <select class="input" id="p-cat">
        ${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
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
    else if (paid) primary = `<div class="hint hint-good">✓ ${L.done} ${fmtNum(paid.amount)} RSD · ${dayLabel(paid.date)}</div>
      <button class="btn btn-ghost btn-danger-text" id="a-undo">↩ Poništi plaćanje (greškom označeno)</button>
      <button class="btn btn-ghost" id="a-paid">Izmeni iznos ili datum plaćanja</button>`;
    else primary = `<button class="btn btn-primary" id="a-pay">${L.act} ${fmtNum(item.amount)} RSD</button>`;
  }
  openSheet({
    title: item.name,
    body: `
      <div class="cd-head">
        <span class="cat-ico" style="--c:${c.color}">${ico(c)}</span>
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
      el.querySelector('#a-undo')?.addEventListener('click', async () => {
        const ok = await confirmSheet({ title: 'Poništi plaćanje?', text: `${esc(item.name)} · ${fmtNum(paid.amount)} RSD biće obrisano iz unosa, a stavka se vraća u „Za plaćanje“.`, ok: 'Poništi', danger: true });
        if (!ok) return;
        await S.deleteTransaction(paid.id);
        close();
        toast(`↩ Plaćanje poništeno: ${esc(item.name)}`, 'ok');
      });
      el.querySelector('#a-edit').onclick = then(() => openPlanItemSheet(key, item));
    },
  });
}

// Stavke plana koje se zovu "džeparac", a nisu u kategoriji Džeparac.
function findMisplacedPocket(plan) {
  const norm = (x) => String(x || '').toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ids = new Set(S.getState().categories.map((c) => c.id));
  return plan
    .filter((p) => /dzeparac/.test(norm(p.name)) && !String(p.categoryId).startsWith('licno-'))
    .map((p) => {
      const n = norm(p.name);
      const who = p.owner === 'm' || /maksijan/.test(n) ? 'm' : p.owner === 'dj' || /djordj|djole/.test(n) ? 'dj' : null;
      return who && ids.has('licno-' + who) ? { item: p, to: 'licno-' + who } : null;
    })
    .filter(Boolean);
}

function openFolds() {
  try { return new Set(JSON.parse(sessionStorage.getItem('budzet_folds') || '[]')); } catch { return new Set(); }
}
