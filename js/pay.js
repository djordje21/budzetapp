// "Plaćeno" — stavka plana jednim dodirom postaje stvarni unos.
import * as S from './store.js?v=20261108081454';
import { todayISO, currentMonthKey, fmtNum, esc } from './util.js?v=20261108081454';
import { txOfMonth } from './calc.js?v=20261108081454';
import { toast } from './ui.js?v=20261108081454';

// Koje stavke plana imaju dugme: prihodi, štednja i fiksni troškovi (rate, računi).
export const isPayable = (item) => {
  const c = S.cat(item.categoryId);
  return c.kind !== 'expense' || !!c.fixed;
};

export const paidTx = (key, item) => txOfMonth(key).find((t) => t.planLine === item.line);

export const PAY_LABELS = {
  expense: { act: 'Plati', done: 'Plaćeno' },
  income: { act: 'Primljeno', done: 'Primljeno' },
  saving: { act: 'Uplati', done: 'Uplaćeno' },
};

export async function payItem(key, item) {
  const c = S.cat(item.categoryId);
  // Tekući mesec → danas; ranija/buduća → prvi u mesecu (datum može da se izmeni posle).
  const date = key === currentMonthKey() ? todayISO() : `${key}-01`;
  await S.addTransaction({
    kind: c.kind,
    categoryId: c.id,
    amount: Number(item.amount),
    date,
    note: item.name,
    planLine: item.line,
  });
  toast(`<b>✓ ${PAY_LABELS[c.kind].done}</b> ${esc(item.name)} · ${fmtNum(item.amount)} RSD`, 'ok');
}
