// Proračuni: plan vs. stvarno za mesec.
import * as S from './store.js?v=20261107205723';
import { daysInMonth, currentMonthKey, todayISO } from './util.js?v=20261107205723';

export const txOfMonth = (key) => S.getState().transactions.filter((t) => t.date.startsWith(key));

export function summarize(key) {
  const plan = S.planOf(key);
  const txs = txOfMonth(key);
  const tot = {
    income: { plan: 0, actual: 0 },
    expense: { plan: 0, actual: 0 },
    saving: { plan: 0, actual: 0 },
  };
  const byCat = new Map();
  const row = (c) => {
    if (!byCat.has(c.id)) byCat.set(c.id, { cat: c, plan: 0, actual: 0, count: 0 });
    return byCat.get(c.id);
  };
  for (const p of plan) {
    const c = S.cat(p.categoryId);
    const a = Number(p.amount) || 0;
    tot[c.kind].plan += a;
    row(c).plan += a;
  }
  for (const t of txs) {
    const c = S.cat(t.categoryId);
    const a = Number(t.amount) || 0;
    tot[t.kind || c.kind].actual += a;
    const r = row(c);
    r.actual += a;
    r.count++;
  }

  // Promenljivi troškovi (bez rata i računa) — za ritam potrošnje.
  let varPlan = 0, varActual = 0;
  for (const r of byCat.values()) {
    if (r.cat.kind === 'expense' && !r.cat.fixed) {
      varPlan += r.plan;
      varActual += r.actual;
    }
  }

  const balancePlan = tot.income.plan - tot.expense.plan - tot.saving.plan;
  const balanceActual = tot.income.actual - tot.expense.actual - tot.saving.actual;

  return { key, plan, txs, tot, cats: [...byCat.values()], varPlan, varActual, balancePlan, balanceActual };
}

// Gde smo u mesecu: 'past' | 'current' | 'future'
export function monthPhase(key) {
  const cur = currentMonthKey();
  return key < cur ? 'past' : key > cur ? 'future' : 'current';
}

export function pace(sum) {
  const phase = monthPhase(sum.key);
  if (phase !== 'current' || sum.varPlan <= 0) return null;
  const dim = daysInMonth(sum.key);
  const day = Number(todayISO().slice(8, 10));
  const timePct = day / dim;
  const spentPct = sum.varActual / sum.varPlan;
  const remaining = sum.varPlan - sum.varActual;
  const perDay = Math.max(0, remaining) / (dim - day + 1);
  let status = 'good';
  if (remaining < 0) status = 'over';
  else if (spentPct > timePct + 0.1) status = 'fast';
  return { day, dim, timePct, spentPct, remaining, perDay, status };
}
