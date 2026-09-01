  /* Quién tiene rostro para marcar por el celular. Es OTRO enrolamiento
     que el del terminal: se puede estar en uno y no en el otro. */
  /* Cómo está la conexión con el terminal. No llama a yunatt: pregunta
     al propio servidor qué sabe ya, así que se puede pedir al entrar sin
     gastar la sesión compartida con el ERP anterior. */
  /* Le pregunta al terminal por quien se quedó a medias.

     Hace falta porque el seguimiento de un enrolamiento vive en la memoria
     del servidor: si la pantalla se cierra o pasa el tiempo, nadie vuelve a
     preguntar y la ficha se queda en «esperando» aunque el equipo ya la
     haya capturado. Recargar no servía: recargar lee la base.

     Si falla, no se dice nada: es una puesta al día de fondo, y un aviso
     rojo por no haber podido hablar con yunatt al entrar sería ruido. Lo
     que sí se enseña es cuando encuentra algo. */
  revisarEnrolamientos() {
    this.api("/api/enrolamiento/revisar", { method: "POST" })
      .then((d) => {
        if (!this._vivo || !d || !d.enroladas) return;
        this.setState({
          bioAlDia: d.enroladas === 1
            ? ("Se confirmó el enrolamiento de " + (d.nombres || [])[0] + ".")
            : ("Se confirmaron " + d.enroladas + " enrolamientos: "
               + (d.nombres || []).join(", ") + ".")
        });
        this.cargarIdentidades();
        this.cargarCandidatos();
      })
      .catch(() => {});
  }

  cargarEstadoTerminal() {
    this.api("/api/yunatt/estado")
      .then((d) => { if (this._vivo) this.setState({ terminal: d }); })
      .catch(() => { if (this._vivo) this.setState({ terminal: null }); });
  }


  cargarIdentidades() {
    this.api("/api/identidades")
      .then((d) => { if (this._vivo) this.setState({ identidades: d.identidades || [] }); })
      .catch(() => {});
  }

/*§CORTE§ linea original 5863 §*/
  cargarCandidatos() {
    this.api("/api/candidatos")
      .then((d) => {
        if (!this._vivo) return;
        const lista = d.candidatos || [];
        const sel = this.state.candidatoSel;
        const sigueValido = lista.some((c) => c.tipo + ":" + c.id === sel);
        this.setState({
          candidatos: lista,
          candidatoSel: sigueValido ? sel : (lista.length ? lista[0].tipo + ":" + lista[0].id : "")
        });
      })
      .catch(() => {});
  }

/*§CORTE§ linea original 5916 §*/
  iniciarCaptura(tipo, titularId, metodo) {
    if (!tipo) {
      const sel = this.state.candidatoSel || "";
      if (!sel) { this.setState({ capFase: "error", capMsg: "Elige a quién enrolar." }); return; }
      const corte = sel.indexOf(":");
      tipo = sel.slice(0, corte);
      titularId = Number(sel.slice(corte + 1));
    }
    metodo = metodo || this.state.addMetodo || "facial";
    /* Dos clics seguidos mandarían dos comandos al terminal y el segundo
       pisaría al primero: mientras hay una captura viva no se admite otra. */
    if (this.state.capFase === "enviando" || this.state.capFase === "esperando") return;
    this.setState({ candidatoSel: tipo + ":" + titularId, addMetodo: metodo });

    this.setState({
      capFase: "enviando",
      capMsg: "Enviando el comando al terminal…",
      capSn: null, capPaso: 1, capTotalPasos: 1, capRestante: 0,
      capRostro: false, capHuella: false
    });

    this.api("/api/enrolamiento", {
      method: "POST",
      body: JSON.stringify({ tipo: tipo, titular_id: titularId, metodo: metodo })
    })
      .then((d) => { if (this._vivo) { this.aplicarEstado(d); this.programarSondeo(); } })
      .catch((e) => { if (this._vivo) this.setState({ capFase: "error", capMsg: String(e.message || e) }); });
  }

  /* El backend cachea 4 s sus consultas a yunatt, así que sondear cada
     1,5 s mantiene viva la interfaz sin castigar la cuenta compartida. */
/*§CORTE§ linea original 5947 §*/
  programarSondeo() {
    if (this._sondeo) clearTimeout(this._sondeo);
    this._sondeo = setTimeout(() => {
      if (!this._vivo || this.state.capFase !== "esperando" || !this.state.capSn) return;
      this.api("/api/enrolamiento/" + this.state.capSn + "/estado")
        .then((d) => {
          if (!this._vivo) return;
          this.aplicarEstado(d);
          if (d.estado === "esperando") this.programarSondeo();
          else { this.cargarPersonas(); this.cargarCandidatos(); }
        })
        .catch(() => { if (this._vivo) this.programarSondeo(); });
    }, 1500);
  }

/*§CORTE§ linea original 5962 §*/
  aplicarEstado(d) {
    const fase = d.estado === "ok" ? "ok"
      : (d.estado === "error" || d.estado === "cancelado") ? "error"
      : "esperando";

    let msg = d.detalle || "";
    if (!msg && fase === "esperando") {
      msg = d.fase_etiqueta === "huella"
        ? "El terminal espera la huella. Coloca el dedo en el lector."
        : "El terminal está en modo reconocimiento. Acércate y mira a la cámara.";
    }

    this.setState({
      capFase: fase,
      capSn: d.staff_number,
      capMsg: msg,
      capEtiqueta: d.fase_etiqueta || "",
      capPaso: d.paso || 1,
      capTotalPasos: d.total_pasos || 1,
      capRestante: d.segundos_restantes || 0,
      capRostro: !!d.tiene_rostro,
      capHuella: !!d.tiene_huella
    });
  }

/*§CORTE§ linea original 5987 §*/
  cancelarCaptura() {
    const sn = this.state.capSn;
    if (this._sondeo) { clearTimeout(this._sondeo); this._sondeo = null; }
    this.setState({ capFase: "error", capMsg: "Captura cancelada." });
    if (sn) this.api("/api/enrolamiento/" + sn + "/cancelar", { method: "POST" }).catch(() => {});
  }

/*§CORTE§ linea original 5994 §*/
  reintentarCaptura() {
    const sn = this.state.capSn;
    /* Sin staffNumber todavía no hubo alta en yunatt: se empieza de cero.
       Con staffNumber se reenvía el comando a la MISMA persona, para no
       consumir otro número del rango reservado en cada intento. */
    if (!sn) { this.iniciarCaptura(); return; }
    this.setState({ capFase: "enviando", capMsg: "Reenviando el comando al terminal…" });
    this.api("/api/enrolamiento/" + sn + "/reintentar", { method: "POST" })
      .then((d) => { if (this._vivo) { this.aplicarEstado(d); this.programarSondeo(); } })
      .catch((e) => { if (this._vivo) this.setState({ capFase: "error", capMsg: String(e.message || e) }); });
  }

/*§CORTE§ linea original 6006 §*/
  cerrarCaptura() {
    if (this._sondeo) { clearTimeout(this._sondeo); this._sondeo = null; }
    this.setState({ capFase: "", capMsg: "", capSn: null });
    this.cargarPersonas();
    this.cargarCandidatos();
    this.cargarIdentidades();
  }

  /* ══════════════════════════════════════════════════════════════════════
     EDITAR Y BORRAR PERSONAS ENROLADAS

     El borrado NO es local: quita a la persona del dispositivo físico y de
     la cuenta de yunatt, ambos compartidos con el ERP anterior. Por eso
     nunca se dispara desde el botón de la fila: ese botón solo abre el
     diálogo, y la acción real exige un segundo clic sobre una confirmación
     que explica el alcance.
     ══════════════════════════════════════════════════════════════════════ */

  /* Hoja de Vida: alta y edición de la ficha del personal. Comparte el mismo
     diálogo que el resto para no tener dos maneras de editar. */
/*§CORTE§ linea original 6352 §*/
  /* Un dia adelante o atras. Recarga por el mismo camino que el selector
     de fecha: dos formas distintas de cambiar de dia acabarian divergiendo. */
  moverDia(dias) {
    const d = new Date(String(this.state.fecha || this.fechaHoy()) + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    this.setState({ fecha: this.iso(d), syncMsg: '' },
                  () => { this.cargarPersonas(); this.cargarRango(); });
  }

  filasSinEnrolar() {
    const etiqueta = { personal: "Trabajador", beneficiario: "Beneficiario",
                       responsable: "Responsable" };
    return (this.state.candidatos || []).map((c) => ({
      nombre: c.nombre,
      ambito: c.ambito || null,
      rolLabel: etiqueta[c.tipo] || c.tipo,
      metodo: "Sin enrolar",
      metodoIcon: "ph-warning-circle",
      metodoColor: "#9aa7b2",
      /* Ni un guion inventado ni un cero: no hay marcas porque no puede
         marcar, y eso lo dice la columna de estado. */
      entrada: "—", salida: "—", horas: "—",
      estado: "Sin enrolar",
      presente: false,
      color: GOLD_D, tint: GOLD_T,
      puedeAcciones: false,
      puedeEnrolar: true,
      enrolado: false,
      enrolar: () => this.setState({ view: "biometria" }),
    }));
  }

/*§CORTE§ linea original 10047 §*/
      onCandidato: (e) => this.setState({ candidatoSel: e.target.value, capFase: "", capMsg: "" }),
      hayCandidatos: (this.state.candidatos || []).length > 0,
      sinCandidatos: (this.state.candidatos || []).length === 0,
      candidatosNota: (this.state.candidatos || []).length === 1
        ? "1 persona con ficha y sin enrolar"
        : (this.state.candidatos || []).length + " personas con ficha y sin enrolar",

      capActivo: !!this.state.capFase,
      capEscaneando: this.state.capFase === "esperando" || this.state.capFase === "enviando",
      capEsperando: this.state.capFase === "esperando",
      capExito: this.state.capFase === "ok",
      capFallo: this.state.capFase === "error",

      capCamFondo: this.state.capFase === "ok" ? "#e8f3ec"
        : this.state.capFase === "error" ? "#fbe7e3"
        : this.state.capFase === "esperando" ? "#0e3d69" : "#eef2f6",
      capCamBorde: this.state.capFase === "ok" ? GREEN
        : this.state.capFase === "error" ? RED
        : this.state.capFase === "esperando" ? BLUE : "#c9d4de",
      capCamColor: this.state.capFase === "ok" ? GREEN
        : this.state.capFase === "error" ? "#a8321f"
        : this.state.capFase === "esperando" ? "#8fb4d3" : BLUE,
      capCamClase: "ph-duotone "
        + (this.state.capFase === "ok" ? "ph-check-circle"
          : this.state.capFase === "error" ? "ph-warning-circle"
          : this.state.capEtiqueta === "huella" ? "ph-fingerprint" : "ph-scan-smiley")
        + (this.state.capFase === "esperando" ? " rrhh-latido" : ""),
      /* La barra inferior toma el color del estado: en éxito o error el azul
         oscuro chocaba con el marco verde o rojo del recuadro. */
      capCamPieFondo: this.state.capFase === "ok" ? "rgba(28,95,58,0.90)"
        : this.state.capFase === "error" ? "rgba(168,50,31,0.90)"
        : "rgba(14,61,105,0.82)",
      capCamPie: this.state.capFase === "ok" ? "Captura completa"
        : this.state.capFase === "error" ? "Sin captura"
        : this.state.capFase === "esperando"
          ? (this.state.capEtiqueta === "huella" ? "Leyendo huella…" : "Reconociendo…")
          : "Conectando con el terminal",

      capTitulo: this.state.capFase === "ok" ? "Captura correcta"
        : this.state.capFase === "error" ? "No se completó la captura"
        : this.state.capFase === "esperando"
          ? (this.state.capEtiqueta === "huella" ? "Leyendo huella…" : "Reconociendo…")
          : "Enviando comando…",
      capTituloColor: this.state.capFase === "ok" ? GREEN_D
        : this.state.capFase === "error" ? RED_D : BLUE_D,
      capMensaje: this.state.capMsg || "",

      capMultipaso: (this.state.capTotalPasos || 1) > 1,
      capPaso: this.state.capPaso || 1,
      capTotalPasos: this.state.capTotalPasos || 1,
      /* En éxito todos los pasos quedan completados: ninguno sigue "en curso" */
      capPasos: Array.from({ length: this.state.capTotalPasos || 1 }, (_, i) => ({
        color: this.state.capFase === "ok" ? GREEN
          : i < (this.state.capPaso || 1) - 1 ? GREEN
          : i === (this.state.capPaso || 1) - 1 ? BLUE : "#c9d4de"
      })),
      capRestante: (() => {
        const s = this.state.capRestante || 0;
        return String(Math.floor(s / 60)) + ":" + String(s % 60).padStart(2, "0");
      })(),
      capStaffNumber: this.state.capSn ? String(this.state.capSn) : "",

      capAviso: !this.state.backendVivo
        ? "No hay conexión con el servidor local. Abre la interfaz desde http://127.0.0.1:7801/ (ejecuta iniciar.bat), no abriendo el archivo directamente."
        : (!this.state.backendConfigurado
          ? ("Falta configurar el acceso a yunatt en backend/.env: " + (this.state.backendFaltan || []).join(", ") + ". La captura no podrá salir hacia el terminal hasta completarlo.")
          : ""),

      fecha: this.state.fecha || this.fechaHoy(),
      onFecha: (e) => this.setState({ fecha: e.target.value, syncMsg: "" }, () => { this.cargarPersonas(); this.cargarRango(); }),

/*§CORTE§ linea original 10487 §*/
      /* ── Candidatos a enrolar ─────────────────────────────────────────
         Salen de /api/candidatos, que devuelve a quien tenga ficha activa y
         todavía no tenga identidad biométrica. Las tres entidades conviven
         en la misma lista porque el terminal no distingue: para él todos
         son un staffNumber. */
      /* El terminal instalado puede no tener lector de huella. El backend
         ya lo dice en metodos_disponibles; ofrecer un botón que va a fallar
         es peor que no ofrecerlo. */
      hayHuella: !this.state.metodosDisponibles
                 || this.state.metodosDisponibles.indexOf("huella") >= 0,
/*§CORTE§ linea original 10497 §*/
      /* ── Quiénes están enrolados de verdad ───────────────────────────
         Enrolado es lo que el terminal confirmó, no que exista la fila: la
         fila se crea al pedir el enrolamiento. Se lee de 'enrolado', que
         lo calcula la base en un solo sitio. */
      bioEnrolados: (this.state.identidades || [])
        .filter((i) => i.enrolado)
        .map((i) => {
          const pinta = {
            personal:     ["ph-identification-card", BLUE_T,  BLUE_D,  "Trabajador"],
            responsable:  ["ph-user-focus",          GREEN_T, GREEN_D, "Responsable"],
            beneficiario: ["ph-baby",                BLUE_T,  BLUE_D,  "Beneficiario"],
          }[i.tipo] || ["ph-user", "#f0ede9", "#5b7185", i.tipo];
          const metodos = [];
          if (i.tiene_rostro) metodos.push("Rostro");
          if (i.tiene_huella) metodos.push("Huella");
          return {
            sn: i.staff_number,
            nombre: i.nombre,
            detalle: metodos.join(" y ") + " · enrolado en el terminal",
            tipo: pinta[3], icono: pinta[0], tint: pinta[1], dark: pinta[2],
            estiloTipo: "font-size:11px; padding:3px 9px; border-radius:2px; "
              + "white-space:nowrap; flex:none; color:" + pinta[2]
              + "; background:" + pinta[1] + ";",
            quitar: () => this.pedirBorrado(i.staff_number, i.nombre),
          };
        }),
      bioHayEnrolados: (this.state.identidades || []).some((i) => i.enrolado),
      bioSinEnrolados: !(this.state.identidades || []).some((i) => i.enrolado),

      /* Aquí se contaba quién tenía rostro registrado para marcar por
         el celular. Se retiró con su bloque de pantalla: marcar en el
         terminal o por el celular es una elección, no un trámite
         pendiente, y la lista lo presentaba como una falta. */

      /* ══ Gráficos ═══════════════════════════════════════════════════
         Barras de caja, como en el Dashboard. Un cero se dibuja de 3 px
         para que se vea que es cero y no que falta el dato. */

      /* ── Personal por área ─────────────────────────────────────────── */
      gpAreas: (() => {
        const cuenta = {};
        (this.state.personal || []).forEach((p) => {
          const a = (p.area || "").trim() || "Sin área asignada";
          cuenta[a] = (cuenta[a] || 0) + 1;
        });
        const claves = Object.keys(cuenta).sort((x, y) => cuenta[y] - cuenta[x]);
        if (!claves.length) return [];
        const mayor = cuenta[claves[0]];
        /* Ocho barras y el resto agrupado: una lista de veinte áreas con
           una persona cada una no es un gráfico, es un listado. */
        const visibles = claves.slice(0, 8);
        const resto = claves.slice(8).reduce((s, k) => s + cuenta[k], 0);
        const filas = visibles.map((k) => ({
          nombre: k, n: String(cuenta[k]),
          ancho: Math.max(2, Math.round(cuenta[k] / mayor * 100)) + "%",
          tono: k === "Sin área asignada" ? "#c9d4de" : BLUE,
        }));
        if (resto) filas.push({
          nombre: "Otras " + claves.slice(8).length + " áreas",
          n: String(resto),
          ancho: Math.max(2, Math.round(resto / mayor * 100)) + "%",
          tono: "#9aa7b2",
        });
        return filas;
      })(),
      gpHayAreas: (this.state.personal || []).length > 0,
      gpSinAreas: (this.state.personal || []).length === 0,
      gpAreasNota: (() => {
        const t = (this.state.personal || []).length;
        const sin = (this.state.personal || [])
          .filter((p) => !(p.area || "").trim()).length;
        if (!t) return "Todavía no hay fichas de personal registradas.";
        if (!sin) return "Las " + t + " fichas tienen área asignada.";
        return sin + " de " + t + " fichas no tienen área asignada.";
      })(),

      /* ── Dónde está el equipo ──────────────────────────────────────── */
      gpSedes: (() => {
        const cuenta = {};
        (this.state.personal || []).forEach((p) => {
          const s = (p.sede || "").trim() || "Sin sede";
          cuenta[s] = (cuenta[s] || 0) + 1;
        });
        const claves = Object.keys(cuenta).sort((x, y) => cuenta[y] - cuenta[x]);
        if (!claves.length) return [];
        const total = claves.reduce((s, k) => s + cuenta[k], 0);
        return claves.map((k) => ({
          nombre: k, n: String(cuenta[k]),
          pct: Math.round(cuenta[k] / total * 100) + " %",
          ancho: Math.round(cuenta[k] / total * 100) + "%",
          tono: k === "Sin sede" ? "#c9d4de" : (k === "Comas" ? GREEN : BLUE),
        }));
      })(),

      /* ── Quién marcó, día a día ────────────────────────────────────── */
      asDias: (() => {
        const gente = this.state.asTendencia || [];
        if (!gente.length) return [];
        /* Se cuentan PERSONAS con entrada, no marcas: dos marcas de la
           misma persona en un día no son dos asistencias. */
        const porDia = {};
        gente.forEach((p) => {
          const dias = p.dias || {};
          Object.keys(dias).forEach((f) => {
            if (!porDia[f]) porDia[f] = 0;
            if ((dias[f] || {}).entrada) porDia[f] += 1;
          });
        });
        /* Se recorren los CATORCE días, no los que tienen marca: si los
           sábados no se dibujan, el gráfico enseña una semana continua
           que no existió. Un cero es un dato; un hueco, no. */
        const fechas = [];
        const cursor = new Date((this.state.asTendenciaDesde || "") + "T12:00:00");
        const fin = new Date((this.state.asTendenciaHasta || "") + "T12:00:00");
        if (isNaN(cursor) || isNaN(fin)) return [];
        while (cursor <= fin) {
          const f = cursor.toISOString().slice(0, 10);
          fechas.push(f);
          if (!(f in porDia)) porDia[f] = 0;
          cursor.setDate(cursor.getDate() + 1);
        }
        if (!fechas.length) return [];
        const mayor = Math.max.apply(null, fechas.map((f) => porDia[f])) || 1;
        const hoy = new Date().toISOString().slice(0, 10);
        /* X para el miércoles, como se escribe en los calendarios de aquí: dos
           M seguidas no se distinguen. */
        const DIAS = ["D", "L", "M", "X", "J", "V", "S"];
        return fechas.map((f) => {
          const n = porDia[f];
          const d = new Date(f + "T12:00:00");
          return {
            fecha: f, n: String(n),
            dia: DIAS[d.getDay()],
            numero: String(d.getDate()),
            alto: n ? Math.max(6, Math.round(n / mayor * 100)) + "%" : "3px",
            tono: f === hoy ? GREEN : (n ? BLUE : "#dcd9d5"),
            tonoDia: f === hoy ? GREEN_D : "#7d8e9c",
          };
        });
      })(),
      asHayDias: (() => {
        const gente = this.state.asTendencia || [];
        return gente.some((p) => Object.keys(p.dias || {}).length);
      })(),
      asDiasNota: (() => {
        const gente = this.state.asTendencia || [];
        if (!gente.length) return "Todavía no hay marcas registradas en las "
          + "dos últimas semanas.";
        return "Personas distintas con marca de entrada, de "
          + (this.state.asTendenciaDesde || "") + " a "
          + (this.state.asTendenciaHasta || "") + ".";
      })(),

      /* ── A qué hora se entra ───────────────────────────────────────── */
      asHoras: (() => {
        const gente = this.state.asTendencia || [];
        const cuenta = {};
        gente.forEach((p) => {
          const dias = p.dias || {};
          Object.keys(dias).forEach((f) => {
            const e = (dias[f] || {}).entrada;
            if (!e) return;
            const h = Number(String(e).slice(0, 2));
            if (isNaN(h)) return;
            cuenta[h] = (cuenta[h] || 0) + 1;
          });
        });
        const horas = Object.keys(cuenta).map(Number).sort((a, b) => a - b);
        if (!horas.length) return [];
        const mayor = Math.max.apply(null, horas.map((h) => cuenta[h]));
        const filas = [];
        /* De la primera hora a la última, sin saltarse las vacías: un
           hueco en medio es información. */
        for (let h = horas[0]; h <= horas[horas.length - 1]; h++) {
          const n = cuenta[h] || 0;
          filas.push({
            hora: String(h).padStart(2, "0"), n: String(n),
            alto: n ? Math.max(6, Math.round(n / mayor * 100)) + "%" : "3px",
            tono: n ? BLUE : "#dcd9d5",
          });
        }
        return filas;
      })(),
      asSinDias: !((this.state.asTendencia || [])
        .some((p) => Object.keys(p.dias || {}).length)),
      asSinHoras: !((this.state.asTendencia || [])
        .some((p) => Object.keys(p.dias || {})
          .some((f) => ((p.dias[f] || {}).entrada)))),
      asHayHoras: (() => {
        const gente = this.state.asTendencia || [];
        return gente.some((p) => Object.keys(p.dias || {})
          .some((f) => ((p.dias[f] || {}).entrada)));
      })(),

      /* ── Estado del terminal ─────────────────────────────────────────
         Tres situaciones y tres mensajes: sin credenciales no puede ni
         intentarlo; con credenciales y sesión, está listo; con
         credenciales y un error apuntado, se enseña el error, que es lo
         que hace falta para arreglarlo. */
      ytHay: !!this.state.terminal,
      ytColor: (() => {
        const t = this.state.terminal;
        if (!t) return "#9aa7b2";
        if (!t.configurado) return RED_D;
        return t.ultimo_error ? GOLD_D : GREEN_D;
      })(),
      ytTint: (() => {
        const t = this.state.terminal;
        if (!t) return "#f0ede9";
        if (!t.configurado) return RED_T;
        return t.ultimo_error ? GOLD_T : GREEN_T;
      })(),
      ytTitulo: (() => {
        const t = this.state.terminal;
        if (!t) return "No se pudo consultar el estado del terminal";
        if (!t.configurado) return "El terminal no está configurado";
        if (t.ultimo_error) return "El terminal dio un error la última vez";
        return t.sesion_activa ? "Terminal conectado"
                               : "Terminal configurado, sin sesión abierta";
      })(),
      ytDetalle: (() => {
        const t = this.state.terminal;
        if (!t) return "Vuelve a entrar a esta pantalla para reintentarlo.";
        if (!t.configurado)
          return "Faltan credenciales de yunatt: " + (t.faltan || []).join(", ")
            + ". Sin ellas no se puede enrolar a nadie ni traer marcas.";
        if (t.ultimo_error) return String(t.ultimo_error).slice(0, 220);
        return t.sesion_activa
          ? "Hay sesión abierta con yunatt. Enrolar y sincronizar deberían funcionar."
          : "Se abrirá sola en la primera operación. No es un problema.";
      })(),
      ytEquipo: (() => {
        const t = this.state.terminal;
        if (!t || !t.configurado) return "";
        return "Dispositivo " + (t.dispositivo || "sin id")
          + " · departamento " + (t.departamento || "sin nombre")
          + (t.departamento_fijado_a_mano ? " (fijado a mano)" : "");
      })(),
      ytHayEquipo: !!(this.state.terminal && this.state.terminal.configurado),

      bioAlDia: this.state.bioAlDia || "",
      bioHayAlDia: !!this.state.bioAlDia,
      bioBusca: this.state.bioBusca || "",
      onBioBusca: (e) => this.setState({ bioBusca: e.target.value }),

      candLista: this.filtradas(this.state.candidatos || [],
                                ["nombre", "cargo", "detalle", "tipo"],
                                this.state.bioBusca).map((c) => {
        const pinta = {
          personal:     ["ph-identification-card", BLUE_T,  BLUE_D,  "Trabajador"],
          responsable:  ["ph-user-focus",          GREEN_T, GREEN_D, "Responsable"],
          beneficiario: ["ph-baby",                BLUE_T,  BLUE_D,  "Beneficiario"],
        }[c.tipo] || ["ph-user", "#f0ede9", "#5b7185", c.tipo];
        return {
          nombre: c.nombre,
          detalle: c.detalle || "Sin detalle",
          tipo: pinta[3],
          icono: pinta[0], tint: pinta[1], dark: pinta[2],
          estiloTipo: "font-size:11px; padding:3px 9px; border-radius:2px; "
            + "white-space:nowrap; flex:none; color:" + pinta[2]
            + "; background:" + pinta[1] + ";",
          estiloBoton: "display:flex; align-items:center; gap:6px; padding:7px 13px; "
            + "border:1px solid #c9d4de; border-radius:2px; background:#ffffff; "
            + "font-size:13px; font-weight:600; color:#3c4a55; white-space:nowrap;",
          /* Un intento previo cambia lo que hay que hacer: no es lo mismo
             enrolar por primera vez que repetir algo que se canceló. */
          hayIntento: !!c.intento_sn,
          intento: c.intento_estado === "error"
            ? ("Intento anterior sin terminar" + (c.intento_detalle ? " · " + c.intento_detalle : ""))
            : c.intento_estado === "esperando"
              ? "Quedó esperando la captura en el terminal"
              : c.intento_estado
                ? ("Intento anterior: " + c.intento_estado)
                : "",
          rostro: () => this.iniciarCaptura(c.tipo, c.id, "facial"),
          huella: () => this.iniciarCaptura(c.tipo, c.id, "huella"),
        };
      }),
      cancelarCaptura: () => this.cancelarCaptura(),
      reintentarCaptura: () => this.reintentarCaptura(),
      cerrarCaptura: () => this.cerrarCaptura(),
      attDiaria: at === "diaria", attSemanal: at === "semanal", attJust: at === "just", attCal: at === "cal",
      metodos: [
        {key:"todos", label:"Todos", icon:"ph-users-three", count:String(enrol[0]), iconColor:BLUE},
        {key:"facial", label:"Rostro", icon:"ph-scan-smiley", count:String(enrol[1]), iconColor:BLUE},
        {key:"huella", label:"Huella", icon:"ph-fingerprint", count:String(enrol[2]), iconColor:GREEN}
      ].map(mt => ({
        ...mt,
        style: "display:flex; align-items:center; gap:9px; padding:8px 14px; border-radius:2px; font-size:14px; border:1px solid "
          + (mtd === mt.key ? BLUE + "; background:#e4eef7; color:" + BLUE_D + ";" : "#c9d4de; color:#3c4a55;"),
        go: () => this.setState({ metodo: mt.key })
      })),
      /* En la vista de beneficiarios sale quien esté registrado de verdad.
         Si no hay nadie, la rejilla queda vacía: antes se rellenaba con
         nueve marcadores de la maqueta.

         OJO: al retirar los valores muertos me llevé por delante el cierre
         de este comentario, y desde aquí quedó comentado medio renderVals.
         La cola de enrolamiento aparecía vacía sin que nada dijera por
         qué. Corregido el 31/08/2026. */
