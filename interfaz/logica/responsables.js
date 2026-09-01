  cargarResponsables() {
    const q = (this.state.rspBusca || "").trim();
    this.setState({ rspCargando: true });
    return this.api("/api/responsables" + (q ? "?q=" + encodeURIComponent(q) : ""))
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ responsables: d.responsables || [], rspCargando: false });
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ rspCargando: false, rspErr: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5034 §*/
  abrirResponsable(r) {
    this.cargarCamposRequeridos();
    /* Un solo formulario para alta y edición: son los mismos campos, y dos
       formularios gemelos acaban divergiendo en cuanto se toca uno. */
    r = r || {};
    this.setState({
      modal: "responsable", modalError: "",
      rspId: r.id || null,
      rspNombre: r.nombre || "", rspDoc: r.documento || "",
      rspNac: r.fecha_nac || "", rspSexo: r.sexo || "",
      rspNacionalidad: r.nacionalidad || "",
      rspTel: r.telefono || "", rspTel2: r.telefono_alt || "",
      rspCorreo: r.correo || "",
      rspDepto: r.departamento || "", rspProv: r.provincia || "",
      rspDistrito: r.distrito || "", rspDireccion: r.direccion || "",
      rspRef: r.referencia || "",
      rspOcupacion: r.ocupacion || "", rspSituacion: r.situacion_laboral || "",
      rspCentro: r.centro_trabajo || "", rspTipoTrabajo: r.tipo_trabajo || "",
      rspIngresos: r.rango_ingresos || "",
      rspACargo: r.personas_a_cargo == null ? "" : String(r.personas_a_cargo),
      rspNota: r.nota || ""
    });
  }

  /* La foto va por multipart, no por la API de JSON: por eso usa fetch
     directo con las cabeceras del token, igual que los adjuntos. */
/*§CORTE§ linea original 5060 §*/
  subirFotoResponsable(e) {
    const fichero = e.target.files && e.target.files[0];
    /* Se limpia el input para que elegir el MISMO archivo otra vez —tras
       un error, por ejemplo— vuelva a disparar el cambio. */
    e.target.value = "";
    if (!fichero || !this.state.rspVer) return;
    const id = this.state.rspVer.id;
    const fd = new FormData();
    fd.append("foto", fichero, fichero.name);
    this.setState({ rspFotoOcupado: true, rspFotoMsg: "", rspFotoMal: false });
    fetch("/api/responsables/" + id + "/foto",
          { method: "POST", body: fd, headers: this.cabecerasCsrf() })
      .then((r) => r.json().then((d) => {
        if (!r.ok || d.ok === false) throw new Error(d.error || ("HTTP " + r.status));
        return d;
      }))
      .then((d) => {
        if (!this._vivo) return;
        this.setState({
          rspFotoOcupado: false, rspFotoMal: false, rspFotoMsg: "",
          rspVer: d.responsable || this.state.rspVer,
          responsables: d.responsables || this.state.responsables,
          /* Cambia el nombre del archivo en cada subida, así que la imagen
             se repinta sola sin trucos contra la caché. */
        });
      })
      .catch((err) => {
        if (this._vivo) this.setState({ rspFotoOcupado: false, rspFotoMal: true,
                                        rspFotoMsg: String(err.message || err) });
      });
  }

/*§CORTE§ linea original 5092 §*/
  quitarFotoResponsable() {
    const r = this.state.rspVer;
    if (!r) return;
    this.setState({ rspFotoOcupado: true, rspFotoMsg: "", rspFotoMal: false });
    this.api("/api/responsables/" + r.id + "/foto", { method: "DELETE" })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ rspFotoOcupado: false,
                        rspVer: d.responsable || this.state.rspVer,
                        responsables: d.responsables || this.state.responsables });
      })
      .catch((err) => {
        if (this._vivo) this.setState({ rspFotoOcupado: false, rspFotoMal: true,
                                        rspFotoMsg: String(err.message || err) });
      });
  }

/*§CORTE§ linea original 5290 §*/
  guardarResponsable() {
    const st = this.state;
    if (st.modalOcupado) return;
    if (!String(st.rspNombre || "").trim()) {
      this.setState({ modalError: "El nombre es obligatorio." });
      return;
    }
    const cuerpo = {
      nombre: st.rspNombre.trim(), documento: st.rspDoc, fecha_nac: st.rspNac,
      sexo: st.rspSexo, nacionalidad: st.rspNacionalidad,
      telefono: st.rspTel, telefono_alt: st.rspTel2, correo: st.rspCorreo,
      departamento: st.rspDepto, provincia: st.rspProv, distrito: st.rspDistrito,
      direccion: st.rspDireccion, referencia: st.rspRef,
      ocupacion: st.rspOcupacion, situacion_laboral: st.rspSituacion,
      centro_trabajo: st.rspCentro, tipo_trabajo: st.rspTipoTrabajo,
      rango_ingresos: st.rspIngresos,
      personas_a_cargo: Number(st.rspACargo) || 0,
      nota: st.rspNota
    };
    const faltan = this.faltanEnFicha("responsable", cuerpo);
    if (faltan.length) {
      this.setState({ modalOcupado: false, sdFaltan: faltan, modalError: "" });
      return;
    }
    cuerpo.sin_dato = (this.state.sdMarcados || []).join(",");

    /* Si esta ficha vino de una respuesta del formulario, esa respuesta
       queda ingresada al guardar. Sin esto seguiría en la bandeja y se
       ingresaría dos veces. */
    const desdeRespuesta = this.state.rspDesdeRespuesta || null;

    this.setState({ modalOcupado: true, modalError: "" });
    this.api(st.rspId ? "/api/responsables/" + st.rspId : "/api/responsables",
             { method: st.rspId ? "PUT" : "POST", body: JSON.stringify(cuerpo) })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modal: "",
                        sdFaltan: [], sdMarcados: [], rspDesdeRespuesta: null });
        if (desdeRespuesta) {
          /* Se descarta con motivo en vez de ingresarla: la ficha ya la
             creó el formulario de siempre, y marcarla «ingresada» sin
             haberla creado aquí dejaría dos caminos que hacen lo mismo. */
          this.api("/api/formulario/respuestas/" + desdeRespuesta + "/descartar",
                   { method: "POST", body: JSON.stringify({
                       motivo: "Ingresada a mano desde el formulario de responsable." }) })
            .then((d) => { if (this._vivo) this.setState({ bandeja: d.respuestas || [] }); })
            .catch(() => {});
        }
        this.cargarResponsables();
        if (this.state.rspVer) this.verResponsable(this.state.rspVer.id);
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 5347 §*/
  verResponsable(id) {
    /* La ficha trae además los beneficiarios vinculados: es la vista que
       responde "¿de quién está a cargo esta señora?", que es justo lo que no
       se podía contestar cuando el tutor era un campo suelto. */
    return this.api("/api/responsables/" + id)
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ rspVer: d.responsable, rspVerBenefs: d.beneficiarios || [] });
      })
      .catch((e) => { if (this._vivo) this.setState({ rspErr: String(e.message || e) }); });
  }

/*§CORTE§ linea original 5359 §*/
  confirmarBorrarResponsable() {
    const r = this.state.rspBorrar;
    if (!r) return;
    this.setState({ modalOcupado: true });
    this.api("/api/responsables/" + r.id, { method: "DELETE" })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modal: "", rspBorrar: null,
                        rspVer: null, rspVerBenefs: [] });
        this.cargarResponsables();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 8962 §*/
      /* ── Responsables / tutores ────────────────────────────────────── */
      puedeResponsables: this.puede("responsables", "edicion"),
      rspTh: "text-align:left; padding:10px 14px; font-size:10.5px; letter-spacing:0.12em; text-transform:uppercase; color:#5b7185; font-weight:600; white-space:nowrap;",
      rspTd: "padding:11px 14px; font-size:14px; color:#3c4a55; vertical-align:top;",
      rspBusca: st.rspBusca,
      onRspBusca: (e) => {
        /* Se busca en el servidor, no filtrando en pantalla: la lista puede
           crecer mucho más que el personal, y el documento no se ve en la
           tabla pero sí se busca por él. */
        this.setState({ rspBusca: e.target.value }, () => this.cargarResponsables());
      },
      rspHay: (st.responsables || []).length > 0,
      rspVacio: (st.responsables || []).length === 0,
      rspVacioTitulo: (st.rspBusca || "").trim()
        ? "Ningún responsable coincide con la búsqueda"
        : "Todavía no hay responsables registrados",
      rspVacioNota: (st.rspBusca || "").trim()
        ? "Prueba con parte del nombre o con el número de documento."
        : "Un responsable es el adulto a cargo de uno o más beneficiarios: su madre, su abuela, un hermano mayor. Se registra una vez aquí y luego se vincula a los niños que corresponda desde la ficha de cada uno.",
      rspResumen: (() => {
        const n = (st.responsables || []).length;
        if (!n) return "";
        const conNinos = (st.responsables || []).filter((r) => r.beneficiarios > 0).length;
        return n === 1 ? "1 responsable" : n + " responsables · " + conNinos + " con beneficiarios vinculados";
      })(),

      rspLista: (st.responsables || []).map((r) => ({
        nombre: r.nombre,
        documento: r.documento || "—",
        contacto: [r.telefono, r.correo].filter(Boolean).join(" · ") || "Sin contacto",
        ocupacion: r.ocupacion || "—",
        cuenta: r.beneficiarios === 0 ? "Ninguno"
              : r.beneficiarios === 1 ? "1 beneficiario"
              : r.beneficiarios + " beneficiarios",
        estiloCuenta: "font-size:11.5px; padding:3px 9px; border-radius:2px; white-space:nowrap; "
          + (r.beneficiarios ? "background:#e7eff7; color:#0e3d69;"
                             : "background:#efece8; color:#7d8e9c;"),
        /* Las fichas que vinieron de la migración se marcan: hay que
           revisarlas a mano porque su origen era una ficha de trabajador. */
        esMigrado: r.origen === "migrado",
        abrir: () => this.verResponsable(r.id),
        editar: () => this.abrirResponsable(r),
        borrar: () => this.setState({ modal: "borrarResp", rspBorrar: r, modalError: "" })
      })),
      rspNuevo: () => this.abrirResponsable(null),

      /* Ficha desplegada */
/*§CORTE§ linea original 9169 §*/
      /* ── La foto del tutor ───────────────────────────────────────────
         La dirección lleva el nombre del archivo guardado, que cambia con
         cada subida: así el navegador no enseña la anterior de su caché. */
      rspTieneFoto: !!(st.rspVer && st.rspVer.foto),
      rspSinFoto: !!(st.rspVer && !st.rspVer.foto),
      rspFotoUrl: st.rspVer && st.rspVer.foto
        ? "/api/responsables/" + st.rspVer.id + "/foto?v=" + st.rspVer.foto
        : "",
      rspVerIniciales: (st.rspVer && ini(st.rspVer.nombre)) || "?",
      rspFotoBoton: st.rspFotoOcupado ? "Subiendo…"
        : (st.rspVer && st.rspVer.foto) ? "Cambiar" : "Subir foto",
      onRspFoto: (e) => this.subirFotoResponsable(e),
      rspQuitarFoto: () => this.quitarFotoResponsable(),
      rspFotoMsgHay: !!st.rspFotoMsg,
      rspFotoMsg: st.rspFotoMsg || "",
      rspFotoMsgColor: st.rspFotoMal ? RED_D : GREEN_D,
      rspFotoMsgTint: st.rspFotoMal ? RED_T : GREEN_T,
      rspCerrarVer: () => this.setState({ rspVer: null, rspVerBenefs: [] }),
      rspVerNombre: (st.rspVer && st.rspVer.nombre) || "",
      rspVerSub: (() => {
        const r = st.rspVer;
        if (!r) return "";
        const partes = [];
        if (r.documento) partes.push("Doc. " + r.documento);
        if (r.telefono) partes.push(r.telefono);
        partes.push((st.rspVerBenefs || []).length + " beneficiario(s) a cargo");
        if (r.origen === "migrado") partes.push("ficha migrada, pendiente de revisar");
        return partes.join(" · ");
      })(),
      rspVerCampos: (() => {
        const r = st.rspVer || {};
        const dir = [r.direccion, r.distrito, r.provincia, r.departamento]
          .filter(Boolean).join(", ");
        return [
          ["Documento", r.documento], ["Fecha de nacimiento", r.fecha_nac],
          /* En la base se guarda el código; aquí se lee la palabra. */
          ["Sexo", ({ F: "Femenino", M: "Masculino",
                      X: "Prefiere no decirlo" })[r.sexo] || ""],
          ["Nacionalidad", r.nacionalidad],
          ["Teléfono", r.telefono], ["Otro teléfono", r.telefono_alt],
          ["Correo", r.correo], ["Dirección", dir],
          ["Referencia", r.referencia], ["Ocupación", r.ocupacion],
          ["Situación laboral", r.situacion_laboral],
          ["Centro de trabajo", r.centro_trabajo],
          ["Tipo de trabajo", r.tipo_trabajo],
          ["Rango de ingresos", r.rango_ingresos],
          ["Personas a cargo", r.personas_a_cargo ? String(r.personas_a_cargo) : ""]
        ].map(([rotulo, valor]) => ({
          rotulo,
          valor: valor || "Sin registrar",
          color: valor ? "#201e1d" : "#a3b1bd"
        }));
      })(),
      rspSinBenefs: (st.rspVerBenefs || []).length === 0,
      rspVerBenefs: (st.rspVerBenefs || []).map((b) => ({
        nombre: b.nombre,
        detalle: [b.parentesco, b.casa, b.sala, b.grado].filter(Boolean).join(" · ") || "Sin datos",
        papeles: [
          [b.es_principal, "Principal", "#0e3d69", "#e7eff7"],
          [b.es_legal, "Legal", "#1f6b45", "#e4f0e9"],
          [b.puede_recoger, "Puede recoger", "#8a5c05", "#fbf0d9"],
          [b.es_emergencia, "Emergencia", "#a8321f", "#fbe7e3"]
        ].filter((x) => x[0]).map(([, texto, color, fondo]) => ({
          texto,
          estilo: "font-size:11px; padding:3px 8px; border-radius:2px; white-space:nowrap; color:"
            + color + "; background:" + fondo + ";"
        }))
      })),

      /* Diálogo de alta / edición */
      modalResponsable: st.modal === "responsable",
      rspTitulo: st.rspId ? "Editar responsable" : "Nuevo responsable",
      rspLede: st.rspId
        ? "Los cambios se reflejan en todos los beneficiarios a los que esté vinculado."
        : "Solo el nombre es obligatorio. Lo demás se puede completar después: es mejor tener la ficha creada y a medias que no tenerla.",
      rspNombre: st.rspNombre,
      onRspNombre: (e) => this.setState({ rspNombre: e.target.value, modalError: "" }),
      rspDoc: st.rspDoc,
      onRspDoc: (e) => this.setState({ rspDoc: e.target.value, modalError: "" }),
      rspNac: st.rspNac,
      onRspNac: (e) => this.setState({ rspNac: e.target.value, modalError: "" }),
      rspSexo: st.rspSexo,
      onRspSexo: (e) => this.setState({ rspSexo: e.target.value, modalError: "" }),
      rspNacionalidad: st.rspNacionalidad,
      onRspNacionalidad: (e) => this.setState({ rspNacionalidad: e.target.value, modalError: "" }),
      rspTel: st.rspTel,
      onRspTel: (e) => this.setState({ rspTel: e.target.value, modalError: "" }),
      rspTel2: st.rspTel2,
      onRspTel2: (e) => this.setState({ rspTel2: e.target.value, modalError: "" }),
      rspCorreo: st.rspCorreo,
      onRspCorreo: (e) => this.setState({ rspCorreo: e.target.value, modalError: "" }),
      rspDepto: st.rspDepto,
      onRspDepto: (e) => this.setState({ rspDepto: e.target.value, modalError: "" }),
      rspProv: st.rspProv,
      onRspProv: (e) => this.setState({ rspProv: e.target.value, modalError: "" }),
      rspDistrito: st.rspDistrito,
      onRspDistrito: (e) => this.setState({ rspDistrito: e.target.value, modalError: "" }),
      rspDireccion: st.rspDireccion,
      onRspDireccion: (e) => this.setState({ rspDireccion: e.target.value, modalError: "" }),
      rspRef: st.rspRef,
      onRspRef: (e) => this.setState({ rspRef: e.target.value, modalError: "" }),
      rspOcupacion: st.rspOcupacion,
      onRspOcupacion: (e) => this.setState({ rspOcupacion: e.target.value, modalError: "" }),
      rspSituacion: st.rspSituacion,
      onRspSituacion: (e) => this.setState({ rspSituacion: e.target.value, modalError: "" }),
      rspCentro: st.rspCentro,
      onRspCentro: (e) => this.setState({ rspCentro: e.target.value, modalError: "" }),
      rspTipoTrabajo: st.rspTipoTrabajo,
      onRspTipoTrabajo: (e) => this.setState({ rspTipoTrabajo: e.target.value, modalError: "" }),
      rspIngresos: st.rspIngresos,
      onRspIngresos: (e) => this.setState({ rspIngresos: e.target.value, modalError: "" }),
      rspACargo: st.rspACargo,
      onRspACargo: (e) => this.setState({ rspACargo: e.target.value, modalError: "" }),
      rspNota: st.rspNota,
      onRspNota: (e) => this.setState({ rspNota: e.target.value, modalError: "" }),

      /* Diálogo de borrado */
      modalBorrarResp: st.modal === "borrarResp",
      rspBorrarNombre: (st.rspBorrar && st.rspBorrar.nombre) || "",
      rspBorrarAviso: (() => {
        const n = (st.rspBorrar && st.rspBorrar.beneficiarios) || 0;
        if (!n) return "No está vinculado a ningún beneficiario. Se elimina solo su ficha.";
        return "Está vinculado a " + n + " beneficiario(s). Se eliminan esos vínculos, "
             + "pero NO los beneficiarios: sus expedientes se quedan como están, sin este responsable.";
      })(),

      isConfig: v === "config",
      cfgOrg: this.state.cfgOrg || "",
      cfgCiudad: this.state.cfgCiudad || "",
      cfgFundacion: this.state.cfgFundacion || "",
      onCfgOrg: (e) => this.setState({ cfgOrg: e.target.value, cfgOk: "", cfgError: "" }),
      onCfgCiudad: (e) => this.setState({ cfgCiudad: e.target.value, cfgOk: "", cfgError: "" }),
      onCfgFundacion: (e) => this.setState({ cfgFundacion: e.target.value, cfgOk: "", cfgError: "" }),
      /* ── Configuración ────────────────────────────────────────────── */
      cfgMeta: this.state.cfgMeta == null ? "" : this.state.cfgMeta,
      cfgLat: this.state.cfgLat == null ? "" : this.state.cfgLat,
      cfgLon: this.state.cfgLon == null ? "" : this.state.cfgLon,
      cfgRadio: this.state.cfgRadio == null ? "" : this.state.cfgRadio,
      onCfgMeta: (e) => this.setState({ cfgMeta: e.target.value }),
      onCfgLat: (e) => this.setState({ cfgLat: e.target.value }),
      onCfgLon: (e) => this.setState({ cfgLon: e.target.value }),
      onCfgRadio: (e) => this.setState({ cfgRadio: e.target.value }),
      /* Sin coordenadas puestas el sistema NO rechaza a nadie por estar
         lejos: guarda dónde marcó y ya. Decirlo aquí evita creer que hay
         un control que no existe. */
      cfgHayLugar: !!(this.state.cfgLat && this.state.cfgLon),
      cfgNotaLugar: (this.state.cfgLat && this.state.cfgLon)
        ? "Se guarda a qué distancia de este punto marcó cada persona. Hoy no se rechaza a nadie por estar lejos; el radio queda anotado para cuando se decida usarlo."
        : "Sin coordenadas no se calcula ninguna distancia: las marcas se guardan igual, solo que sin decir desde dónde.",
      cfgMetaNota: this.state.cfgMeta
        ? ("Cada persona verá su semana contra " + this.state.cfgMeta + " horas.")
        : "Sin meta puesta, la barra de la semana no compara contra nada.",

      cfgFundacionFijada: !this.state.cfgEditandoFecha && !!(this.state.parametros || {}).fecha_fundacion,
      cfgFundacionEditable: this.state.cfgEditandoFecha,
      cfgTeniaFecha: !!(this.state.parametros || {}).fecha_fundacion,
      cfgFundacionTexto: (() => {
        const f = (this.state.parametros || {}).fecha_fundacion;
        if (!f) return "";
        const d = new Date(f + "T00:00:00");
        const txt = d.toLocaleDateString("es-PE", { day:"numeric", month:"long", year:"numeric" });
        return txt.charAt(0).toUpperCase() + txt.slice(1);
      })(),
      cfgDesbloquear: () => this.setState({ cfgEditandoFecha: true, cfgOk: "", cfgError: "" }),
      cfgCancelarFecha: () => this.setState({
        cfgEditandoFecha: false,
        cfgFundacion: (this.state.parametros || {}).fecha_fundacion || "",
        cfgOk: "", cfgError: "" }),
      cfgGuardar: () => this.guardarParametros(),
      cfgError: this.state.cfgError || "",
      cfgOk: this.state.cfgOk || "",
      cfgBotonLabel: this.state.cfgGuardando ? "Guardando…" : "Guardar parámetros",
      cfgBotonStyle: "font-size:13.5px; padding:9px 18px; border-radius:2px; color:#f4f3f1; background:"
        + (this.state.cfgGuardando ? "#9aa7b2" : "#2f8f5b") + ";",

      /* El árbol del menú, aplanado a una sola lista con sangría en los
         hijos. Se aplana en vez de anidar un sc-for dentro de otro, que es
         terreno del runtime que no tengo comprobado.

         Qué está activo se deduce de la vista y la pestaña, sin estado
         aparte: así todo lo que ya cambiaba de vista —volver de un
         expediente, abrir los vencimientos de un documento— marca la entrada
         correcta sin tocar nada. */
      navItems: navDef
        .filter(m => this.puedeAlguno(m.mods, "vista"))
        .reduce((salida, m) => {
          /* Una entrada sin 'mods' no tiene puerta: se ve siempre. Es lo
             que necesita el autoservicio, que va por sesión y no por rol. */
          const hijos = (m.hijos || []).filter(
            h => !h.mods || h.mods.length === 0 || this.puedeAlguno(h.mods, "vista"));
          const activoHijo = (h) => v === h.vista
            && (!h.tab || lt === h.tab)
            && (h.vista !== "legajo" || !!h.tab);
          const suyaLaVista = v === m.vista
            || (m.tambien || []).indexOf(v) >= 0
            || hijos.some(activoHijo);

          salida.push({
            label: m.label, badge: m.badge || "", icon: m.icon, iconoTam: "19px",
            color: suyaLaVista ? BLUE : "#8697a5",
            style: this.navStyle(suyaLaVista, BLUE),
            go: () => this.go(m.vista)
          });

          hijos.forEach(h => {
            const suyo = activoHijo(h) || (h.tambien || []).indexOf(v) >= 0;
            salida.push({
              label: h.label, badge: h.badge || "", icon: h.icon, iconoTam: "16px",
              color: suyo ? BLUE : "#a3b1bd",
              style: "display:flex; align-items:center; gap:9px; width:100%; padding:6px 10px 6px 26px; "
                + "border-radius:2px; font-size:13.5px; "
                + (suyo ? "background:#ffffff; font-weight:600; color:" + BLUE_D + ";"
                        : "color:#5b7185;"),
              go: () => h.tab
                ? this.setState({ view: h.vista, legajoTab: h.tab })
                : this.go(h.vista)
            });
          });
          return salida;
        }, []),
      /* Aquí colgaban ocho módulos apagados —Planillas, Capacitaciones,
         Evaluación, Finanzas, Donaciones, Proyectos, Beneficiarios,
         Inventario— con su etiqueta de «Pendiente» o «2027». Ocupaban media
         barra y no llevaban a ninguna parte: anunciar lo que no existe no
         ayuda a quien trabaja hoy. Retirados el 31/08/2026.

         Planillas SÍ está construida y funciona; su pantalla y sus
         endpoints siguen intactos, solo deja de anunciarse. */
      otherModules: [
        {label:"Configuración", tag:"", vivo:true, mod:"configuracion", ir:"config"},
        {label:"Usuarios y permisos", tag:"", vivo:true, mod:"usuarios", ir:"usuarios"}
      ].filter(m => !m.mod || this.puede(m.mod, "vista")).map(m => ({
        ...m,
        punto: m.vivo ? BLUE : "#b9c5d0",
        style: "display:flex; align-items:center; gap:10px; padding:7px 10px; font-size:14.5px; width:100%; border-radius:2px;"
          + (m.vivo
            ? (v === m.ir ? "background:#ffffff; font-weight:600; color:" + BLUE_D + ";" : "color:#3c4a55;")
            : "color:#9aa7b2; cursor:default;"),
        go: m.vivo ? () => this.setState({ view: m.ir }) : () => {}
      })),

      kpis: [
        {label:"Colaboradores", value:String((this.state.personal || []).length),
         note:"Fichas activas en Hoja de Vida", color:BLUE, tint:BLUE_T, dark:BLUE_D},
        /* El ausentismo necesita un histórico de marcaciones que todavía
           no existe: el terminal lleva días registrando, no meses. Decir
           "2.4 %" era inventarse un dato que nadie midió. */
        {label:"Ausentismo del mes", value:"—",
         note:"Se calculará cuando haya un mes completo de marcaciones en el terminal",
         hint:"Hasta entonces no se muestra un porcentaje: sería un número que nadie midió.",
         color:GOLD, tint:GOLD_T, dark:GOLD_D},
        /* Esto sí sale de la base: son los documentos y contratos vencidos o
           por vencer que ya calcula el backend para el bloque de alertas. */
        (() => {
          const v = this.state.vencimientos || {};
          const doc = v.documento || {};
          const ctr = v.contrato || {};
          const n = (doc.total || 0) + (ctr.total || 0);
          return {
            label: "Pendientes de RRHH", value: String(n),
            note: n === 0 ? "Ningún documento ni contrato vencido o por vencer"
                          : "Documentos y contratos vencidos o por vencer",
            color: n === 0 ? GREEN : RED,
            tint:  n === 0 ? GREEN_T : RED_T,
            dark:  n === 0 ? GREEN_D : RED_D,
          };
        })(),
        /* Años de la ONG, no de ningún colaborador: sale de la fecha de
           fundación que se registra en Configuración. Sin ese dato NO se
           inventa un número — se dice dónde configurarlo. */
        (() => {
          const f = (this.state.parametros || {}).fecha_fundacion;
          if (!f) {
            return { label: "Años de labor", value: "—",
                     note: "Configura la fecha de fundación en Configuración → Parámetros del sistema",
                     color: GREEN, tint: GREEN_T, dark: GREEN_D,
                     go: () => this.setState({ view: "config" }) };
          }
          const d = new Date(f + "T00:00:00");
          const hoy = new Date();
          let anios = hoy.getFullYear() - d.getFullYear();
          /* Si aún no llegó el aniversario de este año, todavía no cumple */
          const m = hoy.getMonth() - d.getMonth();
          if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) anios--;
          return {
            label: "Años de labor",
            value: anios + (anios === 1 ? " año" : " años"),
            note: "Fundada en " + d.getFullYear() + ", trabajando por la niñez",
            color: GREEN, tint: GREEN_T, dark: GREEN_D
          };
        })()
      ],
      /* Sale de las fichas reales, agrupando por el área de cada una. Antes
         venía de una constante de la maqueta con áreas y números fijos. */
      /* ── Personal por sede ────────────────────────────────────────
         Misma forma que por área: magnitud comparada entre categorías con
         nombre. Un solo tono, la etiqueta identifica. */
      sedes: (() => {
        const gente = this.state.personal || [];
        if (!gente.length) return [];
        const cuenta = {};
        gente.forEach((p) => {
          const s = (p.sede || "").trim() || "Sin sede registrada";
          cuenta[s] = (cuenta[s] || 0) + 1;
        });
        const total = gente.length;
        return Object.keys(cuenta)
          .sort((x, y) => cuenta[y] - cuenta[x])
          .slice(0, 8)
          .map((nombre) => ({
            name: nombre, count: String(cuenta[nombre]),
            pct: Math.round(cuenta[nombre] / total * 100) + "%",
          }));
      })(),
      haySedes: (this.state.personal || []).length > 0,
      sedesNota: (() => {
        const n = (this.state.personal || []).length;
        return n ? n + (n === 1 ? " ficha con sede" : " fichas repartidas por sede")
                 : "Todavía no hay fichas registradas";
      })(),

      /* ── Altas por año ────────────────────────────────────────────────
         Cambio en el tiempo: columnas. Por año y no por mes porque con
         pocas altas un gráfico mensual son doce huecos y una barra. */
      altas: (() => {
        /* El año se saca con cuidado: la base guarda 2026-08-18, pero hay
           fichas viejas con 03/02/2014. Cortar los cuatro primeros
           caracteres daba "03/0" y el año salía NaN, así que el grafico
           quedaba vacío sin decir por que. */
        const gente = (this.state.personal || [])
          .map((p) => Component.anioDe(p.fecha_ingreso))
          .filter((a) => a);
        if (!gente.length) return [];
        const cuenta = {};
        gente.forEach((a) => { cuenta[a] = (cuenta[a] || 0) + 1; });
        const anios = Object.keys(cuenta).sort();
        /* Los años sin altas se dibujan igualmente, a cero: saltárselos
           haría parecer continuo lo que tuvo un hueco. */
        const desde = Number(anios[0]);
        const hasta = Number(anios[anios.length - 1]);
        const alto = Math.max.apply(null, anios.map((a) => cuenta[a]));
        const fila = [];
        for (let a = desde; a <= hasta; a++) {
          const n = cuenta[String(a)] || 0;
          fila.push({
            anio: String(a), n: String(n),
            /* 3px de mínimo para que un año con cero no desaparezca: un
               hueco invisible se lee como «no hay dato», no como cero. */
            alto: n ? Math.max(6, Math.round(n / alto * 100)) + "%" : "3px",
            tono: n ? BLUE : "#dcd9d5",
          });
        }
        return fila;
      })(),
      hayAltas: (this.state.personal || [])
        .some((p) => Component.anioDe(p.fecha_ingreso)),
      altasNota: (() => {
        const con = (this.state.personal || [])
          .filter((p) => Component.anioDe(p.fecha_ingreso)).length;
        const total = (this.state.personal || []).length;
        if (!total) return "Todavía no hay fichas registradas";
        if (!con) return "Ninguna ficha tiene fecha de ingreso todavía";
        return con === total ? "Fecha de ingreso de las " + total + " fichas"
          : con + " de " + total + " fichas tienen fecha de ingreso";
      })(),

      /* ── Avance de enrolamiento ───────────────────────────────────────
         Una proporción sola no es un gráfico: es una cifra con su barra.
         Y es de lo más accionable que hay hoy — quien no está enrolado no
         puede marcar. */
      enrolTexto: (() => {
        const t = Component.enrolDelPersonal(this.state.personal);
        if (!t.total) return "—";
        return t.dentro + " de " + t.total;
      })(),
      /* El ancho de la barra, limitado al 100 %. Antes se le pasaba el
         porcentaje tal cual y con un 129 % la barra se salía de su caja.
         Aunque ya no pueda pasar de cien, un medidor capaz de desbordar su
         recuadro es un fallo esperando a que alguien lo vea. */
      enrolAncho: (() => {
        const t = Component.enrolDelPersonal(this.state.personal);
        if (!t.total) return "0%";
        return Math.max(0, Math.min(100, Math.round(t.dentro / t.total * 100))) + "%";
      })(),
      enrolPct: (() => {
        const t = Component.enrolDelPersonal(this.state.personal);
        return t.total ? Math.round(t.dentro / t.total * 100) + "%" : "0%";
      })(),
      enrolTono: (() => {
        const t = Component.enrolDelPersonal(this.state.personal);
        if (!t.total) return "#dcd9d5";
        const r = t.dentro / t.total;
        return r >= 0.9 ? GREEN : r >= 0.5 ? GOLD : RED;
      })(),
      enrolNota: (() => {
        const t = Component.enrolDelPersonal(this.state.personal);
        const fuera = t.total - t.dentro;
        if (!t.total) return "Sin fichas todavía.";
        if (!fuera) return "Todo el personal puede marcar en el terminal.";
        return fuera + (fuera === 1 ? " persona no puede marcar" : " personas no pueden marcar")
          + " hasta que se la enrole.";
      })(),

      areas: (() => {
        const gente = this.state.personal || [];
        if (!gente.length) return [];
        const cuenta = {};
        gente.forEach((p) => {
          const a = (p.area || "").trim() || "Sin área asignada";
          cuenta[a] = (cuenta[a] || 0) + 1;
        });
        /* Un solo tono. El color por posición en el ranking no
           significaba nada y hacía que un área cambiara de color al subir
           o bajar un puesto. La identidad la da la etiqueta. */
        return Object.keys(cuenta)
          .sort((x, y) => cuenta[y] - cuenta[x])
          .map((nombre, i) => ({
            name: nombre,
            count: cuenta[nombre],
            pct: Math.round(cuenta[nombre] / gente.length * 100) + "%",
          }));
      })(),
      hayAreas: (this.state.personal || []).length > 0,
      areasNota: (() => {
        const n = (this.state.personal || []).length;
        return n === 0 ? "Todavía no hay fichas de personal registradas"
             : n === 1 ? "1 colaborador con ficha"
             : n + " colaboradores con ficha";
      })(),
      cumpleTitulo: "Cumpleaños de " + MESES_LARGO[new Date().getMonth()],
      /* Las tres salen de las fichas. Antes eran "11 / 9", "2" y "6" fijos,
         que no cambiaban aunque la base estuviera vacía. */
      subStats: (() => {
        const gente = this.state.personal || [];
        const f = gente.filter((p) => p.sexo === "F").length;
        const m = gente.filter((p) => p.sexo === "M").length;
        const sinSexo = gente.length - f - m;
        const sedes = new Set(gente.map((p) => (p.sede || "").trim()).filter(Boolean));
        const vol = gente.filter((p) => p.vinculo === "voluntario").length;
        return [
          { value: gente.length ? (f + " / " + m) : "—",
            label: sinSexo
              ? ("Mujeres y varones · " + sinSexo + " sin registrar")
              : "Mujeres y varones",
            color: BLUE },
          { value: String(sedes.size || "—"),
            label: sedes.size ? ("Sedes: " + [...sedes].join(", "))
                              : "Ninguna sede registrada todavía",
            color: GOLD },
          { value: String(vol),
            label: "Voluntarios, fuera de planilla",
            color: GREEN },
        ];
      })(),
      /* Cada aviso lleva al punto exacto del problema. Documentos y
         Contratos abren la ficha de la persona YA en su pestaña; antes
         caían en la portada de la ficha y había que buscar de nuevo qué
         era lo urgente. Los conteos salen de la base: si no hay nada
         registrado, el aviso lo dice en vez de inventar una cifra. */
      alerts: (() => {
        const v = this.state.vencimientos || {};
        const doc = v.documento || { total: 0 };
        const ctr = v.contrato || { total: 0 };
        return [
          {
            count: String(doc.total || 0),
            title: "Documentos por vencer",
            detail: doc.total
              ? ("El más próximo: " + doc.nombre + ". Abre la lista de Documentos ya filtrada.")
              : "Ningún documento registrado vence en los próximos 30 días.",
            color: doc.total ? RED : "#c9d4de", dark: doc.total ? RED_D : "#7d8e9c",
            tint: doc.total ? RED_T : "#f0ede9",
            /* A la vista consolidada, no a una ficha: el aviso habla de
               varios documentos, no de uno. Y con el filtro ya puesto. */
            go: () => this.abrirVencimientos("documento", doc.total ? "por_vencer" : "todos")
          },
          {
            count: String(ctr.total || 0),
            title: "Contratos por renovar",
            detail: ctr.total
              ? ("El más próximo: " + ctr.nombre + ". Abre la lista de Contratos ya filtrada.")
              : "Ningún contrato registrado vence en los próximos 30 días.",
            color: ctr.total ? GOLD : "#c9d4de", dark: ctr.total ? GOLD_D : "#7d8e9c",
            tint: ctr.total ? GOLD_T : "#f0ede9",
            go: () => this.abrirVencimientos("contrato", ctr.total ? "por_vencer" : "todos")
          },
          /* Aquí había "4 solicitudes de permiso esperando aprobación",
             con la tabla vacía y el módulo sin construir. Vuelve cuando
             Gestión de Permisos exista y pueda contarlas de verdad. */
        ];
      })(),

      /* De las fechas de nacimiento registradas, las de ESTE mes. Antes era
         una lista fija de cinco personas de la maqueta con días inventados,
         y el título decía "de agosto" pasara el mes que pasase. */
      birthdays: (this.state.personal || []).filter((p) => {
        const f = Component.aISO(p.fecha_nac);
        return f && Number(f.slice(5, 7)) === (new Date().getMonth() + 1);
      }).map((p) => {
        const f = Component.aISO(p.fecha_nac);
        return { p: p, dia: Number(f.slice(8, 10)) };
      }).sort((a, b) => a.dia - b.dia).map(({ p, dia }) => {
        return { nombre:p.nombre, cargo:p.cargo || "Sin cargo", ini:ini(p.nombre),
                 dia: dia + " " + MESES_CORTO[new Date().getMonth()],
                 open: () => this.go("ficha", p.id) };
      }),
      /* Vacía a propósito: seis meses de barras con valores fijos daban la
         impresión de un histórico que no existe. Vuelve cuando haya
         marcaciones de varios meses de las que salga. */
      absenceBars: [],
      hayAusentismo: false,
      /* Se distinguen los dos motivos por los que la lista puede estar
         vacía: que nadie cumpla años este mes, o que no haya ninguna fecha
         de nacimiento registrada. Lo segundo es algo que arreglar. */
      sinCumples: (() => {
        const gente = this.state.personal || [];
        return !gente.some((x) => {
          const f = Component.aISO(x.fecha_nac);
          return f && Number(f.slice(5, 7)) === (new Date().getMonth() + 1);
        });
      })(),
      sinCumplesNota: (() => {
        const gente = this.state.personal || [];
        if (!gente.length) return "Todavía no hay fichas de personal registradas.";
        const conFecha = gente.filter((x) => Component.aISO(x.fecha_nac)).length;
        if (!conFecha) {
          return "Ninguna ficha tiene fecha de nacimiento registrada, así que "
               + "no hay de dónde sacar los cumpleaños.";
        }
        const sin = gente.length - conFecha;
        return "Nadie cumple años este mes"
             + (sin ? (" · " + sin + (sin === 1
                 ? " ficha no tiene fecha de nacimiento registrada."
                 : " fichas no tienen fecha de nacimiento registrada."))
                 : ".");
      })(),
      /* Las dos banderas son opuestas a propósito: este runtime no tiene
         sc-else, así que una condición y su contraria se declaran aparte. */
      sinAusentismo: true,
      fichaTabs: [
        {key:"colab", label:"Colaboradores", icon:"ph-users-three",
         count:String((this.state.personal || []).length)},
        {key:"ninos", label:"Beneficiarios", icon:"ph-baby",
         count:String((this.state.beneficiarios || []).length)}
      ].map(t => ({
        ...t,
        style: "display:flex; align-items:center; gap:8px; padding:8px 15px; border-radius:2px; font-size:14.5px;"
          + (fs === t.key ? "background:#ffffff; font-weight:600; color:" + BLUE_D + "; box-shadow:inset 0 -3px 0 " + BLUE + ";" : "color:#5b7185;"),
        go: () => this.setState({ fichaScope: t.key })
      })),
      fichaColab: lt === "org",
      fichaNinos: lt === "benef",
      sinBenefReales: (this.state.beneficiarios || []).length === 0,
      /* El expediente muestra un beneficiario REAL si se abrió uno; si no,
         un marcador de la maqueta. Antes solo existía lo segundo: las
         fichas creadas de verdad no se podían abrir. */
      ben: this.state.benefRealSel
        ? this.benefRealFor(this.state.benefRealSel)
        : this.benefFor(SIN_BENEFICIARIO, 0),
      /* Ninguno de los tres está construido. Decirlo es mejor que un
         botón mudo: el usuario no puede distinguir "no hace nada" de
         "está roto". El aviso explica además POR QUÉ falta. */
      /* Editar un marcador de la maqueta no lleva a ninguna parte: no hay
         fila que actualizar. Se dice, en vez de abrir un formulario que
         luego no guardaría nada. */
      benEditar: () => {
        const b = this.state.benefRealSel;
        if (!b) {
          this.setState({ benAviso:
            "Esta es una ficha de prueba de la maqueta, no una ficha guardada: "
            + "no hay nada que editar. Crea un beneficiario con «Agregar "
            + "beneficiario» y ábrelo desde «Registrados en el sistema»." });
          return;
        }
        this.setState({ benAviso: "" });
        this.abrirBeneficiario(b);
      },
      benSesionNueva: () => this.abrirSesion(),
      benIncidenciaNueva: () => this.abrirIncidencia(),

/*§CORTE§ linea original 10345 §*/
      /* ── Datos personales, situación laboral y ubicación ─────────────
         Los ocho ya existían en la base y en la API; hasta ahora no había
         forma de escribirlos desde ninguna pantalla. */
      fiSexo: this.state.fiSexo || "",
      onFiSexo: (e) => this.setState({ fiSexo: e.target.value }),
      fiSexos: [
        { valor: "", etiqueta: "— Sin registrar —" },
        { valor: "F", etiqueta: "Femenino" },
        { valor: "M", etiqueta: "Masculino" },
        { valor: "X", etiqueta: "Otro / prefiere no decirlo" },
      ],
/*§CORTE§ linea original 10356 §*/
      /* ── El vocabulario de la ficha de responsable ───────────────────
         Son EXACTAMENTE las opciones del formulario público. Si aquí
         dijeran otra cosa, el mismo dato entraría escrito de dos maneras
         según por dónde llegara. */
      rspSexos: [
        { valor: "", etiqueta: "— Sin registrar —" },
        { valor: "F", etiqueta: "Femenino" },
        { valor: "M", etiqueta: "Masculino" },
        { valor: "X", etiqueta: "Prefiere no decirlo" },
      ],
      rspSituaciones: [{ valor: "", etiqueta: "— Sin registrar —" }].concat(
        ["Trabajo para un empleador", "Trabajo por mi cuenta",
         "Sin trabajo en este momento", "Jubilado o pensionista",
         "Me dedico al hogar", "Estudio"].map((x) => ({ valor: x, etiqueta: x }))),
      rspTiposTrabajo: [{ valor: "", etiqueta: "— Sin registrar —" }].concat(
        ["Con contrato y boleta", "Sin contrato, fijo",
         "Eventual o por temporadas", "Negocio propio",
         "No trabajo en este momento"].map((x) => ({ valor: x, etiqueta: x }))),
      rspRangos: [{ valor: "", etiqueta: "— Sin registrar —" }].concat(
        ["Menos de S/ 1 025", "Entre S/ 1 025 y S/ 2 000",
         "Entre S/ 2 001 y S/ 3 500", "Más de S/ 3 500",
         "Prefiero no responder"].map((x) => ({ valor: x, etiqueta: x }))),

      fiNacionalidad: this.state.fiNacionalidad || "",
      onFiNacionalidad: (e) => this.setState({ fiNacionalidad: e.target.value }),
      fiLugarNac: this.state.fiLugarNac || "",
      onFiLugarNac: (e) => this.setState({ fiLugarNac: e.target.value }),
      fiJornada: this.state.fiJornada || "",
      onFiJornada: (e) => this.setState({ fiJornada: e.target.value }),
      fiJornadas: [
        { valor: "", etiqueta: "— Sin registrar —" },
        { valor: "completa", etiqueta: "Tiempo completo" },
        { valor: "parcial", etiqueta: "Medio tiempo" },
        { valor: "horas", etiqueta: "Por horas" },
      ],
      fiEstadoLaboral: this.state.fiEstadoLaboral || "activo",
      onFiEstadoLaboral: (e) => this.setState({ fiEstadoLaboral: e.target.value }),
      fiEstadosLab: [
        { valor: "activo", etiqueta: "Activo" },
        { valor: "licencia", etiqueta: "De licencia" },
        { valor: "suspendido", etiqueta: "Suspendido" },
        { valor: "cesado", etiqueta: "Cesado" },
      ],
      fiDepartamento: this.state.fiDepartamento || "",
      onFiDepartamento: (e) => this.setState({ fiDepartamento: e.target.value }),
      fiProvincia: this.state.fiProvincia || "",
      onFiProvincia: (e) => this.setState({ fiProvincia: e.target.value }),
      fiDistrito: this.state.fiDistrito || "",
      onFiDistrito: (e) => this.setState({ fiDistrito: e.target.value }),
      fiJefe: this.state.fiJefe || "",
      onFiJefe: (e) => this.setState({ fiJefe: e.target.value }),
      /* Cualquiera puede ser jefe menos la propia persona: permitirlo
         crearía un ciclo y su rama desaparecería del árbol. */
      fiJefes: [{ valor: "", etiqueta: "— Sin jefe asignado —" }].concat(
        (this.state.personal || [])
          .filter((x) => x.id !== this.state.modalId)
          .map((x) => ({ valor: String(x.id),
                         etiqueta: x.nombre + (x.cargo ? " — " + x.cargo : "") }))),
      fiAmbitos: [
        {key:"min", label:"Colaborador", icon:"ph-users-three"},
        {key:"adm", label:"Administración", icon:"ph-briefcase"}
      ].map(a => ({ ...a,
        style: "display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:2px; font-size:14px; border:1px solid "
          + ((this.state.fiAmbito || "min") === a.key ? BLUE + "; background:#ffffff; color:" + BLUE_D + "; font-weight:600;" : "#c9d4de; color:#3c4a55;"),
        go: () => this.setState({ fiAmbito: a.key }) })),
      fiVinculos: [
        {key:"staff", label:"Personal", icon:"ph-identification-badge"},
        {key:"voluntario", label:"Voluntario", icon:"ph-hand-heart"}
      ].map(a => ({ ...a,
        style: "display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:2px; font-size:14px; border:1px solid "
          + ((this.state.fiVinculo || "staff") === a.key ? BLUE + "; background:#ffffff; color:" + BLUE_D + "; font-weight:600;" : "#c9d4de; color:#3c4a55;"),
        go: () => this.setState({ fiVinculo: a.key }) })),
      modalBorrar: this.state.modal === "borrar",
      modalSn: this.state.modalSn ? String(this.state.modalSn) : "",
      modalNombre: this.state.modalNombre || "",
      modalRol: ({ benef: "Beneficiario", colab: "Colaborador", adm: "Administración", vol: "Voluntario" })[this.state.modalRol] || "",
      modalError: this.state.modalError || "",
      cerrarModal: () => this.cerrarModal(),
      cerrarPorFondo: (e) => this.cerrarPorFondo(e),
      condCerrarPorFondo: (e) => {
        if (e.target === e.currentTarget && !this.state.condGuardando)
          this.setState({ condOpen: false, condErr: "" });
      },
      condBorrarPorFondo: (e) => {
        if (e.target === e.currentTarget) this.setState({ condBorrar: null });
      },
      confirmarModal: () => this.confirmarModal(),
      modalConfirmLabel: this.state.modalOcupado
        ? (this.state.modal === "borrar" ? "Borrando…"
           : this.state.modal === "camara"
             ? (this.state.camModo === "base" ? "Registrando…" : "Marcando…")
           : "Guardando…")
        : this.state.modal === "camara"
            ? (this.state.camModo === "base"
               ? "Registrar mi rostro" : "Confirmar y marcar")
        : this.state.modal === "retirarRostro" ? "Sí, retirar mi rostro"
        : this.state.modal === "borrar" ? "Sí, borrar del terminal y de yunatt"
        : this.state.modal === "borrarDoc" ? "Sí, eliminar"
        : this.state.modal === "documento" ? (this.state.docId ? "Guardar cambios" : "Registrar")
        : this.state.modal === "sesion"
            ? (this.state.serieEditId ? "Guardar la corrección" : "Registrar sesión")
        : this.state.modal === "reporte" ? "Generar reporte"
        : this.state.modal === "firma"
            ? (this.state.frId ? "Firmar y aprobar" : "Guardar mi firma")
        : this.state.modal === "programa"
            ? (this.state.serieEditId ? "Guardar la corrección" : "Registrar programa")
        : this.state.modal === "historial"
            ? (this.state.serieEditId ? "Guardar la corrección" : "Registrar año escolar")
        : this.state.modal === "seguimiento"
            ? (this.state.serieEditId ? "Guardar la corrección" : "Registrar seguimiento")
        : this.state.modal === "incidencia"
            ? (this.state.serieEditId ? "Guardar la corrección" : "Registrar incidencia")
        : this.state.modal === "beneficiario" ? (this.state.beId ? "Guardar cambios" : "Registrar beneficiario")
        : this.state.modal === "rechazar" ? "Sí, rechazar"
        : this.state.modal === "pedirPermiso" ? "Enviar solicitud"
        : this.state.modal === "formacion"
            ? (this.state.trEditId ? "Guardar la corrección" : "Agregar formación")
        : this.state.modal === "experiencia"
            ? (this.state.trEditId ? "Guardar la corrección" : "Agregar experiencia")
        : this.state.modal === "vinculo" ? (this.state.vinEditando ? "Guardar vínculo" : "Vincular")
        : this.state.modal === "quitarVinculo" ? "Sí, quitar"
        : this.state.modal === "responsable" ? (this.state.rspId ? "Guardar cambios" : "Registrar responsable")
        : this.state.modal === "borrarResp" ? "Sí, eliminar"
        : this.state.modal === "usuario" ? (this.state.uxId ? "Cambiar la contraseña" : "Crear la cuenta")
        : this.state.modal === "rol" ? (this.state.rxRolClave === "director" ? "Entendido" : (this.state.rxId ? "Guardar permisos" : "Crear el cargo"))
        : this.state.modal === "ficha" && !this.state.modalId ? "Crear ficha"
        : "Guardar cambios",
      modalConfirmStyle: "font-size:13.5px; font-weight:600; padding:10px 20px; "
        + "border-radius:3px; color:#ffffff; background:"
        + (this.state.modalOcupado ? "#9aa7b2"
           : (this.state.modal === "borrar" || this.state.modal === "borrarDoc") ? "#a8321f"
           : "#2f8f5b") + ";",

