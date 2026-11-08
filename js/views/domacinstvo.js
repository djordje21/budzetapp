// Domaćinstvo: članovi (Đorđe i Maksijana), ko je šta uneo ovog meseca, da li je sve sačuvano.
import * as S from '../store.js?v=20261108134755';
import * as Sync from '../sync.js?v=20261108134755';
import { txOfMonth } from '../calc.js?v=20261108134755';
import { esc, fmt, fmtNum, monthLabel, dayLabel } from '../util.js?v=20261108134755';

export function renderDomacinstvo(el, ctx) {
  const key = ctx.month;
  const txs = txOfMonth(key);
  const me = S.getState().settings.currentUser;
  const st = Sync.getStatus();
  const rows = S.MEMBERS.map((m) => {
    const mine = txs.filter((t) => t.by === m.id);
    const spent = mine.filter((t) => t.kind !== 'income').reduce((s, t) => s + Number(t.amount), 0);
    const last = [...mine].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    return `<div class="hh-member card">
      <span class="who who-xl" style="--c:${m.color}">${m.short}</span>
      <div class="grow">
        <div class="hh-name">${esc(m.name)}${m.id === me ? ' <span class="tag">ti</span>' : ''}</div>
        <div class="muted small">${mine.length} ${mine.length === 1 ? 'unos' : 'unosa'} u ${esc(monthLabel(key).toLowerCase())} · ${fmt(spent)}</div>
        ${last ? `<div class="muted small">Poslednji: ${esc(last.note || S.cat(last.categoryId).name)} · ${dayLabel(last.date)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <p class="hh-intro">Vi ste <b>povezani nalozi</b>: svako ima svoj login, a vidite <b>iste podatke</b>. Kad jedno unese trošak, drugo ga vidi odmah.</p>
    <div class="section-head"><h3>Članovi</h3></div>
    <div class="hh-list">${rows}</div>
    <div class="section-head"><h3>Čuvanje</h3></div>
    <section class="card pad hh-sync">
      <span class="dot ${st.state === 'error' ? 'dot-error' : st.state === 'offline' || st.pending ? 'dot-pending' : 'dot-ok'}"></span>
      <span>${st.state === 'error' ? 'Greška pri čuvanju — otvori Nalog za detalje' : st.state === 'offline' ? 'Nema interneta — izmene će se sačuvati kad se veza vrati' : 'Sve je sačuvano i vidljivo oboma'}</span>
    </section>
    <p class="muted small mt">Novog člana domaćinstva dodaje administrator baze (Supabase → Authentication → Users i tabela members).</p>`;
}
