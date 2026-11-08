// Saveti: konkretni predlozi na osnovu vaše potrošnje ovog meseca + par opštih pravila.
import * as S from '../store.js?v=20261108134755';
import { summarize, pace, monthPhase } from '../calc.js?v=20261108134755';
import { esc, fmt, fmtNum, currentMonthKey, daysInMonth, todayISO } from '../util.js?v=20261108134755';
import { unpaidBills } from '../pay.js?v=20261108134755';
import { goalStats } from './goals.js?v=20261108134755';

const GENERAL = [
  ['🐷', 'Prvo platite sebe', 'Kad legne plata, odmah uplatite štednju — pre računa i kupovine. Šta ostane, troši se.'],
  ['⏳', 'Pravilo 24 sata', 'Za svaku kupovinu veću od 5.000 RSD koja nije u planu, sačekajte dan. Pola takvih kupovina se ne desi.'],
  ['📅', 'Nedeljna provera', 'Jednom nedeljno (npr. nedeljom uveče) uporedite stanje u OTP aplikaciji sa aplikacijom. Pet minuta, a nema iznenađenja.'],
  ['🛒', 'Lista za nabavku', 'Kao u kuhinji: nabavka po spisku. Spontane kupovine u marketu su najčešći razlog prekoračenja hrane.'],
  ['🧯', 'Rezerva za nepredviđeno', 'Cilj: 3 mesečna troška na posebnom računu. Tako servis auta ili zubar ne ruše plan.'],
];

export function renderSaveti(el, ctx) {
  const key = currentMonthKey();
  const sum = summarize(key);
  const p = pace(sum);
  const out = [];
  const dim = daysInMonth(key), day = Number(todayISO().slice(8, 10));

  // Prekoračenja i ritam
  for (const r of sum.cats.filter((r) => r.cat.kind === 'expense' && r.plan > 0 && r.actual > r.plan))
    out.push(['bad', '⚠️', `${esc(r.cat.name)} je ${fmt(r.actual - r.plan)} preko plana`, 'Do kraja meseca probajte da ne trošite u ovoj kategoriji, ili povećajte plan ako je prvobitni iznos bio nerealan.']);
  if (p) for (const l of p.limits.filter((l) => l.left >= 0 && l.actual - l.plan * p.timePct > Math.max(1000, l.plan * .15)))
    out.push(['warn', '🏃', `${esc(l.cat.name)} ide brže od plana`, `Ostalo je ${fmt(l.left)} za ${p.daysLeft} dana${l.cat.id === 'hrana' || l.cat.id.startsWith('licno-') ? ` — oko ${fmtNum(Math.round(l.perDay / 50) * 50)} dnevno` : ''}.`]);

  // Neplaćeni računi pred kraj meseca
  const unpaid = unpaidBills(key);
  if (unpaid.length && day >= dim - 7)
    out.push(['warn', '🧾', `Još ${unpaid.length} neplaćen${unpaid.length === 1 ? ' račun' : 'ih računa'} pred kraj meseca`, unpaid.map((x) => esc(x.name)).join(', ') + '.']);

  // Novac bez namene
  if (sum.balancePlan > sum.tot.income.plan * .1 && sum.tot.income.plan)
    out.push(['info', '💡', `${fmt(sum.balancePlan)} u planu nema namenu`, 'Dodelite ga štednji ili cilju, inače će se potrošiti bez plana.']);

  // Štednja
  if (sum.tot.income.actual > 0 && !sum.tot.saving.actual && sum.tot.saving.plan)
    out.push(['info', '🐷', 'Plata je stigla, štednja još nije uplaćena', `Plan je ${fmt(sum.tot.saving.plan)}. Uplatite odmah — "Fiksni rashodi" → Uplati.`]);

  // Iscurelo
  const leak = S.leakedIn(`${key}-01`, `${key}-${dim}`);
  if (leak) out.push(['warn', '💧', `Ovog meseca je iscurelo ${fmt(leak)}`, 'Unosite troškove odmah posle plaćanja — najlakše preko + ili skeniranja računa.']);

  // Ciljevi
  for (const g of S.goalsOf()) {
    const gs = goalStats(g);
    if (!gs.done && gs.perMonth) out.push(['info', '🎯', `${esc(g.name)}: ${fmt(gs.perMonth)} mesečno`, `Toliko treba odvajati da do roka skupite ${fmt(g.target)}.`]);
  }

  // Stanje računa
  for (const a of S.ACCOUNTS) {
    const c = S.lastCheck(a.id);
    if (c && (Date.now() - Date.parse(c.at)) / 864e5 >= 7) out.push(['info', '🏦', `Stanje (${esc(a.name)}) nije provereno ${Math.floor((Date.now() - Date.parse(c.at)) / 864e5)} dana`, 'Meni → Stanje na računima → Proveri.']);
  }

  if (!out.length && monthPhase(key) === 'current') out.push(['good', '👌', 'Sve je u planu', 'Nema prekoračenja ni zaboravljenih računa. Samo tako nastavite.']);

  el.innerHTML = `
    <div class="section-head"><h3>Za ovaj mesec</h3></div>
    <section class="card list tips">${out.map(([k, i, t, d]) => `<div class="tip tip-${k}"><span class="tip-i">${i}</span><span class="grow"><b>${t}</b><br><span class="muted small">${d}</span></span></div>`).join('')}</section>
    <div class="section-head"><h3>Dobre navike</h3></div>
    <section class="card list tips">${GENERAL.map(([i, t, d]) => `<div class="tip"><span class="tip-i">${i}</span><span class="grow"><b>${t}</b><br><span class="muted small">${d}</span></span></div>`).join('')}</section>`;
}
