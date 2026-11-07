// Stavka iz "Čeka evidenciju": plati tačno, plati drugačije, izmeni plan ili preskoči mesec.
import * as S from '../store.js?v=20261107214139';
import { esc, fmt, fmtNum, addMonths, dayLabel, monthLabel, currentMonthKey } from '../util.js?v=20261107214139';
import { openSheet, confirmSheet, toast } from '../ui.js?v=20261107214139';
import { payItem, PAY_LABELS } from '../pay.js?v=20261107214139';
import { openEntrySheet } from './entry.js?v=20261107214139';
import { openPlanItemSheet } from './plan.js?v=20261107214139';

export function openDueSheet(key, item) {
  const c = S.cat(item.categoryId);
  const L = PAY_LABELS[c.kind];
  const owner = S.member(item.owner);
  // Isto plaćanje prethodnog meseca (ista linija plana).
  const prevKey = addMonths(key, -1);
  const prev = S.getState().transactions.find((t) => t.planLine === item.line && t.date.startsWith(prevKey));
  const month = monthLabel(key).split(' ')[0].toLowerCase();

  openSheet({
    title: item.name,
    body: `
      <div class="cd-head">
        <span class="cat-ico" style="--c:${c.color}">${c.icon}</span>
        <div class="grow">
          <div class="cd-big">${fmt(item.amount)}</div>
          <div class="cd-sub">${esc(c.name)} · plan za ${month}</div>
        </div>
      </div>

      <div class="dd-meta">
        <div><span>Čije je</span><span>${esc(owner.name)}</span></div>
        <div><span>Prošli mesec</span><span>${prev ? `${fmtNum(prev.amount)} RSD · ${Number(prev.date.slice(8))}.${Number(prev.date.slice(5, 7))}.` : 'nije evidentirano'}</span></div>
        ${prev && Math.round(prev.amount) !== Math.round(item.amount) ? `<div><span>Prošli mesec vs plan</span><span>${prev.amount > item.amount ? '+' : '−'}${fmtNum(Math.abs(prev.amount - item.amount))}</span></div>` : ''}
      </div>

      <div class="dd-actions">
        <button class="btn btn-primary" id="dd-pay">✓ ${L.act} ${fmtNum(item.amount)} RSD</button>
        <button class="btn btn-soft" id="dd-other">Drugi iznos ili datum…</button>
        <button class="btn btn-ghost" id="dd-edit">Izmeni stavku plana</button>
        <button class="btn btn-ghost btn-danger-text" id="dd-skip">Preskoči za ${month}</button>
      </div>`,
    onMount(el, close) {
      const then = (fn) => () => { close(); setTimeout(fn, 200); };
      el.querySelector('#dd-pay').onclick = () => { close(); payItem(key, item); };
      el.querySelector('#dd-other').onclick = then(() =>
        openEntrySheet({
          categoryId: c.id,
          date: key === currentMonthKey() ? null : `${key}-01`,
          prefill: { amount: item.amount, note: item.name, planLine: item.line },
        }));
      el.querySelector('#dd-edit').onclick = then(() => openPlanItemSheet(key, item));
      el.querySelector('#dd-skip').onclick = async () => {
        const ok = await confirmSheet({
          title: `Preskoči ${esc(item.name)}?`,
          text: `Stavka se uklanja iz plana samo za ${month}. Naredni meseci ostaju isti.`,
          ok: 'Preskoči',
        });
        if (!ok) return;
        await S.deletePlanItem(key, item.id);
        toast(`${esc(item.name)} preskočeno za ${month}`, 'ok');
        close();
      };
    },
  });
}
