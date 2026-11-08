// Saveti: konkretni predlozi na osnovu vaše potrošnje ovog meseca + par opštih pravila.
import * as S from '../store.js?v=20261108205259';
import { summarize, pace, monthPhase } from '../calc.js?v=20261108205259';
import { esc, fmt, fmtNum, currentMonthKey, daysInMonth, todayISO } from '../util.js?v=20261108205259';
import { unpaidBills, paidTx } from '../pay.js?v=20261108205259';
import { goalStats } from './goals.js?v=20261108205259';

const GENERAL = [
  ['🐷', 'Prvo platite sebe', 'Kad legne plata, odmah uplatite štednju — pre računa i kupovine. Šta ostane, troši se.', 'platite-sebe'],
  ['⏳', 'Pravilo 24 sata', 'Za svaku kupovinu veću od 5.000 RSD koja nije u planu, sačekajte dan. Pola takvih kupovina se ne desi.', '24h'],
  ['📅', 'Nedeljna provera', 'Jednom nedeljno (npr. nedeljom uveče) uporedite stanje u OTP aplikaciji sa aplikacijom. Pet minuta, a nema iznenađenja.', 'nedeljna'],
  ['🛒', 'Lista za nabavku', 'Kao u kuhinji: nabavka po spisku. Spontane kupovine u marketu su najčešći razlog prekoračenja hrane.', 'nabavka'],
  ['🧯', 'Rezerva za nepredviđeno', 'Cilj: 3 mesečna troška na posebnom računu. Tako servis auta ili zubar ne ruše plan.', 'rezerva'],
];

// Svi saveti za tekući mesec: upozorenja (na osnovu potrošnje) + opšte dobre navike.
// id je stabilan (bez iznosa), da "✕ do sutra" važi i kad se iznos promeni.
export function buildTips() {
  const key = currentMonthKey();
  const sum = summarize(key);
  const p = pace(sum);
  const out = [];
  const dim = daysInMonth(key), day = Number(todayISO().slice(8, 10));

  // Prekoračenja i ritam
  for (const r of sum.cats.filter((r) => r.cat.kind === 'expense' && r.plan > 0 && r.actual > r.plan))
    out.push(['bad', '⚠️', `${esc(r.cat.name)} je ${fmt(r.actual - r.plan)} preko plana`, 'Do kraja meseca probajte da ne trošite u ovoj kategoriji, ili povećajte plan ako je prvobitni iznos bio nerealan.', 'cat:' + r.cat.id]);
  if (p) for (const l of p.limits.filter((l) => l.left >= 0 && l.actual - l.plan * p.timePct > Math.max(1000, l.plan * .15)))
    out.push(['warn', '🏃', `${esc(l.cat.name)} ide brže od plana`, `Ostalo je ${fmt(l.left)} za ${p.daysLeft} dana${l.cat.id === 'hrana' || l.cat.id.startsWith('licno-') ? ` — oko ${fmtNum(Math.round(l.perDay / 50) * 50)} dnevno` : ''}.`, 'cat:' + l.cat.id]);

  // ---- Datumi: plate i rokovi ----
  const plan = S.planOf(key);
  const incomes = plan.filter((x) => S.cat(x.categoryId).kind === 'income' && x.day);
  for (const it of incomes) {
    if (!paidTx(key, it) && it.day <= day)
      out.push(['warn', '⏰', `${esc(it.name)} je trebalo da stigne ${it.day}.`, 'Kad legne na račun, dodirni Primi kod nje na Pregledu ili u Planu.', 'plan']);
  }
  const next = incomes.filter((it) => it.day > day && !paidTx(key, it)).sort((a, b) => a.day - b.day)[0];
  if (next) {
    const daysTo = next.day - day;
    const billsBefore = unpaidBills(key).filter((b) => !b.day || b.day < next.day);
    const billsSum = billsBefore.reduce((t, b) => t + Number(b.amount), 0);
    const known = S.ACCOUNTS.map((a) => S.balanceOf(a.id)).filter(Boolean);
    const onAcc = known.reduce((t, b) => t + b.amount, 0);
    const daily = known.length ? Math.max(0, onAcc - billsSum) / daysTo : null;
    out.push(['info', '💰', `Do sledeće plate (${esc(next.name)}, ${next.day}.) još ${daysTo} ${daysTo === 1 ? 'dan' : 'dana'}`,
      known.length
        ? `Na računima je ${fmt(onAcc)}${billsSum ? `, a do tada treba platiti još ${fmt(billsSum)}` : ''}. Za svakodnevne troškove ostaje oko ${fmt(Math.round(daily / 50) * 50)} dnevno.`
        : `Do tada pazite na svakodnevne troškove${billsSum ? ` — pre plate treba platiti još ${fmt(billsSum)}` : ''}. Upišite stanje računa (meni → Stanje na računima) za tačniji savet.`, 'accounts']);
  }
  for (const b of unpaidBills(key).filter((b) => b.day)) {
    const d = b.day - day;
    if (d < 0) out.push(['bad', '⚠️', `${esc(b.name)}: rok je bio ${b.day}.`, `${fmt(b.amount)} — ako je plaćeno, označi Plati; ako nije, platiti što pre.`, 'plan']);
    else if (d <= 3) out.push(['warn', '🧾', d === 0 ? `${esc(b.name)} dospeva danas` : `${esc(b.name)} dospeva za ${d} ${d === 1 ? 'dan' : 'dana'}`, `${fmt(b.amount)} · rok ${b.day}.`, 'plan']);
  }

  // Neplaćeni računi (bez upisanog roka) pred kraj meseca
  const unpaid = unpaidBills(key).filter((b) => !b.day);
  if (unpaid.length && day >= dim - 7)
    out.push(['warn', '🧾', `Još ${unpaid.length} neplaćen${unpaid.length === 1 ? ' račun' : 'ih računa'} pred kraj meseca`, unpaid.map((x) => esc(x.name)).join(', ') + '.', 'plan']);

  // Novac bez namene
  if (sum.balancePlan > sum.tot.income.plan * .1 && sum.tot.income.plan)
    out.push(['info', '💡', `${fmt(sum.balancePlan)} u planu nema namenu`, 'Dodelite ga štednji ili cilju, inače će se potrošiti bez plana.', 'plan']);

  // Štednja
  if (sum.tot.income.actual > 0 && !sum.tot.saving.actual && sum.tot.saving.plan)
    out.push(['info', '🐷', 'Plata je stigla, štednja još nije uplaćena', `Plan je ${fmt(sum.tot.saving.plan)}. Uplatite odmah — "Fiksni rashodi" → Uplati.`, 'plan']);

  // Iscurelo
  const leak = S.leakedIn(`${key}-01`, `${key}-${dim}`);
  if (leak) out.push(['warn', '💧', `Ovog meseca je iscurelo ${fmt(leak)}`, 'Unosite troškove odmah posle plaćanja — najlakše preko + ili skeniranja računa.', 'accounts']);

  // Ciljevi
  for (const g of S.goalsOf()) {
    const gs = goalStats(g);
    if (!gs.done && gs.perMonth) out.push(['info', '🎯', `${esc(g.name)}: ${fmt(gs.perMonth)} mesečno`, `Toliko treba odvajati da do roka skupite ${fmt(g.target)}.`, 'goals']);
  }

  // Stanje računa
  for (const a of S.ACCOUNTS) {
    const c = S.lastCheck(a.id);
    if (c && (Date.now() - Date.parse(c.at)) / 864e5 >= 7) out.push(['info', '🏦', `Stanje (${esc(a.name)}) nije provereno ${Math.floor((Date.now() - Date.parse(c.at)) / 864e5)} dana`, 'Meni → Stanje na računima → Proveri.', 'accounts']);
  }

  if (!out.length && monthPhase(key) === 'current') out.push(['good', '👌', 'Sve je u planu', 'Nema prekoračenja ni zaboravljenih računa. Samo tako nastavite.']);

  const mk = ([kind, icon, title, text, action]) => ({ id: icon + title.replace(/[\d.,]+/g, '#'), kind, icon, title, text, action });
  return {
    alerts: out.filter((o) => o[0] !== 'good').map(mk),
    good: out.filter((o) => o[0] === 'good').map(mk),
    general: GENERAL.map(([icon, title, text, lesson]) => ({ ...mk(['tip', icon, title, text]), lesson })),
  };
}

const tipHTML = (t, i) => `<button class="tip tip-${t.kind}" data-i="${i}"><span class="tip-i">${t.icon}</span><span class="grow"><b>${t.title}</b><br><span class="muted small">${t.text}</span></span>${t.lesson || t.action ? '<span class="chev">›</span>' : ''}</button>`;

// Dodir na savet: opšti → serija kartica; upozorenje → mesto gde se rešava.
export function openTip(t) {
  if (t.lesson) return import('./lessons.js?v=20261108205259').then((m) => m.openLesson(t.lesson));
  const a = t.action || '';
  if (a.startsWith('cat:')) return import('./category-detail.js?v=20261108205259').then((m) => m.openCategoryDetail(currentMonthKey(), a.slice(4)));
  if (a === 'accounts') return import('./accounts.js?v=20261108205259').then((m) => m.openAccounts());
  if (a === 'goals') { location.hash = '#/ciljevi'; return; }
  if (a === 'plan') { location.hash = '#/plan'; }
}

export function renderSaveti(el) {
  const { alerts, good, general } = buildTips();
  const top = [...alerts, ...good];
  el.innerHTML = `
    <div class="section-head"><h3>Za ovaj mesec</h3></div>
    <section class="card list tips">${top.map((t, i) => tipHTML(t, i)).join('')}</section>
    <div class="section-head"><h3>Dobre navike</h3><span class="muted small">dodirni za više</span></div>
    <section class="card list tips">${general.map((t, i) => tipHTML(t, top.length + i)).join('')}</section>`;
  const all = [...top, ...general];
  el.querySelectorAll('.tip[data-i]').forEach((b) => (b.onclick = () => openTip(all[Number(b.dataset.i)])));
}

// ---- Savet na glavnoj kartici: svaki put drugi, ✕ sklanja do sutra ----
const HID = 'budzet_tips_hidden';
const today = () => todayISO();
function hiddenToday() {
  try { const o = JSON.parse(localStorage.getItem(HID) || '{}'); return new Set(Object.keys(o).filter((k) => o[k] === today())); } catch { return new Set(); }
}
export function hideTip(id) {
  try { const o = JSON.parse(localStorage.getItem(HID) || '{}'); for (const k of Object.keys(o)) if (o[k] !== today()) delete o[k]; o[id] = today(); localStorage.setItem(HID, JSON.stringify(o)); } catch {}
}
// Redosled: prvo upozorenja, pa korisni saveti; svako otvaranje aplikacije pomera na sledeći.
export function currentTip(seq) {
  const { alerts, good, general } = buildTips();
  const hidden = hiddenToday();
  const list = [...alerts, ...good, ...general].filter((t) => !hidden.has(t.id));
  if (!list.length) return null;
  const nAlerts = alerts.filter((t) => !hidden.has(t.id)).length;
  // Upozorenja se smenjuju češće: ako ih ima, svako drugo otvaranje je upozorenje.
  const i = nAlerts && seq % 2 === 0 ? Math.floor(seq / 2) % nAlerts : seq % list.length;
  return { tip: list[i], pos: list.indexOf(list[i]) + 1, total: list.length };
}

