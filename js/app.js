// Ulazna tačka: navigacija, izbor meseca, tema.
import * as S from './store.js?v=20261107212806';
import { currentMonthKey, addMonths, monthLabel, MONTH_SHORT, esc } from './util.js?v=20261107212806';
import { openSheet } from './ui.js?v=20261107212806';
import { renderPregled } from './views/pregled.js?v=20261107212806';
import { renderPlan } from './views/plan.js?v=20261107212806';
import { renderIstorija } from './views/istorija.js?v=20261107212806';
import { renderVise } from './views/vise.js?v=20261107212806';
import { renderIzvestaji } from './views/izvestaji.js?v=20261107212806';
import { openEntrySheet } from './views/entry.js?v=20261107212806';
import { renderLogin } from './views/login.js?v=20261107212806';
import * as Sync from './sync.js?v=20261107212806';
import { VERSION } from './version.js?v=20261107212806';

const views = {
  pregled: { render: renderPregled, title: 'Pregled' },
  plan: { render: renderPlan, title: 'Plan' },
  istorija: { render: renderIstorija, title: 'Istorija' },
  izvestaji: { render: renderIzvestaji, title: 'Izveštaji' },
  vise: { render: renderVise, title: 'Više' },
};

const ctx = { month: currentMonthKey(), route: 'pregled' };
const $ = (s) => document.querySelector(s);

function applyTheme() {
  const t = S.getState().settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function render() {
  applyTheme();
  const st = S.getState();
  $('#month-label').textContent = monthLabel(ctx.month);
  $('#month-label').classList.toggle('is-now', ctx.month === currentMonthKey());
  const me = S.MEMBERS.find((m) => m.id === st.settings.currentUser);
  const who = $('#who-btn');
  who.textContent = me ? me.short : '?';
  who.style.setProperty('--c', me ? me.color : '#64748b');
  document.querySelector('.topbar').classList.toggle('hide-month', ctx.route === 'vise' || ctx.route === 'izvestaji');
  document.querySelector('.topbar').dataset.title = ctx.route === 'izvestaji' ? 'Izveštaji' : ctx.route === 'vise' ? 'Podešavanja' : '';

  document.querySelectorAll('.tabbar [data-route]').forEach((a) => a.classList.toggle('on', a.dataset.route === ctx.route));
  const view = $('#view');
  views[ctx.route].render(view, ctx);
}

function onRoute() {
  const r = location.hash.replace(/^#\/?/, '') || 'pregled';
  const changed = r !== ctx.route;
  ctx.route = views[r] ? r : 'pregled';
  render();
  if (changed) {
    window.scrollTo({ top: 0 });
    const v = $('#view');
    v.classList.remove('enter');
    void v.offsetWidth;
    v.classList.add('enter');
  }
}

function setMonth(k) {
  ctx.month = k;
  render();
}

function openMonthPicker() {
  let year = Number(ctx.month.slice(0, 4));
  const st = S.getState();
  const has = (k) => (st.plans[k]?.length || 0) > 0 || st.transactions.some((t) => t.date.startsWith(k));
  openSheet({
    title: 'Izaberi mesec',
    body: `<div class="year-nav"><button class="icon-btn" id="y-prev">‹</button><b id="y-label"></b><button class="icon-btn" id="y-next">›</button></div>
      <div class="month-grid" id="m-grid"></div>
      <button class="btn btn-soft btn-block mt" id="m-now">Idi na tekući mesec</button>`,
    onMount(el, close) {
      const paint = () => {
        el.querySelector('#y-label').textContent = year;
        el.querySelector('#m-grid').innerHTML = MONTH_SHORT.map((m, i) => {
          const k = `${year}-${String(i + 1).padStart(2, '0')}`;
          return `<button class="month-cell ${k === ctx.month ? 'on' : ''} ${k === currentMonthKey() ? 'now' : ''}" data-k="${k}">${m}${has(k) ? '<i></i>' : ''}</button>`;
        }).join('');
        el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { setMonth(b.dataset.k); close(); }));
      };
      el.querySelector('#y-prev').onclick = () => { year--; paint(); };
      el.querySelector('#y-next').onclick = () => { year++; paint(); };
      el.querySelector('#m-now').onclick = () => { setMonth(currentMonthKey()); close(); };
      paint();
    },
  });
}

function askWho() {
  openSheet({
    title: 'Ko koristi ovaj telefon?',
    body: `<p class="sheet-text">Unosi sa ovog uređaja biće označeni tvojim imenom. Možeš da promeniš kasnije u „Više“.</p>
      <div class="who-pick">${S.MEMBERS.map((m) => `<button class="who-big" data-v="${m.id}" style="--c:${m.color}"><span>${m.short}</span>${esc(m.name)}</button>`).join('')}</div>`,
    onMount(el, close) {
      el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = async () => { await S.setSetting('currentUser', b.dataset.v); close(); }));
    },
  });
}

// Prevlačenje levo/desno na pregledu menja mesec.
function enableSwipe() {
  let x0 = null, y0 = null;
  const v = $('#view');
  v.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  v.addEventListener('touchend', (e) => {
    if (x0 === null || ctx.route === 'vise' || ctx.route === 'izvestaji') return;
    if (e.target.closest('input, textarea, select, .chips')) { x0 = null; return; }
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) setMonth(addMonths(ctx.month, dx < 0 ? 1 : -1));
  }, { passive: true });
}

function paintSync(st = Sync.getStatus()) {
  const who = $('#who-btn');
  who.dataset.sync = !Sync.enabled ? '' : st.state === 'error' ? 'error' : st.state === 'offline' ? 'offline' : st.pending ? 'pending' : 'ok';
  if (ctx.route === 'vise') document.querySelector('[data-sync-text]') && render();
}

function init() {
  $('#prev-month').onclick = () => setMonth(addMonths(ctx.month, -1));
  $('#next-month').onclick = () => setMonth(addMonths(ctx.month, 1));
  $('#month-label').onclick = openMonthPicker;
  $('#who-btn').onclick = () => (location.hash = '#/vise');
  $('#fab').onclick = () => {
    // Ako gledaš drugi mesec, predloži datum u tom mesecu.
    const cur = currentMonthKey();
    openEntrySheet(ctx.month === cur ? {} : { date: `${ctx.month}-01` });
  };
  window.addEventListener('hashchange', onRoute);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', render);
  S.subscribe(render);
  Sync.onStatus(paintSync);
  enableSwipe();
  onRoute();
  paintSync();
  if (!Sync.enabled && !S.getState().settings.currentUser) askWho();
}

// Ako je na serveru novija verzija nego što je telefon učitao, osveži (jednom).
async function checkVersion() {
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    const { version } = await r.json();
    if (version && version !== VERSION && sessionStorage.getItem('budzet_reloaded') !== version) {
      sessionStorage.setItem('budzet_reloaded', version);
      location.replace(location.pathname + '?v=' + version + location.hash);
      return true;
    }
  } catch {}
  return false;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

async function boot() {
  if (await checkVersion()) return;
  if (Sync.enabled) {
    const session = await Sync.init().catch(() => null);
    if (!session) {
      renderLogin($('#view'), init);
      return;
    }
    // Odmah prikaži sačuvane podatke, a uskladi sa bazom u pozadini.
    init();
    Sync.start().catch(async (e) => {
      if (String(e?.message) === 'NOT_MEMBER') location.reload();
      else console.warn(e);
    });
  } else init();
}

boot();
