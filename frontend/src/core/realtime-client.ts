/**
 * RealtimeClient — encapsula el WebSocket de tiempo real y su reconexión.
 *
 * Extrae la lógica que hoy vive suelta en js/db.js (`_conectarWS`, backoff,
 * `_wsConectado`). NO cambia el protocolo: mismo endpoint `/ws/asistencia`,
 * mismo token por query-string, mismos eventos entrantes:
 *   - `{ evento: 'asistencia' }` → hubo una marca (refrescar asistencia)
 *   - `{ evento: 'cambio' }`     → cambió algo más (recargar)
 *
 * Esto es lo que mantiene viva la sincronización con el Timmy (las marcas del
 * dispositivo llegan por yunatt → backend → este socket). Por eso se conserva
 * idéntico en semántica; solo cambia dónde vive el código.
 */

export type RealtimeEvent = 'asistencia' | 'cambio';

export interface RealtimeHandlers {
  onAsistencia: () => void;
  onCambio: () => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private retryMs = 2000;
  private readonly maxRetryMs = 30000;
  private connected = false;
  private stopped = false;

  constructor(
    /** Base HTTP del backend (se convierte a ws://). */
    private readonly httpBase: string,
    private readonly getToken: () => string,
    private readonly handlers: RealtimeHandlers,
  ) {}

  get isConnected(): boolean {
    return this.connected;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  /** Cierra el socket y detiene los reintentos (p. ej. al hacer logout). */
  disconnect(): void {
    this.stopped = true;
    this.connected = false;
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
  }

  private open(): void {
    if (this.stopped) return;
    try {
      const token = this.getToken();
      const wsUrl =
        this.httpBase.replace(/^http/, 'ws') +
        '/ws/asistencia' +
        (token ? '?token=' + encodeURIComponent(token) : '');

      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.retryMs = 2000;
        this.connected = true;
        this.handlers.onOpen?.();
      };

      ws.onmessage = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as { evento?: RealtimeEvent };
          if (data.evento === 'asistencia') this.handlers.onAsistencia();
          else if (data.evento === 'cambio') this.handlers.onCambio();
        } catch {
          /* mensaje no-JSON: ignorar, igual que hoy */
        }
      };

      ws.onclose = () => {
        this.ws = null;
        this.connected = false;
        this.handlers.onClose?.();
        if (this.stopped) return;
        setTimeout(() => this.open(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, this.maxRetryMs); // backoff
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };
    } catch {
      if (!this.stopped) setTimeout(() => this.open(), 10000);
    }
  }
}
