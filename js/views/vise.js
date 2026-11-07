// Podešavanja: korisnik, tema, kategorije, backup.
import * as S from '../store.js';
import { esc, todayISO } from '../util.js';
import { openSheet, toast, confirmSheet } from '../ui.js';

export function renderVise(el, ctx) {
  const st = S.getState();
  const me = st.settings.currentUser;

  el.innerHTML = `
    <div class="section-head"><h3>Ko koristi ovaj uređaj</h3></div>
    <section class="card pad">
      <div class="seg seg-2" id="who">
        ${S.MEMBERS.map((m) => `<button data-v="${m.id}" class="${me === m.id ? 'on' : ''}">${esc(m.name)}</button>`).join('')}
      </div>
      <p class="muted small mt">Novi unosi sa ovog telefona biće označeni ovim imenom.</p>
    </section>

    <div class="section-head"><h3>Izgled</h3></div>
    <section class="card pad">
      <div class="seg seg-3" id="theme">
        ${[['auto', 'Automatski'], ['light', 'Svetla'], ['dark', 'Tamna']].map(([v, l]) =>
          `<button data-v="${v}" class="${st.settings.theme === v ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </section>

    <div class="section-head"><h3>Kategorije</h3></div>
    ${Object.entries(S.KINDS).map(([kind, k]) => `
      <section class="card list">
        <div class="list-title">${k.plural}</div>
        ${S.categoriesOf(kind, { includeArchived: true }).map((c) => `
          <button class="tool-row cat-edit ${c.archived ? 'archived' : ''}" data-cat="${c.id}">
            <span class="cat-ico" style="--c:${c.color}">${c.icon}</span>
            <span class="grow">${esc(c.name)}${c.fixed ? ' <span class="tag">fiksni</span>' : ''}${c.archived ? ' <span class="tag">sakriveno</span>' : ''}</span>
            <span class="muted">›</span>
          </button>`).join('')}
        <button class="add-line" data-newcat="${kind}">+ Nova kategorija</button>
      </section>`).join('')}

    <div class="section-head"><h3>Podaci</h3></div>
    <section class="card list">
      <div class="sync-row"><span class="dot dot-local"></span><span class="grow"><b>Lokalno</b><br><span class="muted small">Podaci su samo na ovom uređaju. Zajednička sinhronizacija (Supabase) stiže u sledećem koraku.</span></span></div>
      <button class="tool-row" id="export">⬇️ Izvezi backup (.json)</button>
      <button class="tool-row" id="import">⬆️ Uvezi backup <span class="muted small">— radi i sa starim budzet2026 backupom</span></button>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
      <button class="tool-row t-red" id="reset">🗑️ Obriši sve podatke</button>
    </section>

    <p class="muted small center mt-lg">Budžet · verzija 2.0</p>
  `;

  el.querySelectorAll('#who button').forEach((b) => (b.onclick = async () => {
    await S.setSetting('currentUser', b.dataset.v);
    toast(`Zdravo, ${esc(S.member(b.dataset.v).name)} 👋`, 'ok');
  }));
  el.querySelectorAll('#theme button').forEach((b) => (b.onclick = () => S.setSetting('theme', b.dataset.v)));
  el.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => openCategorySheet(S.cat(b.dataset.cat))));
  el.querySelectorAll('[data-newcat]').forEach((b) => (b.onclick = () => openCategorySheet(null, b.dataset.newcat)));

  el.querySelector('#export').onclick = () => {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budzet-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup preuzet', 'ok');
  };
  const file = el.querySelector('#import-file');
  el.querySelector('#import').onclick = () => file.click();
  file.onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (S.isNewFormat(data)) {
        if (!(await confirmSheet({ title: 'Uvezi backup?', text: 'Svi trenutni podaci na ovom uređaju biće zamenjeni podacima iz backupa.', ok: 'Uvezi' }))) return;
        await S.importNew(data);
        toast('Backup uvezen ✅', 'ok');
      } else if (S.isOldFormat(data)) {
        if (!(await confirmSheet({ title: 'Uvezi stari backup?', text: 'Stavke iz stare aplikacije postaju <b>plan</b> za januar–decembar 2026. Vanredni troškovi postaju stvarni unosi. Postojeći plan za 2026. biće zamenjen.', ok: 'Uvezi' }))) return;
        await S.importOld(data, 2026);
        toast('Stari backup uvezen ✅', 'ok');
      } else throw new Error('Nepoznat format');
    } catch (err) {
      toast('Fajl nije ispravan backup.', 'bad');
    }
  };
  el.querySelector('#reset').onclick = async () => {
    if (await confirmSheet({ title: 'Obriši sve?', text: 'Brišu se plan, unosi i beleške na ovom uređaju. Preporuka: prvo izvezi backup.', ok: 'Obriši sve', danger: true })) {
      await S.resetAll();
      toast('Podaci obrisani', 'ok');
    }
  };
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
      ${kind === 'expense' ? `<label class="check"><input type="checkbox" id="c-fixed"><span><b>Fiksni trošak</b> — plaća se jednom mesečno (rata, račun). Ne računa se u dnevni ritam potrošnje.</span></label>` : ''}
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
