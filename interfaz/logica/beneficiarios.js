  cargarVinculos(beneficiarioId) {
    if (!beneficiarioId) { this.setState({ vinculos: [] }); return Promise.resolve(); }
    return this.api("/api/beneficiarios/" + beneficiarioId + "/responsables")
      .then((d) => { if (this._vivo) this.setState({ vinculos: d.responsables || [] }); })
      .catch(() => { if (this._vivo) this.setState({ vinculos: [] }); });
  }

/*§CORTE§ linea original 4933 §*/
  abrirVinculo(existente) {
    /* Con 'existente' se edita el papel de alguien ya vinculado; sin él se
       busca a quién vincular. No se permite cambiar de persona editando:
       para eso se quita el vínculo y se crea otro, que es más claro que un
       formulario que cambia de sujeto a media edición. */
    const e = existente || null;
    this.setState({
      modal: "vinculo", modalError: "",
      vinEditando: e,
      vinElegido: e ? { id: e.responsable_id, nombre: e.nombre,
                        documento: e.documento, telefono: e.telefono } : null,
      vinBusca: "", vinCandidatos: [],
      vinParentesco: e ? (e.parentesco || "") : "",
      vinPrincipal: e ? (e.es_principal ? 1 : 0) : 0,
      vinLegal: e ? (e.es_legal ? 1 : 0) : 0,
      vinRecoger: e ? (e.puede_recoger ? 1 : 0) : 0,
      vinEmergencia: e ? (e.es_emergencia ? 1 : 0) : 0
    });
  }

/*§CORTE§ linea original 4953 §*/
  buscarResponsablesParaVincular(texto) {
    this.setState({ vinBusca: texto });
    const q = (texto || "").trim();
    if (q.length < 2) { this.setState({ vinCandidatos: [] }); return; }
    this.api("/api/responsables?q=" + encodeURIComponent(q))
      .then((d) => {
        if (!this._vivo) return;
        /* Los que ya están vinculados a ESTE niño no se ofrecen: volver a
           elegirlos no daría de alta nada, solo confundiría. */
        const ya = (this.state.vinculos || []).map((v) => v.responsable_id);
        this.setState({
          vinCandidatos: (d.responsables || []).filter((r) => ya.indexOf(r.id) < 0)
        });
      })
      .catch(() => {});
  }

/*§CORTE§ linea original 4970 §*/
  guardarVinculo() {
    const st = this.state;
    if (st.modalOcupado) return;
    const ben = st.benefRealSel;
    if (!ben) { this.setState({ modalError: "No hay un beneficiario abierto." }); return; }
    if (!st.vinElegido) {
      this.setState({ modalError: "Elige a qué responsable vincular." });
      return;
    }
    this.setState({ modalOcupado: true, modalError: "" });
    this.api("/api/beneficiarios/" + ben.id + "/responsables", {
      method: "POST",
      body: JSON.stringify({
        responsable_id: st.vinElegido.id,
        parentesco: st.vinParentesco,
        es_principal: st.vinPrincipal,
        es_legal: st.vinLegal,
        puede_recoger: st.vinRecoger,
        es_emergencia: st.vinEmergencia
      })
    })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modal: "",
                        vinculos: d.responsables || [] });
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5002 §*/
  confirmarQuitarVinculo() {
    const st = this.state;
    const v = st.vinQuitar, ben = st.benefRealSel;
    if (!v || !ben) return;
    this.setState({ modalOcupado: true });
    this.api("/api/beneficiarios/" + ben.id + "/responsables/" + v.responsable_id,
             { method: "DELETE" })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modal: "", vinQuitar: null,
                        vinculos: d.responsables || [] });
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 6408 §*/
  benefRealFor(b) {
    const V = (x) => (x && String(x).trim()) ? String(x) : "Sin registrar";
    const edad = (() => {
      if (!b.fecha_nac) return "";
      const n = new Date(String(b.fecha_nac) + "T00:00:00");
      if (isNaN(n)) return "";
      const h = new Date();
      let a = h.getFullYear() - n.getFullYear();
      const m = h.getMonth() - n.getMonth();
      if (m < 0 || (m === 0 && h.getDate() < n.getDate())) a--;
      return a >= 0 ? (a === 1 ? "1 año" : a + " años") : "";
    })();
    /* Categoría derivada de la edad, no guardada: un "niño" registrado a
       mano seguiría diciendo niño a los veinte. Los cortes viven en un solo
       sitio para poder ajustarlos cuando la ONG los defina. */
    const CORTES = [[0, 5, "Primera infancia"], [6, 11, "Niño / niña"],
                    [12, 17, "Adolescente"], [18, 200, "Joven"]];
    const anios = (() => {
      const n2 = b.fecha_nac ? new Date(b.fecha_nac + "T00:00:00") : null;
      if (!n2 || isNaN(n2)) return null;
      const h2 = new Date();
      let a2 = h2.getFullYear() - n2.getFullYear();
      const m2 = h2.getMonth() - n2.getMonth();
      if (m2 < 0 || (m2 === 0 && h2.getDate() < n2.getDate())) a2--;
      return a2 >= 0 ? a2 : null;
    })();
    const categoria = anios == null
      ? "Sin fecha de nacimiento"
      : ((CORTES.find(([d, h]) => anios >= d && anios <= h) || [,, "—"])[2]);

    const faltan = b.faltantes || [];
    return {
      nombre: b.nombre,
      categoria: categoria,
      casa: V(b.casa), sala: V(b.sala), grado: V(b.grado),
      edad: edad || "Sin registrar",
      color: BLUE, tint: BLUE_T, dark: BLUE_D,
      /* El código que escriba el equipo manda; si no hay ninguno, se genera
         uno del id para que la ficha no salga sin identificador. */
      codigo: (b.codigo || "").trim() || ("BEN-" + String(b.id).padStart(4, "0")),
      /* La foto que tomó el terminal al registrarle el rostro. Se guarda
         desde el 31/08/2026, con el permiso firmado de los padres o
         tutores; antes de eso los menores quedaban fuera. */
      tieneFoto: !!b.foto,
      sinFoto: !b.foto,
      fotoUrl: b.foto ? ("/api/beneficiarios/" + b.id + "/foto?v=" + b.foto) : "",
      ingreso: V(b.anio_ingreso),
      tiempo: b.anio_ingreso
        ? ((new Date().getFullYear() - Number(b.anio_ingreso)) + " años en la casa")
        : "Sin registrar",
      estado: b.estado === "activo" ? "Activo" : V(b.estado),
      situacion: V(b.situacion_legal),
      riesgo: faltan.length ? "Ficha incompleta" : "Ficha completa",
      riesgoColor: faltan.length ? GOLD : GREEN,
      riesgoTint: faltan.length ? GOLD_T : GREEN_T,
      riesgoDark: faltan.length ? GOLD_D : GREEN_D,
      riesgoNota: faltan.length
        ? ("Faltan por registrar: " + faltan.join(", ") + ".")
        : "Todos los campos principales están registrados.",
      datos: [
        {k:"Fecha de nacimiento", v:V(b.fecha_nac)},
        {k:"Edad", v:edad || "Sin registrar"},
        {k:"Categoría", v:categoria},
        {k:"Documento", v:V(b.documento)},
        {k:"Sexo", v:V(b.sexo)},
        {k:"Nacionalidad", v:V(b.nacionalidad)},
        {k:"Lugar de nacimiento", v:V(b.lugar_nacimiento)},
        {k:"Procedencia", v:V(b.procedencia)},
        {k:"Lengua materna", v:V(b.lengua_materna)},
        {k:"Vía de ingreso", v:V(b.via_ingreso)},
        {k:"Expediente judicial", v:V(b.expediente_judicial)},
        {k:"Referente familiar", v:V(b.referente_familiar)},
        {k:"Régimen de visitas", v:V(b.regimen_visitas)}
      ],
      bloques: [
        {titulo:"Educación", icon:"ph-graduation-cap", color:BLUE, tint:BLUE_T, items:[
          {k:"Institución", v:V(b.institucion_educativa)},
          {k:"Grado", v:V(b.grado)},
          {k:"Rendimiento", v:V(b.rendimiento)},
          {k:"Refuerzo escolar", v:V(b.refuerzo_escolar)}
        ]},
        {titulo:"Salud", icon:"ph-first-aid-kit", color:GREEN, tint:GREEN_T, items:[
          {k:"Seguro", v:V(b.seguro)},
          {k:"Alergias", v:V(b.alergias)},
          {k:"Control médico", v:V(b.control_medico)},
          {k:"Tratamiento", v:V(b.tratamiento)}
        ]},
        {titulo:"Acompañamiento", icon:"ph-heart", color:GOLD, tint:GOLD_T, items:[
          {k:"Tutor asignado", v:V(b.tutor_nombre)},
          {k:"Psicóloga", v:V(b.psicologo_nombre)},
          {k:"Sesiones del año", v:String(this.state.benSesionesAnio || 0)},
          {k:"Plan de vida", v:V(b.plan_vida)}
        ]},
        {titulo:"Domicilio", icon:"ph-house-line", color:BLUE_D, tint:"#eef2f6", items:[
          {k:"Dirección", v:V(b.direccion)},
          {k:"Distrito", v:[b.distrito, b.provincia, b.departamento]
                            .filter(Boolean).join(", ") || "Sin registrar"},
          {k:"Referencia", v:V(b.referencia)},
          {k:"Vivienda", v:[b.tipo_vivienda, b.servicios_basicos]
                            .filter(Boolean).join(" · ") || "Sin registrar"}
        ]},
        {titulo:"Educación (detalle)", icon:"ph-books", color:BLUE, tint:BLUE_T, items:[
          {k:"Nivel y sección", v:[b.nivel_educativo, b.seccion, b.turno]
                                    .filter(Boolean).join(" · ") || "Sin registrar"},
          {k:"Año académico", v:V(b.anio_academico)},
          {k:"Situación", v:V(b.situacion_academica)},
          {k:"Asistencia", v:V(b.asistencia_escolar)},
          {k:"Dificultades", v:V(b.dificultades)},
          {k:"Observaciones", v:V(b.nota_educativa)}
        ]},
        {titulo:"Salud (detalle)", icon:"ph-heartbeat", color:GREEN, tint:GREEN_T, items:[
          {k:"Seguro", v:[b.tipo_seguro, b.centro_salud]
                          .filter(Boolean).join(" · ") || "Sin registrar"},
          {k:"Discapacidad", v:V(b.discapacidad)},
          {k:"Necesidades especiales", v:V(b.necesidades_especiales)},
          {k:"Información médica", v:V(b.info_medica)},
          {k:"Emergencia", v:[b.emergencia_nombre, b.emergencia_telefono]
                             .filter(Boolean).join(" · ") || "Sin registrar"},
          {k:"Observaciones", v:V(b.nota_salud)}
        ]},
        {titulo:"Situación socioeconómica", icon:"ph-users-four", color:RED_D, tint:"#f7efee", items:[
          {k:"Con quién vive", v:V(b.con_quien_vive)},
          {k:"Integrantes del hogar", v:b.integrantes_hogar
                                        ? String(b.integrantes_hogar) : "Sin registrar"},
          {k:"Hermanos", v:b.hermanos ? String(b.hermanos) : "Sin registrar"},
          {k:"Responsable económico", v:V(b.responsable_economico)},
          {k:"Vivienda", v:V(b.tenencia_vivienda)},
          {k:"Rango de ingresos", v:V(b.rango_ingresos)},
          {k:"Personas dependientes", v:b.personas_dependientes
                                        ? String(b.personas_dependientes) : "Sin registrar"},
          {k:"Observaciones", v:V(b.nota_socioeconomica)}
        ]}
      ],
      docs: [],
      hitos: []
    };
  }

  /* Ficha de un beneficiario. La estructura está aprobada; el CONTENIDO
     ya no se inventa: antes generaba DNI, expediente judicial, vía de
     ingreso, referente familiar e historia de vida a partir del índice de
     la lista, y el resultado era indistinguible de un caso real de
     protección infantil. Ahora los campos dicen que no hay dato. */
/*§CORTE§ linea original 6545 §*/
  benefFor(k, i) {
    const SIN = "Sin registrar";
    return {
      nombre: k.n,
      casa: String(k.casa || "").split(" · ")[0] || SIN,
      sala: String(k.casa || "").split(" · ")[1] || SIN,
      grado: k.grado || SIN,
      edad: SIN,
      color: BLUE, tint: BLUE_T, dark: BLUE_D,
      codigo: SIN,
      ingreso: SIN,
      tiempo: SIN,
      estado: "Ficha de prueba",
      situacion: SIN,
      riesgo: "Sin evaluar", riesgoColor: "#7d8e9c", riesgoTint: "#f0ede9",
      riesgoDark: "#5b7185",
      riesgoNota: "Esta es una ficha de prueba: no contiene datos de ninguna persona real.",
      datos: [
        {k:"Fecha de nacimiento", v:SIN},
        {k:"Documento", v:SIN},
        {k:"Procedencia", v:SIN},
        {k:"Lengua materna", v:SIN}
      ],
      bloques: [
        {titulo:"Educación", icon:"ph-graduation-cap", color:BLUE, tint:BLUE_T, items:[
          {k:"Institución", v:SIN},
          {k:"Grado", v:k.grado || SIN}
        ]},
        {titulo:"Salud", icon:"ph-first-aid-kit", color:GREEN, tint:GREEN_T, items:[
          {k:"Seguro", v:SIN},
          {k:"Alergias", v:SIN}
        ]},
        {titulo:"Acompañamiento", icon:"ph-heart", color:GOLD, tint:GOLD_T, items:[
          {k:"Tutor asignado", v:SIN},
          {k:"Plan de vida", v:SIN}
        ]}
      ],
      docs: [],
      hitos: []
    };
  }

  /* La ficha lee de la base, no de la maqueta: el nombre, cargo, área y
     jefe son los mismos que muestra Hoja de Vida y el organigrama. */
/*§CORTE§ linea original 6738 §*/
  borrarDeSerie(ruta, id) {
    const b = this.state.benefRealSel;
    this.api("/api/" + ruta + "/" + id, { method: "DELETE" })
      .then(() => { if (this._vivo && b) this.cargarAcompanamiento(b.id); })
      .catch((e) => {
        if (this._vivo) this.setState({ benAviso: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 6747 §*/
  cargarAcompanamiento(id) {
    this.api("/api/beneficiarios/" + id + "/acompanamiento")
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ benSesiones: d.sesiones || [],
                        benIncidencias: d.incidencias || [],
                        benProgramas: d.programas || [],
                        benHistorial: d.historial || [],
                        benSeguimiento: d.seguimiento || [],
                        benSesionesAnio: d.sesiones_anio || 0 });
      })
      .catch(() => {
        if (this._vivo) this.setState({ benSesiones: [], benIncidencias: [],
                                        benProgramas: [], benHistorial: [],
                                        benSeguimiento: [],
                                        benSesionesAnio: 0 });
      });
  }

/*§CORTE§ linea original 6766 §*/
  abrirSesion() {
    const b = this.state.benefRealSel;
    if (!b) {
      this.setState({ benAviso:
        "Esta es una ficha de prueba de la maqueta: no hay expediente al que "
        + "asociar una sesión. Crea un beneficiario con «Agregar beneficiario» "
        + "y ábrelo desde «Registrados en el sistema»." });
      return;
    }
    this.setState({
      modal: "sesion", benAviso: "", serieEditId: null,
      seFecha: new Date().toISOString().slice(0, 10),
      seTipo: "individual", seQuien: "", seNotas: "",
      modalError: "", modalOcupado: false
    });
  }

  /* Abre una de las tres altas. Comprueba antes que haya expediente:
     sobre un marcador de la maqueta no hay nada a lo que asociar. */
/*§CORTE§ linea original 6785 §*/
  abrirSerie(cual) {
    const b = this.state.benefRealSel;
    if (!b) {
      this.setState({ benAviso:
        "Esta ficha no tiene expediente real al que asociar el registro. "
        + "Crea el beneficiario con «Agregar beneficiario» y ábrelo desde "
        + "«Registrados en el sistema»." });
      return;
    }
    const hoy = this.fechaHoy();
    this.setState({
      modal: cual, modalError: "", modalOcupado: false,
      /* Se limpia la corrección pendiente: abrir «Registrar» después de
         haber corregido otra fila guardaría encima de aquella. */
      serieEditId: null,
      /* La fecha de hoy viene puesta: es la respuesta correcta casi
         siempre y se cambia con un clic. */
      pgNombre: "", pgDesde: hoy, pgHasta: "", pgNota: "",
      hiAnio: String(new Date().getFullYear()), hiInstitucion: "", hiNivel: "",
      hiGrado: "", hiSeccion: "", hiSituacion: "", hiNota: "",
      sgFecha: hoy, sgTipo: "", sgSituacion: "", sgAccion: "",
      sgCompromisos: "", sgProxima: "",
    });
  }

  /* Guarda cualquiera de las tres. Una sola función: las tres hacen lo
     mismo y tres copias acaban divergiendo. */
/*§CORTE§ linea original 6809 §*/
  guardarSerie(cual) {
    const b = this.state.benefRealSel;
    if (!b) return;
    const st = this.state;
    const config = {
      programa: {
        ruta: "programas",
        exige: st.pgNombre, falta: "Escribe el nombre del programa.",
        cuerpo: { programa: st.pgNombre, fecha_ingreso: st.pgDesde || "",
                  fecha_salida: st.pgHasta || "",
                  estado: st.pgHasta ? "terminado" : "activo",
                  nota: st.pgNota || "" },
        aviso: "Programa registrado.",
      },
      historial: {
        ruta: "historial",
        exige: st.hiAnio, falta: "Indica el año escolar.",
        cuerpo: { anio: st.hiAnio, institucion: st.hiInstitucion || "",
                  nivel: st.hiNivel || "", grado: st.hiGrado || "",
                  seccion: st.hiSeccion || "", situacion: st.hiSituacion || "",
                  nota: st.hiNota || "" },
        aviso: "Año escolar registrado.",
      },
      seguimiento: {
        ruta: "seguimiento",
        /* Las dos que el servidor exige. Sin situación devuelve 400,
           así que preguntarlo aquí ahorra el viaje y el susto. */
        exige: st.sgFecha && st.sgSituacion,
        falta: !st.sgFecha ? "Indica la fecha del seguimiento."
                           : "Escribe qué se detectó en la situación.",
        cuerpo: { fecha: st.sgFecha, tipo: st.sgTipo || "",
                  situacion: st.sgSituacion || "", accion: st.sgAccion || "",
                  compromisos: st.sgCompromisos || "",
                  proxima_fecha: st.sgProxima || "" },
        aviso: "Seguimiento registrado.",
      },
    }[cual];
    if (!config) return;
    if (!String(config.exige || "").trim()) {
      this.setState({ modalError: config.falta });
      return;
    }
    /* Si el diálogo se abrió desde «Corregir», se edita esa fila; si no,
       se crea una nueva. Corregir no es borrar y volver a escribir: eso
       perdería cuándo se registró y quién lo anotó. */
    const edId = this.state.serieEditId;
    this.setState({ modalOcupado: true, modalError: "" });
    this.api(edId ? ("/api/" + config.ruta + "/" + edId)
                  : ("/api/beneficiarios/" + b.id + "/" + config.ruta),
             { method: edId ? "PUT" : "POST",
               body: JSON.stringify(config.cuerpo) })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modal: "", modalOcupado: false, serieEditId: null,
                        syncEstado: "ok",
                        syncMsg: edId ? "Corrección guardada." : config.aviso });
        /* Se recarga el expediente entero en vez de añadir la fila a
           mano: así lo que se ve es lo que quedó guardado. */
        this.cargarAcompanamiento(b.id);
      })
      .catch((e) => {
        if (this._vivo) this.setState({ modalOcupado: false,
                                        modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 6868 §*/
  guardarSesion() {
    const b = this.state.benefRealSel;
    if (!b) return;
    if (!this.state.seFecha) {
      this.setState({ modalError: "Indica la fecha de la sesión." }); return;
    }
    const edSes = this.state.serieEditId;
    this.setState({ modalOcupado: true, modalError: "" });
    this.api(edSes ? ("/api/sesiones/" + edSes)
                   : ("/api/beneficiarios/" + b.id + "/sesiones"), {
      method: edSes ? "PUT" : "POST",
      body: JSON.stringify({
        fecha: this.state.seFecha, tipo: this.state.seTipo || "individual",
        realizada_por: this.state.seQuien || null,
        notas: this.state.seNotas || ""
      })
    })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ modal: "", modalOcupado: false, syncEstado: "ok",
                        syncMsg: "Sesión registrada.",
                        benSesiones: d.sesiones || [],
                        benIncidencias: d.incidencias || [],
                        benSesionesAnio: d.sesiones_anio || 0 });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ modalOcupado: false,
                                        modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 6897 §*/
  abrirIncidencia() {
    const b = this.state.benefRealSel;
    if (!b) {
      this.setState({ benAviso:
        "Esta es una ficha de prueba de la maqueta: no hay expediente al que "
        + "asociar una incidencia. Crea un beneficiario con «Agregar "
        + "beneficiario» y ábrelo desde «Registrados en el sistema»." });
      return;
    }
    this.setState({
      modal: "incidencia", benAviso: "", serieEditId: null,
      inFecha: new Date().toISOString().slice(0, 10),
      inGravedad: "leve", inQuien: "", inDescripcion: "", inSeguimiento: "",
      modalError: "", modalOcupado: false
    });
  }

/*§CORTE§ linea original 6914 §*/
  guardarIncidencia() {
    const b = this.state.benefRealSel;
    if (!b) return;
    if (!this.state.inFecha) {
      this.setState({ modalError: "Indica la fecha de la incidencia." }); return;
    }
    if (!(this.state.inDescripcion || "").trim()) {
      this.setState({ modalError: "Describe qué pasó." }); return;
    }
    this.setState({ modalOcupado: true, modalError: "" });
    const edInc = this.state.serieEditId;
    this.api(edInc ? ("/api/incidencias/" + edInc)
                   : ("/api/beneficiarios/" + b.id + "/incidencias"), {
      method: edInc ? "PUT" : "POST",
      body: JSON.stringify({
        fecha: this.state.inFecha, gravedad: this.state.inGravedad || "leve",
        descripcion: this.state.inDescripcion,
        reportada_por: this.state.inQuien || null,
        seguimiento: this.state.inSeguimiento || ""
      })
    })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ modal: "", modalOcupado: false, syncEstado: "ok",
                        syncMsg: "Incidencia registrada.",
                        benSesiones: d.sesiones || [],
                        benIncidencias: d.incidencias || [],
                        benSesionesAnio: d.sesiones_anio || 0 });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ modalOcupado: false,
                                        modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 6947 §*/
  borrarRegistroBen(tipo, id) {
    this.api("/api/" + (tipo === "sesion" ? "sesiones" : "incidencias") + "/" + id,
             { method: "DELETE" })
      .then((d) => {
        if (this._vivo) this.setState({ benSesiones: d.sesiones || [],
                                        benIncidencias: d.incidencias || [],
                                        benSesionesAnio: d.sesiones_anio || 0 });
      })
      .catch(() => {});
  }

  /* Sin argumento es un alta; con una ficha, la misma pantalla precargada
     para corregirla. Un solo formulario para las dos cosas: mantener dos
     habría garantizado que uno se quedara atrás. */
/*§CORTE§ linea original 6961 §*/
  abrirBeneficiario(b) {
    this.cargarCamposRequeridos();
    const v = (x) => (b && b[x] != null) ? String(b[x]) : "";
    this.setState({
      modal: "beneficiario",
      beId: b ? b.id : null,
      beNombre: v("nombre"), beDoc: v("documento"), beNac: v("fecha_nac"),
      beCasa: (b && b.casa) ? b.casa : "Casa Lima",
      beSala: v("sala"), beGrado: v("grado"),
      beAnio: b ? v("anio_ingreso") : String(new Date().getFullYear()),
      beProcedencia: v("procedencia"), beLengua: v("lengua_materna"),
      beViaIngreso: v("via_ingreso"), beSituacion: v("situacion_legal"),
      beExpediente: v("expediente_judicial"), beReferente: v("referente_familiar"),
      beVisitas: v("regimen_visitas"),
      beInstitucion: v("institucion_educativa"), beRendimiento: v("rendimiento"),
      beRefuerzo: v("refuerzo_escolar"),
      beSeguro: v("seguro"), beAlergias: v("alergias"),
      beControl: v("control_medico"), beTratamiento: v("tratamiento"),
      beTutor: (b && b.tutor_id) ? String(b.tutor_id) : "",
      bePsicologo: (b && b.psicologo_id) ? String(b.psicologo_id) : "",
      bePlanVida: v("plan_vida"),
      /* Ficha completa. Los numéricos en 0 se muestran vacíos a propósito:
         un "0 hermanos" que nadie escribió es una afirmación, y lo que hay
         es ausencia de dato. */
      beCodigo: v("codigo"),
      beSexo: v("sexo"),
      beNacionalidad: v("nacionalidad"),
      beLugarNac: v("lugar_nacimiento"),
      beDepto: v("departamento"),
      beProv: v("provincia"),
      beDistrito: v("distrito"),
      beDireccion: v("direccion"),
      beReferencia: v("referencia"),
      beTipoVivienda: v("tipo_vivienda"),
      beServicios: v("servicios_basicos"),
      beNivel: v("nivel_educativo"),
      beSeccion: v("seccion"),
      beTurno: v("turno"),
      beAnioAcad: v("anio_academico"),
      beSitAcad: v("situacion_academica"),
      beAsisEscolar: v("asistencia_escolar"),
      beDificultades: v("dificultades"),
      beNotaEdu: v("nota_educativa"),
      beTipoSeguro: v("tipo_seguro"),
      beCentroSalud: v("centro_salud"),
      beDiscapacidad: v("discapacidad"),
      beNecesidades: v("necesidades_especiales"),
      beInfoMedica: v("info_medica"),
      beEmergNombre: v("emergencia_nombre"),
      beEmergTel: v("emergencia_telefono"),
      beNotaSalud: v("nota_salud"),
      beIntegrantes: (b && b.integrantes_hogar) ? String(b.integrantes_hogar) : "",
      beHermanos: (b && b.hermanos) ? String(b.hermanos) : "",
      beConQuienVive: v("con_quien_vive"),
      beRespEconomico: v("responsable_economico"),
      beTenencia: v("tenencia_vivienda"),
      beIngresos: v("rango_ingresos"),
      beDependientes: (b && b.personas_dependientes) ? String(b.personas_dependientes) : "",
      beNotaSocio: v("nota_socioeconomica"),
      modalError: "", modalOcupado: false
    });
  }

/*§CORTE§ linea original 7024 §*/
  guardarBeneficiario() {
    const nombre = (this.state.beNombre || "").trim();
    if (!nombre) { this.setState({ modalError: "El nombre no puede quedar vacío." }); return; }
    if (this.state.beNac && this.state.beNac > new Date().toISOString().slice(0, 10)) {
      this.setState({ modalError: "La fecha de nacimiento no puede estar en el futuro." });
      return;
    }
    const editando = !!this.state.beId;
    /* El cuerpo se arma aparte para poder comprobarlo antes de enviarlo:
       dentro de la llamada no había manera de mirarlo. */
    const beCuerpo = {
        nombre: nombre, documento: this.state.beDoc || "",
        fecha_nac: this.state.beNac || "", casa: this.state.beCasa || "",
        sala: this.state.beSala || "", grado: this.state.beGrado || "",
        anio_ingreso: this.state.beAnio || "",
        procedencia: this.state.beProcedencia || "",
        lengua_materna: this.state.beLengua || "",
        via_ingreso: this.state.beViaIngreso || "",
        situacion_legal: this.state.beSituacion || "",
        expediente_judicial: this.state.beExpediente || "",
        referente_familiar: this.state.beReferente || "",
        regimen_visitas: this.state.beVisitas || "",
        institucion_educativa: this.state.beInstitucion || "",
        rendimiento: this.state.beRendimiento || "",
        refuerzo_escolar: this.state.beRefuerzo || "",
        seguro: this.state.beSeguro || "",
        alergias: this.state.beAlergias || "",
        control_medico: this.state.beControl || "",
        tratamiento: this.state.beTratamiento || "",
        tutor_id: this.state.beTutor || null,
        psicologo_id: this.state.bePsicologo || null,
        plan_vida: this.state.bePlanVida || "",
        codigo: this.state.beCodigo || "",
        sexo: this.state.beSexo || "",
        nacionalidad: this.state.beNacionalidad || "",
        lugar_nacimiento: this.state.beLugarNac || "",
        departamento: this.state.beDepto || "",
        provincia: this.state.beProv || "",
        distrito: this.state.beDistrito || "",
        direccion: this.state.beDireccion || "",
        referencia: this.state.beReferencia || "",
        tipo_vivienda: this.state.beTipoVivienda || "",
        servicios_basicos: this.state.beServicios || "",
        nivel_educativo: this.state.beNivel || "",
        seccion: this.state.beSeccion || "",
        turno: this.state.beTurno || "",
        anio_academico: this.state.beAnioAcad || "",
        situacion_academica: this.state.beSitAcad || "",
        asistencia_escolar: this.state.beAsisEscolar || "",
        dificultades: this.state.beDificultades || "",
        nota_educativa: this.state.beNotaEdu || "",
        tipo_seguro: this.state.beTipoSeguro || "",
        centro_salud: this.state.beCentroSalud || "",
        discapacidad: this.state.beDiscapacidad || "",
        necesidades_especiales: this.state.beNecesidades || "",
        info_medica: this.state.beInfoMedica || "",
        emergencia_nombre: this.state.beEmergNombre || "",
        emergencia_telefono: this.state.beEmergTel || "",
        nota_salud: this.state.beNotaSalud || "",
        integrantes_hogar: Number(this.state.beIntegrantes) || 0,
        hermanos: Number(this.state.beHermanos) || 0,
        con_quien_vive: this.state.beConQuienVive || "",
        responsable_economico: this.state.beRespEconomico || "",
        tenencia_vivienda: this.state.beTenencia || "",
        rango_ingresos: this.state.beIngresos || "",
        personas_dependientes: Number(this.state.beDependientes) || 0,
        nota_socioeconomica: this.state.beNotaSocio || ""
    };

    const faltan = this.faltanEnFicha("beneficiario", beCuerpo);
    if (faltan.length) {
      this.setState({ modalOcupado: false, sdFaltan: faltan, modalError: "" });
      return;
    }
    beCuerpo.sin_dato = (this.state.sdMarcados || []).join(",");

    this.setState({ modalOcupado: true, modalError: "" });
    this.api(editando ? "/api/beneficiarios/" + this.state.beId : "/api/beneficiarios", {
      method: editando ? "PUT" : "POST",
      body: JSON.stringify(beCuerpo)
    })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({
          modal: "", modalOcupado: false, beId: null, syncEstado: "ok",
          sdFaltan: [], sdMarcados: [],
          syncMsg: nombre + (editando ? " actualizado." : " registrado en Beneficiarios."),
          beneficiarios: d.beneficiarios || [],
          /* Si el expediente de esa misma ficha está abierto detrás, hay
             que refrescarlo o seguiría mostrando los datos viejos. */
          benefRealSel: (this.state.benefRealSel && d.beneficiario
                         && this.state.benefRealSel.id === d.beneficiario.id)
            ? (d.beneficiarios || []).find(x => x.id === d.beneficiario.id) || d.beneficiario
            : this.state.benefRealSel
        });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ modalOcupado: false,
                                        modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 7318 §*/
  cargarBeneficiarios() {
    this.api("/api/beneficiarios")
      .then((d) => { if (this._vivo) this.setState({ beneficiarios: d.beneficiarios || [] }); })
      .catch(() => {});
  }

  /* Las fichas migradas guardan la fecha como dd/mm/aaaa. El input date
     solo acepta aaaa-mm-dd, así que se traduce en los dos sentidos sin
     reescribir lo que ya está en la base. */
  static aISO(fecha) {
    const f = String(fecha || "").trim();
    if (!f) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
    const m = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return "";
    return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  }

  static pesoLegible(bytes) {
    const b = Number(bytes || 0);
    if (b <= 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
  }

/*§CORTE§ linea original 8871 §*/
      /* ── Vínculo responsable ↔ beneficiario ────────────────────────── */
      vinPuedeEditar: this.puede("beneficiarios", "edicion"),
      vinVacio: (st.vinculos || []).length === 0,
      vinVacioNota: this.puede("beneficiarios", "edicion")
        ? "Todavía no hay ningún responsable vinculado. Se busca uno que ya esté registrado en Gestión de Personas → Responsables / Tutores y se indica qué papel cumple."
        : "Todavía no hay ningún responsable vinculado.",
      vinResumen: (() => {
        const n = (st.vinculos || []).length;
        if (!n) return "";
        const pr = (st.vinculos || []).find((v) => v.es_principal);
        return (n === 1 ? "1 responsable" : n + " responsables")
             + (pr ? " · principal: " + pr.nombre : " · sin responsable principal marcado");
      })(),
      vinLista: (st.vinculos || []).map((v) => ({
        nombre: v.nombre,
        detalle: [v.parentesco, v.documento ? "Doc. " + v.documento : "",
                  v.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto",
        papeles: [
          [v.es_principal, "Principal", "#0e3d69", "#e7eff7"],
          [v.es_legal, "Legal", "#1f6b45", "#e4f0e9"],
          [v.puede_recoger, "Puede recoger", "#8a5c05", "#fbf0d9"],
          [v.es_emergencia, "Emergencia", "#a8321f", "#fbe7e3"]
        ].filter((x) => x[0]).map(([, texto, color, fondo]) => ({
          texto,
          estilo: "font-size:11px; padding:3px 8px; border-radius:2px; white-space:nowrap; color:"
            + color + "; background:" + fondo + ";"
        })),
        editar: () => this.abrirVinculo(v),
        quitar: () => this.setState({ modal: "quitarVinculo", vinQuitar: v, modalError: "" })
      })),
      vinAbrir: () => this.abrirVinculo(null),

      /* Diálogo */
      modalVinculo: st.modal === "vinculo",
      vinEsNuevo: !st.vinEditando,
      vinTitulo: st.vinEditando ? "Editar el vínculo" : "Vincular un responsable",
      vinLede: st.vinEditando
        ? "Cambia el parentesco o el papel. Para cambiar de persona, quita este vínculo y crea otro."
        : "Se busca entre los responsables YA registrados. Si esta persona todavía no existe, hay que darla de alta primero en Responsables / Tutores.",
      vinBusca: st.vinBusca,
      onVinBusca: (e) => this.buscarResponsablesParaVincular(e.target.value),
      vinBuscaNota: (st.vinBusca || "").trim().length < 2
        ? "Escribe al menos dos letras."
        : (st.vinCandidatos || []).length + " coincidencia(s)",
      vinHayCandidatos: (st.vinCandidatos || []).length > 0,
      vinSinCandidatos: (st.vinBusca || "").trim().length >= 2
        && (st.vinCandidatos || []).length === 0,
      vinSinCandidatosNota: "Ningún responsable registrado coincide. Si es alguien nuevo, regístralo primero en Gestión de Personas → Responsables / Tutores; desde aquí no se crean fichas, para no acabar con la misma persona repetida.",
      vinCandidatos: (st.vinCandidatos || []).map((r) => {
        const elegido = !!(st.vinElegido && st.vinElegido.id === r.id);
        return {
          nombre: r.nombre,
          detalle: [r.documento ? "Doc. " + r.documento : "", r.telefono,
                    r.beneficiarios ? r.beneficiarios + " beneficiario(s)" : ""]
                   .filter(Boolean).join(" · ") || "Sin datos",
          elegido,
          estilo: "display:flex; align-items:center; gap:10px; width:100%; padding:10px 12px; "
            + "border-bottom:1px solid #f2efeb; color:#201e1d;"
            + (elegido ? " background:#e7eff7;" : ""),
          elegir: () => this.setState({ vinElegido: r, modalError: "" })
        };
      }),
      vinHayElegido: !!st.vinElegido,
      vinElegidoNombre: (st.vinElegido && st.vinElegido.nombre) || "",
      vinParentesco: st.vinParentesco,
      onVinParentesco: (e) => this.setState({ vinParentesco: e.target.value, modalError: "" }),
      vinBanderas: [
        ["vinPrincipal", "Responsable principal",
         "El contacto por defecto. Solo puede haber uno: marcarlo aquí se lo quita a quien lo tuviera."],
        ["vinLegal", "Responsable legal",
         "Tiene la representación legal del niño o niña."],
        ["vinRecoger", "Autorizado a recogerlo",
         "Puede llevárselo del colegio o de la casa."],
        ["vinEmergencia", "Contacto de emergencia",
         "A quién se llama primero si pasa algo."]
      ].map(([campo, label, nota]) => {
        const activo = !!st[campo];
        return {
          label, nota,
          marca: activo ? "✓" : "",
          casilla: "width:18px; height:18px; flex:none; margin-top:1px; border-radius:2px; "
            + "display:flex; align-items:center; justify-content:center; font-size:12px; "
            + "color:#ffffff; border:1px solid " + (activo ? BLUE : "#c9d4de")
            + "; background:" + (activo ? BLUE : "#ffffff") + ";",
          alternar: () => this.setState({ [campo]: activo ? 0 : 1 })
        };
      }),

      modalQuitarVinculo: st.modal === "quitarVinculo",
      vinQuitarNombre: (st.vinQuitar && st.vinQuitar.nombre) || "",

/*§CORTE§ linea original 9623 §*/
      /* ── Formulario de sesión ── */
/*§CORTE§ linea original 9624 §*/
      /* ── Las tres altas ──────────────────────────────────────────── */
      modalPrograma: this.state.modal === "programa",
      modalHistorial: this.state.modal === "historial",
      modalSeguimiento: this.state.modal === "seguimiento",
      benProgramaNuevo: () => this.abrirSerie("programa"),
      benHistorialNuevo: () => this.abrirSerie("historial"),
      benSeguimientoNuevo: () => this.abrirSerie("seguimiento"),

      pgNombre: st.pgNombre, onPgNombre: (e) => this.setState({ pgNombre: e.target.value, modalError: "" }),
      pgDesde: st.pgDesde, onPgDesde: (e) => this.setState({ pgDesde: e.target.value, modalError: "" }),
      pgHasta: st.pgHasta, onPgHasta: (e) => this.setState({ pgHasta: e.target.value, modalError: "" }),
      pgNota: st.pgNota, onPgNota: (e) => this.setState({ pgNota: e.target.value }),

      hiAnio: st.hiAnio, onHiAnio: (e) => this.setState({ hiAnio: e.target.value, modalError: "" }),
      hiInstitucion: st.hiInstitucion, onHiInstitucion: (e) => this.setState({ hiInstitucion: e.target.value }),
      hiNivel: st.hiNivel, onHiNivel: (e) => this.setState({ hiNivel: e.target.value }),
      hiGrado: st.hiGrado, onHiGrado: (e) => this.setState({ hiGrado: e.target.value }),
      hiSeccion: st.hiSeccion, onHiSeccion: (e) => this.setState({ hiSeccion: e.target.value }),
      hiSituacion: st.hiSituacion, onHiSituacion: (e) => this.setState({ hiSituacion: e.target.value }),
      hiNota: st.hiNota, onHiNota: (e) => this.setState({ hiNota: e.target.value }),

      sgFecha: st.sgFecha, onSgFecha: (e) => this.setState({ sgFecha: e.target.value, modalError: "" }),
      sgTipo: st.sgTipo, onSgTipo: (e) => this.setState({ sgTipo: e.target.value }),
      sgSituacion: st.sgSituacion, onSgSituacion: (e) => this.setState({ sgSituacion: e.target.value }),
      sgAccion: st.sgAccion, onSgAccion: (e) => this.setState({ sgAccion: e.target.value }),
      sgCompromisos: st.sgCompromisos, onSgCompromisos: (e) => this.setState({ sgCompromisos: e.target.value }),
      sgProxima: st.sgProxima, onSgProxima: (e) => this.setState({ sgProxima: e.target.value }),

      modalSesion: this.state.modal === "sesion",
      seFecha: this.state.seFecha || "",
      onSeFecha: (e) => this.setState({ seFecha: e.target.value }),
      seNotas: this.state.seNotas || "",
      onSeNotas: (e) => this.setState({ seNotas: e.target.value }),
      seQuien: this.state.seQuien || "",
      onSeQuien: (e) => this.setState({ seQuien: e.target.value }),
      seTipos: [
        {key:"individual", label:"Individual"},
        {key:"grupal",     label:"Grupal"},
        {key:"familiar",   label:"Familiar"},
        {key:"escolar",    label:"Escolar"},
        {key:"otra",       label:"Otra"}
      ].map(t => ({
        label: t.label,
        style: "padding:8px 14px; border-radius:2px; font-size:14px; border:1px solid "
          + ((this.state.seTipo || "individual") === t.key
             ? BLUE + "; background:#ffffff; color:" + BLUE_D + "; font-weight:600;"
             : "#c9d4de; color:#3c4a55;"),
        go: () => this.setState({ seTipo: t.key })
      })),
      sePersonas: [{ valor: "", etiqueta: "— Sin indicar —" }].concat(
        (this.state.personal || []).map(x => ({
          valor: String(x.id),
          etiqueta: x.nombre + (x.cargo ? " — " + x.cargo : "") }))),
      seBenef: (this.state.benefRealSel || {}).nombre || "",

/*§CORTE§ linea original 9679 §*/
      /* ── Formulario de incidencia ── */
      modalIncidencia: this.state.modal === "incidencia",
      inFecha: this.state.inFecha || "",
      onInFecha: (e) => this.setState({ inFecha: e.target.value }),
      inDescripcion: this.state.inDescripcion || "",
      onInDescripcion: (e) => this.setState({ inDescripcion: e.target.value }),
      inSeguimiento: this.state.inSeguimiento || "",
      onInSeguimiento: (e) => this.setState({ inSeguimiento: e.target.value }),
      inQuien: this.state.inQuien || "",
      onInQuien: (e) => this.setState({ inQuien: e.target.value }),
      inGravedades: [
        {key:"leve",     label:"Leve",     c:GREEN, d:GREEN_D},
        {key:"moderada", label:"Moderada", c:GOLD,  d:GOLD_D},
        {key:"grave",    label:"Grave",    c:RED,   d:RED_D}
      ].map(g => ({
        label: g.label,
        style: "padding:8px 14px; border-radius:2px; font-size:14px; border:1px solid "
          + ((this.state.inGravedad || "leve") === g.key
             ? g.c + "; background:#ffffff; color:" + g.d + "; font-weight:600;"
             : "#c9d4de; color:#3c4a55;"),
        go: () => this.setState({ inGravedad: g.key })
      })),
      inPersonas: [{ valor: "", etiqueta: "— Sin indicar —" }].concat(
        (this.state.personal || []).map(x => ({
          valor: String(x.id),
          etiqueta: x.nombre + (x.cargo ? " — " + x.cargo : "") }))),
      inBenef: (this.state.benefRealSel || {}).nombre || "",

/*§CORTE§ linea original 9707 §*/
      /* ── Lo registrado, en el expediente ── */
/*§CORTE§ linea original 9708 §*/
      /* ── Las tres series ─────────────────────────────────────────────
         Tres líneas por fila: qué es, cuándo, y la nota si la hay. Los
         demás campos siguen en la base para quien los busque; volcarlos
         todos aquí haría la lista ilegible. */
      benProgramas: (this.state.benProgramas || []).map((x) => ({
        titulo: x.programa || "Programa sin nombre",
        periodo: (x.fecha_ingreso || "—")
          + (x.fecha_salida ? (" → " + x.fecha_salida) : " · sigue en curso")
          + (x.estado ? (" · " + x.estado) : ""),
        nota: x.nota || "",
        borrar: () => this.borrarDeSerie("programas", x.id),
        corregir: () => this.setState({
          modal: "programa", modalError: "", serieEditId: x.id,
          pgNombre: x.programa || "", pgDesde: x.fecha_ingreso || "",
          pgHasta: x.fecha_salida || "", pgNota: x.nota || "",
        }),
      })),
      hayBenProgramas: (this.state.benProgramas || []).length > 0,
      sinBenProgramas: (this.state.benProgramas || []).length === 0,

      benHistorial: (this.state.benHistorial || []).map((x) => ({
        titulo: [x.anio, x.nivel, x.grado].filter(Boolean).join(" · ")
                || "Año sin datos",
        detalle: [x.institucion, x.seccion && ("sección " + x.seccion),
                  x.situacion, x.rendimiento].filter(Boolean).join(" · ")
                 || "Sin detalle",
        nota: x.nota || "",
        borrar: () => this.borrarDeSerie("historial", x.id),
        corregir: () => this.setState({
          modal: "historial", modalError: "", serieEditId: x.id,
          hiAnio: x.anio || "", hiInstitucion: x.institucion || "",
          hiNivel: x.nivel || "", hiGrado: x.grado || "",
          hiSeccion: x.seccion || "", hiSituacion: x.situacion || "",
          hiNota: x.nota || "",
        }),
      })),
      hayBenHistorial: (this.state.benHistorial || []).length > 0,
      sinBenHistorial: (this.state.benHistorial || []).length === 0,

      benSeguimiento: (this.state.benSeguimiento || []).map((x) => ({
        titulo: [x.fecha, x.tipo].filter(Boolean).join(" · ") || "Sin fecha",
        detalle: [x.situacion, x.accion].filter(Boolean).join(" · ")
                 || "Sin detalle",
        nota: [x.compromisos, x.nota].filter(Boolean).join(" · ")
              + (x.proxima_fecha ? (" · próxima: " + x.proxima_fecha) : ""),
        borrar: () => this.borrarDeSerie("seguimiento", x.id),
        corregir: () => this.setState({
          modal: "seguimiento", modalError: "", serieEditId: x.id,
          sgFecha: x.fecha || "", sgTipo: x.tipo || "",
          sgSituacion: x.situacion || "", sgAccion: x.accion || "",
          sgCompromisos: x.compromisos || "", sgProxima: x.proxima_fecha || "",
        }),
      })),
      hayBenSeguimiento: (this.state.benSeguimiento || []).length > 0,
      sinBenSeguimiento: (this.state.benSeguimiento || []).length === 0,

      benSesiones: (this.state.benSesiones || []).map(x => ({
        fecha: x.fecha,
        tipo: ({individual:"Individual", grupal:"Grupal", familiar:"Familiar",
                escolar:"Escolar", otra:"Otra"})[x.tipo] || x.tipo,
        quien: x.responsable || "Sin responsable asignado",
        notas: x.notas || "",
        tieneNotas: !!x.notas,
        borrar: () => this.borrarRegistroBen("sesion", x.id),
        corregir: () => this.setState({
          modal: "sesion", modalError: "", serieEditId: x.id,
          seFecha: x.fecha || "", seTipo: x.tipo || "individual",
          seQuien: x.realizada_por || "", seNotas: x.notas || "",
        })
      })),
      hayBenSesiones: (this.state.benSesiones || []).length > 0,
      sinBenSesiones: (this.state.benSesiones || []).length === 0,
      benIncidencias: (this.state.benIncidencias || []).map(x => {
        const pal = x.gravedad === "grave" ? [RED_D, RED_T]
                  : x.gravedad === "moderada" ? [GOLD_D, GOLD_T] : [GREEN_D, GREEN_T];
        return {
          fecha: x.fecha,
          gravedad: ({leve:"Leve", moderada:"Moderada", grave:"Grave"})[x.gravedad] || x.gravedad,
          color: pal[0], tint: pal[1],
          descripcion: x.descripcion,
          quien: x.reportante || "Sin reportante asignado",
          seguimiento: x.seguimiento || "",
          tieneSeguimiento: !!x.seguimiento,
          borrar: () => this.borrarRegistroBen("incidencia", x.id),
          corregir: () => this.setState({
            modal: "incidencia", modalError: "", serieEditId: x.id,
            inFecha: x.fecha || "", inGravedad: x.gravedad || "leve",
            inQuien: x.reportado_por || "", inDescripcion: x.descripcion || "",
            inSeguimiento: x.seguimiento || "",
          })
        };
      }),
      hayBenIncidencias: (this.state.benIncidencias || []).length > 0,
      sinBenIncidencias: (this.state.benIncidencias || []).length === 0,
      benEsReal: !!this.state.benefRealSel,

      benProximamente: () => this.setState({ benAviso:
        "Todavía no está construido. Editar el expediente necesita que primero "
        + "acordemos qué campos guarda la tabla de beneficiarios; registrar "
        + "sesiones e incidencias necesita sus propias tablas. Mientras tanto, "
        + "el alta de beneficiarios sí funciona desde el botón «Agregar "
        + "beneficiario» de la pestaña Beneficiarios." }),
      benAviso: this.state.benAviso || "",
      benAvisoHay: !!this.state.benAviso,
      backToBenef: () => this.setState({ view: "legajo", legajoTab: "benef", benAviso: "", benefRealSel: null }),
      /* Un árbol no se recorta al buscar: quitar a alguien del medio
         dejaría a su equipo colgando de nadie. Se resalta lo que coincide
         y se apaga el resto. */
      organigrama: (() => {
        const t = String(this.state.busLegajo || "").trim().toLowerCase();
        return this.arbolOrganigrama().filas.map((f) => {
          const fila = this.filaOrganigrama(f);
          /* Siempre se declara la opacidad: dejarla sin valor cuando no se
             busca escribiría `opacity:;` en el estilo. */
          if (!t) return Object.assign({}, fila, { opacidad: "1" });
          const coincide = (String(fila.nombre || "") + " " + String(fila.cargo || ""))
            .toLowerCase().indexOf(t) >= 0;
          return Object.assign({}, fila, {
            opacidad: coincide ? "1" : "0.3",
            peso: coincide ? "600" : fila.peso,
          });
        });
      })(),
      orgSueltos: this.filtradas(this.arbolOrganigrama().sueltos,
                                 ["n", "c"], this.state.busLegajo).map((p) => ({
        nombre: p.nombre,
        cargo: p.cargo || "Sin cargo registrado",
        area: p.area || "Sin área",
        ini: ini(p.nombre),
        bio: p.staff_number ? ("ID " + p.staff_number) : "",
        editar: () => this.abrirFicha(p)
      })),
      hayOrg: this.arbolOrganigrama().filas.length > 0,
      haySueltos: this.arbolOrganigrama().sueltos.length > 0,
      orgNota: (() => {
        const a = this.arbolOrganigrama();
        return a.filas.length + " de " + a.total + " fichas ubicadas en la jerarquía";
      })(),
      orgSueltosNota: (() => {
        const n = this.arbolOrganigrama().sueltos.length;
        return n === 1
          ? "1 persona sin jefe asignado y sin equipo a cargo"
          : n + " personas sin jefe asignado y sin equipo a cargo";
      })(),

      emp: this.fichaFor(sel),
      /* Secciones navegables dentro de la ficha. El aviso del Dashboard
         entra directo a la que corresponde. */
      fichaSecs: [
        {key:"datos",      label:"Datos",       count:""},
        {key:"docs",       label:"Documentos",  count:String((this.state.fichaDocs || []).length || "")},
        {key:"contratos",  label:"Contratos",   count:String((this.state.fichaContratos || []).length || "")},
        {key:"condiciones", label:"Condiciones", count:String((this.state.condHistorial || []).length || "")},
        {key:"trayectoria", label:"Trayectoria",
         count:String(((this.state.trFormacion || []).length
                       + (this.state.trExperiencia || []).length) || "")},
      ].map(t => ({
        ...t,
        style: "display:flex; align-items:center; gap:7px; padding:0 0 12px; font-size:15.5px; border-bottom:3px solid "
          + ((this.state.fichaSec || "datos") === t.key
             ? BLUE + "; color:" + BLUE_D + "; font-weight:600;"
             : "transparent; color:#5b7185;"),
        go: () => this.setState({ fichaSec: t.key })
      })),
      secDatos: (this.state.fichaSec || "datos") === "datos",
      secDocs: this.state.fichaSec === "docs",
      secContratos: this.state.fichaSec === "contratos",
      secCondiciones: this.state.fichaSec === "condiciones",
      secTrayectoria: this.state.fichaSec === "trayectoria",

/*§CORTE§ linea original 9919 §*/
      /* ── Formulario ── */
      condOpen: !!this.state.condOpen,
      condCerrar: () => this.setState({ condOpen: false, condErr: "" }),
      condGuardar: () => this.guardarCondicion(),
      condGuardando: !!this.state.condGuardando,
      condGuardarLabel: this.state.condGuardando ? "Guardando…" : "Registrar",
      condErr: this.state.condErr || "",
      condHayErr: !!this.state.condErr,
      condRegimenes: [
        {key:"planilla",   label:"Planilla",   icon:"ph-briefcase"},
        {key:"honorarios", label:"Honorarios", icon:"ph-receipt"},
        {key:"sin_pago",   label:"Sin pago",   icon:"ph-hand-heart"}
      ].map(r => ({
        ...r,
        style: "display:flex; align-items:center; gap:8px; padding:9px 15px; border-radius:2px; font-size:14px; border:1px solid "
          + ((this.state.condRegimen || "planilla") === r.key
             ? BLUE + "; background:#ffffff; color:" + BLUE_D + "; font-weight:600;"
             : "#c9d4de; color:#3c4a55;"),
        go: () => this.setState({ condRegimen: r.key })
      })),
      condEsSinPago: (this.state.condRegimen || "planilla") === "sin_pago",
      condNoEsSinPago: (this.state.condRegimen || "planilla") !== "sin_pago",
      condSueldo: this.state.condSueldo || "",
      setCondSueldo: (e) => this.setState({ condSueldo: e.target.value }),
      condJornada: this.state.condJornada || "8",
      setCondJornada: (e) => this.setState({ condJornada: e.target.value }),
      condDesde: this.state.condDesde || "",
      setCondDesde: (e) => this.setState({ condDesde: e.target.value }),
      condNota: this.state.condNota || "",
      setCondNota: (e) => this.setState({ condNota: e.target.value }),
      /* Aviso de lo que va a pasar con la condición que ya existe: registrar
         no reemplaza, cierra la anterior el día antes. */
      condAvisoCierre: this.state.condVigente && this.state.condDesde
        ? "La condición actual se cerrará el día anterior al " + this.state.condDesde + ". El historial se conserva."
        : "",
      condHayAvisoCierre: !!(this.state.condVigente && this.state.condDesde),

      condBorrarOpen: !!this.state.condBorrar,
      condBorrarNota: this.state.condBorrar
        ? "Se quitará del historial el tramo " + this.state.condBorrar.vigente_desde
          + " → " + (this.state.condBorrar.vigente_hasta || "vigente") + "."
        : "",
      condBorrarCancelar: () => this.setState({ condBorrar: null }),
      condBorrarConfirmar: () => this.borrarCondicion(this.state.condBorrar),
      hayDocs: (this.state.fichaDocs || []).length > 0,
      sinDocs: (this.state.fichaDocs || []).length === 0,
      hayContratos: (this.state.fichaContratos || []).length > 0,
      sinContratos: (this.state.fichaContratos || []).length === 0,
      fichaDocs: (this.state.fichaDocs || []).map(d => ({
        ...Component.filaDocumento(d),
        editar: () => this.abrirDocumento("documento", d),
        borrar: () => this.abrirBorrarDocumento(d) })),
      docNuevo: () => this.abrirDocumento("documento", null),
      fichaContratos: (this.state.fichaContratos || []).map(d => ({
        ...Component.filaDocumento(d),
        editar: () => this.abrirDocumento("contrato", d),
        borrar: () => this.abrirBorrarDocumento(d) })),
      ctrNuevo: () => this.abrirDocumento("contrato", null),
      fichaEditar: () => {
        const f = (this.state.personal || []).find(x => x.id === Number(sel));
        if (f) this.abrirFicha(f);
      },
      backToOrg: () => this.setState({ view: "legajo", legajoTab: "dir" }),
      openJefe: () => { const j = this.fichaFor(sel).jefeId; if (j) this.go("ficha", j); },

      /* Estas pestañas llevaban las cifras 43, 26, 11 y 8 escritas a mano:
         venían de la maqueta y no salían de ninguna parte. Con 6 personas
         y 8 niños en la base, la pantalla anunciaba 43 de algo. Justo
         debajo, en attTabs, ya se habían quitado tres cifras iguales por
         lo mismo; estas se pasaron por alto.

         Ahora se cuentan de verdad, y la que no tiene nada que contar no
         enseña número: un cero escrito es un dato, pero un número que
         nadie calculó es una mentira. */
      scopeTabs: [
        {key:"todos", label:"General", icon:"ph-chart-pie-slice",
         count:String((this.state.personal || []).length
                      + (this.state.beneficiarios || []).length)},
        {key:"ninos", label:"Beneficiarios", icon:"ph-baby",
         count:String((this.state.beneficiarios || []).length)},
        {key:"min", label:"Colaboradores", icon:"ph-users-three",
         count:String((this.state.personal || [])
                        .filter((p) => p.ambito !== "adm").length)},
        {key:"adm", label:"Administración", icon:"ph-briefcase",
         count:String((this.state.personal || [])
                        .filter((p) => p.ambito === "adm").length)}
      ].map(t => ({
        ...t,
        style: "padding:5px 11px; border-radius:2px; font-size:13.5px; white-space:nowrap;"
          + (sc === t.key ? "background:#ffffff; font-weight:600; color:" + BLUE_D + ";" : "color:#5b7185;"),
        go: () => this.setState({ scope: t.key })
      })),
      attTabs: [
        /* Sin cuentas: las que había (12, 5, 3) no salían de ninguna parte.
           Volverán cuando haya algo real que contar. */
        {key:"diaria", label:"Día", count:"", icon:"ph-calendar-dot"},
        {key:"semanal", label:"Vista semanal", count:"", icon:"ph-calendar-blank"},
        {key:"just", label:"Justificaciones", count:"", icon:"ph-note-pencil"},
        {key:"cal", label:"Calendario mensual", count:"", icon:"ph-calendar"}
      ].map(t => ({
        ...t,
        /* Subrayado azul, como el resto del ERP. La pastilla verde que
           había aquí hacía que esta pantalla pareciera de otro producto:
           el verde en este sistema significa «bien», no «seleccionada». */
        style: "display:flex; align-items:center; gap:7px; padding:0 0 12px; font-size:15.5px; "
          + "border-bottom:3px solid "
          + (at === t.key ? BLUE + "; color:" + BLUE_D + "; font-weight:600;"
                          : "transparent; color:#5b7185;"),
        go: () => this.setState({ attTab: t.key }, () => this.cargarRango())
      })),
      addOpen: !!this.state.addOpen,
      /* "Agregar registro" describía el formulario viejo, donde había que
         elegir persona y método. Ya no se agrega nada a mano: se abre la
         lista de quienes faltan por enrolar. */
      addLabel: this.state.addOpen ? "Cerrar lista" : "Enrolar personas",
      toggleAdd: () => this.setState({ addOpen: !this.state.addOpen, attTab: "diaria" },
        () => this.cargarRango()),
      addMetodos: [
        {key:"facial", label:"Rostro", icon:"ph-scan-smiley"},
        {key:"huella", label:"Huella", icon:"ph-fingerprint"},
        {key:"ambos", label:"Rostro y huella", icon:"ph-shield-check"}
      ].map(m => {
        const disp = this.state.metodosDisponibles;
        const permitido = !disp || disp.indexOf(m.key) >= 0;
        const activo = (this.state.addMetodo || "facial") === m.key;
        return {
          ...m,
          label: permitido ? m.label : m.label + " · no disponible",
          style: "display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:2px; font-size:14px; border:1px solid "
            + (!permitido
              ? "#e2ded8; color:#a9b2ba; background:#f0eeeb; cursor:not-allowed; text-decoration:line-through;"
              : activo
                ? BLUE + "; background:#ffffff; color:" + BLUE_D + "; font-weight:600;"
                : "#c9d4de; color:#3c4a55;"),
          go: permitido ? () => this.setState({ addMetodo: m.key }) : () => {}
        };
      }),
      addNota: (() => {
        const disp = this.state.metodosDisponibles;
        if (disp && disp.indexOf("huella") < 0)
          return "El terminal configurado no tiene lector de huella, por eso esas opciones están desactivadas.";
        const m = this.state.addMetodo || "facial";
        return m === "facial"
          ? "Captura en el terminal facial de la puerta principal. Toma unos 20 segundos."
          : m === "huella"
            ? "Captura de tres muestras de huella en el lector de la puerta principal."
            : "Se capturan ambos métodos: la persona podrá marcar en cualquier terminal.";
      })(),

