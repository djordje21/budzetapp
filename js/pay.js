// "Plaćeno" — stavka plana jednim dodirom postaje stvarni unos.
import * as S from './store.js?v=20261108091307';
import { todayISO, currentMonthKey, fmtNum, esc, monthLabel } from './util.js?v=20261108091307';
import { txOfMonth } from './calc.js?v=20261108091307';
import { toast, openSheet, confetti, burst } from './ui.js?v=20261108091307';

// Koje stavke plana imaju dugme: prihodi, štednja i fiksni troškovi (rate, računi).
export const isPayable = (item) => {
  const c = S.cat(item.categoryId);
  return c.kind !== 'expense' || !!c.fixed;
};

export const paidTx = (key, item) => txOfMonth(key).find((t) => t.planLine === item.line);

export const PAY_LABELS = {
  expense: { act: 'Plati', done: 'Plaćeno' },
  income: { act: 'Primljeno', done: 'Primljeno' },
  saving: { act: 'Uplati', done: 'Uplaćeno' },
};

export async function payItem(key, item, origin = null) {
  const c = S.cat(item.categoryId);
  // Tekući mesec → danas; ranija/buduća → prvi u mesecu (datum može da se izmeni posle).
  const date = key === currentMonthKey() ? todayISO() : `${key}-01`;
  const before = unpaidBills(key).length;
  await S.addTransaction({
    kind: c.kind,
    categoryId: c.id,
    amount: Number(item.amount),
    date,
    note: item.name,
    planLine: item.line,
  });
  burst(origin);
  toast(progressMsg(key, item, c), 'ok', 3200);
  afterBillPaid(key, before);
}

const NUDGES = ['Korak po korak 👣', 'Odlično ide 👌', 'Jedan manje 😌', 'Tako se to radi 💪', 'Sve po planu ✨'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const racuna = (n) => (n === 1 ? 'račun' : n < 5 ? 'računa' : 'računa');

// Poruka posle plaćanja: šta je ostalo, a ne opšta motivacija.
function progressMsg(key, item, c) {
  const head = `<b>✓ ${PAY_LABELS[c.kind].done}</b> ${esc(item.name)} · ${fmtNum(item.amount)} RSD`;
  if (c.kind === 'income') return `💰 <b>${esc(item.name)} stigla!</b> ${fmtNum(item.amount)} RSD`;
  if (c.kind === 'saving') return `🐷 <b>Uplaćeno:</b> ${esc(item.name)} · ${fmtNum(item.amount)} RSD<br><small>Budući vi će vam biti zahvalni.</small>`;
  const left = unpaidBills(key);
  if (!left.length) return head; // poslednji — sledi velika proslava
  const sum = left.reduce((s, p) => s + Number(p.amount), 0);
  if (left.length === 1) return `${head}<br><small>Još samo <b>${esc(left[0].name)}</b> i gotovi ste! 💪</small>`;
  return `${head}<br><small>Još ${left.length} ${racuna(left.length)} (${fmtNum(sum)} RSD) · ${pick(NUDGES)}</small>`;
}

// ---- Računi i rate (fiksni troškovi iz plana) ----
export const billsOf = (key) => S.planOf(key).filter((p) => { const c = S.cat(p.categoryId); return c.kind === 'expense' && c.fixed; });
export const unpaidBills = (key) => billsOf(key).filter((p) => !paidTx(key, p));

// Poziva se posle svakog plaćanja: ako je to bio poslednji neplaćeni račun u mesecu — proslava.
export function afterBillPaid(key, unpaidBefore) {
  if (unpaidBefore > 0 && unpaidBills(key).length === 0) setTimeout(() => celebrateBills(key), 500);
}

const MESSAGES = [
  (m) => `Svi računi za ${m} su plaćeni! Mirna glava je najbolja investicija — uživajte u vremenu zajedno. ❤️`,
  () => `Sve izmireno! Ovaj mesec ste pobedili vi, a ne računi. 💪`,
  () => `Računi plaćeni, nervi sačuvani. Zaslužili ste porodičnu večeru — po planu, naravno. 😉`,
  () => `Sve na vreme, sve po planu. Tako se gradi sigurnost za porodicu — korak po korak. 🏡`,
  () => `Finansijski mir: otključan. 🔓 Bravo vama dvoma!`,
  () => `Niko vam ništa ne duguje, ni vi nikome. Lepo je kad se sve poklopi. 😊`,
  (m) => `${m.charAt(0).toUpperCase() + m.slice(1)} je pod kontrolom. Sad je vreme za ono što je stvarno važno — vas dvoje. 🥂`,
];

function celebrateBills(key) {
  const bills = billsOf(key);
  const total = bills.reduce((s, p) => s + Number(paidTx(key, p)?.amount || 0), 0);
  const month = monthLabel(key).split(' ')[0].toLowerCase();
  let last = -1;
  try { last = Number(localStorage.getItem('budzet_last_msg') ?? -1); } catch {}
  let i = Math.floor(Math.random() * MESSAGES.length);
  if (i === last) i = (i + 1) % MESSAGES.length;
  try { localStorage.setItem('budzet_last_msg', String(i)); } catch {}
  confetti();
  openSheet({
    title: 'Svi računi su plaćeni! 🎉',
    body: `
      <div class="celebrate">
        <div class="cel-ico">🏆</div>
        <p class="cel-msg">${MESSAGES[i](month)}</p>
        <div class="cel-stats"><b>${bills.length}</b> ${bills.length === 1 ? 'stavka' : bills.length < 5 ? 'stavke' : 'stavki'} · <b>${fmtNum(total)} RSD</b> plaćeno za ${month}</div>
      </div>
      <button class="btn btn-primary btn-block" id="cel-ok">Hvala! 🙌</button>`,
    onMount(el, close) { el.querySelector('#cel-ok').onclick = close; },
  });
}
