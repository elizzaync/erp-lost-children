/**
 * AppStore — Facade de la capa de datos.
 *
 * Reemplaza el monolito js/db.js orquestando: repositorios (HTTP+map), caché en
 * memoria, EventBus (Observer) y RealtimeClient (WebSocket). Expone la MISMA
 * superficie pública que `window.DB` (getters + on/off/emit + métodos de
 * mutación con sus mismos efectos y eventos), para que los módulos legacy sin
 * migrar sigan funcionando sin cambios durante toda la migración.
 *
 * No toca el backend ni el protocolo WebSocket: consume los mismos endpoints y
 * el mismo socket /ws/asistencia que el sistema actual. La sincronización con
 * yunatt/Timmy queda intacta.
 */
import { ApiClient, EventBus, RealtimeClient } from '@core/index';
import {
  PersonasRepository, ArticulosRepository, GastosRepository, EntregasRepository,
  FondosRepository, AsistenciaRepository, AlimentacionRepository,
} from '@domain/index';
import type { Persona } from '@domain/personas/personas.types';
import type { Articulo } from '@domain/articulos/articulos.types';
import type { Gasto } from '@domain/gastos/gastos.types';
import type { Entrega } from '@domain/entregas/entregas.types';
import type { Asistencia } from '@domain/asistencia/asistencia.types';
import type { ServicioAlimentacion } from '@domain/alimentacion/alimentacion.types';
import { toAsistencia } from '@domain/asistencia/asistencia.mapper';
import { toFondos } from '@domain/fondos/fondos.mapper';
import type { FondosBalanceRaw } from '@domain/fondos/fondos.types';
import type { ActividadItem, StoreData } from './store-types';
import { getKPIs, getAlertasActivas } from './store-selectors';
import { nextId, hoy, ahora } from './store-utils';

export class AppStore {
  private readonly bus = new EventBus();
  private readonly api: ApiClient;

  private readonly personasRepo: PersonasRepository;
  private readonly articulosRepo: ArticulosRepository;
  private readonly gastosRepo: GastosRepository;
  private readonly entregasRepo: EntregasRepository;
  private readonly fondosRepo: FondosRepository;
  private readonly asistenciaRepo: AsistenciaRepository;
  private readonly alimentacionRepo: AlimentacionRepository;

  private realtime: RealtimeClient | null = null;
  private inicializada = false;
  private cargarTodoDebounce: ReturnType<typeof setTimeout> | null = null;

  private readonly data: StoreData = {
    personas: [],
    asistencia: [],
    articulos: [],
    gastos: [],
    entregas: [],
    serviciosAlimentacion: [],
    actividad: [],
    presupuestoMes: 2400,
    fondos: { balance: 0, ingresos: 0, egresos: 0, movimientos: [] },
  };

  constructor(private readonly getToken: () => string) {
    this.api = new ApiClient(getToken);
    this.personasRepo = new PersonasRepository(this.api);
    this.articulosRepo = new ArticulosRepository(this.api);
    this.gastosRepo = new GastosRepository(this.api);
    this.entregasRepo = new EntregasRepository(this.api);
    this.fondosRepo = new FondosRepository(this.api);
    this.asistenciaRepo = new AsistenciaRepository(this.api);
    this.alimentacionRepo = new AlimentacionRepository(this.api);

    // Feed de actividad: mismo comportamiento que addActividad() de db.js.
    this.bus.on<ActividadItem>('actividad:add', (item) => {
      if (!item) return;
      this.data.actividad.unshift(item);
      if (this.data.actividad.length > 20) this.data.actividad.pop();
      this.bus.emit('actividad:update');
    });
  }

  /* ---------- EVENT BUS ---------- */
  on = this.bus.on.bind(this.bus);
  off = this.bus.off.bind(this.bus);
  emit = this.bus.emit.bind(this.bus);

  /* ---------- GETTERS ---------- */
  get personas(): Persona[] { return this.data.personas; }
  get asistencia(): Asistencia[] { return this.data.asistencia; }
  get articulos(): Articulo[] { return this.data.articulos; }
  get gastos(): Gasto[] { return this.data.gastos; }
  get entregas(): Entrega[] { return this.data.entregas; }
  get serviciosAlimentacion(): ServicioAlimentacion[] { return this.data.serviciosAlimentacion; }
  get actividad(): ActividadItem[] { return this.data.actividad; }
  get presupuestoMes(): number { return this.data.presupuestoMes; }
  get fondos() { return this.data.fondos; }

  getKPIs() { return getKPIs(this.data); }
  getAlertasActivas() { return getAlertasActivas(this.data); }

  nextId = nextId;
  hoy = hoy;
  ahora = ahora;

  /* ---------- CARGA INICIAL ---------- */
  /** Recarga todo desde la API. allSettled: si un endpoint falla, los demás
   *  siguen; la caché solo se sobreescribe con lo que respondió bien. */
  async cargarTodo(): Promise<void> {
    const [personas, articulos, gastos, entregas, asistencia, alimentacion, fondos] =
      await Promise.allSettled([
        this.personasRepo.list(),
        this.articulosRepo.list(),
        this.gastosRepo.list(),
        this.entregasRepo.list(),
        this.asistenciaRepo.hoy(),
        this.alimentacionRepo.list(),
        this.fondosRepo.balance(),
      ]);

    const val = <T>(r: PromiseSettledResult<T | null>): T | null =>
      r.status === 'fulfilled' ? r.value : null;

    const p = val(personas);
    const ar = val(articulos);
    const g = val(gastos);
    const e = val(entregas);
    const asis = val(asistencia);
    const al = val(alimentacion);
    const f = val(fondos);

    if (p) this.data.personas = p;
    if (ar) this.data.articulos = ar;
    if (g) this.data.gastos = g;
    if (e) this.data.entregas = e;
    if (asis) this.data.asistencia = asis;
    if (al) this.data.serviciosAlimentacion = al;
    if (f) this.data.fondos = f;

    this.bus.emit('personas:update');
    this.bus.emit('asistencia:update');
    this.bus.emit('almacen:update');
    this.bus.emit('gastos:update');
    this.bus.emit('entregas:update');
    this.bus.emit('alimentacion:update');
    this.bus.emit('fondos:update');
  }

  /** Alias público (db.js exponía `recargar`). */
  recargar = () => this.cargarTodo();

  /** Refresca solo asistencia y detecta nuevos presentes (emite asistencia:nueva). */
  async refrescarAsistencia(): Promise<void> {
    const rows = await this.asistenciaRepo.hoy();
    if (!rows) return;
    const antesPresentes = new Set(
      this.data.asistencia.filter((a) => a.presente && a.personaId).map((a) => a.personaId),
    );
    const habiaDatos = this.data.asistencia.length > 0;
    this.data.asistencia = rows;
    this.bus.emit('asistencia:update');
    if (habiaDatos) {
      const nuevos = this.data.asistencia.filter(
        (a) => a.presente && a.personaId && !antesPresentes.has(a.personaId),
      );
      if (nuevos.length) this.bus.emit('asistencia:nueva', nuevos);
    }
  }

  /* ---------- REALTIME ---------- */
  private cargarTodoDebounced(): void {
    if (this.cargarTodoDebounce) clearTimeout(this.cargarTodoDebounce);
    this.cargarTodoDebounce = setTimeout(() => this.cargarTodo(), 250);
  }

  /** Init: carga datos, conecta el WebSocket y deja timers de respaldo que solo
   *  actúan si el socket está caído (mismo criterio que db.js tras el fix). */
  init(): Promise<void> {
    if (this.inicializada) return this.cargarTodo();
    this.inicializada = true;
    return this.cargarTodo().then(() => {
      this.realtime = new RealtimeClient(this.api.base, this.getToken, {
        onAsistencia: () => this.refrescarAsistencia(),
        onCambio: () => this.cargarTodoDebounced(),
      });
      this.realtime.connect();
      setInterval(() => { if (!this.realtime?.isConnected) this.refrescarAsistencia(); }, 30000);
      setInterval(() => { if (!this.realtime?.isConnected) this.cargarTodo(); }, 120000);
    });
  }

  /** Cierra el realtime (logout). */
  disconnect(): void {
    this.realtime?.disconnect();
  }

  /* ---------- PERSONAS ---------- */
  async agregarPersona(persona: Persona): Promise<Persona> {
    const res = await this.personasRepo.create(persona);
    if (res && res.ok) {
      persona.id = res.id ?? nextId(this.data.personas);
      // Nota: db.js llamaba además a POST /users, ruta inexistente en server.py
      // (404 silencioso). Se omite deliberadamente: el enrolamiento real es vía
      // /timmy/agregar. No cambia el comportamiento observable.
      this.data.personas.push(persona);
      this.data.asistencia.push(toAsistencia({
        id: nextId(this.data.asistencia),
        persona_id: persona.id,
        tipo: persona.tipo,
        nombre: persona.nombre,
        inicial: persona.inicial,
        avatar_bg: persona.avatarBg,
        avatar_fg: persona.avatarFg,
      }));
      this.bus.emit('asistencia:update');
      this.bus.emit('personas:update', persona);
      this.bus.emit('actividad:add', {
        color: 'var(--primary)',
        texto: `Nueva persona registrada: <b>${persona.nombre}</b>`,
        tiempo: 'ahora', lugar: 'Personas',
      });
    }
    return persona;
  }

  async actualizarPersona(id: number, cambios: Partial<Persona>): Promise<void> {
    const i = this.data.personas.findIndex((p) => p.id === id);
    if (i < 0) return;
    const merged = { ...this.data.personas[i], ...cambios };
    void this.personasRepo.update(id, merged);
    Object.assign(this.data.personas[i], cambios);
    if (cambios.nombre || cambios.inicial || cambios.avatarBg || cambios.avatarFg) {
      const a = this.data.asistencia.find((x) => x.personaId === id);
      if (a) {
        if (cambios.nombre) a.nombre = cambios.nombre;
        if (cambios.inicial) a.inicial = cambios.inicial;
        if (cambios.avatarBg) a.avatarBg = cambios.avatarBg;
        if (cambios.avatarFg) a.avatarFg = cambios.avatarFg;
        this.bus.emit('asistencia:update');
      }
    }
    this.bus.emit('personas:update', this.data.personas[i]);
  }

  async eliminarPersona(id: number): Promise<boolean> {
    const r = await this.personasRepo.remove(id);
    if (r && r.ok) {
      this.data.personas = this.data.personas.filter((p) => p.id !== id);
      this.data.asistencia = this.data.asistencia.filter((a) => a.personaId !== id);
      this.data.entregas = this.data.entregas.filter((e) => e.personaId !== id);
      this.bus.emit('personas:update');
      this.bus.emit('asistencia:update');
      return true;
    }
    return false;
  }

  /* ---------- ASISTENCIA ---------- */
  async toggleAsistencia(id: number, metodo?: string): Promise<Asistencia | undefined> {
    const a = this.data.asistencia.find((x) => x.id === id);
    if (!a) return undefined;
    a.presente = !a.presente;
    a.hora = a.presente ? ahora() : '';
    a.metodo = a.presente ? (metodo || 'Manual') : '—';
    this.bus.emit('asistencia:update', a);
    void this.asistenciaRepo.actualizarMarca(id, { presente: a.presente, metodo: a.metodo, hora: a.hora });
    if (a.presente) {
      this.bus.emit('actividad:add', {
        color: 'var(--primary)',
        texto: `${a.nombre} marcó asistencia por <b>${a.metodo}</b>`,
        tiempo: 'ahora', lugar: 'Kiosko',
      });
    }
    return a;
  }

  async marcarFacial(personaId: number): Promise<Asistencia | null> {
    const a = this.data.asistencia.find((x) => x.personaId === personaId);
    if (!a || a.presente) return null;
    a.presente = true;
    a.hora = ahora();
    a.metodo = 'Reconocimiento facial';
    if (a.id != null) {
      void this.asistenciaRepo.actualizarMarca(a.id, { presente: true, metodo: 'Reconocimiento facial', hora: a.hora });
    }
    this.bus.emit('asistencia:update', a);
    this.bus.emit('actividad:add', {
      color: 'var(--primary)',
      texto: `${a.nombre} marcó asistencia por <b>rostro</b>`,
      tiempo: 'ahora', lugar: 'Kiosko',
    });
    return a;
  }

  /* ---------- ALMACÉN ---------- */
  async agregarArticulo(articulo: Articulo): Promise<Articulo> {
    const res = await this.articulosRepo.create(articulo);
    articulo.id = res?.id || nextId(this.data.articulos);
    this.data.articulos.push(articulo);
    this.bus.emit('almacen:update', articulo);
    this.bus.emit('actividad:add', {
      color: 'var(--success)',
      texto: `Nuevo artículo en catálogo: <b>${articulo.nombre}</b>`,
      tiempo: 'ahora', lugar: 'Almacén',
    });
    return articulo;
  }

  async actualizarArticulo(id: number, cambios: Partial<Articulo>): Promise<void> {
    const i = this.data.articulos.findIndex((a) => a.id === id);
    if (i < 0) return;
    const merged = { ...this.data.articulos[i], ...cambios };
    void this.articulosRepo.update(id, merged);
    Object.assign(this.data.articulos[i], cambios);
    this.bus.emit('almacen:update', this.data.articulos[i]);
  }

  async eliminarArticulo(id: number): Promise<void> {
    void this.articulosRepo.remove(id);
    this.data.articulos = this.data.articulos.filter((a) => a.id !== id);
    this.bus.emit('almacen:update');
  }

  async entradaAlmacen(articuloId: number, cantidad: number, origen: string, costoTotal: number, proveedorDonante: string): Promise<Articulo | null> {
    const a = this.data.articulos.find((x) => x.id === articuloId);
    if (!a) return null;
    a.stock += cantidad;
    if (origen === 'compra' && costoTotal > 0) {
      a.precio = Math.round((costoTotal / cantidad) * 10000) / 10000;
    }
    this.bus.emit('almacen:update', a);
    const esCompra = origen === 'compra';
    void this.articulosRepo.movimiento(articuloId, {
      tipo: 'entrada', cantidad,
      origen: origen || 'compra',
      costo_total: costoTotal || 0,
      proveedor_donante: proveedorDonante || '',
      motivo: esCompra ? `Compra · ${proveedorDonante || ''}` : `Donación · ${proveedorDonante || ''}`,
    });
    this.bus.emit('actividad:add', {
      color: esCompra ? 'var(--primary)' : 'var(--success)',
      texto: esCompra
        ? `Compra de <b>${cantidad} ${a.unidad}</b> de ${a.nombre}${costoTotal > 0 ? ' · $' + costoTotal.toFixed(2) : ''}`
        : `Donación de <b>${cantidad} ${a.unidad}</b> de ${a.nombre}`,
      tiempo: 'ahora', lugar: proveedorDonante || 'Almacén',
    });
    return a;
  }

  async salidaAlmacen(articuloId: number, cantidad: number, motivo?: string): Promise<Articulo | { error: string }> {
    const a = this.data.articulos.find((x) => x.id === articuloId);
    if (!a) return { error: 'Artículo no encontrado' };
    if (cantidad > a.stock) return { error: `Stock insuficiente. Disponible: ${a.stock} ${a.unidad}` };
    a.stock -= cantidad;
    this.bus.emit('almacen:update', a);
    void this.articulosRepo.movimiento(articuloId, { tipo: 'salida', cantidad, motivo: motivo || 'Salida manual' });
    return a;
  }

  /* ---------- GASTOS ---------- */
  async registrarGasto(gasto: Gasto): Promise<Gasto> {
    const hoyISO = new Date().toISOString().split('T')[0];
    const res = await this.gastosRepo.create({
      fecha: hoyISO,
      categoria: gasto.categoria,
      monto: gasto.monto,
      proveedor: gasto.proveedor,
      fondo: gasto.fondo || 'Fondo General',
      observacion: gasto.observacion || '',
      cat_bg: gasto.catBg,
      cat_fg: gasto.catFg,
    });
    gasto.id = res && res.ok ? (res.id ?? nextId(this.data.gastos)) : nextId(this.data.gastos);
    gasto.fecha = hoy();
    this.data.gastos.unshift(gasto);
    this.bus.emit('gastos:update', gasto);
    this.bus.emit('actividad:add', {
      color: 'var(--accent)',
      texto: `Gasto de <b>S/${gasto.monto}</b> en ${gasto.categoria} registrado`,
      tiempo: 'ahora', lugar: gasto.proveedor,
    });
    void this.recargarFondos();
    return gasto;
  }

  async actualizarGasto(id: number, cambios: Partial<Gasto>): Promise<unknown> {
    const i = this.data.gastos.findIndex((g) => g.id === id);
    if (i === -1) return { error: 'Gasto no encontrado' };
    const res = await this.gastosRepo.update(id, {
      fecha: cambios.fechaISO,
      categoria: cambios.categoria,
      monto: cambios.monto,
      proveedor: cambios.proveedor,
      observacion: cambios.observacion || '',
      cat_bg: cambios.catBg,
      cat_fg: cambios.catFg,
    });
    if (res && res.ok) {
      Object.assign(this.data.gastos[i], cambios);
      this.bus.emit('gastos:update');
      void this.recargarFondos();
    }
    return res;
  }

  async eliminarGasto(id: number): Promise<unknown> {
    const res = await this.gastosRepo.remove(id);
    if (res && res.ok) {
      this.data.gastos = this.data.gastos.filter((g) => g.id !== id);
      this.bus.emit('gastos:update');
      void this.recargarFondos();
    }
    return res;
  }

  /* ---------- FONDOS ---------- */
  private async recargarFondos(): Promise<void> {
    const raw = await this.api.get<FondosBalanceRaw>('/fondos/balance');
    if (raw && raw.ok !== false) {
      this.data.fondos = toFondos(raw);
      this.bus.emit('fondos:update');
    }
  }

  async registrarIngreso(ingreso: Record<string, unknown>): Promise<unknown> {
    const res = await this.fondosRepo.registrarIngreso(ingreso);
    if (!res || !res.ok) return { error: (res && res.error) || 'Error al registrar ingreso' };
    await this.recargarFondos();
    this.bus.emit('actividad:add', {
      color: '#1D7A56',
      texto: `Donación de <b>S/${ingreso.monto}</b> registrada`,
      tiempo: 'ahora', lugar: String(ingreso.descripcion || ''),
    });
    return res;
  }

  async eliminarFondoMovimiento(id: number): Promise<unknown> {
    const res = await this.fondosRepo.eliminarMovimiento(id);
    if (res && res.ok) await this.recargarFondos();
    return res;
  }

  /* ---------- ENTREGAS ---------- */
  async registrarEntrega(entrega: Entrega): Promise<Entrega | { error: string }> {
    const art = this.data.articulos.find((a) => a.id === entrega.articuloId);
    if (!art) return { error: 'Artículo no encontrado' };
    if (entrega.cantidad > art.stock) return { error: `Stock insuficiente. Disponible: ${art.stock} ${art.unidad}` };
    art.stock -= entrega.cantidad;
    entrega.id = nextId(this.data.entregas);
    entrega.fecha = hoy();
    this.data.entregas.unshift(entrega);
    this.bus.emit('entregas:update', entrega);
    this.bus.emit('almacen:update');
    void this.entregasRepo.create({
      persona_id: entrega.personaId,
      articulo_id: entrega.articuloId,
      cantidad: entrega.cantidad,
      campana: entrega.campana,
      notas: entrega.notas || '',
    });
    this.bus.emit('actividad:add', {
      color: '#8A6BEA',
      texto: `Entrega de <b>${entrega.articulo}</b> a ${entrega.nino} · ${entrega.campana}`,
      tiempo: 'ahora', lugar: `Campaña ${entrega.campana}`,
    });
    return entrega;
  }

  /* ---------- ALIMENTACIÓN ---------- */
  async registrarServicio(servicio: ServicioAlimentacion, consumo: Array<{ articuloId: number; cantidad: number }>): Promise<ServicioAlimentacion | { error: string }> {
    const errores: string[] = [];
    for (const c of consumo) {
      const a = this.data.articulos.find((x) => x.id === c.articuloId);
      if (!a) { errores.push(`Artículo ID ${c.articuloId} no encontrado`); continue; }
      if (c.cantidad > a.stock) errores.push(`Stock insuficiente de ${a.nombre}. Disponible: ${a.stock} ${a.unidad}`);
    }
    if (errores.length) return { error: errores.join('\n') };
    for (const c of consumo) {
      const a = this.data.articulos.find((x) => x.id === c.articuloId);
      if (a) a.stock -= c.cantidad;
    }
    servicio.id = nextId(this.data.serviciosAlimentacion);
    servicio.fecha = hoy();
    servicio.descontado = true;
    this.data.serviciosAlimentacion.unshift(servicio);
    this.bus.emit('alimentacion:update', servicio);
    this.bus.emit('almacen:update');
    void this.alimentacionRepo.create({
      menu: servicio.menu,
      total: servicio.total,
      ninos: servicio.ninos,
      misioneros: servicio.misioneros,
      voluntarios: servicio.voluntarios || 0,
      padres: servicio.padres || 0,
      staff: servicio.staff || 0,
      insumos: servicio.insumos,
      costo: servicio.costo,
      costo_por_plato: servicio.costoPlato || 0,
      consumo,
    });
    this.bus.emit('actividad:add', {
      color: 'var(--success)',
      texto: `Se sirvieron <b>${servicio.total} almuerzos</b> · ${servicio.menu}`,
      tiempo: 'ahora', lugar: 'Cocina',
    });
    void this.recargarFondos();
    return servicio;
  }
}
