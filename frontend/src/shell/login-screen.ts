/**
 * LoginScreen — pantalla de login. Port de la de js/auth.js a la nueva
 * arquitectura (sin globals): resuelve una Promise cuando el login es correcto.
 */
import { Auth } from './auth';
import { esc } from './ui';

export function showLogin(): Promise<void> {
  return new Promise((resolve) => {
    const screen = document.createElement('div');
    screen.id = 'login-screen';
    screen.innerHTML = `
      <div class="lc-bg-left">
        <div class="lc-brand">
          <div class="lc-brand-icon">
            <img src="assets/logo.jpg" style="width:64px;height:64px;object-fit:contain;border-radius:16px;" alt="Logo">
          </div>
          <div class="lc-brand-name">Lost Children</div>
          <div class="lc-brand-sub">Sistema de Gestión ONG</div>
          <div class="lc-dots">
            <span style="background:#fd4c5c"></span><span style="background:#febd3e"></span>
            <span style="background:#5dbc35"></span><span style="background:#fff;opacity:.5"></span>
          </div>
          <p class="lc-quote">"Cada niño merece un registro, un seguimiento y una familia que lo cuide."</p>
        </div>
      </div>
      <div class="lc-bg-right">
        <div class="lc-card">
          <div class="lc-color-bar">
            <span style="background:#fd4c5c"></span><span style="background:#0176bf"></span>
            <span style="background:#5dbc35"></span><span style="background:#febd3e"></span>
          </div>
          <div style="padding:32px 36px 28px;">
            <h2 class="lc-heading">Bienvenido de vuelta</h2>
            <p class="lc-subheading">Ingresa tus credenciales para acceder al ERP</p>
            <div class="lc-field"><label>Usuario</label>
              <div class="lc-input-wrap">
                <input type="text" id="lc-user" placeholder="Tu nombre de usuario" autocomplete="username">
              </div>
            </div>
            <div class="lc-field"><label>Contraseña</label>
              <div class="lc-input-wrap">
                <input type="password" id="lc-pass" placeholder="Tu contraseña" autocomplete="current-password">
              </div>
            </div>
            <div id="lc-error" class="lc-error-box"><span id="lc-error-text"></span></div>
            <button id="lc-btn" class="lc-submit"><span id="lc-btn-text">Iniciar sesión</span></button>
            <div style="margin-top:22px;text-align:center;font-size:12.5px;color:#8E97A8;">
              ¿Problemas para entrar? Contacta al administrador.
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(screen);

    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
    const setError = (msg: string) => {
      const box = $('lc-error'); const txt = $<HTMLElement>('lc-error-text');
      if (txt) txt.textContent = msg;
      if (box) box.style.display = msg ? 'flex' : 'none';
    };
    const setLoading = (on: boolean) => {
      const btn = $<HTMLButtonElement>('lc-btn'); const txt = $('lc-btn-text');
      if (btn) btn.disabled = on;
      if (txt) txt.textContent = on ? 'Verificando…' : 'Iniciar sesión';
    };

    async function submit() {
      const username = ($<HTMLInputElement>('lc-user')?.value || '').trim();
      const password = $<HTMLInputElement>('lc-pass')?.value || '';
      if (!username || !password) { setError('Completa usuario y contraseña'); return; }
      setError('');
      setLoading(true);
      try {
        const data = await Auth.login(username, password);
        if (!data.ok) { setError(esc(data.error || 'Error al iniciar sesión')); return; }
        screen.remove();
        resolve();
      } catch {
        setError('No se pudo conectar con el servidor. Verifica que el bridge esté activo.');
      } finally {
        setLoading(false);
      }
    }

    $('lc-btn')?.addEventListener('click', () => void submit());
    $('lc-user')?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') $('lc-pass')?.focus(); });
    $('lc-pass')?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void submit(); });
    setTimeout(() => $('lc-user')?.focus(), 100);
  });
}
