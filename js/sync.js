// Sinhronizacija sa Supabase bazom.
//
// Princip: aplikacija uvek radi nad lokalnim podacima (brzo, radi i bez interneta).
// Posle svake lokalne izmene računa se razlika u odnosu na ono što baza već ima ("shadow"),
// razlika ide u red za slanje ("outbox"), a red se šalje čim ima interneta.
// Promene drugog korisnika stižu preko Realtime kanala i pri svakom otvaranju aplikacije.

import * as S from './store.js?v=20261108204516';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=20261108204516';

const QKEY = 'budzetapp_outbox';
const SHKEY = 'budzetapp_shadow';
// Osnovne tabele + "opcione" tabele/kolone koje postoje tek posle SQL migracija (003 ciljevi, 004 računi).
const PK = { categories: 'id', goals: 'id', balance_checks: 'id', transfers: 'id', plan_items: 'id', transactions: 'id', notes: 'month' };
const UPSERT_ORDER = ['categories', 'goals', 'balance_checks', 'transfers', 'plan_items', 'transactions', 'notes'];
const DELETE_ORDER = ['transactions', 'plan_items', 'notes', 'transfers', 'balance_checks', 'goals', 'categories'];
const EMPTY = () => Object.fromEntries(Object.keys(PK).map((t) => [t, {}]));

// Liste u stanju aplikacije koje se 1:1 slikaju na tabelu.
const LISTS = {
  goals: {
    key: 'goals', feature: 'goals', order: 'created_at',
    to: (g) => ({ id: g.id, name: g.name, icon: g.icon || null, target: Number(g.target) || 0, start_amount: Number(g.startAmount) || 0, due: g.due || null, archived: !!g.archived, created_at: g.createdAt }),
    from: (r) => ({ id: r.id, name: r.name, icon: r.icon || '🎯', target: Number(r.target), startAmount: Number(r.start_amount) || 0, due: r.due || null, archived: !!r.archived, createdAt: r.created_at }),
  },
  balance_checks: {
    key: 'balanceChecks', feature: 'accounts', order: 'at',
    to: (c) => ({ id: c.id, account: c.account, amount: Number(c.amount) || 0, at: c.at, by_member: c.by || null }),
    from: (r) => ({ id: r.id, account: r.account, amount: Number(r.amount), at: r.at, by: r.by_member || null }),
  },
  transfers: {
    key: 'transfers', feature: 'accounts', order: 'created_at',
    to: (x) => ({ id: x.id, date: x.date, from_account: x.from, to_account: x.to, amount: Number(x.amount) || 0, note: x.note || '', by_member: x.by || null, created_at: x.createdAt }),
    from: (r) => ({ id: r.id, date: r.date, from: r.from_account, to: r.to_account, amount: Number(r.amount), note: r.note || '', by: r.by_member || null, createdAt: r.created_at }),
  },
};
// Opcione kolone u transactions: kolona -> [polje u aplikaciji, funkcija]
const TX_OPT = { goal_id: ['goalId', 'goals'], account: ['account', 'accounts'] };

// Dok tabela za neku funkciju ne postoji, njeni podaci ostaju lokalno i šalju se kad migracija bude pokrenuta.
const avail = { goals: true, accounts: true };
export const isAvailable = (f) => avail[f];
const tableOn = (t) => !LISTS[t] || avail[LISTS[t].feature];

export const enabled = !!(SUPABASE_URL && SUPABASE_KEY && window.supabase?.createClient);

let sb = null;
let session = null;
let channel = null;
let started = false;
let flushing = false;
let flushTimer = null;
let lastPull = 0;

const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const isNetErr = (e) => !navigator.onLine || /fetch|network|timeout/i.test(String(e?.message || e));
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let queue = load(QKEY, []);
let shadow = load(SHKEY, null); // { table: { key: JSON } } — null = uređaj još nije sinhronizovan

// ---- Status (za tačkicu na avataru i ekran "Više") ----
const status = { state: 'idle', error: '', lastSync: load('budzetapp_lastsync', null) };
const statusSubs = new Set();
export const getStatus = () => ({ ...status, pending: queue.length, email: session?.user?.email || '' });
export const onStatus = (fn) => { statusSubs.add(fn); return () => statusSubs.delete(fn); };
function setStatus(state, error = '') {
  status.state = state;
  status.error = error;
  if (state === 'synced') { status.lastSync = new Date().toISOString(); save('budzetapp_lastsync', status.lastSync); }
  statusSubs.forEach((fn) => fn(getStatus()));
}

// ---- Pretvaranje: lokalni podaci <-> redovi u bazi ----
function rowsFromState(st) {
  const out = EMPTY();
  for (const [t, L] of Object.entries(LISTS)) for (const x of st[L.key] || []) out[t][x.id] = L.to(x);
  for (const c of st.categories)
    out.categories[c.id] = { id: c.id, name: c.name, kind: c.kind, icon: c.icon || null, color: c.color || null, fixed: !!c.fixed, archived: !!c.archived };
  for (const [month, items] of Object.entries(st.plans))
    for (const p of items)
      out.plan_items[p.id] = { id: p.id, month, line: p.line, category_id: p.categoryId, name: p.name, amount: Number(p.amount) || 0, owner: p.owner || 'zaj' };
  for (const t of st.transactions) {
    const r = { id: t.id, date: t.date, kind: t.kind, category_id: t.categoryId, amount: Number(t.amount) || 0, note: t.note || '', by_member: t.by, created_at: t.createdAt };
    if (t.planLine) r.plan_line = t.planLine;
    for (const [col, [field, f]] of Object.entries(TX_OPT)) if (field in t && avail[f]) r[col] = t[field] || null;
    out.transactions[t.id] = r;
  }
  for (const [month, text] of Object.entries(st.notes))
    if (text) out.notes[month] = { month, text };
  return out;
}

const catFromRow = (r) => ({ id: r.id, name: r.name, kind: r.kind, icon: r.icon || '📌', color: r.color || '#94a3b8', fixed: !!r.fixed, archived: !!r.archived });
const planFromRow = (r) => ({ id: r.id, line: r.line, categoryId: r.category_id, name: r.name, amount: Number(r.amount), owner: r.owner });
function txFromRow(r) {
  const t = { id: r.id, date: r.date, kind: r.kind, categoryId: r.category_id, amount: Number(r.amount), note: r.note || '', by: r.by_member, createdAt: r.created_at };
  if (r.plan_line) t.planLine = r.plan_line;
  for (const [col, [field]] of Object.entries(TX_OPT)) if (r[col]) t[field] = r[col];
  return t;
}

const catRank = (c) => { const i = S.DEFAULT_CATEGORIES.findIndex((d) => d.id === c.id); return i < 0 ? 999 : i; };

const toJSONMap = (rows) => Object.fromEntries(Object.entries(rows).map(([t, m]) => [t, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, JSON.stringify(v)]))]));

// ---- Red za slanje ----
function enqueue(table, op, key, row) {
  const i = queue.findIndex((q) => q.table === table && q.key === key);
  if (i >= 0) {
    // Novi objekat na istom mestu: redosled ostaje, a slanje u toku ne briše noviju verziju.
    if (op === 'upsert' && queue[i].op === 'upsert') { queue[i] = { table, op, key, row }; return; }
    queue.splice(i, 1);
  }
  queue.push(op === 'upsert' ? { table, op, key, row } : { table, op, key });
}

function onLocalChange() {
  if (!shadow) return;
  const now = rowsFromState(S.getState());
  for (const t of UPSERT_ORDER) {
    if (!tableOn(t)) continue;
    const prev = shadow[t] || {};
    for (const [k, row] of Object.entries(now[t])) if (prev[k] !== JSON.stringify(row)) enqueue(t, 'upsert', k, row);
  }
  for (const t of DELETE_ORDER) {
    if (!tableOn(t)) continue;
    const prev = shadow[t] || {};
    for (const k of Object.keys(prev)) if (!(k in now[t])) enqueue(t, 'delete', k);
  }
  const keep = {};
  for (const t of Object.keys(LISTS)) if (!tableOn(t)) keep[t] = shadow[t] || {};
  shadow = { ...toJSONMap(now), ...keep };
  save(SHKEY, shadow);
  save(QKEY, queue);
  setStatus(queue.length ? 'pending' : status.state);
  scheduleFlush();
}

function scheduleFlush(ms = 600) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, ms);
}

export async function flush() {
  if (!sb || !session || flushing || !queue.length) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  flushing = true;
  setStatus('syncing');
  try {
    while (queue.length) {
      const first = queue[0];
      let n = 1;
      while (n < queue.length && n < 500 && queue[n].table === first.table && queue[n].op === first.op) n++;
      const batch = queue.slice(0, n);
      const res = first.op === 'upsert'
        ? await sb.from(first.table).upsert(batch.map((b) => b.row), { onConflict: PK[first.table] })
        : await sb.from(first.table).delete().in(PK[first.table], batch.map((b) => b.key));
      if (res.error) throw res.error;
      queue = queue.filter((q) => !batch.includes(q));
      save(QKEY, queue);
    }
    setStatus('synced');
  } catch (e) {
    console.warn('Slanje nije uspelo', e);
    setStatus(isNetErr(e) ? 'offline' : 'error', isNetErr(e) ? '' : e.message || String(e));
    scheduleFlush(20000);
  } finally {
    flushing = false;
  }
}

// ---- Preuzimanje svega iz baze ----
async function fetchAll(table, order) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb.from(table).select('*').order(order).range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

export async function pull() {
  if (!sb || !session) return;
  if (queue.length) { await flush(); if (queue.length) return; }
  setStatus('syncing');
  try {
    const listNames = Object.keys(LISTS);
    const [cats, plans, txs, notes, ...opt] = await Promise.all([
      fetchAll('categories', 'id'),
      fetchAll('plan_items', 'name'),
      fetchAll('transactions', 'created_at'),
      fetchAll('notes', 'month'),
      ...listNames.map((t) => fetchAll(t, LISTS[t].order).catch((e) => { console.warn(`Tabela ${t} ne postoji (pokreni migraciju)`, e); return null; })),
    ]);
    if (queue.length) { scheduleFlush(0); return; } // korisnik je nešto menjao u međuvremenu
    const optRes = Object.fromEntries(listNames.map((t, i) => [t, opt[i]]));
    const newAvail = {};
    for (const f of Object.keys(avail)) newAvail[f] = listNames.filter((t) => LISTS[t].feature === f).every((t) => optRes[t] !== null);

    const planMap = {};
    for (const r of plans) (planMap[r.month] ||= []).push(planFromRow(r));
    const needDefaults = S.missingDefaults(cats);
    const st0 = S.getState();

    // Liste (ciljevi, provere stanja, prebacivanja): lokalni redovi koje baza još nema se čuvaju i šalju.
    const lists = {}, localOnly = {}, remoteLists = {};
    for (const t of listNames) {
      const L = LISTS[t];
      if (!newAvail[L.feature]) { lists[L.key] = st0[L.key] || []; remoteLists[L.key] = []; continue; }
      const remote = optRes[t].map(L.from);
      const ids = new Set(remote.map((x) => x.id));
      localOnly[L.key] = (st0[L.key] || []).filter((x) => !ids.has(x.id) && !(shadow?.[t] && x.id in shadow[t]));
      lists[L.key] = remote;
      remoteLists[L.key] = remote;
    }

    // Opciona polja unosa (cilj, račun): sačuvaj lokalne vrednosti dok baza nema kolonu, i pošalji ih kad je dobije.
    const remoteTx = txs.map(txFromRow);
    const keepF = Object.values(TX_OPT).filter(([, f]) => !newAvail[f] || !avail[f]);
    const localById = new Map(st0.transactions.map((t) => [t.id, t]));
    const mergedTx = keepF.length ? remoteTx.map((t) => {
      const o = localById.get(t.id);
      if (!o) return t;
      const c = { ...t };
      for (const [field] of keepF) if (!c[field] && o[field]) c[field] = o[field];
      return c;
    }) : remoteTx;
    const newlyOnWithData = keepF.some(([field, f]) => newAvail[f] && mergedTx.some((t) => t[field]));

    S.replaceData({
      categories: cats.map(catFromRow).sort((a, b) => catRank(a) - catRank(b) || a.name.localeCompare(b.name, 'sr')),
      plans: planMap,
      transactions: mergedTx,
      notes: Object.fromEntries(notes.map((n) => [n.month, n.text])),
      ...lists,
    });
    Object.assign(avail, newAvail);

    // Shadow = ono što baza zaista ima.
    const remoteState = { ...S.getState(), categories: cats.map(catFromRow), transactions: remoteTx, ...remoteLists };
    shadow = toJSONMap(rowsFromState(remoteState));
    save(SHKEY, shadow);

    const anyLocalOnly = Object.values(localOnly).some((a) => a.length);
    if (anyLocalOnly) S.applyRemote((st) => { for (const [k, arr] of Object.entries(localOnly)) st[k] = [...(st[k] || []), ...arr]; });
    if (anyLocalOnly || newlyOnWithData || needDefaults) onLocalChange();
    lastPull = Date.now();
    setStatus('synced');
  } catch (e) {
    console.warn('Preuzimanje nije uspelo', e);
    setStatus(isNetErr(e) ? 'offline' : 'error', isNetErr(e) ? '' : e.message || String(e));
  }
}

// ---- Promene uživo (drugi korisnik) ----
function onRemote(payload) {
  const table = payload.table;
  const pk = PK[table];
  if (!pk) return;
  const isDelete = payload.eventType === 'DELETE';
  const row = isDelete ? payload.old : payload.new;
  const key = row?.[pk];
  if (key == null) return;
  if (queue.some((q) => q.table === table && q.key === key)) return; // lokalna izmena ima prednost

  shadow ||= EMPTY();
  shadow[table] ||= {};
  if (isDelete) {
    if (!(key in shadow[table])) return;
    delete shadow[table][key];
  } else {
    // Normalizuj red kroz lokalni format da bi poređenje bilo tačno (izbegava "eho" sopstvenih izmena).
    const json = JSON.stringify(normalizeRow(table, row));
    if (shadow[table][key] === json) return;
    shadow[table][key] = json;
  }
  save(SHKEY, shadow);

  S.applyRemote((st) => {
    if (table === 'categories') {
      st.categories = st.categories.filter((c) => c.id !== key);
      if (!isDelete) st.categories.push(catFromRow(row));
    } else if (table === 'plan_items') {
      for (const m of Object.keys(st.plans)) st.plans[m] = st.plans[m].filter((p) => p.id !== key);
      if (!isDelete) (st.plans[row.month] ||= []).push(planFromRow(row));
    } else if (table === 'transactions') {
      const old = st.transactions.find((t) => t.id === key);
      st.transactions = st.transactions.filter((t) => t.id !== key);
      if (!isDelete) {
        const t = txFromRow(row);
        // Baza bez opcione kolone (pre migracije) ne sme da obriše lokalnu vrednost.
        for (const [col, [field]] of Object.entries(TX_OPT)) if (!(col in row) && old?.[field]) t[field] = old[field];
        st.transactions.push(t);
      }
    } else if (LISTS[table]) {
      const L = LISTS[table];
      st[L.key] = (st[L.key] || []).filter((x) => x.id !== key);
      if (!isDelete) st[L.key].push(L.from(row));
    } else if (table === 'notes') {
      if (isDelete) delete st.notes[key];
      else st.notes[key] = row.text;
    }
  });
}

function normalizeRow(table, row) {
  const st = { categories: [], plans: {}, transactions: [], notes: {} };
  for (const L of Object.values(LISTS)) st[L.key] = [];
  if (LISTS[table]) st[LISTS[table].key].push(LISTS[table].from(row));
  if (table === 'categories') st.categories.push(catFromRow(row));
  if (table === 'plan_items') st.plans[row.month] = [planFromRow(row)];
  if (table === 'transactions') st.transactions.push(txFromRow(row));
  if (table === 'notes') st.notes[row.month] = row.text;
  const rows = rowsFromState(st)[table];
  return rows[row[PK[table]]] ?? row;
}

function subscribeRealtime() {
  if (channel) return;
  let ch = sb.channel('budzet');
  for (const t of ['categories', 'plan_items', 'transactions', 'notes', ...Object.keys(LISTS).filter(tableOn)])
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onRemote);
  channel = ch.subscribe();
}

// ---- Prijava ----
export async function init() {
  if (!enabled) return null;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'budzetapp_auth' },
  });
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((ev, s) => {
    session = s;
    if (ev === 'PASSWORD_RECOVERY') window.dispatchEvent(new Event('budzet:recovery'));
  });
  return session;
}

export const isSignedIn = () => !!session;

// Zaboravljena lozinka: Supabase šalje email sa linkom nazad u aplikaciju.
export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
export async function setNewPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  session = data.session;
}

// Posle prijave: utvrdi ko je korisnik, uskladi podatke i uključi promene uživo.
export async function start() {
  if (started || !session) return;
  S.setSyncHook(onLocalChange);

  const email = session.user.email.toLowerCase();
  const { data: members, error } = await sb.from('members').select('email, member_id, name');
  if (error) {
    // Bez interneta: radi sa sačuvanim podacima ako je uređaj već bio sinhronizovan.
    if (shadow) { setStatus('offline'); window.addEventListener('online', () => start(), { once: true }); return; }
    throw error;
  }
  const me = members.find((m) => m.email.toLowerCase() === email);
  if (!me) {
    await sb.auth.signOut();
    session = null;
    throw new Error('NOT_MEMBER');
  }
  started = true;
  if (S.getState().settings.currentUser !== me.member_id) await S.setSetting('currentUser', me.member_id);

  await firstSync();
  subscribeRealtime();

  window.addEventListener('online', () => { flush().then(pull); });
  window.addEventListener('offline', () => setStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPull > 15000) flush().then(pull);
  });
}

async function firstSync() {
  if (shadow) { await flush(); await pull(); return; }

  const { data, error } = await sb.from('categories').select('id').limit(1);
  if (error) throw error;
  if (!data.length) {
    // Baza je prazna: ovaj uređaj je prvi — šalje sve što ima (kategorije, plan, unose).
    shadow = EMPTY();
    onLocalChange();
    await flush();
  } else {
    // Baza već ima podatke: lokalni podaci se čuvaju kao rezervna kopija, pa se preuzima baza.
    const st = S.getState();
    if (st.transactions.length || Object.keys(st.plans).length) {
      try { localStorage.setItem('budzetapp_v2_pre_sync_backup', S.exportJSON()); } catch {}
    }
  }
  await pull();
}

export async function signOut() {
  try { if (channel) await sb.removeChannel(channel); } catch {}
  channel = null;
  await sb.auth.signOut();
  session = null;
  started = false;
  queue = [];
  shadow = null;
  save(QKEY, queue);
  localStorage.removeItem(SHKEY);
  S.setSyncHook(null);
  setStatus('idle');
}

export function discardPending() {
  queue = [];
  save(QKEY, queue);
  shadow = null;
  localStorage.removeItem(SHKEY);
  return firstSync();
}

// Poziv Supabase Edge funkcije (npr. 'racun' za fiskalne račune), sa vremenskim ograničenjem.
export async function invoke(name, body, timeoutMs = 9000) {
  if (!sb || !session) throw new Error('Nije prijavljen');
  const t = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs));
  const { data, error } = await Promise.race([sb.functions.invoke(name, { body }), t]);
  if (error) throw error;
  return data;
}
