// Podešavanja: korisnik, tema, kategorije, backup.
import { ico } from '../icons.js?v=20261108124130';
import * as S from '../store.js?v=20261108124130';
import { esc, todayISO, fmtDate, isoOf } from '../util.js?v=20261108124130';
import { openSheet, toast, confirmSheet } from '../ui.js?v=20261108124130';
import * as Sync from '../sync.js?v=20261108124130';

export function renderVise(el, ctx) {
  const st = S.getState();
  const me = st.settings.currentUser;

  el.innerHTML = `
    ${Sync.enabled ? accountBlock() : `
    <div class="section-head"><h3>Ko koristi ovaj uređaj</h3></div>
    <section class="card pad">
      <div class="seg seg-2" id="who">
        ${S.MEMBERS.map((m) => `<button data-v="${m.id}" class="${me === m.id ? 'on' : ''}">${esc(m.name)}</button>`).join('')}
      </div>
      <p class="muted small mt">Novi unosi sa ovog telefona biće označeni ovim imenom.</p>
    </section>`}

    <div class="section-head"><h3>Izgled</h3></div>
    <section class="card pad">
      <div class="seg seg-3" id="theme">
        ${[['light', 'Svetla'], ['dark', 'Tamna'], ['auto', 'Kao telefon']].map(([v, l]) =>
          `<button data-v="${v}" class="${st.settings.theme === v ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </section>

    <div class="section-head"><h3>Kategorije</h3></div>
    ${Object.entries(S.KINDS).map(([kind, k]) => `
      <section class="card list">
        <div class="list-title">${k.plural}</div>
        ${S.categoriesOf(kind, { includeArchived: true }).filter((c) => c.id !== 'iscurelo').map((c) => `
          <button class="tool-row cat-edit ${c.archived ? 'archived' : ''}" data-cat="${c.id}">
            <span class="cat-ico" style="--c:${c.color}">${ico(c)}</span>
            <span class="grow">${esc(c.name)}${c.fixed ? ' <span class="tag">mesečni račun</span>' : ''}${c.archived ? ' <span class="tag">sakriveno</span>' : ''}</span>
            <span class="muted">›</span>
          </button>`).join('')}
        <button class="add-line" data-newcat="${kind}">+ Nova kategorija</button>
      </section>`).join('')}

    <div class="section-head"><h3>Podaci</h3></div>
    <section class="card list">
      ${Sync.enabled ? '' : '<div class="sync-row"><span class="dot dot-pending"></span><span class="grow"><b>Lokalno</b><br><span class="muted small">Podaci su samo na ovom uređaju.</span></span></div>'}
      <button class="tool-row" id="export"><span class="grow">💾 Sačuvaj rezervnu kopiju<br><span class="muted small">fajl sa svim podacima, za svaki slučaj</span></span></button>
    </section>

    <details class="danger-zone">
      <summary>⚠️ Napredno <span class="muted small">— vraćanje i brisanje podataka</span></summary>
      <section class="card list">
        <p class="dz-note">Ove opcije menjaju podatke <b>za oba korisnika</b>. Pre svake, aplikacija sama sačuva rezervnu kopiju na ovaj telefon.</p>
        <button class="tool-row" id="import"><span class="grow">📂 Vrati podatke iz rezervne kopije<br><span class="muted small">i iz stare aplikacije budzet2026</span></span></button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
        <button class="tool-row t-red" id="reset">🗑️ Obriši sve podatke</button>
      </section>
    </details>

    <p class="muted small center mt-lg">Budžet · verzija 2.1</p>
  `;

  el.querySelector('#sync-now')?.addEventListener('click', async () => {
    await Sync.flush();
    await Sync.pull();
    const st = Sync.getStatus();
    toast(st.state === 'synced' ? 'Podaci osveženi ✅' : 'Osvežavanje nije uspelo — proveri internet', st.state === 'synced' ? 'ok' : 'bad');
  });
  el.querySelector('#discard')?.addEventListener('click', async () => {
    if (await confirmSheet({ title: 'Odbaci neposlate izmene?', text: 'Izmene koje nisu stigle do baze biće odbačene, a podaci ponovo preuzeti iz baze.', ok: 'Odbaci', danger: true })) {
      await Sync.discardPending();
      toast('Podaci ponovo preuzeti', 'ok');
    }
  });
  el.querySelector('#logout')?.addEventListener('click', async () => {
    const pending = Sync.getStatus().pending;
    const ok = await confirmSheet({ title: 'Odjavi se?', text: pending ? `<b>${pending} izmena još nije poslato u bazu</b> i biće izgubljeno.` : 'Podaci ostaju u bazi.', ok: 'Odjavi se', danger: !!pending });
    if (!ok) return;
    await Sync.signOut();
    location.reload();
  });
  el.querySelectorAll('#who button').forEach((b) => (b.onclick = async () => {
    await S.setSetting('currentUser', b.dataset.v);
    toast(`Zdravo, ${esc(S.member(b.dataset.v).name)} 👋`, 'ok');
  }));
  el.querySelectorAll('#theme button').forEach((b) => (b.onclick = () => S.setSetting('theme', b.dataset.v)));
  el.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => openCategorySheet(S.cat(b.dataset.cat))));
  el.querySelectorAll('[data-newcat]').forEach((b) => (b.onclick = () => openCategorySheet(null, b.dataset.newcat)));

  el.querySelector('#export').onclick = () => { downloadBackup(); toast('Rezervna kopija sačuvana u Preuzimanja (Downloads)', 'ok', 3500); };
  const file = el.querySelector('#import-file');
  el.querySelector('#import').onclick = () => file.click();
  file.onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (S.isNewFormat(data)) {
        if (!(await confirmSheet({ title: 'Vrati podatke iz kopije?', text: `Svi trenutni podaci <b>za oba korisnika</b> biće zamenjeni podacima iz kopije (${esc(f.name)}). Trenutni podaci se prvo sačuvaju kao rezervna kopija.`, ok: 'Vrati', danger: true }))) return;
        downloadBackup('pre-vracanja');
        await S.importNew(data);
        toast('Backup uvezen ✅', 'ok');
      } else if (S.isOldFormat(data)) {
        if (!(await confirmSheet({ title: 'Uvezi stari backup?', text: 'Stavke iz stare aplikacije postaju <b>plan</b> za januar–decembar 2026. Vanredni troškovi postaju stvarni unosi. Postojeći plan za 2026. biće zamenjen.', ok: 'Uvezi' }))) return;
        downloadBackup('pre-uvoza');
        await S.importOld(data, 2026);
        toast('Podaci iz stare aplikacije prebačeni ✅', 'ok');
      } else throw new Error('Nepoznat format');
    } catch (err) {
      toast('Ovaj fajl nije rezervna kopija budžeta.', 'bad');
    }
  };
  el.querySelector('#reset').onclick = () => openResetSheet();
}

function downloadBackup(tag = '') {
  const blob = new Blob([S.exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `budzet-kopija-${todayISO()}${tag ? '-' + tag : ''}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Brisanje svega: mora da se ukuca reč OBRIŠI.
function openResetSheet() {
  openSheet({
    title: 'Obriši sve podatke?',
    body: `
      <p class="sheet-text">Brišu se plan, svi unosi, ciljevi, stanja računa i beleške${Sync.enabled ? ' — <b>za oba korisnika</b>, u bazi' : ''}. Ovo se ne može poništiti.</p>
      <p class="sheet-text">Pre brisanja aplikacija sačuva rezervnu kopiju na ovaj telefon.</p>
      <div class="field-label">Za potvrdu ukucaj <b>OBRIŠI</b></div>
      <input class="input" id="r-word" autocomplete="off" autocapitalize="characters" placeholder="OBRIŠI">
      <div class="btn-row"><button class="btn btn-ghost" id="r-no">Odustani</button><button class="btn btn-danger" id="r-yes" disabled>Obriši sve</button></div>`,
    onMount(el, close) {
      const w = el.querySelector('#r-word'), yes = el.querySelector('#r-yes');
      const ok = () => ['OBRIŠI', 'OBRISI'].includes(w.value.trim().toUpperCase());
      w.oninput = () => (yes.disabled = !ok());
      el.querySelector('#r-no').onclick = close;
      yes.onclick = async () => {
        if (!ok()) return;
        downloadBackup('pre-brisanja');
        await S.resetAll();
        close();
        toast('Podaci obrisani. Rezervna kopija je u Preuzimanjima.', 'ok', 4000);
      };
    },
  });
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#94a3b8'];

function openCategorySheet(c, kind) {
  kind = c?.kind || kind;
  const v = { name: c?.name || '', icon: c?.icon || '📌', color: c?.color || COLORS[5], fixed: !!c?.fixed, archived: !!c?.archived };
  openSheet({
    title: c ? 'Izmena kategorije' : 'Nova kategorija',
    body: `
      <div class="cat-form">
        <input class="input icon-input" id="c-icon" maxlength="4" aria-label="Ikonica">
        <input class="input grow" id="c-name" maxlength="30" placeholder="Naziv kategorije">
      </div>
      <div class="field-label">Boja</div>
      <div class="swatches">${COLORS.map((col) => `<button class="swatch" data-col="${col}" style="--c:${col}" aria-label="${col}"></button>`).join('')}</div>
      ${kind === 'expense' ? `<label class="check"><input type="checkbox" id="c-fixed"><span><b>Račun ili rata</b> — plaća se jednom mesečno (rata, račun). Ne računa se u dnevni ritam potrošnje.</span></label>` : ''}
      ${c ? `<label class="check"><input type="checkbox" id="c-arch"><span>Sakrij kategoriju (ostaje u istoriji)</span></label>` : ''}
      <div class="btn-row sticky-actions"><button class="btn btn-primary" id="c-save">Sačuvaj</button></div>`,
    onMount(el, close) {
      const $ = (s) => el.querySelector(s);
      $('#c-icon').value = v.icon;
      $('#c-name').value = v.name;
      if ($('#c-fixed')) $('#c-fixed').checked = v.fixed;
      if ($('#c-arch')) $('#c-arch').checked = v.archived;
      const paint = () => el.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.col === v.color));
      el.querySelectorAll('.swatch').forEach((s) => (s.onclick = () => { v.color = s.dataset.col; paint(); }));
      paint();
      $('#c-save').onclick = async () => {
        const name = $('#c-name').value.trim();
        if (!name) { toast('Upiši naziv', 'warn'); return; }
        await S.saveCategory({
          ...(c ? { id: c.id } : {}),
          kind, name,
          icon: $('#c-icon').value.trim() || '📌',
          color: v.color,
          fixed: !!$('#c-fixed')?.checked,
          archived: !!$('#c-arch')?.checked,
        });
        toast('Kategorija sačuvana', 'ok');
        close();
      };
    },
  });
}

function accountBlock() {
  const st = Sync.getStatus();
  const me = S.member(S.getState().settings.currentUser);
  const label = { synced: 'Sve je sačuvano', syncing: 'Čuvam…', pending: 'Čuva se…', offline: 'Nema interneta — izmene će se sačuvati kad se veza vrati', error: 'Greška pri čuvanju', idle: 'Povezivanje…' }[st.state] || st.state;
  const dot = st.state === 'error' ? 'dot-error' : st.state === 'offline' || st.pending ? 'dot-pending' : 'dot-ok';
  const when = st.lastSync ? `${fmtDate(isoOf(new Date(st.lastSync)))} ${new Date(st.lastSync).toTimeString().slice(0, 5)}` : '—';
  return `
    <div class="section-head"><h3>Nalog</h3></div>
    <section class="card list" data-sync-text>
      <div class="sync-row">
        <span class="who who-lg" style="--c:${me.color}">${me.short}</span>
        <span class="grow"><b>${esc(me.name)}</b><br><span class="muted small">${esc(st.email)}</span></span>
      </div>
      <div class="sync-row">
        <span class="dot ${dot}"></span>
        <span class="grow"><b>${label}</b>${st.pending ? ` · ${st.pending} na čekanju` : ''}<br>
          <span class="muted small">Poslednje čuvanje: ${when}${st.error ? '<br>' + esc(st.error) : ''}</span></span>
      </div>
      <div class="sync-row muted small">Tačkica na tvom krugu gore desno: 🟢 sačuvano · 🟡 čuva se / nema interneta · 🔴 greška</div>
      <button class="tool-row" id="sync-now">🔄 Osveži podatke</button>
      ${st.state === 'error' && st.pending ? '<button class="tool-row t-red" id="discard">⚠️ Odbaci neposlate izmene</button>' : ''}
      <button class="tool-row" id="logout">🚪 Odjavi se</button>
    </section>`;
}
