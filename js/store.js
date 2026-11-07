// Skladište podataka. Za sada lokalno (localStorage); kasnije se ovde uključuje Supabase
// bez menjanja ekrana — svi ekrani koriste samo funkcije iz ovog fajla.

import { uid, addMonths } from './util.js?v=20261107220058';

const KEY = 'budzetapp_v2';

export const MEMBERS = [
  { id: 'dj', name: 'Đorđe', short: 'Đ', color: '#8b5cf6' },
  { id: 'm', name: 'Maksijana', short: 'M', color: '#ec4899' },
];
export const OWNERS = [{ id: 'zaj', name: 'Zajedničko', short: 'Z', color: '#64748b' }, ...MEMBERS];
export const member = (id) => OWNERS.find((m) => m.id === id) || OWNERS[0];

export const KINDS = {
  expense: { label: 'Trošak', acc: 'trošak', plural: 'Troškovi', sign: -1 },
  income: { label: 'Prihod', acc: 'prihod', plural: 'Prihodi', sign: 1 },
  saving: { label: 'Štednja', acc: 'štednju', plural: 'Štednja i investicije', sign: -1 },
};

// fixed = trošak koji se plaća jednom mesečno (rata, račun) — ne ulazi u "ritam potrošnje".
export const DEFAULT_CATEGORIES = [
  { id: 'krediti', name: 'Krediti i rate', kind: 'expense', icon: '🏦', color: '#ef4444', fixed: true },
  { id: 'racuni', name: 'Računi', kind: 'expense', icon: '🧾', color: '#f97316', fixed: true },
  { id: 'hrana', name: 'Hrana i namirnice', kind: 'expense', icon: '🛒', color: '#eab308' },
  { id: 'auto', name: 'Gorivo i auto', kind: 'expense', icon: '⛽', color: '#0ea5e9' },
  { id: 'zdravlje', name: 'Zdravlje i sport', kind: 'expense', icon: '💪', color: '#22c55e' },
  { id: 'izlasci', name: 'Izlasci i restorani', kind: 'expense', icon: '🍷', color: '#d946ef' },
  { id: 'dom', name: 'Kuća i domaćinstvo', kind: 'expense', icon: '🏠', color: '#14b8a6' },
  { id: 'odeca', name: 'Odeća i nega', kind: 'expense', icon: '👕', color: '#6366f1' },
  { id: 'pokloni', name: 'Pokloni', kind: 'expense', icon: '🎁', color: '#f43f5e' },
  { id: 'licno-dj', name: 'Džeparac – Đorđe', kind: 'expense', icon: '🧔', color: '#8b5cf6', personal: 'dj' },
  { id: 'licno-m', name: 'Džeparac – Maksijana', kind: 'expense', icon: '👩', color: '#ec4899', personal: 'm' },
  // Razlika pri proveri stanja koju niko ne ume da objasni. Sakrivena iz izbora pri unosu.
  { id: 'iscurelo', name: 'Iscurelo', kind: 'expense', icon: '💧', color: '#0ea5e9', archived: true },
  { id: 'ostalo', name: 'Ostalo', kind: 'expense', icon: '📦', color: '#94a3b8' },
  { id: 'plata', name: 'Plata', kind: 'income', icon: '💼', color: '#22c55e' },
  { id: 'dodatno', name: 'Dodatni prihod', kind: 'income', icon: '💵', color: '#10b981' },
  { id: 'stednja', name: 'Štednja', kind: 'saving', icon: '🐷', color: '#06b6d4' },
  { id: 'investicije', name: 'Investicije', kind: 'saving', icon: '📈', color: '#8b5cf6' },
];

function emptyState() {
  return {
    version: 2,
    categories: structuredClone(DEFAULT_CATEGORIES),
    plans: {}, // 'YYYY-MM' -> [{ id, line, categoryId, name, amount, owner }]
    transactions: [], // { id, date, kind, categoryId, amount, note, by, createdAt }
    notes: {}, // 'YYYY-MM' -> text
    goals: [], // { id, name, icon, target, startAmount, due:'YYYY-MM'|null, archived, createdAt }
    balanceChecks: [], // { id, account:'dj'|'m'|'kes', amount, at: ISO, by }
    transfers: [], // { id, date, from, to, amount, note, by, createdAt }
    settings: { currentUser: null, theme: 'auto' },
  };
}

// Kategorije dodate u novijim verzijama — dopunjuju se postojećim podacima.
const ADDED_LATER = ['licno-dj', 'licno-m', 'iscurelo'];
function withNewDefaults(cats) {
  const out = [...cats];
  for (const id of ADDED_LATER) {
    if (out.some((c) => c.id === id)) continue;
    const d = DEFAULT_CATEGORIES.find((c) => c.id === id);
    const at = out.findIndex((c) => c.id === 'ostalo');
    out.splice(at < 0 ? out.length : at, 0, structuredClone(d));
  }
  return out;
}

function normalize(s) {
  const e = emptyState();
  return {
    ...e,
    ...s,
    settings: { ...e.settings, ...(s.settings || {}) },
    categories: s.categories?.length ? withNewDefaults(s.categories) : e.categories,
    plans: s.plans || {},
    transactions: s.transactions || [],
    notes: s.notes || {},
    goals: s.goals || [],
    balanceChecks: s.balanceChecks || [],
    transfers: s.transfers || [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 2) return normalize(s);
    }
  } catch (e) {
    console.warn('Učitavanje nije uspelo', e);
  }
  return emptyState();
}

let state = load();
const subs = new Set();

// Sinhronizacija se kači ovde: posle svake lokalne izmene računa razliku i šalje je u bazu.
let syncHook = null;
export const setSyncHook = (fn) => (syncHook = fn);

function persist({ silent = false, fromRemote = false } = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Čuvanje nije uspelo', e);
  }
  if (!fromRemote) syncHook?.();
  if (!silent) subs.forEach((fn) => fn());
}

// Izmene koje stižu iz baze (ne šalju se nazad).
export function applyRemote(fn) {
  fn(state);
  persist({ fromRemote: true });
}
export function replaceData(data) {
  state = normalize({ ...state, ...data });
  persist({ fromRemote: true });
}
// Posle preuzimanja iz baze: ako su dopunjene nove kategorije, pošalji ih.
export const missingDefaults = (cats) => cats.length > 0 && ADDED_LATER.some((id) => !cats.some((c) => c.id === id));

export const getState = () => state;
export const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

// ---- Kategorije ----
export const cat = (id) =>
  state.categories.find((c) => c.id === id) || { id, name: 'Nepoznato', icon: '❔', kind: 'expense', color: '#888' };
export const categoriesOf = (kind, { includeArchived = false } = {}) =>
  state.categories.filter((c) => c.kind === kind && (includeArchived || !c.archived));

export async function saveCategory(c) {
  if (c.id && state.categories.some((x) => x.id === c.id)) {
    state.categories = state.categories.map((x) => (x.id === c.id ? { ...x, ...c } : x));
  } else {
    state.categories.push({ ...c, id: c.id || 'c-' + uid().slice(0, 8) });
  }
  persist();
}
export const categoryInUse = (id) =>
  state.transactions.some((t) => t.categoryId === id) ||
  Object.values(state.plans).some((p) => p.some((i) => i.categoryId === id));

// ---- Transakcije (stvarni unosi) ----
export async function addTransaction(t) {
  const tx = { id: uid(), createdAt: new Date().toISOString(), by: state.settings.currentUser || 'dj', note: '', ...t };
  state.transactions.push(tx);
  persist();
  return tx;
}
export async function updateTransaction(id, patch) {
  state.transactions = state.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t));
  persist();
}
export async function deleteTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  persist();
}

// ---- Plan ----
export const planOf = (key) => state.plans[key] || [];
export const hasPlan = (key) => planOf(key).length > 0;

const yearEnd = (key) => key.slice(0, 4) + '-12';
function forwardKeys(key) {
  const out = [];
  for (let k = addMonths(key, 1); k <= yearEnd(key); k = addMonths(k, 1)) out.push(k);
  return out;
}

// applyForward: ista stavka (ista "linija") se ažurira i u narednim mesecima do kraja godine.
export async function savePlanItem(key, item, { applyForward = false } = {}) {
  const list = [...planOf(key)];
  let saved;
  if (item.id) {
    const i = list.findIndex((x) => x.id === item.id);
    saved = { ...list[i], ...item };
    list[i] = saved;
  } else {
    saved = { ...item, id: uid(), line: uid() };
    list.push(saved);
  }
  state.plans[key] = list;

  if (applyForward) {
    for (const k of forwardKeys(key)) {
      const pl = [...planOf(k)];
      const j = pl.findIndex((x) => x.line === saved.line);
      const data = { categoryId: saved.categoryId, name: saved.name, amount: saved.amount, owner: saved.owner };
      if (j >= 0) pl[j] = { ...pl[j], ...data };
      else pl.push({ ...data, id: uid(), line: saved.line });
      state.plans[k] = pl;
    }
  }
  persist();
}

export async function deletePlanItem(key, id, { applyForward = false } = {}) {
  const item = planOf(key).find((x) => x.id === id);
  if (!item) return;
  state.plans[key] = planOf(key).filter((x) => x.id !== id);
  if (applyForward) {
    for (const k of forwardKeys(key)) state.plans[k] = planOf(k).filter((x) => x.line !== item.line);
  }
  persist();
}

export async function copyPlan(fromKey, toKeys) {
  const src = planOf(fromKey);
  for (const k of [].concat(toKeys)) {
    state.plans[k] = src.map((x) => ({ ...x, id: uid() }));
  }
  persist();
}
export const copyPlanToRestOfYear = (key) => copyPlan(key, forwardKeys(key));

// ---- Ciljevi štednje ----
export const goalsOf = ({ includeArchived = false } = {}) => (state.goals || []).filter((g) => includeArchived || !g.archived);
export const goal = (id) => (state.goals || []).find((g) => g.id === id);
export async function saveGoal(g) {
  state.goals ||= [];
  if (g.id && state.goals.some((x) => x.id === g.id)) state.goals = state.goals.map((x) => (x.id === g.id ? { ...x, ...g } : x));
  else state.goals.push({ startAmount: 0, archived: false, ...g, id: uid(), createdAt: new Date().toISOString() });
  persist();
}
export async function deleteGoal(id) {
  state.goals = (state.goals || []).filter((g) => g.id !== id);
  state.transactions = state.transactions.map((t) => (t.goalId === id ? (({ goalId, ...rest }) => rest)(t) : t));
  persist();
}
// Koliko je uplaćeno na cilj (početni iznos + uplate štednje vezane za cilj).
export const goalSaved = (g) => (Number(g.startAmount) || 0) + state.transactions.filter((t) => t.goalId === g.id).reduce((s, t) => s + (t.kind === 'saving' ? 1 : -1) * Number(t.amount), 0);

// ---- Računi i stanje ----
export const ACCOUNTS = [
  { id: 'dj', name: 'Đorđe', bank: 'OTP tekući', icon: '💳', color: '#8b5cf6' },
  { id: 'm', name: 'Maksijana', bank: 'OTP tekući', icon: '💳', color: '#ec4899' },
  { id: 'kes', name: 'Keš', bank: 'gotovina', icon: '💵', color: '#16a34a' },
];
export const account = (id) => ACCOUNTS.find((a) => a.id === id) || ACCOUNTS[0];
// Stari unosi bez računa: račun osobe koja je unela.
export const accountOf = (t) => t.account || (t.by === 'm' ? 'm' : 'dj');

const ms = (iso) => Date.parse(iso) || 0;
const localDate = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const lastCheck = (acc) =>
  (state.balanceChecks || []).filter((c) => c.account === acc).sort((a, b) => ms(a.at) - ms(b.at)).at(-1) || null;

// Procena = poslednje upisano stanje + sve što je uneto posle toga.
export function balanceOf(acc) {
  const chk = lastCheck(acc);
  if (!chk) return null;
  const day = localDate(chk.at), t0 = ms(chk.at);
  const after = (date, createdAt) => date > day || (date === day && ms(createdAt) > t0);
  let delta = 0, count = 0;
  for (const t of state.transactions) {
    if (accountOf(t) !== acc || !after(t.date, t.createdAt)) continue;
    delta += (t.kind === 'income' ? 1 : -1) * Number(t.amount);
    count++;
  }
  for (const x of state.transfers || []) {
    if (!after(x.date, x.createdAt)) continue;
    if (x.from === acc) { delta -= Number(x.amount); count++; }
    if (x.to === acc) { delta += Number(x.amount); count++; }
  }
  return { amount: Number(chk.amount) + delta, check: chk, delta, count };
}

export async function addBalanceCheck(acc, amount) {
  state.balanceChecks ||= [];
  const chk = { id: uid(), account: acc, amount: Number(amount), at: new Date().toISOString(), by: state.settings.currentUser || 'dj' };
  state.balanceChecks.push(chk);
  persist();
  return chk;
}
// Unos koji objašnjava razliku pri proveri mora da bude "pre" provere, inače bi je duplirao.
export const beforeCheck = (chk) => new Date(Date.parse(chk.at) - 1000).toISOString();

// Iscurelo u periodu (za upozorenja i izveštaje).
export const leakedIn = (from, to) => state.transactions.filter((t) => t.categoryId === 'iscurelo' && t.date >= from && t.date <= to).reduce((s, t) => s + Number(t.amount), 0);
export async function deleteBalanceCheck(id) {
  state.balanceChecks = (state.balanceChecks || []).filter((c) => c.id !== id);
  persist();
}
export async function addTransfer(x) {
  state.transfers ||= [];
  state.transfers.push({ note: '', ...x, id: uid(), by: state.settings.currentUser || 'dj', createdAt: new Date().toISOString() });
  persist();
}
export async function deleteTransfer(id) {
  state.transfers = (state.transfers || []).filter((x) => x.id !== id);
  persist();
}

// ---- Beleške i podešavanja ----
export const noteOf = (key) => state.notes[key] || '';
export function setNote(key, text) {
  state.notes[key] = text;
  persist({ silent: true }); // bez ponovnog crtanja da kursor ne skače
}

export async function setSetting(k, v) {
  state.settings[k] = v;
  persist();
}

// ---- Backup ----
export function exportJSON() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export const isOldFormat = (d) => d && typeof d === 'object' && d[0] && Array.isArray(d[0].income) && Array.isArray(d[0].expenses);
export const isNewFormat = (d) => d && d.version === 2 && Array.isArray(d.transactions);

export async function importNew(d) {
  const currentUser = state.settings.currentUser;
  state = normalize(d);
  state.settings.currentUser = currentUser; // uređaj zadržava svog korisnika
  persist();
}

// Uvoz backupa iz stare aplikacije (budzet2026.html).
export async function importOld(d, year = 2026) {
  const ownerFromName = (n) => (/\sĐ$|\sDj?$/i.test(n) ? 'dj' : /\sM$/.test(n) ? 'm' : 'zaj');
  const expenseCat = (e) => {
    if (e.category === 'Fiksni') return 'krediti';
    if (e.category === 'Računi') return 'racuni';
    if (e.category === 'Zdravlje') return 'zdravlje';
    if (/hrana/i.test(e.name)) return 'hrana';
    if (/gorivo|auto/i.test(e.name)) return 'auto';
    return 'ostalo';
  };
  const lines = {}; // isti naziv kroz mesece = ista linija plana
  const lineFor = (name) => (lines[name] ||= uid());

  for (let i = 0; i < 12; i++) {
    const m = d[i];
    if (!m) continue;
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const plan = [];
    for (const inc of m.income || [])
      plan.push({ id: uid(), line: lineFor('i:' + inc.name), categoryId: /plata/i.test(inc.name) ? 'plata' : 'dodatno', name: inc.name, amount: Number(inc.amount) || 0, owner: ownerFromName(inc.name) });
    for (const ex of m.expenses || [])
      plan.push({ id: uid(), line: lineFor('e:' + ex.name), categoryId: expenseCat(ex), name: ex.name, amount: Number(ex.amount) || 0, owner: ownerFromName(ex.name) });
    const sv = m.savings || {};
    if (Number(sv.savings)) plan.push({ id: uid(), line: lineFor('s:stednja'), categoryId: 'stednja', name: 'Mesečna štednja', amount: Number(sv.savings), owner: 'zaj' });
    if (Number(sv.investments)) plan.push({ id: uid(), line: lineFor('s:inv'), categoryId: 'investicije', name: 'Investicije', amount: Number(sv.investments), owner: 'zaj' });
    state.plans[key] = plan;

    // Vanredni troškovi su bili stvarni troškovi → postaju unosi na 1. u mesecu.
    for (const v of m.vanredno || []) {
      state.transactions.push({ id: uid(), date: `${key}-01`, kind: 'expense', categoryId: 'ostalo', amount: Number(v.amount) || 0, note: `${v.name} (vanredno, uvezeno)`, by: 'dj', createdAt: new Date().toISOString() });
    }
    if (m.note) state.notes[key] = m.note;
  }
  persist();
}

export async function resetAll() {
  const currentUser = state.settings.currentUser;
  state = emptyState();
  state.settings.currentUser = currentUser;
  persist();
}
