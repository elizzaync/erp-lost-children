  cargarBandeja() {
    return this.api("/api/formulario/respuestas")
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ bandeja: d.respuestas || [],
                        bjCredencial: d.hay_credencial !== false,
                        bjSondeo: d.sondeo || null });
      })
      .catch(() => {});
  }

  /* Traer es ir a buscar a la hoja lo que aún no estaba. No ingresa nada:
     dejarlo en la bandeja es justamente el trato. */
/*§CORTE§ linea original 5122 §*/
  traerRespuestas() {
    if (this.state.bjOcupado) return;
    this.setState({ bjOcupado: true, bjMsg: "", bjMal: false });
    this.api("/api/formulario/traer", { method: "POST", body: "{}" })
      .then((d) => {
        if (!this._vivo) return;
        const r = d.resumen || {};
        this.setState({
          bjOcupado: false, bandeja: d.respuestas || [], bjMal: false,
          bjMsg: r.nuevas
            ? (r.nuevas === 1 ? "Llegó 1 respuesta nueva."
                              : "Llegaron " + r.nuevas + " respuestas nuevas.")
            : "No hay respuestas nuevas. " + (r.leidas || 0) + " ya estaban.",
        });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ bjOcupado: false, bjMal: true,
                                        bjMsg: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5143 §*/
  ingresarRespuesta(r) {
    if (this.state.bjOcupado) return;
    this.setState({ bjOcupado: true, bjMsg: "", bjMal: false });
    this.api("/api/formulario/respuestas/" + r.id + "/ingresar",
             { method: "POST", body: JSON.stringify({ cambios: {} }) })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({
          bjOcupado: false, bandeja: d.respuestas || [],
          responsables: d.responsables || this.state.responsables, bjMal: false,
          /* Se salta al filtro donde acaba de caer: si la fila solo
             desapareciera de «Por revisar», parecería que se perdió. */
          bjFiltro: "ingresada",
          bjMsg: (d.creado ? "Ficha creada: " : "Ficha actualizada: ")
                 + ((d.responsable || {}).nombre || "")
                 + ". Está aquí, en «Ingresadas».",
        });
        /* La ficha nueva también cambia estas dos pantallas. */
        this.cargarPersonas();
        this.cargarResumenPersonas();
      })
      .catch((e) => {
        if (this._vivo) this.setState({ bjOcupado: false, bjMal: true,
                                        bjMsg: String(e.message || e) });
      });
  }

  /* «Editar e ingresar» abre la ficha con lo que llegó ya puesto. Se guarda
     desde el formulario de siempre, con sus mismas validaciones: una ficha
     que entra por aquí no puede quedar peor comprobada que una escrita a
     mano. */
/*§CORTE§ linea original 5174 §*/
  editarRespuesta(r) {
    const v = r.valores || {};
    this.abrirResponsable(null);
    this.setState({
      rspNombre: v.nombre || "", rspDoc: v.documento || "",
      rspNac: v.fecha_nac || "", rspSexo: v.sexo || "",
      rspNacionalidad: v.nacionalidad || "", rspTel: v.telefono || "",
      rspTel2: v.telefono_alt || "", rspCorreo: v.correo || "",
      rspDepto: v.departamento || "", rspProv: v.provincia || "",
      rspDistrito: v.distrito || "", rspDireccion: v.direccion || "",
      rspRef: v.referencia || "", rspOcupacion: v.ocupacion || "",
      rspSituacion: v.situacion_laboral || "", rspCentro: v.centro_trabajo || "",
      rspTipoTrabajo: v.tipo_trabajo || "", rspIngresos: v.rango_ingresos || "",
      rspACargo: String(v.personas_a_cargo || ""), rspNota: v.nota || "",
      /* Al guardar, la respuesta se marca ingresada: sin esto quedaría en
         la bandeja para siempre y alguien la ingresaría dos veces. */
      rspDesdeRespuesta: r.id,
    });
  }

/*§CORTE§ linea original 5194 §*/
  descartarRespuesta(r) {
    const motivo = window.prompt(
      "¿Por qué se descarta esta respuesta?\n\nQueda escrito junto a ella.");
    if (motivo === null) return;
    if (!String(motivo).trim()) {
      this.setState({ bjMal: true, bjMsg: "Hay que decir por qué se descarta." });
      return;
    }
    this.api("/api/formulario/respuestas/" + r.id + "/descartar",
             { method: "POST", body: JSON.stringify({ motivo: motivo }) })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ bandeja: d.respuestas || [], bjMal: false,
                        bjFiltro: "descartada",
                        bjMsg: "Respuesta descartada. Está aquí, en «Descartadas»." });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ bjMal: true, bjMsg: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5215 §*/
  cargarInvitaciones() {
    return this.api("/api/invitaciones")
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ invLista: d.invitaciones || [], invConfig: !!d.configurado });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ invErr: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5226 §*/
  crearInvitacion() {
    if (this.state.invOcupado) return;
    const st = this.state;
    const cuerpo = {
      responsable_id: st.invPara ? Number(st.invPara) : null,
      etiqueta: st.invPara ? "" : (st.invEtiqueta || "").trim(),
      dias: Number(st.invDias) || 30,
    };
    this.setState({ invOcupado: true, invErr: "" });
    this.api("/api/invitaciones", { method: "POST", body: JSON.stringify(cuerpo) })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({
          invOcupado: false, invLista: d.invitaciones || [],
          /* Se limpian los campos: el siguiente enlace es para otra
             familia, y dejar el nombre anterior puesto invita a crear dos
             veces el mismo. */
          invPara: "", invEtiqueta: "",
        });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ invOcupado: false, invErr: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5251 §*/
  anularInvitacion(iv) {
    this.api("/api/invitaciones/" + iv.id + "/anular",
             { method: "POST", body: JSON.stringify({ motivo: "" }) })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ invLista: d.invitaciones || [] });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ invErr: String(e.message || e) });
      });
  }

  /* Copiar al portapapeles puede fallar —permisos del navegador, o una
     página servida sin cifrar—; entonces se selecciona el enlace para que
     se pueda copiar a mano en vez de dejar al usuario sin nada. */
/*§CORTE§ linea original 5266 §*/
  copiarEnlace(iv) {
    const listo = () => { if (this._vivo) this.setState({ invCopiado: iv.id, invErr: "" }); };
    try {
      navigator.clipboard.writeText(iv.enlace).then(listo).catch(() => this.copiarAMano(iv));
    } catch (e) {
      this.copiarAMano(iv);
    }
  }

/*§CORTE§ linea original 5275 §*/
  copiarAMano(iv) {
    const caja = document.createElement("textarea");
    caja.value = iv.enlace;
    caja.style.position = "fixed";
    caja.style.opacity = "0";
    document.body.appendChild(caja);
    caja.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(caja);
    if (!this._vivo) return;
    this.setState(ok ? { invCopiado: iv.id, invErr: "" }
                     : { invErr: "No se pudo copiar solo. El enlace es: " + iv.enlace });
  }

/*§CORTE§ linea original 8167 §*/
      /* ── Bandeja de revisión ─────────────────────────────────────────
         El filtro por defecto es "" = lo que está por resolver, que es a
         lo que se viene a esta pantalla. */
      gpFiltros: [
        { clave: "",          label: "Por resolver" },
        { clave: "aprobada",  label: "Aprobadas" },
        { clave: "rechazada", label: "Rechazadas" },
        { clave: "todas",     label: "Todas" },
      ].map((f) => {
        const r = this.state.gsResumen || {};
        const n = f.clave === ""          ? r.por_resolver
                : f.clave === "todas"     ? null
                : r[f.clave];
        const activo = (this.state.gsFiltro || "") === f.clave;
        return {
          label: f.label,
          cuenta: (n === null || n === undefined) ? "" : ("  " + n),
          estilo: "display:flex; align-items:center; gap:7px; padding:8px 15px; "
            + "border-radius:2px; font-size:14px; border:1px solid "
            + (activo ? BLUE + "; background:#ffffff; color:" + BLUE_D
                      + "; font-weight:600;"
                      : "#c9d4de; color:#3c4a55;"),
          go: () => this.cargarPermisos(f.clave),
        };
      }),

      gsAviso: this.state.gsAviso || "",
      gsVacio: (this.state.gsLista || []).length === 0,
      gsHay: (this.state.gsLista || []).length > 0,
      gsVacioTitulo: (this.state.gsFiltro || "") === ""
        ? "No hay nada esperando tu respuesta"
        : "Ninguna solicitud en este estado",
      gsVacioNota: (this.state.gsFiltro || "") === ""
        ? "Cuando alguien del equipo pida un permiso desde «Mis Permisos», "
        + "aparecerá aquí para que lo apruebes o lo rechaces."
        : "Prueba con otro filtro: «Todas» las muestra sin importar el estado.",

/*§CORTE§ linea original 8204 §*/
      /* ── Resumen de la bandeja ───────────────────────────────────────
         Cuatro cuentas sobre lo que hay de verdad. Se cuentan los dos
         estados de pendiente juntos —espera al jefe y espera a
         Administración— porque para quien mira la bandeja las dos son
         «todavía sin resolver». */
      gsTarjetas: (() => {
        const todas = this.state.gsLista || [];
        const cuantas = (f) => todas.filter(f).length;
        return [
          { label: "Total", valor: String(todas.length), tint: BLUE_T, dark: BLUE_D,
            nota: todas.length ? "solicitudes registradas" : "todavía no hay ninguna" },
          { label: "Pendientes", valor: String(cuantas((x) => String(x.estado).startsWith("pendiente"))),
            tint: GOLD_T, dark: GOLD_D, nota: "esperan una firma" },
          { label: "Aprobadas", valor: String(cuantas((x) => x.estado === "aprobada")),
            tint: GREEN_T, dark: GREEN_D, nota: "resueltas a favor" },
          { label: "Rechazadas", valor: String(cuantas((x) => x.estado === "rechazada")),
            tint: RED_T, dark: RED_D, nota: "con su motivo escrito" },
        ];
      })(),

      /* El filtro por tipo se arma con los tipos que el servidor declara,
         no con una lista escrita aquí: si mañana se añade uno, aparece. */
      gsTipos: [{ valor: "", etiqueta: "Todos los tipos" }].concat(
        (this.state.misTipos || []).map((t) => ({
          valor: t.valor, etiqueta: t.etiqueta,
        }))),
      gsTipo: st.gsTipo,
      onGsTipo: (e) => this.setState({ gsTipo: e.target.value }),
      gsBusca: st.gsBusca,
      onGsBusca: (e) => this.setState({ gsBusca: e.target.value }),
      gsMostrando: (() => {
        const total = (this.state.gsLista || []).length;
        const vistas = this.solicitudesVisibles().length;
        if (!total) return "";
        return vistas === total ? (total === 1 ? "1 solicitud" : total + " solicitudes")
                                : vistas + " de " + total;
      })(),

      gsLista: this.solicitudesVisibles().map((x) => {
        const pinta = {
          pendiente:       [GOLD,  GOLD_T,  GOLD_D,  "Espera tu respuesta"],
          pendiente_admin: [GOLD,  GOLD_T,  GOLD_D,  "Espera a Administración"],
          aprobada:        [GREEN, GREEN_T, GREEN_D, "Aprobada"],
          rechazada:       [RED,   RED_T,   RED_D,   "Rechazada"],
          cancelada:       ["#9aa7b2", "#f0ede9", "#5b7185", "Cancelada"],
        }[x.estado] || ["#9aa7b2", "#f0ede9", "#5b7185", x.estado];
        /* Un permiso largo no se cierra con la firma de la jefatura: pasa
           después a Administración. Decirlo EN LA FILA evita que alguien
           apruebe creyendo que ya está resuelto — el botón lo avisa, pero
           el botón se lee al final, y la columna de estado se lee antes. */
        if (x.estado === "pendiente" && x.requiere_admin)
          pinta[3] = "Espera tu respuesta · luego Administración";
        const acciones = x.acciones || [];
        /* Un color por tipo, estable: el mismo permiso se reconoce de un
           vistazo en cualquier fila. */
        /* Los diez tipos del papel, agrupados por familia y con los
           colores de la casa. No se inventa un color por tipo: diez tonos
           distintos no se distinguen entre sí, y menos por alguien que no
           ve bien el color. Descanso en azul, trabajo fuera en verde,
           horas en ámbar, salud en rojo. */
        const tinta = {
          vacaciones: [BLUE_T, BLUE_D], libres: [BLUE_T, BLUE_D],
          personal: ["#efe7f5", "#5b3a7a"],
          medico: [RED_T, RED_D],
          comision: [GREEN_T, GREEN_D], transferencia: [GREEN_T, GREEN_D],
          capacitacion: [GREEN_T, GREEN_D],
          permanencia: [GOLD_T, GOLD_D], recuperacion: [GOLD_T, GOLD_D],
          otro: ["#f0ede9", "#5b7185"],
        }[x.tipo] || ["#f0ede9", "#5b7185"];
        const motivo = x.motivo || "Sin motivo indicado";
        return {
          persona: x.persona,
          cargo: x.cargo || "Sin cargo registrado",
          iniciales: ini(x.persona) || "?",
          iniTint: tinta[0], iniColor: tinta[1],
          tipoEtiqueta: x.tipo_etiqueta,
          estiloTipo: "font-size:11.5px; padding:4px 9px; border-radius:2px; "
            + "white-space:nowrap; display:inline-block; color:" + tinta[1]
            + "; background:" + tinta[0] + ";",
          duracion: x.dias === 1 ? "1 día" : x.dias + " días",
          /* El motivo se recorta en la fila y entero al abrirla: una
             columna que crece rompe la tabla, y perderlo no es opción. */
          motivoCorto: motivo.length > 42 ? motivo.slice(0, 41) + "…" : motivo,
          motivoLargo: motivo,
          abierta: st.gsAbierta === x.id,
          revisarLabel: st.gsAbierta === x.id ? "Cerrar" : "Revisar",
          /* El documento se baja en cualquier estado: quien archiva lo
             necesita sobre todo cuando ya está resuelta. */
          verDocumento: () => window.open("/api/permisos/" + x.id + "/documento.pdf", "_blank"),
          revisar: () => this.setState({ gsAbierta: st.gsAbierta === x.id ? null : x.id }),
          estado: pinta[3],
          color: pinta[0],
          estiloEstado: "font-size:11px; padding:3px 9px; border-radius:2px; "
            + "white-space:nowrap; color:" + pinta[2] + "; background:" + pinta[1] + ";",
          periodo: x.desde === x.hasta ? x.desde : (x.desde + " → " + x.hasta),
          titulo: x.tipo_etiqueta + " · " + (x.dias === 1 ? "1 día" : x.dias + " días"),
          detalle: (x.motivo || "Sin motivo indicado")
            + (x.requiere_admin ? " · pasa del umbral, necesita las dos firmas" : ""),
          tieneNota: !!x.nota,
          nota: x.nota,
          hayAcciones: acciones.indexOf("aprobar") >= 0
                    || acciones.indexOf("rechazar") >= 0,
          puedeAprobar: acciones.indexOf("aprobar") >= 0,
          puedeRechazar: acciones.indexOf("rechazar") >= 0,
          /* Si es larga y solo pasó por la jefatura, aprobar NO la cierra:
             la manda a Administración. Decirlo en el propio botón evita
             que alguien crea que ya está resuelta. */
          etiquetaAprobar: (x.estado === "pendiente" && x.requiere_admin)
            ? "Firmar y dar el visto bueno" : "Firmar y aprobar",
          /* Aprobar pasa por la firma: el documento archivado tiene que
             enseñar quién autorizó, no solo decirlo. */
          aprobar: () => this.abrirFirma(x),
          rechazar: () => this.setState({
            modal: "rechazar", modalError: "", grId: x.id, grNota: "",
            grDetalle: x.persona + " · " + x.tipo_etiqueta + " · "
                       + (x.desde === x.hasta ? x.desde : (x.desde + " a " + x.hasta)),
          }),
        };
      }),

      modalRechazar: this.state.modal === "rechazar",
      grDetalle: this.state.grDetalle || "",
      grNota: this.state.grNota || "",
      onGrNota: (e) => this.setState({ grNota: e.target.value, modalError: "" }),

/*§CORTE§ linea original 9009 §*/
      /* ── La bandeja del formulario ───────────────────────────────── */
      isBandeja: v === "bandeja",
      bjSinCredencial: !st.bjCredencial,
      bjTraer: () => this.traerRespuestas(),
      bjTraerLabel: st.bjOcupado ? "Trayendo…" : "Traer respuestas",
      /* Cuándo miró el sistema la hoja por su cuenta. Un trabajo que corre
         solo y no se puede observar no es de fiar, aunque funcione: sin
         esto no hay forma de distinguir «no había nada» de «no corrió». */
      bjSondeoTexto: (() => {
        const s2 = st.bjSondeo;
        if (!s2) return "";
        if (!s2.cada) return "Revisión automática desactivada · solo llegan al pulsar el botón.";
        if (!s2.cuando) return "Revisión automática cada " + s2.cada
          + " min · todavía no ha mirado desde que arrancó el servidor.";
        return "Última revisión automática: " + String(s2.cuando).slice(11, 16)
          + " · " + s2.resultado + " · mira cada " + s2.cada + " min.";
      })(),
      bjSondeoHay: !!st.bjSondeo,
      bjSondeoColor: (st.bjSondeo && st.bjSondeo.ok === false) ? RED_D : "#7d8e9c",
      bjHayMsg: !!st.bjMsg,
      bjMsg: st.bjMsg || "",
      bjMsgColor: st.bjMal ? RED_D : GREEN_D,
      bjMsgTint: st.bjMal ? RED_T : GREEN_T,
      bjFiltros: [
        ["por_revisar", "Por revisar"],
        ["ingresada", "Ingresadas"],
        ["descartada", "Descartadas"],
      ].map(([clave, label]) => ({
        label: label,
        cuenta: String((st.bandeja || []).filter((x) => x.estado === clave).length),
        estilo: "padding:7px 14px; border-radius:2px; font-size:13.5px; border:1px solid "
          + (st.bjFiltro === clave ? "#1462a5; background:#e4eef7; color:#0e3d69; font-weight:600;"
                                   : "#c9d4de; background:#ffffff; color:#3c4a55;"),
        go: () => this.setState({ bjFiltro: clave, bjMsg: "" }),
      })),
      bjVacia: (st.bandeja || []).filter((x) => x.estado === st.bjFiltro).length === 0,
      bjVaciaTitulo: st.bjFiltro === "por_revisar" ? "No hay nada por revisar"
        : st.bjFiltro === "ingresada" ? "Todavía no se ha ingresado ninguna"
        : "No se ha descartado ninguna",
      bjVaciaNota: st.bjFiltro === "por_revisar"
        ? "Cuando una familia envíe el formulario, su respuesta aparecerá aquí. Pulsa «Traer respuestas» para buscar las que haya."
        : "Las respuestas resueltas se conservan: son el rastro de qué se hizo con lo que cada familia envió.",
      busBandeja: st.busBandeja || "",
      onBusBandeja: (e) => this.setState({ busBandeja: e.target.value }),
      hayBusBandeja: !!String(st.busBandeja || "").trim(),
      limpiarBusBandeja: () => this.setState({ busBandeja: "" }),

      bjLista: (st.bandeja || [])
        .filter((x) => x.estado === st.bjFiltro)
        /* Se busca sobre los valores ya limpios, no sobre el texto crudo:
           así «Ana» no devuelve respuestas donde Ana es el nombre del niño
           y no el de quien responde. */
        .filter((x) => {
          const t = String(st.busBandeja || "").trim().toLowerCase();
          if (!t) return true;
          const v = x.valores || {};
          return ["nombre", "apellidos", "documento", "telefono", "correo"]
            .some((c) => String(v[c] == null ? "" : v[c]).toLowerCase().indexOf(t) >= 0);
        })
        .map((r) => {
          const val = r.valores || {};
          const avisos = r.avisos || [];
          const negada = !r.consentimiento;
          /* Tres colores y un solo criterio: rojo lo que no se puede
             ingresar, ámbar lo que hay que mirar, blanco lo limpio. */
          const acento = negada ? RED : (avisos.length ? GOLD : "#c9d4de");
          let cruda = [];
          try {
            const c = JSON.parse(r.cruda || "{}");
            cruda = Object.keys(c).map((k) => ({ pregunta: k, valor: String(c[k] || "—") }));
          } catch (e) { cruda = []; }
          return {
            id: r.id,
            nombre: val.nombre || "(sin nombre)",
            recibida: String(r.recibida || "").slice(0, 16),
            paraQuien: r.para ? ("Enlace de: " + r.para) : "Sin enlace reconocido",
            borde: negada ? RED_T : "#e2ddd6",
            acento: acento,
            estadoLabel: negada ? "No autorizó"
              : r.estado === "ingresada" ? "Ingresada"
              : r.estado === "descartada" ? "Descartada" : "Por revisar",
            estiloEstado: "font-size:11.5px; letter-spacing:0.05em; text-transform:uppercase; padding:3px 9px; border-radius:2px; white-space:nowrap; "
              + (negada ? "background:" + RED_T + "; color:" + RED_D + ";"
                 : r.estado === "ingresada" ? "background:" + GREEN_T + "; color:" + GREEN_D + ";"
                 : r.estado === "descartada" ? "background:#f0ede9; color:#5b7185;"
                 : "background:" + BLUE_T + "; color:" + BLUE_D + ";"),
            hayAvisos: avisos.length > 0,
            avisos: avisos.map((a) => ({ texto: a })),
            avisoTint: negada ? RED_T : GOLD_T,
            avisoColor: negada ? RED_D : GOLD_D,
            campos: [
              ["Documento", val.documento], ["Teléfono", val.telefono],
              ["Correo", val.correo], ["Fecha de nacimiento", val.fecha_nac],
              ["Distrito", val.distrito], ["Ocupación", val.ocupacion],
            ].map(([rotulo, valor]) => ({
              rotulo: rotulo,
              valor: (valor && String(valor).trim()) ? String(valor) : "Sin dato",
              color: (valor && String(valor).trim()) ? "#201e1d" : "#9aa7b2",
            })),
            crudaAbierta: st.bjCruda === r.id,
            crudaLabel: st.bjCruda === r.id ? "Ocultar lo que escribió" : "Ver lo que escribió",
            cruda: cruda,
            verCruda: () => this.setState({ bjCruda: st.bjCruda === r.id ? null : r.id }),
            puedeIngresar: !!r.puede_ingresar,
            ingresarLabel: st.bjOcupado ? "Ingresando…" : "Ingresar",
            ingresar: () => this.ingresarRespuesta(r),
            editar: () => this.editarRespuesta(r),
            puedeDescartar: r.estado === "por_revisar",
            estiloDescartar: "font-size:13.5px; color:#a8321f; border:1px solid #e2503c; padding:8px 15px; border-radius:2px;"
              + (r.puede_ingresar ? "" : " margin-left:auto;"),
            descartar: () => this.descartarRespuesta(r),
            motivoHay: !!r.motivo,
            motivo: r.motivo || "",
          };
        }),

/*§CORTE§ linea original 9110 §*/
      /* ── Enlaces del formulario ──────────────────────────────────── */
      invAbierto: !!st.invAbierto,
      invBotonLabel: st.invAbierto ? "Ocultar enlaces" : "Enlaces del formulario",
      invAlternar: () => {
        const abrir = !this.state.invAbierto;
        this.setState({ invAbierto: abrir, invErr: "" });
        if (abrir) this.cargarInvitaciones();
      },
      invSinConfig: !st.invConfig,
      invPuedeCrear: !!st.invConfig,
      invPara: st.invPara,
      onInvPara: (e) => this.setState({ invPara: e.target.value, invErr: "" }),
      /* El nombre a mano solo hace falta cuando la ficha todavía no
         existe; con una elegida, el nombre ya lo pone ella. */
      invPideEtiqueta: !st.invPara,
      invEtiqueta: st.invEtiqueta,
      onInvEtiqueta: (e) => this.setState({ invEtiqueta: e.target.value, invErr: "" }),
      invDias: st.invDias,
      onInvDias: (e) => this.setState({ invDias: e.target.value }),
      invCrear: () => this.crearInvitacion(),
      invCrearLabel: st.invOcupado ? "Creando…" : "Crear enlace",
      invHayErr: !!st.invErr,
      invErr: st.invErr || "",
      invVacio: (st.invLista || []).length === 0,
      invResumen: (() => {
        const n = (st.invLista || []).filter((x) => x.situacion === "vigente").length;
        return n === 0 ? "ninguno vigente"
             : n === 1 ? "1 vigente" : n + " vigentes";
      })(),
      invOpciones: [{ valor: "", etiqueta: "— Una familia que aún no tiene ficha —" }]
        .concat((st.responsables || []).map((r) => ({
          valor: String(r.id), etiqueta: r.nombre,
        }))),
      invLista: (st.invLista || []).map((iv) => {
        const color = iv.situacion === "vigente" ? [GREEN_D, GREEN_T]
                    : iv.situacion === "usada" ? [BLUE_D, BLUE_T]
                    : [RED_D, RED_T];
        return {
          id: iv.id,
          para: iv.para || "(sin nombre)",
          enlace: iv.enlace || "",
          situacion: iv.situacion,
          /* Se dice la fecha, no "caduca en 12 días": quien entrega el
             enlace por WhatsApp necesita poder escribirla en el mensaje. */
          detalle: iv.situacion === "usada" ? ("Respondido el " + (iv.usada || "").slice(0, 10))
                 : iv.situacion === "anulada" ? "Anulado"
                 : "Caduca el " + String(iv.caduca || "").slice(0, 10),
          estiloSituacion: "font-size:11.5px; letter-spacing:0.05em; text-transform:uppercase; padding:4px 9px; border-radius:2px; white-space:nowrap; color:"
            + color[0] + "; background:" + color[1] + ";",
          entregable: iv.situacion === "vigente" && !!iv.enlace,
          anulable: iv.situacion === "vigente",
          copiarLabel: st.invCopiado === iv.id ? "Copiado" : "Copiar enlace",
          copiar: () => this.copiarEnlace(iv),
          anular: () => this.anularInvitacion(iv),
        };
      }),

      rspHayVer: !!st.rspVer,

