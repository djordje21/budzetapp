// Ciljevi štednje: svi ciljevi na jednom mestu.
import * as S from '../store.js?v=20261108141149';
import { goalsBlock, bindGoals } from './goals.js?v=20261108141149';
import { animateBars } from '../ui.js?v=20261108141149';

export function renderCiljevi(el) {
  el.innerHTML = `<div class="goals-page">${goalsBlock()}</div>`;
  bindGoals(el);
  animateBars(el);
  void S;
}
