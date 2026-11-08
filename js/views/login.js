// Ekran za prijavu (kad je uključena zajednička baza).
import * as Sync from '../sync.js?v=20261108210214';

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
        <button class="link forgot" id="l-forgot" type="button">Zaboravili ste lozinku?</button>
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
  el.querySelector('#l-forgot').onclick = async () => {
    const email = el.querySelector('#l-email').value.trim();
    if (!email) { err.textContent = 'Prvo upiši svoj email, pa dodirni „Zaboravili ste lozinku?“.'; el.querySelector('#l-email').focus(); return; }
    try {
      await Sync.resetPassword(email);
      err.style.color = 'var(--green)';
      err.textContent = `Poslali smo link na ${email}. Otvori ga na ovom telefonu i upiši novu lozinku.`;
    } catch (ex) {
      err.style.color = '';
      err.textContent = 'Slanje nije uspelo: ' + (ex.message || ex);
    }
  };
  setTimeout(() => el.querySelector('#l-email').focus(), 100);
}
