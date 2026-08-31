  cargarUsuarios() {
    return this.api("/api/usuarios")
      .then((d) => {
        if (!this._vivo) return;
        this.setState({
          usuarios: d.usuarios || [], roles: d.roles || [],
          sinUsuario: d.sin_usuario || [], modulosPerm: d.modulos || []
        });
      })
      .catch(() => {});
  }

/*§CORTE§ linea original 5388 §*/
  cargarAccesos() {
    return this.api("/api/accesos?limite=150")
      .then((d) => { if (this._vivo) this.setState({ accesos: d.accesos || [] }); })
      .catch(() => {});
  }

  /* Una clave inicial legible: la va a dictar una persona a otra, así que
     se evitan los caracteres que se confunden al leerlos en voz alta. */
/*§CORTE§ linea original 5396 §*/
  claveSugerida() {
    const abc = "abcdefghijkmnpqrstuvwxyz";
    const num = "23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += abc.charAt(Math.floor(Math.random() * abc.length));
    out += "-";
    for (let i = 0; i < 3; i++) out += num.charAt(Math.floor(Math.random() * num.length));
    return out;
  }

/*§CORTE§ linea original 5406 §*/
  abrirAltaUsuario() {
    this.cargarUsuarios();
    this.setState({
      modal: "usuario", modalError: "", uxId: null, uxPersona: "",
      uxUsuario: "", uxRol: "", uxClave: this.claveSugerida()
    });
  }

/*§CORTE§ linea original 5414 §*/
  abrirResetUsuario(u) {
    this.setState({
      modal: "usuario", modalError: "", uxId: u.id, uxPersona: "",
      uxUsuario: u.usuario, uxRol: "", uxClave: this.claveSugerida()
    });
  }

  /* El nombre de usuario se propone del nombre real, pero solo mientras
     nadie lo haya escrito a mano: si no, se sobrescribiría lo tecleado. */
/*§CORTE§ linea original 5423 §*/
  sugerirUsuario(nombre) {
    const limpio = String(nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/);
    if (!limpio.length || !limpio[0]) return "";
    const base = limpio.length > 1
      ? limpio[0].charAt(0) + limpio[1]
      : limpio[0];
    const usados = (this.state.usuarios || []).map((u) => u.usuario);
    let cand = base, n = 2;
    while (usados.indexOf(cand) >= 0) cand = base + n++;
    return cand;
  }

/*§CORTE§ linea original 5436 §*/
  guardarUsuario() {
    const st = this.state;
    if (st.modalOcupado) return;

    if (st.uxId) {                     // reseteo de contraseña
      if (!st.uxClave || st.uxClave.length < 8) {
        this.setState({ modalError: "La contraseña necesita al menos 8 caracteres." });
        return;
      }
      this.setState({ modalOcupado: true, modalError: "" });
      this.api("/api/usuarios/" + st.uxId, {
        method: "PUT", body: JSON.stringify({ clave: st.uxClave })
      })
        .then((d) => {
          if (!this._vivo) return;
          this.setState({ modalOcupado: false, modal: "", usuarios: d.usuarios || [] });
        })
        .catch((e) => {
          if (!this._vivo) return;
          this.setState({ modalOcupado: false, modalError: String(e.message || e) });
        });
      return;
    }

    if (!st.uxPersona) { this.setState({ modalError: "Elige a quién le das la cuenta." }); return; }
    if (!st.uxRol) { this.setState({ modalError: "Elige el cargo que tendrá en el sistema." }); return; }
    if (!st.uxClave || st.uxClave.length < 8) {
      this.setState({ modalError: "La contraseña inicial necesita al menos 8 caracteres." });
      return;
    }
    this.setState({ modalOcupado: true, modalError: "" });
    this.api("/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        personal_id: Number(st.uxPersona), rol_id: Number(st.uxRol),
        usuario: String(st.uxUsuario || "").trim().toLowerCase(), clave: st.uxClave
      })
    })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modal: "" });
        this.cargarUsuarios();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5485 §*/
  cambiarEstadoUsuario(u) {
    const nuevo = u.estado === "activo" ? "suspendido" : "activo";
    this.api("/api/usuarios/" + u.id, {
      method: "PUT", body: JSON.stringify({ estado: nuevo })
    })
      .then((d) => { if (this._vivo) this.setState({ usuarios: d.usuarios || [], usuErr: "" }); })
      .catch((e) => { if (this._vivo) this.setState({ usuErr: String(e.message || e) }); });
  }

/*§CORTE§ linea original 5494 §*/
  borrarUsuarioCuenta(u) {
    this.api("/api/usuarios/" + u.id, { method: "DELETE" })
      .then(() => { if (this._vivo) { this.setState({ usuErr: "" }); this.cargarUsuarios(); } })
      .catch((e) => { if (this._vivo) this.setState({ usuErr: String(e.message || e) }); });
  }

  /* ── Cargos ───────────────────────────────────────────────────────── */

/*§CORTE§ linea original 5502 §*/
  abrirAltaRol() {
    const vacio = {};
    (this.state.modulosPerm || []).forEach((m) => { vacio[m.clave] = "ninguno"; });
    this.setState({
      modal: "rol", modalError: "", rxId: null, rxNombre: "",
      rxPermisos: vacio, rxSistema: false, rxRolClave: ""
    });
  }

/*§CORTE§ linea original 5511 §*/
  abrirRol(r) {
    this.setState({
      modal: "rol", modalError: "", rxId: r.id, rxNombre: r.nombre,
      rxPermisos: {}, rxSistema: !!r.es_sistema, rxRolClave: r.clave
    });
    this.api("/api/roles/" + r.id + "/permisos")
      .then((d) => { if (this._vivo) this.setState({ rxPermisos: d.permisos || {} }); })
      .catch((e) => { if (this._vivo) this.setState({ modalError: String(e.message || e) }); });
  }

/*§CORTE§ linea original 5521 §*/
  fijarPermiso(clave, nivel) {
    const copia = Object.assign({}, this.state.rxPermisos);
    copia[clave] = nivel;
    this.setState({ rxPermisos: copia });
  }

/*§CORTE§ linea original 5527 §*/
  fijarTodos(nivel) {
    const copia = {};
    (this.state.modulosPerm || []).forEach((m) => { copia[m.clave] = nivel; });
    this.setState({ rxPermisos: copia });
  }

/*§CORTE§ linea original 5533 §*/
  guardarRol() {
    const st = this.state;
    if (st.modalOcupado) return;
    /* El rol Director no se toca: recortarlo dejaría al sistema sin nadie
       capaz de arreglarlo. El backend lo rechaza igual. */
    if (st.rxRolClave === "director") { this.cerrarModal(); return; }

    if (!st.rxId) {
      if (!String(st.rxNombre || "").trim()) {
        this.setState({ modalError: "Ponle nombre al cargo." });
        return;
      }
      this.setState({ modalOcupado: true, modalError: "" });
      this.api("/api/roles", {
        method: "POST",
        body: JSON.stringify({ nombre: st.rxNombre.trim(), permisos: st.rxPermisos })
      })
        .then((d) => {
          if (!this._vivo) return;
          /* Si ya existía uno equivalente el backend devuelve ese en vez de
             duplicarlo; entonces hay que guardarle los permisos aparte. */
          if (d.ya_existia) {
            return this.api("/api/roles/" + d.id + "/permisos", {
              method: "PUT", body: JSON.stringify({ permisos: st.rxPermisos })
            });
          }
        })
        .then(() => {
          if (!this._vivo) return;
          this.setState({ modalOcupado: false, modal: "" });
          this.cargarUsuarios();
        })
        .catch((e) => {
          if (!this._vivo) return;
          this.setState({ modalOcupado: false, modalError: String(e.message || e) });
        });
      return;
    }

    this.setState({ modalOcupado: true, modalError: "" });
    this.api("/api/roles/" + st.rxId + "/permisos", {
      method: "PUT", body: JSON.stringify({ permisos: st.rxPermisos })
    })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modal: "" });
        this.cargarUsuarios();
        /* Guardar los permisos cierra las sesiones de quien tenga el cargo.
           Si el que edita se lo cambió a sí mismo, la suya también: se
           relee para enterarse antes de chocar con el primer 403. */
        this.cargarSesion();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5591 §*/
  borrarRolCargo(r) {
    this.api("/api/roles/" + r.id, { method: "DELETE" })
      .then((d) => { if (this._vivo) this.setState({ roles: d.roles || [], usuErr: "" }); })
      .catch((e) => { if (this._vivo) this.setState({ usuErr: String(e.message || e) }); });
  }

/*§CORTE§ linea original 8616 §*/
      /* ── Módulo Usuarios ───────────────────────────────────────────── */
      usuTh: "text-align:left; padding:10px 14px; font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:#5b7185; font-weight:600; white-space:nowrap;",
      usuTd: "padding:11px 14px; font-size:14px; color:#3c4a55; vertical-align:top;",
      usuPuedeEditar: this.puede("usuarios", "edicion"),
      abrirAltaUsuario: () => this.abrirAltaUsuario(),
      abrirAltaRol: () => this.abrirAltaRol(),
      usuTabs: [["cuentas", "Cuentas"], ["roles", "Cargos y permisos"], ["accesos", "Registro de accesos"]]
        .map(([k, label]) => ({
          label,
          style: "padding:10px 15px; font-size:14px; border-bottom:2px solid "
            + (st.usuTab === k ? BLUE : "transparent") + "; color:"
            + (st.usuTab === k ? BLUE_D : "#5b7185") + "; font-weight:"
            + (st.usuTab === k ? "600" : "400") + ";",
          go: () => {
            this.setState({ usuTab: k, usuErr: "" });
            if (k === "accesos") this.cargarAccesos();
            else this.cargarUsuarios();
          }
        })),
      usuTabCuentas: st.usuTab === "cuentas",
      usuTabRoles: st.usuTab === "roles",
      usuTabAccesos: st.usuTab === "accesos",

      usuHay: (st.usuarios || []).length > 0,
      usuVacio: (st.usuarios || []).length === 0,
      usuVacioNota: st.estricto
        ? "Sin cuentas nadie puede entrar. Crea al menos una desde el servidor con crear_director.py."
        : "Mientras no exista ninguna, el sistema sigue abierto para todos. Ve creándolas sin prisa: nadie se queda fuera hasta que se active el acceso restringido.",
      usuResumen: (() => {
        const n = (st.usuarios || []).length;
        const act = (st.usuarios || []).filter((u) => u.estado === "activo").length;
        return n === 0 ? "Ninguna cuenta creada"
             : n === 1 ? "1 cuenta · " + act + " activa"
             : n + " cuentas · " + act + " activas";
      })(),
      usuResumenNota: (() => {
        const sin = (st.sinUsuario || []).length;
        return sin === 0
          ? "Todo el personal activo tiene cuenta."
          : sin + " persona(s) del personal activo todavía no tienen cuenta.";
      })(),

      usuLista: (st.usuarios || []).map((u) => {
        const activo = u.estado === "activo";
        /* Solo un Director puede tocar a otro Director; el backend lo
           vuelve a comprobar. Aquí solo se evita ofrecer lo imposible. */
        const soyDirector = !st.sesion || st.sesion.rol === "director";
        const esDirector = u.rol === "director";
        const yoMismo = !!(st.sesion && st.sesion.usuario === u.usuario);
        const editable = this.puede("usuarios", "edicion")
                      && (!esDirector || soyDirector) && !yoMismo;
        return {
          nombre: u.nombre, cargo: u.cargo || "—", usuario: u.usuario,
          rol_nombre: u.rol_nombre,
          etiquetaEstado: u.debe_cambiar ? "Clave sin estrenar" : (activo ? "Activo" : "Suspendido"),
          estiloEstado: "font-size:11.5px; padding:3px 9px; border-radius:2px; white-space:nowrap; "
            + (u.debe_cambiar ? "background:#fbf0d9; color:#8a5c05;"
               : activo ? "background:#e4f0e9; color:#1f6b45;"
                        : "background:#efece8; color:#7d8e9c;"),
          ultimo: u.ultimo_acceso ? this.cuandoCorto(u.ultimo_acceso) : "Nunca entró",
          editable,
          protegido: !editable,
          motivoProtegido: yoMismo ? "Es tu cuenta"
            : (esDirector && !soyDirector) ? "Solo un Director"
            : "Solo lectura",
          accionAlternar: activo ? "Suspender" : "Reactivar",
          tituloAlternar: activo
            ? "Le cierra la sesión y le impide entrar, sin borrar la cuenta"
            : "Vuelve a permitirle entrar",
          alternar: () => this.cambiarEstadoUsuario(u),
          resetear: () => this.abrirResetUsuario(u),
          borrar: () => this.borrarUsuarioCuenta(u)
        };
      }),

      usuRoles: (st.roles || []).map((r) => ({
        nombre: r.nombre,
        esSistema: !!r.es_sistema,
        borrable: !r.es_sistema && !r.usuarios && this.puede("usuarios", "edicion"),
        nota: r.usuarios === 1 ? "1 persona" : r.usuarios + " personas",
        resumenPermisos: r.clave === "director"
          ? "Acceso total a todos los módulos, por definición."
          : "Pulsa para ver y ajustar a qué llega este cargo.",
        etiquetaEditar: (r.clave === "director" || !this.puede("usuarios", "edicion"))
          ? "Ver permisos" : "Ver y editar permisos",
        estilo: "background:#ffffff; border:1px solid #e2ddd6; border-radius:3px; padding:16px 17px;",
        editar: () => this.abrirRol(r),
        borrar: () => this.borrarRolCargo(r)
      })),

      accesosHay: (st.accesos || []).length > 0,
      accesosVacio: (st.accesos || []).length === 0,
      accesosLista: (st.accesos || []).map((a) => {
        const negado = a.resultado >= 400;
        return {
          cuando: this.cuandoCorto(a.cuando),
          usuario: a.usuario || "sin identificar",
          modulo: this.nombreModulo(a.modulo),
          accion: (a.accion === "edicion" ? "Modificar" : "Consultar") + " · " + a.metodo,
          resultado: negado ? (a.resultado === 403 ? "Denegado" : "Sin sesión") : "Permitido",
          estiloResultado: "font-size:11.5px; padding:3px 9px; border-radius:2px; white-space:nowrap; "
            + (negado ? "background:#fbe7e3; color:#a8321f;" : "background:#e4f0e9; color:#1f6b45;"),
          fila: "border-top:1px solid #efece8;" + (negado ? " background:#fdf5f4;" : "")
        };
      }),

/*§CORTE§ linea original 8722 §*/
      /* ── Diálogo de cuenta ─────────────────────────────────────────── */
      modalUsuario: st.modal === "usuario",
      uxEsAlta: !st.uxId,
      uxTitulo: st.uxId ? "Nueva contraseña para " + st.uxUsuario : "Crear una cuenta",
      uxLede: st.uxId
        ? "La actual deja de servir y se le cierran las sesiones abiertas. Al entrar con la nueva tendrá que elegir la suya."
        : "La cuenta se engancha a una ficha de personal que ya existe: así el sistema sabe siempre quién está detrás de cada acción.",
      uxPersona: st.uxPersona,
      uxPersonas: (st.sinUsuario || []).map((o) => ({
        id: String(o.id),
        etiqueta: o.nombre + (o.cargo ? " · " + o.cargo : "")
      })),
      uxPersonasNota: (st.sinUsuario || []).length === 0
        ? "Todo el personal activo ya tiene cuenta."
        : "Solo aparece el personal activo que todavía no tiene cuenta.",
      onUxPersona: (e) => {
        const id = e.target.value;
        const per = (st.sinUsuario || []).find((o) => String(o.id) === String(id));
        const parche = { uxPersona: id, modalError: "" };
        /* Se propone el usuario solo si el campo sigue como lo dejó el
           sistema: lo escrito a mano no se pisa. */
        if (per && (!st.uxUsuario || st.uxUsuario === this._ultimaSugerencia)) {
          parche.uxUsuario = this.sugerirUsuario(per.nombre);
          this._ultimaSugerencia = parche.uxUsuario;
        }
        this.setState(parche);
      },
      uxUsuario: st.uxUsuario,
      onUxUsuario: (e) => this.setState({ uxUsuario: e.target.value, modalError: "" }),
      uxRol: st.uxRol,
      uxRoles: (st.roles || []).map((r) => ({
        id: String(r.id), etiqueta: r.nombre + (r.es_sistema ? " (del sistema)" : "")
      })),
      uxRolResumen: (() => {
        const r = (st.roles || []).find((x) => String(x.id) === String(st.uxRol));
        if (!r) return "Los permisos vienen del cargo, no de la persona.";
        if (r.clave === "director") return "Acceso total, y es el único cargo que puede crear otros Directores.";
        return "Hereda los permisos de «" + r.nombre + "». Se ajustan en la pestaña Cargos y permisos.";
      })(),
      onUxRol: (e) => this.setState({ uxRol: e.target.value, modalError: "" }),
      uxClave: st.uxClave,
      onUxClave: (e) => this.setState({ uxClave: e.target.value, modalError: "" }),
      uxGenerar: () => this.setState({ uxClave: this.claveSugerida(), modalError: "" }),

/*§CORTE§ linea original 8766 §*/
      /* ── Diálogo de cargo ──────────────────────────────────────────── */
      modalCargo: st.modal === "rol",
      rxEsAlta: !st.rxId,
      rxNombre: st.rxNombre,
      onRxNombre: (e) => this.setState({ rxNombre: e.target.value, modalError: "" }),
      rxTitulo: st.rxId ? st.rxNombre : "Nuevo cargo",
      rxLede: st.rxRolClave === "director"
        ? "Acceso total a todo. No se puede recortar: si se pudiera, un descuido dejaría al sistema sin nadie capaz de arreglarlo."
        : "Marca a qué llega este cargo. Afecta a todas las personas que lo tengan.",
      rxEditable: st.rxRolClave !== "director" && this.puede("usuarios", "edicion"),
      rxBloqueado: st.rxRolClave === "director"
        ? "Este cargo está fijado en el código y no admite cambios desde aquí."
        : (this.puede("usuarios", "edicion") ? "" : "Solo puedes consultarlo: tu cargo no tiene permiso de edición sobre Usuarios."),
      rxNinguno: () => this.fijarTodos("ninguno"),
      rxVista: () => this.fijarTodos("vista"),
      rxGrupos: (() => {
        const grupos = [];
        const editable = st.rxRolClave !== "director" && this.puede("usuarios", "edicion");
        const total = st.rxRolClave === "director";
        (st.modulosPerm || []).forEach((m) => {
          let g = grupos.find((x) => x.nombre === m.grupo);
          if (!g) { g = { nombre: m.grupo, modulos: [] }; grupos.push(g); }
          const actual = total ? "edicion" : ((st.rxPermisos || {})[m.clave] || "ninguno");
          g.modulos.push({
            nombre: m.nombre,
            /* Se avisa donde el permiso abre datos de menores: es la
               decisión que más cuesta deshacer. */
            nota: (m.clave === "incidencias" || m.clave === "beneficiarios" || m.clave === "sesiones")
              ? (actual !== "ninguno" ? "Da acceso a datos de menores" : "")
              : (m.clave === "condiciones" && actual !== "ninguno" ? "Incluye los sueldos" : ""),
            opciones: [["ninguno", "Nada"], ["vista", "Ver"], ["edicion", "Ver y editar"]]
              .map(([nivel, label]) => ({
                label,
                estilo: "padding:5px 10px; font-size:12px; border-radius:2px; white-space:nowrap; border:1px solid "
                  + (actual === nivel ? BLUE : "#d5cfc7") + "; background:"
                  + (actual === nivel ? BLUE : "#ffffff") + "; color:"
                  + (actual === nivel ? "#f4f3f1" : (editable ? "#5b7185" : "#b0bcc6")) + ";"
                  + (editable ? "" : " cursor:default;"),
                elegir: editable ? () => this.fijarPermiso(m.clave, nivel) : () => {}
              }))
          });
        });
        return grupos;
      })(),

