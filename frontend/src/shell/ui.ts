/**
 * UI — helpers de interfaz reutilizables (esc, toast, modal).
 *
 * Port tipado de js/ui.js. `esc()` es la MISMA función anti-XSS de la
 * remediación de seguridad: TODO dato de usuario interpolado en HTML debe
 * pasar por aquí. Se exporta como named export (no como global window.esc).
 */

/** Escapa caracteres HTML para evitar XSS al insertar datos en innerHTML. */
export function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type ToastTipo = 'success' | 'error' | 'warn' | 'info';

let _toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string, tipo: ToastTipo = 'success'): void {
  const colors: Record<ToastTipo, { bg: string; color: string; icon: string }> = {
    success: { bg: '#E8F7F1', color: '#1D7A56', icon: '✓' },
    error: { bg: '#FDE7E1', color: '#C24A30', icon: '✕' },
    warn: { bg: '#FDF2D5', color: '#9A6B0A', icon: '!' },
    info: { bg: 'var(--primary-soft)', color: 'var(--primary-d)', icon: 'ℹ' },
  };
  const c = colors[tipo] || colors.success;
  let el = document.getElementById('toast-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-root';
    el.style.cssText = 'position:fixed;bottom:28px;right:28px;z-index:200;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(el);
  }
  const t = document.createElement('div');
  t.style.cssText = `background:${c.bg};color:${c.color};padding:12px 18px;border-radius:12px;font-size:14px;font-weight:600;font-family:'Quicksand';box-shadow:0 4px 20px rgba(0,0,0,.12);display:flex;align-items:center;gap:10px;max-width:340px;`;
  // msg puede contener HTML de plantilla propia (no dato de usuario crudo); los
  // callers escapan con esc() lo que venga del usuario antes de pasarlo aquí.
  t.innerHTML = `<span style="font-size:16px;">${c.icon}</span>${msg}`;
  el.appendChild(t);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.remove(), 3000);
}

/** Abre un modal con el HTML dado. Clic en el overlay cierra (salvo noClose). */
export function modal(html: string, opts: { wide?: boolean; narrow?: boolean; noClose?: boolean } = {}): void {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" style="${opts.wide ? 'width:680px;' : ''}${opts.narrow ? 'width:380px;' : ''}">
        ${html}
      </div>
    </div>`;
  if (!opts.noClose) {
    const overlay = document.getElementById('modal-overlay');
    overlay?.addEventListener('click', function (this: HTMLElement, e: Event) {
      if (e.target === this) closeModal();
    });
  }
  setTimeout(() => {
    const first = root.querySelector<HTMLElement>('input:not([type=hidden]),select');
    first?.focus();
  }, 50);
}

export function closeModal(): void {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

/** Spinner de carga estándar. */
export function loadingHtml(texto = 'Cargando…'): string {
  return `<div class="loading"><div class="spinner"></div>${esc(texto)}</div>`;
}
