// Kratke serije finansijskih saveta (3–4 kartice) sa akcijom na kraju.
import * as S from '../store.js?v=20261108205259';
import { summarize } from '../calc.js?v=20261108205259';
import { esc, fmt, currentMonthKey } from '../util.js?v=20261108205259';
import { openSheet, toast } from '../ui.js?v=20261108205259';

// Mesečni fiksni troškovi (rate, računi, hrana, gorivo, džeparac...) — za računanje rezerve.
function monthlyNeeds() {
  const sum = summarize(currentMonthKey());
  return sum.tot.expense.plan || 0;
}

export const LESSONS = {
  'platite-sebe': {
    icon: '🐷', title: 'Prvo platite sebe',
    pages: [
      ['Ideja', 'Štednja nije ono što ostane na kraju meseca — na kraju meseca obično ne ostane ništa. Štednja je <b>prvi račun</b> koji plaćate, istog dana kad legne plata.'],
      ['Koliko', 'Dobar cilj je <b>10–20% prihoda</b>. Ako je to previše za početak, krenite od 5% i povećavajte za 1% svaka dva meseca — razliku nećete ni osetiti.'],
      ['Kako da se ne zaboravi', 'U OTP aplikaciji napravite <b>trajni nalog</b> na štedni račun za dan posle plate (npr. 6. i 21. u mesecu). Šta se ne vidi na tekućem računu, ne troši se.'],
      ['U aplikaciji', 'Štednja je u planu kao fiksni rashod. Kad uplatite, dodirnite <b>Uplati</b> — i vezujte je za cilj, da se vidi napredak.'],
    ],
    action: { label: 'Otvori Plan', run: () => (location.hash = '#/plan') },
  },
  '24h': {
    icon: '⏳', title: 'Pravilo 24 sata',
    pages: [
      ['Zašto', 'Većina prekoračenja nisu velike odluke, nego <b>spontane kupovine</b>: akcija, popust, "baš mi treba". Mozak traži nagradu sada, a račun stiže kasnije.'],
      ['Pravilo', 'Za sve što <b>nije u planu i košta preko 5.000 RSD</b> — sačekajte 24 sata. Ako vam i sutra treba, kupite bez griže savesti.'],
      ['Za veće stvari', 'Preko 30.000 RSD: pravilo <b>30 dana</b>. Zapišite stvar kao cilj štednje. Ako posle mesec dana i dalje želite — skupljate za nju, bez duga.'],
    ],
    action: { label: 'Napravi cilj za veću kupovinu', run: () => import('./goals.js?v=20261108205259').then((m) => m.openGoalForm(null)) },
  },
  'nedeljna': {
    icon: '📅', title: 'Nedeljna provera',
    pages: [
      ['Zašto', 'Mali zaboravljeni troškovi se gomilaju. Posle mesec dana niko ne zna gde je otišlo 8.000 dinara. Posle nedelju dana — još se sećate.'],
      ['Ritual od 5 minuta', '1) Otvorite OTP aplikaciju. 2) U Budžetu: meni → <b>Stanje na računima</b> → Proveri. 3) Ako ima razlike, setite se i unesite šta fali.'],
      ['Isto vreme, zajedno', 'Najbolje <b>nedeljom uveče, vas dvoje</b>. Kao kratak brifing pre smene — pet minuta i obe strane znaju gde su.'],
    ],
    action: { label: 'Proveri stanje sada', run: () => import('./accounts.js?v=20261108205259').then((m) => m.openAccounts()) },
  },
  'nabavka': {
    icon: '🛒', title: 'Lista za nabavku',
    pages: [
      ['Kao u kuhinji', 'U kuhinji ne naručujete "šta vidite" nego po <b>par nivou i spisku</b>. Kod kuće isto: nabavka po listi je najveća ušteda na hrani.'],
      ['Nedeljni jelovnik', 'Isplanirajte 4–5 večera za nedelju. Lista se pravi iz jelovnika, a ostaci se koriste — manje bacanja, manje kupovine.'],
      ['Pravila u marketu', 'Ne kupujte gladni. Jedna velika nabavka nedeljno + male dopune (hleb, mleko). Akcija se računa samo ako je stvar i bila na listi.'],
    ],
    action: { label: 'Pogledaj potrošnju na hranu', run: () => import('./category-detail.js?v=20261108205259').then((m) => m.openCategoryDetail(currentMonthKey(), 'hrana')) },
  },
  'rezerva': {
    icon: '🧯', title: 'Rezerva za nepredviđeno',
    pages: [
      ['Šta je to', 'Novac koji <b>ne dirate</b> osim za hitno: kvar auta, zubar, gubitak posla. Bez rezerve, svaka takva situacija ide na kredit ili minus.'],
      ['Koliko', () => `Cilj je <b>3 meseca troškova</b>. Po vašem planu to je oko <b>${fmt(monthlyNeeds() * 3)}</b>. Prvi korak: 1 mesec, ${fmt(monthlyNeeds())}.`],
      ['Gde', 'Na <b>posebnom štednom računu</b>, ne na tekućem (tu se lako potroši) i ne u investicijama (vrednost može da padne baš kad zatreba).'],
      ['Kako', 'Kao cilj štednje sa mesečnom uplatom. Aplikacija računa koliko mesečno treba da biste ga skupili do roka.'],
    ],
    action: {
      label: 'Napravi cilj „Rezerva“',
      run: async () => {
        const target = Math.round((monthlyNeeds() * 3) / 1000) * 1000 || 300000;
        if (S.goalsOf().some((g) => /rezerv/i.test(g.name))) { toast('Cilj „Rezerva“ već postoji — pogledaj u Ciljevima štednje', 'ok'); location.hash = '#/ciljevi'; return; }
        await S.saveGoal({ name: 'Rezerva za nepredviđeno', icon: '🧯', target, startAmount: 0, due: null });
        toast(`🎯 Napravljen cilj „Rezerva“: ${fmt(target)}`, 'ok', 3500);
        location.hash = '#/ciljevi';
      },
    },
  },
};

export function openLesson(id) {
  const L = LESSONS[id];
  if (!L) return;
  let i = 0;
  openSheet({
    title: `${L.icon} ${L.title}`,
    body: `<div class="lesson">
      <div class="ls-dots">${L.pages.map((_, k) => `<i data-k="${k}"></i>`).join('')}</div>
      <h3 class="ls-h"></h3><p class="ls-t"></p>
      <div class="btn-row"><button class="btn btn-ghost" id="ls-back">← Nazad</button><button class="btn btn-primary" id="ls-next">Dalje →</button></div>
    </div>`,
    onMount(el, close) {
      const paint = () => {
        const [h, t] = L.pages[i];
        el.querySelector('.ls-h').textContent = h;
        el.querySelector('.ls-t').innerHTML = typeof t === 'function' ? t() : t;
        el.querySelectorAll('.ls-dots i').forEach((d) => d.classList.toggle('on', Number(d.dataset.k) <= i));
        el.querySelector('#ls-back').style.visibility = i ? 'visible' : 'hidden';
        el.querySelector('#ls-next').textContent = i < L.pages.length - 1 ? 'Dalje →' : L.action ? L.action.label : 'Zatvori';
        el.querySelector('.lesson').classList.remove('ls-in'); void el.offsetWidth; el.querySelector('.lesson').classList.add('ls-in');
      };
      el.querySelector('#ls-back').onclick = () => { if (i > 0) { i--; paint(); } };
      el.querySelector('#ls-next').onclick = () => {
        if (i < L.pages.length - 1) { i++; paint(); return; }
        close();
        if (L.action) setTimeout(() => L.action.run(), 220);
      };
      paint();
      void esc;
    },
  });
}
