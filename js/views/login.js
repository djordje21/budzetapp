// Ekran za prijavu (kad je uključena zajednička baza).
import * as Sync from '../sync.js?v=20261108081259';

export function renderLogin(el, onDone) {
  document.body.classList.add('auth');
  el.innerHTML = `
    <section class="login">
      <img src="icons/icon.svg" alt="" class="login-logo">
      <h1>Budžet</h1>
      <p class="muted">Zajednički budžet za Đorđa i Maksijanu</p>
      <form id="login-form" class="login-form" novalidate>
        <label class="field-label" for="l-email">Email</label>
        <input class="input" id="l-email" type="email" autocomplete="username" inputmode="email" required>
        <label class="field-label" for="l-pass">Lozinka</label>
        <input class="input" id="l-pass" type="password" autocomplete="current-password" required>
        <div class="login-error" id="l-err" role="alert"></div>
        <button class="btn btn-primary btn-block" id="l-btn" type="submit">Prijavi se</button>
      </form>
    </section>`;

  const form = el.querySelector('#login-form');
  const err = el.querySelector('#l-err');
  const btn = el.querySelector('#l-btn');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = el.querySelector('#l-email').value;
    const pass = el.querySelector('#l-pass').value;
    if (!email || !pass) { err.textContent = 'Upiši email i lozinku.'; return; }
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Prijavljivanje…';
    try {
      await Sync.signIn(email, pass);
      btn.textContent = 'Preuzimam podatke…';
      await Sync.start();
      document.body.classList.remove('auth');
      onDone();
    } catch (ex) {
      const m = String(ex?.message || ex);
      err.textContent =
        m === 'NOT_MEMBER' ? 'Ovaj nalog nema pristup budžetu.'
        : /invalid login/i.test(m) ? 'Pogrešan email ili lozinka.'
        : /fetch|network/i.test(m) ? 'Nema veze sa internetom. Pokušaj ponovo.'
        : 'Greška: ' + m;
      btn.disabled = false;
      btn.textContent = 'Prijavi se';
    }
  };
  setTimeout(() => el.querySelector('#l-email').focus(), 100);
}
