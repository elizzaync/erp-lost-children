/**
 * main.ts — bootstrap del frontend nuevo (TypeScript + Vite).
 *
 * Flujo: valida sesión → login si hace falta → monta el shell (que muestra los
 * módulos ya migrados) → inicializa el AppStore en segundo plano (carga de
 * datos + WebSocket para los módulos que usan la capa de datos).
 *
 * Producción sigue con el frontend legacy hasta la Fase 3; esta app se prueba
 * con `npm run dev` (Vite proxya la API/WS al Flask real en :7793).
 */
import './styles/styles.css';
import './styles/login.css';

import { ApiClient } from '@core/index';
import { AppStore } from '@store/app-store';
import { Auth } from '@shell/auth';
import { showLogin } from '@shell/login-screen';
import { AppShell } from '@shell/app-shell';

const api = new ApiClient(() => Auth.getToken());
const store = new AppStore(() => Auth.getToken());

function startApp(): void {
  const shell = new AppShell({ api, store });
  shell.mount();
  // Carga de datos + WebSocket en segundo plano (no bloquea el primer render;
  // los módulos que usan datos escuchan los eventos del store cuando lleguen).
  void store.init();
}

async function boot(): Promise<void> {
  const sesionValida = await Auth.validarSesion();
  if (!sesionValida) await showLogin();
  startApp();
}

document.addEventListener('DOMContentLoaded', () => void boot());
