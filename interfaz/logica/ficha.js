  cargarTrayectoria(personalId) {
    if (!personalId) { this.setState({ trFormacion: [], trExperiencia: [] }); return Promise.resolve(); }
    return this.api("/api/personal/" + personalId + "/trayectoria")
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ trFormacion: d.formacion || [], trExperiencia: d.experiencia || [] });
      })
      .catch(() => { if (this._vivo) this.setState({ trFormacion: [], trExperiencia: [] }); });
  }

/*§CORTE§ linea original 4879 §*/
  guardarTrayectoria(tipo) {
    const st = this.state;
    if (st.modalOcupado) return;
    const pid = st.sel;
    if (!pid) { this.setState({ modalError: "No hay una ficha abierta." }); return; }

    let ruta, cuerpo;
    if (tipo === "formacion") {
      if (!String(st.trInstitucion || "").trim() && !String(st.trCarrera || "").trim()) {
        this.setState({ modalError: "Pon al menos la institución o la carrera." });
        return;
      }
      ruta = "/api/personal/" + pid + "/formacion";
      cuerpo = { nivel: st.trNivel, institucion: st.trInstitucion,
                 carrera: st.trCarrera, grado: st.trGrado,
                 anio_inicio: st.trDesde, anio_fin: st.trHasta, nota: st.trNota };
    } else {
      if (!String(st.trEmpresa || "").trim() && !String(st.trCargo || "").trim()) {
        this.setState({ modalError: "Pon al menos la empresa o el cargo." });
        return;
      }
      ruta = "/api/personal/" + pid + "/experiencia";
      cuerpo = { empresa: st.trEmpresa, cargo: st.trCargo, desde: st.trDesde2,
                 hasta: st.trHasta2, funciones: st.trFunciones };
    }

    /* Corregir y crear son la misma pantalla. Si trae id, se corrige esa
       fila (PUT sobre /api/<tipo>/<id>); si no, se crea una nueva. Antes
       solo se podía crear o borrar, así que un año mal tecleado obligaba a
       borrar la fila entera y perder lo demás. */
    const editando = st.trEditId;
    if (editando) ruta = "/api/" + tipo + "/" + editando;
    this.setState({ modalOcupado: true, modalError: "" });
    this.api(ruta, { method: editando ? "PUT" : "POST",
                     body: JSON.stringify(cuerpo) })
      .then((d) => {
        if (!this._vivo) return;
        const parche = { modalOcupado: false, modal: "", trEditId: null };
        if (d.formacion) parche.trFormacion = d.formacion;
        if (d.experiencia) parche.trExperiencia = d.experiencia;
        this.setState(parche);
        /* El PUT contesta solo «ok»: la lista se vuelve a pedir para que lo
           que se ve sea lo que quedó guardado, no lo que se escribió. */
        if (editando) this.cargarTrayectoria(pid);
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 4920 §*/
  borrarTrayectoria(tipo, id) {
    this.api("/api/" + tipo + "/" + id, { method: "DELETE" })
      .then(() => { if (this._vivo) this.cargarTrayectoria(this.state.sel); })
      .catch(() => {});
  }

/*§CORTE§ linea original 6026 §*/
  abrirFicha(p) {
    this.cargarCamposRequeridos();
    this.setState({
      modal: "ficha", modalSn: null, modalId: p ? p.id : null,
      modalNombre: p ? p.nombre : "Nueva ficha",
      fiNombre: p ? p.nombre : "", fiDoc: p ? (p.documento || "") : "",
      fiCargo: p ? (p.cargo || "") : "", fiArea: p ? (p.area || "") : "",
      fiSede: p ? (p.sede || "") : "", fiAmbito: p ? (p.ambito || "min") : "min",
      fiVinculo: p ? (p.vinculo || "staff") : "staff",
      fiJefe: p && p.jefe_id ? String(p.jefe_id) : "",
      /* Las fichas migradas traen la fecha como dd/mm/aaaa; el input date
         solo entiende aaaa-mm-dd. Se convierte al abrir y al guardar. */
      fiIngreso: p ? Component.aISO(p.fecha_ingreso) : "",
      fiNac: p ? Component.aISO(p.fecha_nac) : "",
      fiEmail: p ? (p.email || "") : "",
      fiTelefono: p ? (p.telefono || "") : "",
      fiDireccion: p ? (p.direccion || "") : "",
      fiEmerNombre: p ? (p.emergencia_nombre || "") : "",
      fiEmerTelefono: p ? (p.emergencia_telefono || "") : "",
      fiSexo: p ? (p.sexo || "") : "",
      fiNacionalidad: p ? (p.nacionalidad || "") : "",
      fiLugarNac: p ? (p.lugar_nacimiento || "") : "",
      fiJornada: p ? (p.jornada || "") : "",
      /* Una ficha nueva nace activa: es lo que se da por hecho al darla
         de alta, y preguntarlo sería pedir un dato que ya se sabe. */
      fiEstadoLaboral: p ? (p.estado_laboral || "activo") : "activo",
      fiDepartamento: p ? (p.departamento || "") : "",
      fiProvincia: p ? (p.provincia || "") : "",
      fiDistrito: p ? (p.distrito || "") : "",
      modalError: "", modalOcupado: false
    });
  }

/*§CORTE§ linea original 6059 §*/
  guardarFicha() {
    const nombre = (this.state.fiNombre || "").trim();
    if (!nombre) { this.setState({ modalError: "El nombre no puede quedar vacío." }); return; }
    this.setState({ modalOcupado: true, modalError: "" });
    const cuerpo = JSON.stringify({
      nombre: nombre, documento: this.state.fiDoc || "", cargo: this.state.fiCargo || "",
      area: this.state.fiArea || "", sede: this.state.fiSede || "",
      ambito: this.state.fiAmbito || "min", vinculo: this.state.fiVinculo || "staff",
      jefe_id: this.state.fiJefe ? Number(this.state.fiJefe) : null,
      fecha_ingreso: this.state.fiIngreso || "", fecha_nac: this.state.fiNac || "",
      email: (this.state.fiEmail || "").trim(),
      telefono: (this.state.fiTelefono || "").trim(),
      direccion: (this.state.fiDireccion || "").trim(),
      emergencia_nombre: (this.state.fiEmerNombre || "").trim(),
      emergencia_telefono: (this.state.fiEmerTelefono || "").trim(),
      sexo: this.state.fiSexo || "",
      nacionalidad: (this.state.fiNacionalidad || "").trim(),
      lugar_nacimiento: (this.state.fiLugarNac || "").trim(),
      jornada: this.state.fiJornada || "",
      estado_laboral: this.state.fiEstadoLaboral || "activo",
      departamento: (this.state.fiDepartamento || "").trim(),
      provincia: (this.state.fiProvincia || "").trim(),
      distrito: (this.state.fiDistrito || "").trim()
    });
    /* Se comprueba con el cuerpo ya armado, no con el estado: así se mira
       exactamente lo que se va a enviar y no una copia que puede diferir. */
    const _v = JSON.parse(cuerpo);
    const _faltan = this.faltanEnFicha("personal", _v);
    if (_faltan.length) {
      this.setState({ modalOcupado: false, sdFaltan: _faltan, modalError: "" });
      return;
    }
    _v.sin_dato = (this.state.sdMarcados || []).join(",");
    const _cuerpo = JSON.stringify(_v);

    const nuevo = !this.state.modalId;
    this.api(nuevo ? "/api/personal" : "/api/personal/" + this.state.modalId,
             { method: nuevo ? "POST" : "PUT", body: _cuerpo })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({
          modal: "", modalOcupado: false, sdFaltan: [], sdMarcados: [],
          syncEstado: d.aviso ? "error" : "ok",
          syncMsg: d.aviso || ("Ficha de " + nombre + (nuevo ? " creada." : " actualizada."))
        });
        this.cargarPersonal();
        this.cargarCandidatos();
        this.cargarIdentidades();
    this.cargarIdentidades();
        this.cargarPersonas();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 6589 §*/
  fichaFor(id) {
    const gente = this.state.personal || [];
    const p = gente.find((x) => x.id === Number(id));
    if (!p) {
      return { existe: false, nombre: "Ficha no encontrada", cargo: "", area: "",
               color: BLUE, sede: "—", contrato: "—", codigo: "—", ingreso: "—",
               antiguedad: "—", jefeNombre: "—", jefeCargo: "", jefeIni: "—",
               jefeId: null, equipoTexto: "", datos: [] };
    }
    const jefe = p.jefe_id ? gente.find((x) => x.id === p.jefe_id) : null;
    const equipo = gente.filter((x) => x.jefe_id === p.id);
    const anio = parseInt(String(p.fecha_ingreso || "").slice(-4), 10);
    const anios = anio > 1900 ? new Date().getFullYear() - anio : null;
    return {
      existe: true,
      nombre: p.nombre,
      cargo: p.cargo || "Sin cargo registrado",
      area: p.area || "Sin área",
      color: p.ambito === "adm" ? BLUE : RED,
      sede: p.sede || "—",
      contrato: p.contrato === "Indeterminado" ? "Indefinido" : (p.contrato || "—"),
      codigo: p.staff_number ? ("Terminal " + p.staff_number) : "Sin enrolar",
      /* La foto que tomó el terminal al registrarle el rostro. El «?v=»
         lleva el nombre del archivo: al cambiar la foto cambia la
         dirección, y el navegador no enseña la vieja de su caché. */
      tieneFoto: !!p.foto,
      sinFoto: !p.foto,
      fotoUrl: p.foto ? ("/api/personal/" + p.id + "/foto?v=" + p.foto) : "",
      ingreso: p.fecha_ingreso || "—",
      antiguedad: anios === null ? "—" : (anios + (anios === 1 ? " año" : " años")),
      jefeNombre: jefe ? jefe.nombre : "Sin jefe asignado",
      jefeCargo: jefe ? (jefe.cargo || "") : "",
      jefeIni: jefe ? ini(jefe.nombre) : "—",
      jefeId: jefe ? jefe.id : null,
      equipoTexto: equipo.length
        ? equipo.map((x) => x.nombre).join(", ")
        : "No tiene personas a cargo.",
      datos: [
        { k: "Documento", v: p.documento || "Sin registrar" },
        { k: "Cargo", v: p.cargo || "Sin registrar" },
        { k: "Área", v: p.area || "Sin registrar" },
        { k: "Sede", v: p.sede || "Sin registrar" },
        { k: "Vínculo", v: p.vinculo === "voluntario" ? "Voluntario" : "Personal" },
        { k: "Contrato", v: p.contrato || "Sin registrar" },
        { k: "Fecha de ingreso", v: p.fecha_ingreso || "Sin registrar" },
        { k: "Fecha de nacimiento", v: p.fecha_nac || "Sin registrar" },
        { k: "Sexo", v: { F: "Femenino", M: "Masculino",
                          X: "Otro / prefiere no decirlo" }[p.sexo] || "Sin registrar" },
        { k: "Nacionalidad", v: p.nacionalidad || "Sin registrar" },
        { k: "Lugar de nacimiento", v: p.lugar_nacimiento || "Sin registrar" },
        { k: "Jornada", v: { completa: "Tiempo completo", parcial: "Medio tiempo",
                             horas: "Por horas" }[p.jornada] || "Sin registrar" },
        { k: "Estado laboral", v: { activo: "Activo", licencia: "De licencia",
                                    suspendido: "Suspendido", cesado: "Cesado"
                                  }[p.estado_laboral || "activo"] || "Sin registrar" },
        /* Los tres de ubicación se muestran juntos: por separado son tres
           casillas casi siempre vacías que no dicen nada. */
        { k: "Ubicación", v: [p.distrito, p.provincia, p.departamento]
                              .filter(Boolean).join(", ") || "Sin registrar" },
      ],
    };
  }

  /* Traduce el estado de vigencia que calcula el backend a algo legible */
  static filaDocumento(d) {
    const cfg = {
      vencido:        [RED_D, RED_T, "Vencido"],
      por_vencer:     [GOLD_D, GOLD_T, "Por vencer"],
      vigente:        [GREEN_D, GREEN_T, "Vigente"],
      sin_vencimiento:["#5b7185", "#f0ede9", "Sin vencimiento"],
    }[d.estado] || ["#5b7185", "#f0ede9", "—"];
    let detalle = d.emitido ? ("Emitido el " + d.emitido) : "Sin fecha de emisión";
    if (d.vence) {
      detalle += " · vence el " + d.vence;
      if (d.dias !== null && d.dias !== undefined) {
        detalle += d.dias < 0 ? (" (hace " + Math.abs(d.dias) + " días)")
                 : d.dias === 0 ? " (hoy)"
                 : (" (en " + d.dias + " días)");
      }
    }
    return { nombre: d.nombre, detalle: detalle,
             color: cfg[0], tint: cfg[1], etiqueta: cfg[2] };
  }

  /* Tipos sugeridos. "Otro" abre un campo libre en vez de obligar a
     encajar todo en una lista cerrada. */
  static get TIPOS_DOC() {
    return ["Antecedentes penales", "Certificado de salud ocupacional",
            "Certificado de salvaguarda infantil", "Otro"];
  }
  static get TIPOS_CTR() {
    return ["Contrato a plazo indeterminado", "Contrato a plazo fijo",
            "Adenda de renovación", "Otro"];
  }

  /* 'persona' permite registrar un papel desde la lista del módulo sin
     abrir antes su ficha. Si no se indica, se usa la ficha abierta. */
/*§CORTE§ linea original 7286 §*/
  cargarCamposRequeridos() {
    if (this.state.camposReq) return Promise.resolve(this.state.camposReq);
    return this.api("/api/campos-requeridos")
      .then((d) => { if (this._vivo) this.setState({ camposReq: d }); return d; })
      .catch(() => null);
  }

  /* Qué exige la ficha y todavía no está ni declarado. Devuelve la lista de
     {campo, etiqueta} que impide guardar. */
/*§CORTE§ linea original 7295 §*/
  faltanEnFicha(entidad, valores) {
    const reglas = ((this.state.camposReq || {})[entidad]) || [];
    const marcados = this.state.sdMarcados || [];
    return reglas.filter((r) => {
      if (marcados.indexOf(r.campo) >= 0) return false;
      const v = valores[r.campo];
      return v === null || v === undefined || String(v).trim() === "";
    });
  }

/*§CORTE§ linea original 7305 §*/
  alternarSinDato(campo) {
    const m = (this.state.sdMarcados || []).slice();
    const i = m.indexOf(campo);
    if (i >= 0) m.splice(i, 1); else m.push(campo);
    this.setState({ sdMarcados: m });
  }

/*§CORTE§ linea original 8080 §*/
      /* ── Campos que faltan al guardar ────────────────────────────────
         Solo aparecen cuando el guardado se detuvo por ellos. El resto del
         tiempo el formulario no enseña ninguna casilla. */
      sdHayFaltan: (this.state.sdFaltan || []).length > 0,
      sdFaltan: (this.state.sdFaltan || []).map((f) => ({
        etiqueta: f.etiqueta,
        marcado: (this.state.sdMarcados || []).indexOf(f.campo) >= 0,
        alternar: () => this.alternarSinDato(f.campo),
      })),
      isPermisos: v === "permisos",
      isAsistenciaHome: v === "asistenciaHome",

/*§CORTE§ linea original 9831 §*/
      /* ── Trayectoria: formación y experiencia ──────────────────────── */
      puedeTrayectoria: this.puede("personal", "edicion"),
      trSinFormacion: (st.trFormacion || []).length === 0,
      trSinExperiencia: (st.trExperiencia || []).length === 0,
      trFormacion: (st.trFormacion || []).map((f) => ({
        titulo: f.carrera || f.institucion || "Formación",
        detalle: [f.carrera ? f.institucion : "", f.grado,
                  [f.anio_inicio, f.anio_fin].filter(Boolean).join("–")]
                 .filter(Boolean).join(" · ") || "Sin detalle",
        nivel: f.nivel || "—",
        nota: f.nota || "",
        estiloNivel: "font-size:11px; padding:3px 8px; border-radius:2px; white-space:nowrap; "
          + "flex:none; color:#0e3d69; background:#e7eff7;",
        borrar: () => this.borrarTrayectoria("formacion", f.id),
        corregir: () => this.setState({
          modal: "formacion", modalError: "", trEditId: f.id,
          trNivel: f.nivel || "", trInstitucion: f.institucion || "",
          trCarrera: f.carrera || "", trGrado: f.grado || "",
          trDesde: f.anio_inicio || "", trHasta: f.anio_fin || "",
          trNota: f.nota || "",
        })
      })),
      trExperiencia: (st.trExperiencia || []).map((x) => ({
        titulo: x.cargo || x.empresa || "Experiencia",
        periodo: [x.cargo ? x.empresa : "",
                  [x.desde, x.hasta].filter(Boolean).join(" – ")]
                 .filter(Boolean).join(" · ") || "Sin fechas",
        funciones: x.funciones || "",
        borrar: () => this.borrarTrayectoria("experiencia", x.id),
        corregir: () => this.setState({
          modal: "experiencia", modalError: "", trEditId: x.id,
          trEmpresa: x.empresa || "", trCargo: x.cargo || "",
          trDesde2: x.desde || "", trHasta2: x.hasta || "",
          trFunciones: x.funciones || "",
        })
      })),
      trAbrirFormacion: () => this.setState({
        modal: "formacion", modalError: "", trEditId: null,
        trNivel: "", trInstitucion: "", trCarrera: "", trGrado: "",
        trDesde: "", trHasta: "", trNota: ""
      }),
      trAbrirExperiencia: () => this.setState({
        modal: "experiencia", modalError: "", trEditId: null,
        trEmpresa: "", trCargo: "", trDesde2: "", trHasta2: "", trFunciones: ""
      }),
      modalFormacion: st.modal === "formacion",
      modalExperiencia: st.modal === "experiencia",
      trNivel: st.trNivel,
      onTrNivel: (e) => this.setState({ trNivel: e.target.value, modalError: "" }),
      trInstitucion: st.trInstitucion,
      onTrInstitucion: (e) => this.setState({ trInstitucion: e.target.value, modalError: "" }),
      trCarrera: st.trCarrera,
      onTrCarrera: (e) => this.setState({ trCarrera: e.target.value, modalError: "" }),
      trGrado: st.trGrado,
      onTrGrado: (e) => this.setState({ trGrado: e.target.value, modalError: "" }),
      trDesde: st.trDesde,
      onTrDesde: (e) => this.setState({ trDesde: e.target.value, modalError: "" }),
      trHasta: st.trHasta,
      onTrHasta: (e) => this.setState({ trHasta: e.target.value, modalError: "" }),
      trNota: st.trNota,
      onTrNota: (e) => this.setState({ trNota: e.target.value, modalError: "" }),
      trEmpresa: st.trEmpresa,
      onTrEmpresa: (e) => this.setState({ trEmpresa: e.target.value, modalError: "" }),
      trCargo: st.trCargo,
      onTrCargo: (e) => this.setState({ trCargo: e.target.value, modalError: "" }),
      trDesde2: st.trDesde2,
      onTrDesde2: (e) => this.setState({ trDesde2: e.target.value, modalError: "" }),
      trHasta2: st.trHasta2,
      onTrHasta2: (e) => this.setState({ trHasta2: e.target.value, modalError: "" }),
      trFunciones: st.trFunciones,
      onTrFunciones: (e) => this.setState({ trFunciones: e.target.value, modalError: "" }),

/*§CORTE§ linea original 9890 §*/
      /* ── Condiciones laborales de esta ficha ── */
      condHay: !!this.state.condVigente,
      condSin: !this.state.condVigente,
      condRegimenLabel: Component.etiquetaRegimen((this.state.condVigente || {}).regimen),
      condSueldoLabel: (this.state.condVigente || {}).regimen === "sin_pago"
        ? "Sin remuneración"
        : Component.soles((this.state.condVigente || {}).sueldo_base),
      condJornadaLabel: ((this.state.condVigente || {}).jornada_horas || 8) + " h por día",
      condDesdeLabel: (this.state.condVigente || {}).vigente_desde || "",
      condNotaVigente: (this.state.condVigente || {}).nota || "",
      condTieneNota: !!((this.state.condVigente || {}).nota),
      condColor: (this.state.condVigente || {}).regimen === "sin_pago" ? GOLD_D : GREEN_D,
      condTint:  (this.state.condVigente || {}).regimen === "sin_pago" ? GOLD_T : GREEN_T,
      /* El historial anterior: lo vigente ya se muestra arriba. */
      condPasadas: (this.state.condHistorial || [])
        .filter(c => c.vigente_hasta)
        .map(c => ({
          id: c.id,
          rango: c.vigente_desde + " → " + c.vigente_hasta,
          regimen: Component.etiquetaRegimen(c.regimen),
          sueldo: c.regimen === "sin_pago" ? "Sin remuneración" : Component.soles(c.sueldo_base),
          nota: c.nota || "",
          quitar: () => this.setState({ condBorrar: c })
        })),
      condHayPasadas: (this.state.condHistorial || []).filter(c => c.vigente_hasta).length > 0,
      condNuevo: () => this.abrirCondicion(),
      condBotonLabel: this.state.condVigente ? "Registrar cambio de condiciones"
                                             : "Registrar condiciones laborales",

