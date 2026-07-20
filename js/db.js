/* ============================================================
   db.js — Store central conectado a API Flask (localhost:7793)
   ============================================================
   Misma interfaz pública que antes. Los módulos no necesitan
   cambios. Los datos ahora vienen de MySQL vía server.py.
   ============================================================ */
window.DB = (function () {

  // file:// → usa localhost. http:// → misma IP que sirvió la página
  const API = window.location.protocol === 'file:'
    ? 'http://localhost:7793'
    : window.location.origin;

  /* ---------- DATOS EN MEMORIA (cache local) ---------- */
  const data = {
    personas:            [],
    asistencia:          [],
    articulos:           [],
    gastos:              [],
    entregas:            [],
    serviciosAlimentacion: [],
    actividad:           [],
    presupuestoMes:      2400,
    fondos: { balance: 0, ingresos: 0, egresos: 0, movimientos: [] },
  };

  /* ---------- UTILIDADES ---------- */
  function nextId(arr) {
    return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;
  }

  function hoy() {
    const d = new Date();
    const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${d.getDate()} ${m[d.getMonth()]}`;
  }

  function ahora() {
    return new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
  }

  /* ---------- EVENT BUS ---------- */
  const _listeners = {};

  function on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }

  function off(event, cb) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== cb);
  }

  function emit(event, payload) {
    (_listeners[event] || []).forEach(cb => cb(payload));
  }

  /* ---------- HELPERS API ---------- */
  async function apiFetch(path, opts = {}) {
    const token = (window.Auth && Auth.getToken()) ? Auth.getToken() : '';
    try {
      const res = await fetch(API + path, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {'Authorization': `Bearer ${token}`} : {}),
        },
        ...opts,
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  /* Normaliza persona de MySQL → formato del frontend */
  function normPersona(p) {
    return {
      id:               p.id,
      nombre:           p.nombre,
      tutor:            p.tutor || '',
      tipo:             p.tipo,
      edad:             String(p.edad || ''),
      genero:           p.genero || 'M',
      ingreso:          p.ingreso ? p.ingreso.substring(0,7) : '',
      estado:           p.estado || 'activo',
      inicial:          p.inicial || p.nombre.substring(0,2).toUpperCase(),
      avatarBg:         p.avatar_bg || '#DDEDF1',
      avatarFg:         p.avatar_fg || '#1C6678',
      cargo:            p.cargo || '',
      dni:              p.dni || '',
      fechaNacimiento:  p.fecha_nacimiento ? p.fecha_nacimiento.substring(0,10) : '',
      nacionalidad:     p.nacionalidad || '',
      telefono:         p.telefono || '',
      email:            p.email || '',
      direccion:        p.direccion || '',
      barrio:           p.barrio || '',
      parentescoTutor:  p.parentesco_tutor || '',
      telefonoTutor:    p.telefono_tutor || '',
      situacionFamiliar:p.situacion_familiar || '',
      grupoSanguineo:   p.grupo_sanguineo || '',
      alergias:         p.alergias || '',
      condicionMedica:  p.condicion_medica || '',
      escolaridad:      p.escolaridad || '',
      colegio:          p.colegio || '',
      procedencia:      p.procedencia || '',
      motivoIngreso:    p.motivo_ingreso || '',
      prioridad:        p.prioridad || 'media',
      observaciones:    p.observaciones || '',
      ocupacion:        p.ocupacion || '',
      organizacion:     p.organizacion || '',
      paisOrigen:       p.pais_origen || '',
      areaServicio:     p.area_servicio || '',
      tipoVinculo:      p.tipo_vinculo || '',
      fechaFin:         p.fecha_fin ? p.fecha_fin.substring(0,10) : '',
      ingresoFamiliar:  p.ingreso_familiar || '',
      numHijosPrograma: p.num_hijos_programa || 0,
      zkUserId:         p.zk_user_id || '',
      fotoUrl:          p.foto_url   || '',
    };
  }

  /* Normaliza artículo de MySQL → formato del frontend */
  function normArticulo(a) {
    return {
      id:          a.id,
      nombre:      a.nombre,
      categoria:   a.categoria,
      stock:       Number(a.stock),
      minimo:      Number(a.minimo),
      unidad:      a.unidad,
      vence:       a.vence || '—',
      precio:      Number(a.precio || 0),
      descripcion: a.descripcion || '',
      proveedor:   a.proveedor || '',
      codigo:      a.codigo || '',
      ubicacion:   a.ubicacion || '',
      imagen:      a.imagen || '',
    };
  }

  /* Normaliza gasto de MySQL → formato del frontend */
  function normGasto(g) {
    const d = new Date(g.fecha + 'T00:00:00');
    const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return {
      id:            g.id,
      fecha:         `${d.getDate()} ${m[d.getMonth()]}`,
      fechaISO:      g.fecha,
      categoria:     g.categoria,
      monto:         Number(g.monto),
      proveedor:     g.proveedor || '',
      fondo:         g.fondo || 'Fondo General',
      observacion:   g.observacion || '',
      comprobante:   g.comprobante_url || '',
      fuenteAuto:    g.fuente_auto || '',
      catBg:         g.cat_bg || '#DDEDF1',
      catFg:         g.cat_fg || '#1C6678',
    };
  }

  /* Normaliza entrega de MySQL → formato del frontend */
  function normEntrega(e) {
    const d = new Date(e.fecha);
    const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return {
      id:                e.id,
      fecha:             `${d.getDate()} ${m[d.getMonth()]}`,
      personaId:         e.persona_id,
      nino:              e.nino || '',
      personaTipo:       e.persona_tipo || 'nino',
      articulo:          e.articulo || '',
      articuloCategoria: e.articulo_categoria || '',
      unidad:            e.unidad || '',
      articuloId:        e.articulo_id,
      cantidad:          Number(e.cantidad),
      campana:           e.campana || 'General',
      notas:             e.notas || '',
      inicial:           e.inicial || '',
      avatarBg:          e.avatar_bg || '#DDEDF1',
      avatarFg:          e.avatar_fg || '#1C6678',
      campBg:            e.bg_color  || '#EDE7FD',
      campFg:            e.fg_color  || '#6B4EEA',
    };
  }

  /* Normaliza movimiento de fondos de MySQL → formato del frontend */
  function normFondoMov(m) {
    const d = new Date((m.fecha || '') + 'T00:00:00');
    const mes = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return {
      id:          m.id,
      tipo:        m.tipo,
      monto:       Number(m.monto),
      descripcion: m.descripcion || '',
      categoria:   m.categoria  || '',
      fuente:      m.fuente     || 'manual',
      fecha:       m.fecha ? `${d.getDate()} ${mes[d.getMonth()]}` : '',
    };
  }

  /* Normaliza asistencia de MySQL → formato del frontend */
  function normAsistencia(a) {
    return {
      id:          a.id || null,
      personaId:   a.persona_id || null,
      zkUserId:    a.zk_user_id || null,
      nombre:      a.nombre || '',
      tipo:        a.tipo || 'nino',
      metodo:      a.metodo || '—',
      presente:    Boolean(a.presente),
      hora:        a.hora ? String(a.hora).substring(0,5) : '',
      inicial:     a.inicial || (a.nombre ? a.nombre.split(' ').map(n=>n[0]||'').join('').slice(0,2).toUpperCase() : '?'),
      avatarBg:    a.avatar_bg || '#DDEDF1',
      avatarFg:    a.avatar_fg || '#1C6678',
      fotoUrl:     a.foto_url || '',
      sinAsignar:  Boolean(a.sin_asignar),
    };
  }

  /* ---------- CARGA INICIAL DESDE API ---------- */
  async function cargarTodo() {
    // allSettled: si un endpoint falla, los demás siguen — los datos en memoria
    // no se borran, solo se actualizan los que respondieron correctamente
    const resultados = await Promise.allSettled([
      apiFetch('/personas'),
      apiFetch('/articulos'),
      apiFetch('/gastos'),
      apiFetch('/entregas'),
      apiFetch('/asistencia/hoy'),
      apiFetch('/alimentacion'),
      apiFetch('/fondos/balance'),
    ]);

    const val = i => {
      const r = resultados[i];
      return r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : null;
    };

    const personas    = val(0);
    const articulos   = val(1);
    const gastos      = val(2);
    const entregas    = val(3);
    const asistencia  = val(4);
    const alimentacion= val(5);
    const fondosRes   = resultados[6];

    if (personas)    data.personas            = personas.map(normPersona);
    if (articulos)   data.articulos            = articulos.map(normArticulo);
    if (gastos)      data.gastos               = gastos.map(normGasto);
    if (entregas)    data.entregas             = entregas.map(normEntrega);
    if (asistencia)  data.asistencia           = asistencia.map(normAsistencia);
    if (alimentacion) data.serviciosAlimentacion = alimentacion.map(s => ({
      id:           s.id,
      fecha:        s.fecha,
      menu:         s.menu || '',
      total:        s.total_raciones || 0,
      ninos:        s.ninos || 0,
      misioneros:   s.misioneros || 0,
      voluntarios:  s.voluntarios || 0,
      padres:       s.padres || 0,
      staff:        s.staff || 0,
      insumos:      s.insumos_desc || '',
      costo:        Number(s.costo_total || 0),
      costoPlato:   Number(s.costo_por_plato || 0),
      descontado:   Boolean(s.descontado),
    }));
    if (fondosRes && fondosRes.status === 'fulfilled' && fondosRes.value && fondosRes.value.ok !== false) {
      const f = fondosRes.value;
      data.fondos = {
        balance:    Number(f.balance   || 0),
        ingresos:   Number(f.total_ingresos || 0),
        egresos:    Number(f.total_egresos  || 0),
        movimientos: (f.movimientos || []).map(normFondoMov),
      };
    }

    emit('personas:update');
    emit('asistencia:update');
    emit('almacen:update');
    emit('gastos:update');
    emit('entregas:update');
    emit('alimentacion:update');
    emit('fondos:update');

    const ok  = resultados.filter(r=>r.status==='fulfilled' && r.value).length;
    const err = resultados.length - ok;
  }

  /* Refresca asistencia; detecta nuevos presentes y emite 'asistencia:nueva' */
  async function refrescarAsistencia() {
    const rows = await apiFetch('/asistencia/hoy');
    if (!rows || !Array.isArray(rows)) return;
    const antesPresentes = new Set(
      data.asistencia.filter(a => a.presente && a.personaId).map(a => a.personaId)
    );
    const habiaDatos = data.asistencia.length > 0;
    data.asistencia = rows.map(normAsistencia);
    emit('asistencia:update');
    if (habiaDatos) {
      const nuevos = data.asistencia.filter(a =>
        a.presente && a.personaId && !antesPresentes.has(a.personaId));
      if (nuevos.length) emit('asistencia:nueva', nuevos);
    }
  }

  /* ---------- WEBSOCKET: asistencia en tiempo real ---------- */
  let _ws = null;
  let _wsRetry = 2000;

  function _conectarWS() {
    try {
      const token = (window.Auth && Auth.getToken()) ? Auth.getToken() : '';
      const wsUrl = API.replace(/^http/, 'ws') + '/ws/asistencia'
                  + (token ? ('?token=' + encodeURIComponent(token)) : '');
      _ws = new WebSocket(wsUrl);
      _ws.onopen = () => { _wsRetry = 2000; };
      _ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (d.evento === 'asistencia') refrescarAsistencia();
        } catch(_) {}
      };
      _ws.onclose = () => {
        _ws = null;
        setTimeout(_conectarWS, _wsRetry);
        _wsRetry = Math.min(_wsRetry * 2, 30000);  // backoff hasta 30s
      };
      _ws.onerror = () => { try { _ws.close(); } catch(_) {} };
    } catch(_) {
      setTimeout(_conectarWS, 10000);
    }
  }

  /* ---------- ACCIONES (mutations) — ahora persisten en API ---------- */

  // PERSONAS
  async function agregarPersona(persona) {
    const res = await apiFetch('/personas', {
      method: 'POST',
      body: JSON.stringify({
        nombre:            persona.nombre,
        tipo:              persona.tipo,
        estado:            persona.estado || 'activo',
        edad:              persona.edad,
        genero:            persona.genero,
        tutor:             persona.tutor,
        ingreso:           persona.ingreso,
        inicial:           persona.inicial,
        avatar_bg:         persona.avatarBg,
        avatar_fg:         persona.avatarFg,
        cargo:             persona.cargo,
        dni:               persona.dni,
        fecha_nacimiento:  persona.fechaNacimiento,
        nacionalidad:      persona.nacionalidad,
        telefono:          persona.telefono,
        email:             persona.email,
        direccion:         persona.direccion,
        barrio:            persona.barrio,
        parentesco_tutor:  persona.parentescoTutor,
        telefono_tutor:    persona.telefonoTutor,
        situacion_familiar:persona.situacionFamiliar,
        grupo_sanguineo:   persona.grupoSanguineo,
        alergias:          persona.alergias,
        condicion_medica:  persona.condicionMedica,
        escolaridad:       persona.escolaridad,
        colegio:           persona.colegio,
        procedencia:       persona.procedencia,
        motivo_ingreso:    persona.motivoIngreso,
        prioridad:         persona.prioridad,
        observaciones:     persona.observaciones,
        ocupacion:         persona.ocupacion,
        organizacion:      persona.organizacion,
        pais_origen:       persona.paisOrigen,
        area_servicio:     persona.areaServicio,
        tipo_vinculo:      persona.tipoVinculo,
        fecha_fin:         persona.fechaFin,
        ingreso_familiar:  persona.ingresoFamiliar,
        num_hijos_programa:persona.numHijosPrograma,
      }),
    });
    if (res && res.ok) {
      persona.id = res.id;
      // Nota: el enrolamiento real en el dispositivo se hace vía /timmy/agregar
      // (tab "Enrolar"), que llama a timmy_direct.agregar_usuario() con
      // privilegio=0 (usuario normal) por defecto. Esta llamada a /users queda
      // aquí por compatibilidad, pero /users no existe como ruta en server.py
      // — si alguna vez se implementa, debe crearse con privilege=0, nunca 14
      // (Admin): eso le daría a cada persona registrada acceso administrativo
      // al dispositivo físico solo para evitar una restricción de horario.
      apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          uid:       res.id,
          user_id:   String(res.id),
          name:      persona.nombre.substring(0, 24),
          privilege: 0,
          password:  '',
        }),
      });
      data.personas.push(persona);
      // Todos los tipos tienen asistencia (niños, misioneros, voluntarios, staff)
      data.asistencia.push({
        id: nextId(data.asistencia), personaId: persona.id,
        tipo: persona.tipo,
        nombre: persona.nombre, metodo: '—', presente: false, hora: '',
        inicial: persona.inicial, avatarBg: persona.avatarBg, avatarFg: persona.avatarFg,
      });
      emit('asistencia:update');
      emit('personas:update', persona);
      emit('actividad:add', {color:'var(--primary)',texto:`Nueva persona registrada: <b>${persona.nombre}</b>`,tiempo:'ahora',lugar:'Personas'});
    }
    return persona;
  }

  async function actualizarPersona(id, cambios) {
    const i = data.personas.findIndex(p => p.id === id);
    if (i < 0) return;
    const merged = Object.assign({}, data.personas[i], cambios);
    // persiste en MySQL
    apiFetch(`/personas/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre:            merged.nombre,    tipo:              merged.tipo,
        estado:            merged.estado,    edad:              merged.edad,
        genero:            merged.genero,    tutor:             merged.tutor,
        ingreso:           merged.ingreso,   inicial:           merged.inicial,
        avatar_bg:         merged.avatarBg,  avatar_fg:         merged.avatarFg,
        dni:               merged.dni,               fecha_nacimiento:  merged.fechaNacimiento,
        nacionalidad:      merged.nacionalidad,       telefono:          merged.telefono,
        email:             merged.email,              direccion:         merged.direccion,
        barrio:            merged.barrio,             parentesco_tutor:  merged.parentescoTutor,
        telefono_tutor:    merged.telefonoTutor,      situacion_familiar:merged.situacionFamiliar,
        grupo_sanguineo:   merged.grupoSanguineo,     alergias:          merged.alergias,
        condicion_medica:  merged.condicionMedica,    escolaridad:       merged.escolaridad,
        colegio:           merged.colegio,            procedencia:       merged.procedencia,
        motivo_ingreso:    merged.motivoIngreso,      prioridad:         merged.prioridad,
        observaciones:     merged.observaciones,
        ocupacion:         merged.ocupacion,          organizacion:      merged.organizacion,
        pais_origen:       merged.paisOrigen,         area_servicio:     merged.areaServicio,
        tipo_vinculo:      merged.tipoVinculo,        fecha_fin:         merged.fechaFin,
        ingreso_familiar:  merged.ingresoFamiliar,    num_hijos_programa:merged.numHijosPrograma,
      }),
    });
    Object.assign(data.personas[i], cambios);
    // sincroniza con asistencia en memoria
    if (cambios.nombre || cambios.inicial || cambios.avatarBg || cambios.avatarFg) {
      const a = data.asistencia.find(x => x.personaId === id);
      if (a) {
        if (cambios.nombre)   a.nombre   = cambios.nombre;
        if (cambios.inicial)  a.inicial  = cambios.inicial;
        if (cambios.avatarBg) a.avatarBg = cambios.avatarBg;
        if (cambios.avatarFg) a.avatarFg = cambios.avatarFg;
        emit('asistencia:update');
      }
    }
    emit('personas:update', data.personas[i]);
  }

  async function eliminarPersona(id) {
    try {
      const r = await apiFetch(`/personas/${id}`, { method: 'DELETE' });
      if (r && r.ok) {
        data.personas    = data.personas.filter(p => p.id !== id);
        data.asistencia  = data.asistencia.filter(a => a.personaId !== id);
        data.entregas    = data.entregas.filter(e => e.personaId !== id);
        emit('personas:update');
        emit('asistencia:update');
        return true;
      }
      return false;
    } catch { return false; }
  }

  // ASISTENCIA
  async function toggleAsistencia(id, metodo) {
    const a = data.asistencia.find(x => x.id === id);
    if (!a) return;
    a.presente = !a.presente;
    a.hora     = a.presente ? ahora() : '';
    a.metodo   = a.presente ? (metodo || 'Manual') : '—';
    emit('asistencia:update', a);
    // Persiste en MySQL
    apiFetch(`/asistencia/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ presente: a.presente, metodo: a.metodo, hora: a.hora }),
    });
    if (a.presente) {
      emit('actividad:add', {color:'var(--primary)',texto:`${a.nombre} marcó asistencia por <b>${a.metodo}</b>`,tiempo:'ahora',lugar:'Kiosko'});
    }
    return a;
  }

  async function marcarFacial(personaId) {
    const a = data.asistencia.find(x => x.personaId === personaId);
    if (!a || a.presente) return null;
    a.presente = true;
    a.hora     = ahora();
    a.metodo   = 'Reconocimiento facial';
    // Persiste en MySQL reutilizando el mismo endpoint PUT de asistencia
    apiFetch(`/asistencia/${a.id}`, {
      method: 'PUT',
      body: JSON.stringify({ presente: true, metodo: 'Reconocimiento facial', hora: a.hora }),
    });
    emit('asistencia:update', a);
    emit('actividad:add', {color:'var(--primary)',texto:`${a.nombre} marcó asistencia por <b>rostro</b>`,tiempo:'ahora',lugar:'Kiosko'});
    return a;
  }

  // ALMACEN
  async function agregarArticulo(articulo) {
    const res = await apiFetch('/articulos', {
      method: 'POST',
      body: JSON.stringify({
        nombre: articulo.nombre, categoria: articulo.categoria,
        stock: articulo.stock, minimo: articulo.minimo,
        unidad: articulo.unidad, vence: articulo.vence !== '—' ? articulo.vence : null,
        precio: articulo.precio, descripcion: articulo.descripcion,
        proveedor: articulo.proveedor, codigo: articulo.codigo,
        ubicacion: articulo.ubicacion,
      }),
    });
    articulo.id = res?.id || nextId(data.articulos);
    data.articulos.push(articulo);
    emit('almacen:update', articulo);
    emit('actividad:add', {color:'var(--success)',texto:`Nuevo artículo en catálogo: <b>${articulo.nombre}</b>`,tiempo:'ahora',lugar:'Almacén'});
    return articulo;
  }

  async function actualizarArticulo(id, cambios) {
    const i = data.articulos.findIndex(a => a.id === id);
    if (i < 0) return;
    const merged = Object.assign({}, data.articulos[i], cambios);
    apiFetch(`/articulos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: merged.nombre, categoria: merged.categoria,
        stock: merged.stock, minimo: merged.minimo,
        unidad: merged.unidad, vence: merged.vence !== '—' ? merged.vence : null,
        precio: merged.precio, descripcion: merged.descripcion,
        proveedor: merged.proveedor, codigo: merged.codigo,
        ubicacion: merged.ubicacion,
      }),
    });
    Object.assign(data.articulos[i], cambios);
    emit('almacen:update', data.articulos[i]);
  }

  async function eliminarArticulo(id) {
    apiFetch(`/articulos/${id}`, { method: 'DELETE' });
    data.articulos = data.articulos.filter(a => a.id !== id);
    emit('almacen:update');
  }

  async function entradaAlmacen(articuloId, cantidad, origen, costoTotal, proveedorDonante) {
    const a = data.articulos.find(x => x.id === articuloId);
    if (!a) return null;
    a.stock += cantidad;
    // Actualiza precio unitario en memoria si es compra con costo
    if (origen === 'compra' && costoTotal > 0) {
      a.precio = Math.round((costoTotal / cantidad) * 10000) / 10000;
    }
    emit('almacen:update', a);
    const esCompra = origen === 'compra';
    apiFetch(`/articulos/${articuloId}/movimiento`, {
      method: 'POST',
      body: JSON.stringify({
        tipo: 'entrada', cantidad,
        origen: origen || 'compra',
        costo_total: costoTotal || 0,
        proveedor_donante: proveedorDonante || '',
        motivo: esCompra ? `Compra · ${proveedorDonante||''}` : `Donación · ${proveedorDonante||''}`,
      }),
    });
    const actColor = esCompra ? 'var(--primary)' : 'var(--success)';
    const actTexto = esCompra
      ? `Compra de <b>${cantidad} ${a.unidad}</b> de ${a.nombre}${costoTotal>0?' · $'+costoTotal.toFixed(2):''}`
      : `Donación de <b>${cantidad} ${a.unidad}</b> de ${a.nombre}`;
    emit('actividad:add', { color: actColor, texto: actTexto, tiempo: 'ahora', lugar: proveedorDonante || 'Almacén' });
    return a;
  }

  async function salidaAlmacen(articuloId, cantidad, motivo) {
    const a = data.articulos.find(x => x.id === articuloId);
    if (!a) return {error: 'Artículo no encontrado'};
    if (cantidad > a.stock) return {error: `Stock insuficiente. Disponible: ${a.stock} ${a.unidad}`};
    a.stock -= cantidad;
    emit('almacen:update', a);
    apiFetch(`/articulos/${articuloId}/movimiento`, {
      method: 'POST',
      body: JSON.stringify({ tipo: 'salida', cantidad, motivo: motivo || 'Salida manual' }),
    });
    return a;
  }

  // GASTOS
  async function registrarGasto(gasto) {
    const hoyISO = new Date().toISOString().split('T')[0];
    const res = await apiFetch('/gastos', {
      method: 'POST',
      body: JSON.stringify({
        fecha:      hoyISO,
        categoria:  gasto.categoria,
        monto:      gasto.monto,
        proveedor:  gasto.proveedor,
        fondo:      gasto.fondo || 'Fondo General',
        observacion: gasto.observacion || '',
        cat_bg:     gasto.catBg,
        cat_fg:     gasto.catFg,
      }),
    });
    if (res && res.ok) {
      gasto.id = res.id;
      gasto.fecha = hoy();
    } else {
      gasto.id = nextId(data.gastos);
      gasto.fecha = hoy();
    }
    data.gastos.unshift(gasto);
    emit('gastos:update', gasto);
    emit('actividad:add', {color:'var(--accent)',texto:`Gasto de <b>S/${gasto.monto}</b> en ${gasto.categoria} registrado`,tiempo:'ahora',lugar:gasto.proveedor});
    // Actualiza fondos (el backend ya creó el egreso)
    _recargarFondos();
    return gasto;
  }

  async function actualizarGasto(id, cambios) {
    const i = data.gastos.findIndex(g => g.id === id);
    if (i === -1) return { error: 'Gasto no encontrado' };
    const res = await apiFetch(`/gastos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        fecha:       cambios.fechaISO,
        categoria:   cambios.categoria,
        monto:       cambios.monto,
        proveedor:   cambios.proveedor,
        observacion: cambios.observacion || '',
        cat_bg:      cambios.catBg,
        cat_fg:      cambios.catFg,
      }),
    });
    if (res && res.ok) {
      Object.assign(data.gastos[i], cambios);
      emit('gastos:update');
      _recargarFondos();
    }
    return res;
  }

  async function eliminarGasto(id) {
    const res = await apiFetch(`/gastos/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
      data.gastos = data.gastos.filter(g => g.id !== id);
      emit('gastos:update');
      _recargarFondos();
    }
    return res;
  }

  // FONDOS / DONACIONES
  async function _recargarFondos() {
    const res = await apiFetch('/fondos/balance');
    if (res && res.ok !== false) {
      data.fondos = {
        balance:    Number(res.balance   || 0),
        ingresos:   Number(res.total_ingresos || 0),
        egresos:    Number(res.total_egresos  || 0),
        movimientos: (res.movimientos || []).map(normFondoMov),
      };
      emit('fondos:update');
    }
  }

  async function registrarIngreso(ingreso) {
    const res = await apiFetch('/fondos/ingreso', {
      method: 'POST',
      body: JSON.stringify(ingreso),
    });
    if (!res || !res.ok) return {error: res?.error || 'Error al registrar ingreso'};
    await _recargarFondos();
    emit('actividad:add', {color:'#1D7A56',texto:`Donación de <b>S/${ingreso.monto}</b> registrada`,tiempo:'ahora',lugar:ingreso.descripcion || ''});
    return res;
  }

  async function eliminarFondoMovimiento(id) {
    const res = await apiFetch(`/fondos/${id}`, {method: 'DELETE'});
    if (res && res.ok) await _recargarFondos();
    return res;
  }

  // ENTREGAS
  async function registrarEntrega(entrega) {
    // Valida stock antes de continuar (optimista en memoria)
    const art = data.articulos.find(a => a.id === entrega.articuloId);
    if (!art) return {error: 'Artículo no encontrado'};
    if (entrega.cantidad > art.stock) return {error: `Stock insuficiente. Disponible: ${art.stock} ${art.unidad}`};
    // Descuenta en memoria
    art.stock -= entrega.cantidad;
    entrega.id = nextId(data.entregas);
    entrega.fecha = hoy();
    data.entregas.unshift(entrega);
    emit('entregas:update', entrega);
    emit('almacen:update');
    // Persiste en MySQL (stock + entrega)
    apiFetch('/entregas', {
      method: 'POST',
      body: JSON.stringify({
        persona_id:  entrega.personaId,
        articulo_id: entrega.articuloId,
        cantidad:    entrega.cantidad,
        campana:     entrega.campana,
        notas:       entrega.notas || '',
      }),
    });
    emit('actividad:add', {color:'#8A6BEA',texto:`Entrega de <b>${entrega.articulo}</b> a ${entrega.nino} · ${entrega.campana}`,tiempo:'ahora',lugar:`Campaña ${entrega.campana}`});
    return entrega;
  }

  // ALIMENTACION
  async function registrarServicio(servicio, consumo) {
    // Valida stock en memoria para todos los insumos antes de descontar
    const errores = [];
    consumo.forEach(c => {
      const a = data.articulos.find(x => x.id === c.articuloId);
      if (!a) { errores.push(`Artículo ID ${c.articuloId} no encontrado`); return; }
      if (c.cantidad > a.stock) errores.push(`Stock insuficiente de ${a.nombre}. Disponible: ${a.stock} ${a.unidad}`);
    });
    if (errores.length) return {error: errores.join('\n')};
    // Descuenta en memoria
    consumo.forEach(c => {
      const a = data.articulos.find(x => x.id === c.articuloId);
      if (a) a.stock -= c.cantidad;
    });
    servicio.id = nextId(data.serviciosAlimentacion);
    servicio.fecha = hoy();
    servicio.descontado = true;
    data.serviciosAlimentacion.unshift(servicio);
    emit('alimentacion:update', servicio);
    emit('almacen:update');
    // Persiste en MySQL (servicio + descuento de insumos)
    apiFetch('/alimentacion', {
      method: 'POST',
      body: JSON.stringify({
        menu:           servicio.menu,
        total:          servicio.total,
        ninos:          servicio.ninos,
        misioneros:     servicio.misioneros,
        voluntarios:    servicio.voluntarios || 0,
        padres:         servicio.padres || 0,
        staff:          servicio.staff || 0,
        insumos:        servicio.insumos,
        costo:          servicio.costo,
        costo_por_plato:servicio.costoPlato || 0,
        consumo:        consumo,
      }),
    });
    emit('actividad:add', {color:'var(--success)',texto:`Se sirvieron <b>${servicio.total} almuerzos</b> · ${servicio.menu}`,tiempo:'ahora',lugar:'Cocina'});
    // Actualiza fondos (el backend ya creó el egreso por el costo del servicio)
    _recargarFondos();
    return servicio;
  }

  // ACTIVIDAD
  function addActividad(item) {
    data.actividad.unshift(item);
    if (data.actividad.length > 20) data.actividad.pop();
    emit('actividad:update');
  }
  on('actividad:add', addActividad);

  /* ---------- GETTERS DERIVADOS ---------- */
  function getKPIs() {
    const presentes    = data.asistencia.filter(a => a.presente).length;
    const gastoMes     = data.gastos.reduce((s,g) => s + g.monto, 0);
    const almuerzosMes = data.serviciosAlimentacion.reduce((s,x) => s + x.total, 0);
    const entregasMes  = data.entregas.length;
    const criticos     = data.articulos.filter(a => a.stock < a.minimo).length;
    const ninos        = data.personas.filter(p => p.tipo === 'nino').length;
    return { presentes, gastoMes, almuerzosMes, entregasMes, criticos, ninos };
  }

  function getAlertasActivas() {
    const alertas = [];
    const criticos = data.articulos.filter(a => a.stock < a.minimo);
    if (criticos.length) alertas.push({tipo:'danger',texto:`${criticos.map(a=>a.nombre).join(', ')} bajo el mínimo`,sub:`${criticos.length} artículo${criticos.length>1?'s':''} por agotarse`,link:'almacen'});
    data.personas.filter(p=>p.estado==='alerta').forEach(p => {
      alertas.push({tipo:'warn',texto:`${p.nombre} no asiste hace 8 días`,sub:'Posible deserción · contactar al tutor',link:'personas'});
    });
    const sinZK = data.personas.filter(p=>['nino','padre'].includes(p.tipo) && p.estado==='activo' && !p.zkUserId).length;
    if (sinZK > 0) alertas.push({tipo:'primary',texto:`${sinZK} persona${sinZK>1?'s':''} sin enrolamiento facial`,sub:'Sin ZK user ID asignado · ir a Marcado',link:'marcado'});
    return alertas;
  }

  /* ---------- INIT: carga datos y arranca refresco automático ----------
     IMPORTANTE: antes esto se ejecutaba apenas se parseaba el script (antes
     de que existiera sesión), así que salían peticiones sin token en cuanto
     se abría la página, login incluido. Ahora es un método explícito que
     Auth/App llaman recién cuando confirman que hay una sesión válida. */
  let _dbInicializada = false;

  function init() {
    if (_dbInicializada) return cargarTodo();
    _dbInicializada = true;
    return cargarTodo().then(() => {
      // WebSocket: push instantáneo cuando hay marcas/cambios de asistencia
      _conectarWS();
      // Respaldo por si el WebSocket se cae: refresco cada 30s
      setInterval(refrescarAsistencia, 30000);
      // Refresca todos los datos cada 2 minutos para mantener dashboard actualizado
      setInterval(cargarTodo, 120000);
    });
  }

  /* ---------- API PÚBLICA ---------- */
  return {
    get personas()              { return data.personas; },
    get asistencia()            { return data.asistencia; },
    get articulos()             { return data.articulos; },
    get gastos()                { return data.gastos; },
    get entregas()              { return data.entregas; },
    get serviciosAlimentacion() { return data.serviciosAlimentacion; },
    get actividad()             { return data.actividad; },
    get presupuestoMes()        { return data.presupuestoMes; },
    get fondos()                { return data.fondos; },

    on, off, emit,

    agregarPersona,
    actualizarPersona,
    eliminarPersona,
    toggleAsistencia,
    marcarFacial,
    agregarArticulo,
    actualizarArticulo,
    eliminarArticulo,
    entradaAlmacen,
    salidaAlmacen,
    registrarGasto,
    actualizarGasto,
    eliminarGasto,
    registrarIngreso,
    eliminarFondoMovimiento,
    registrarEntrega,
    registrarServicio,

    getKPIs,
    getAlertasActivas,

    nextId,
    hoy,
    ahora,

    // utilidad para forzar recarga manual desde cualquier módulo
    recargar: cargarTodo,
    // llamar solo tras confirmar sesión válida (ver auth.js)
    init,
  };
})();