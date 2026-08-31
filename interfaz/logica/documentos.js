  cargarVencimientos() {
    for (const [tipo, clave] of [["documento", "vencDocs"], ["contrato", "vencContratos"]]) {
      this.api("/api/documentos?tipo=" + tipo)
        .then((d) => { if (this._vivo) this.setState({ [clave]: d.documentos || [] }); })
        .catch(() => {});
    }
  }

  /* Entra a la vista consolidada con el filtro ya puesto: desde el aviso
     del Dashboard hay que ver lo urgente sin volver a filtrar. */
/*§CORTE§ linea original 5795 §*/
  abrirVencimientos(tipo, filtro) {
    this.setState({ view: "legajo", legajoTab: tipo === "contrato" ? "contratos" : "docs",
                    vencFiltro: filtro || "todos" },
                  () => this.cargarVencimientos());
  }

/*§CORTE§ linea original 6680 §*/
  abrirDocumento(tipo, doc, persona) {
    const lista = tipo === "contrato" ? Component.TIPOS_CTR : Component.TIPOS_DOC;
    const conocido = doc && lista.indexOf(doc.nombre) >= 0;
    this.setState({
      modal: "documento", docTipo: tipo, docId: doc ? doc.id : null,
      docPersona: persona ? Number(persona) : null,
      docSel: doc ? (conocido ? doc.nombre : "Otro") : lista[0],
      docNombre: doc ? doc.nombre : "",
      docEmitido: doc ? (doc.emitido || "") : "",
      docVence: doc ? (doc.vence || "") : "",
      /* El adjunto elegido en esta sesión del diálogo. Si el registro ya
         traía uno, se muestra el que hay hasta que se elija otro. */
      docArchivo: null,
      docArchivoNombre: doc ? (doc.archivo_nombre || "") : "",
      docArchivoTam: doc ? (doc.archivo_tam || 0) : 0,
      modalError: "", modalOcupado: false
    });
  }

  /* Solo tamaño y extensión, para avisar antes de subir. La validación de
     verdad la hace el backend: la del navegador se puede saltar. */
/*§CORTE§ linea original 6701 §*/
  elegirArchivo(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      this.setState({ docArchivo: null, docArchivoNombre: "", docArchivoTam: 0 });
      return;
    }
    const ok = [".pdf",".doc",".docx",".odt",".jpg",".jpeg",".png",".webp"];
    const punto = f.name.lastIndexOf(".");
    const ext = punto >= 0 ? f.name.slice(punto).toLowerCase() : "";
    if (ok.indexOf(ext) < 0) {
      this.setState({ docArchivo: null, docArchivoNombre: "", docArchivoTam: 0,
        modalError: "Tipo de archivo no admitido (" + (ext || "sin extensión")
          + "). Se aceptan: " + ok.join(", ") });
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      this.setState({ docArchivo: null, docArchivoNombre: "", docArchivoTam: 0,
        modalError: "El archivo supera el máximo de 15 MB." });
      return;
    }
    this.setState({ docArchivo: f, docArchivoNombre: f.name, docArchivoTam: f.size,
                    modalError: "" });
  }

  /* ── Alta de beneficiarios ──────────────────────────────────────────────
     Tabla y formulario propios. Un niño tiene casa, sala y grado; un
     colaborador tiene cargo, área y contrato. Forzarlos al mismo formulario
     dejaría media ficha vacía en los dos casos. */

  /* ── Sesiones de acompañamiento e incidencias ───────────────────────────
     Cuelgan de un beneficiario real. En un marcador de la maqueta no hay
     ficha a la que asociarlas, así que se explica en vez de abrir un
     formulario que no guardaría nada. */

  /* Borra una fila de cualquiera de las tres series. Una sola función:
     las tres se comportan igual y tener tres copias garantiza que un día
     se arregle una y se olviden las otras dos. */
/*§CORTE§ linea original 7344 §*/
  abrirBorrarDocumento(doc) {
    this.setState({ modal: "borrarDoc", docId: doc.id, docNombre: doc.nombre,
                    modalError: "", modalOcupado: false });
  }

/*§CORTE§ linea original 7349 §*/
  guardarDocumento() {
    const esOtro = this.state.docSel === "Otro";
    const nombre = (esOtro ? (this.state.docNombre || "") : this.state.docSel).trim();
    if (!nombre) { this.setState({ modalError: "Escribe el nombre del documento." }); return; }
    this.setState({ modalOcupado: true, modalError: "" });
    const cuerpo = JSON.stringify({
      tipo: this.state.docTipo, nombre: nombre,
      emitido: this.state.docEmitido || "", vence: this.state.docVence || ""
    });
    const editando = !!this.state.docId;
    /* Puede venir de la ficha abierta o de la lista del módulo, donde se
       elige a la persona en la propia fila. */
    const destino = this.state.docPersona || this.state.sel;
    const fichero = this.state.docArchivo;

    /* Con adjunto va como multipart; sin él, como JSON de siempre. No se
       puede fijar Content-Type a mano en el multipart: el navegador tiene
       que añadir el boundary. */
    let peticion;
    if (fichero && !editando) {
      const fd = new FormData();
      fd.append("tipo", this.state.docTipo);
      fd.append("nombre", nombre);
      fd.append("emitido", this.state.docEmitido || "");
      fd.append("vence", this.state.docVence || "");
      fd.append("archivo", fichero, fichero.name);
      peticion = fetch("/api/personal/" + destino + "/documentos",
                       { method: "POST", body: fd, headers: this.cabecerasCsrf() })
        .then((r) => r.json().then((d) => {
          if (!r.ok || d.ok === false) throw new Error(d.error || ("HTTP " + r.status));
          return d;
        }));
    } else {
      peticion = this.api(editando ? "/api/documentos/" + this.state.docId
                                   : "/api/personal/" + destino + "/documentos",
                          { method: editando ? "PUT" : "POST", body: cuerpo });
      /* Al corregir un registro que ya existe, el archivo se sube aparte:
         los metadatos y el adjunto son dos cosas independientes. */
      if (fichero && editando) {
        peticion = peticion.then(() => {
          const fd = new FormData();
          fd.append("archivo", fichero, fichero.name);
          return fetch("/api/documentos/" + this.state.docId + "/archivo",
                       { method: "POST", body: fd, headers: this.cabecerasCsrf() })
            .then((r) => r.json().then((d) => {
              if (!r.ok || d.ok === false) throw new Error(d.error || ("HTTP " + r.status));
              return d;
            }));
        });
      }
    }

    peticion
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modal: "", modalOcupado: false, docPersona: null,
          docArchivo: null, docArchivoNombre: "", docArchivoTam: 0,
          syncEstado: "ok",
          syncMsg: editando ? (nombre + " actualizado.") : (nombre + " registrado.") });
        this.cargarDocumentos(destino);
        this.cargarAlertas();
        this.cargarVencimientos();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 7418 §*/
  confirmarBorrarDocumento() {
    const nombre = this.state.docNombre;
    this.setState({ modalOcupado: true, modalError: "" });
    this.api("/api/documentos/" + this.state.docId, { method: "DELETE" })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modal: "", modalOcupado: false,
                        syncEstado: "ok", syncMsg: nombre + " eliminado." });
        this.cargarDocumentos(this.state.sel);
        this.cargarAlertas();
        this.cargarVencimientos();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

  /* Qué estado quedaría con la fecha que se está escribiendo, para que se
     vea antes de guardar que el cálculo es automático. */
  static estadoPrevio(vence) {
    if (!vence) return "";
    const d = new Date(vence + "T00:00:00");
    if (isNaN(d)) return "";
    const dias = Math.round((d - new Date(new Date().toDateString())) / 86400000);
    return dias < 0 ? "Vencido" : dias <= 30 ? "Por vencer" : "Vigente";
  }

/*§CORTE§ linea original 7446 §*/
  cargarDocumentos(id) {
    this.api("/api/personal/" + id + "/documentos")
      .then((d) => {
        if (this._vivo) this.setState({ fichaDocs: d.documentos || [], fichaContratos: d.contratos || [] });
      })
      .catch(() => { if (this._vivo) this.setState({ fichaDocs: [], fichaContratos: [] }); });
  }

  /* Abre la ficha directamente en la sección que interesa: los avisos del
     Dashboard tienen que aterrizar en el problema, no en la portada de la
     ficha obligando a buscarlo otra vez. */
/*§CORTE§ linea original 7964 §*/
      /* ── Vista consolidada de vencimientos ─────────────────────────── */
/*§CORTE§ linea original 7965 §*/
      /* ── Documentos y Contratos del módulo ───────────────────────────
         Una tarjeta por PERSONA, no una fila por papel: la lista es el
         directorio completo, incluida la gente que todavía no tiene nada
         cargado. Se agrupa aquí, en el cliente, a partir de dos listas que
         el estado ya tiene ('personal' y los papeles); no hace falta un
         endpoint nuevo ni una segunda copia de las personas. */
      vencTitulo: lt === "contratos" ? "Contratos de todo el personal"
                                     : "Documentos de todo el personal",
      vencNota: (() => {
        const gente = (this.state.personal || []).length;
        const lista = lt === "contratos" ? (this.state.vencContratos || []) : (this.state.vencDocs || []);
        const cosa = lt === "contratos" ? "contrato" : "documento";
        return gente + (gente === 1 ? " persona · " : " personas · ")
          + lista.length + " " + (lista.length === 1 ? cosa : cosa + "s") + " registrados";
      })(),
      vencBotonAgregar: lt === "contratos" ? "Agregar contrato" : "Agregar documento",
      vencVacioPersona: lt === "contratos" ? "Sin contratos registrados todavía."
                                           : "Sin documentos registrados todavía.",
      vencFiltros: (() => {
        const lista = lt === "contratos" ? (this.state.vencContratos || []) : (this.state.vencDocs || []);
        const cuenta = (e) => lista.filter((x) => x.estado === e).length;
        return [
          { key: "todos",      label: "Todos",      n: lista.length },
          { key: "vencido",    label: "Vencidos",   n: cuenta("vencido") },
          { key: "por_vencer", label: "Por vencer", n: cuenta("por_vencer") },
          { key: "vigente",    label: "Vigentes",   n: cuenta("vigente") },
        ].map((f) => ({
          label: f.label, count: String(f.n),
          style: "display:flex; align-items:center; gap:8px; padding:7px 13px; border-radius:2px; font-size:14px; border:1px solid "
            + ((this.state.vencFiltro || "todos") === f.key
               ? BLUE + "; background:#e4eef7; color:" + BLUE_D + "; font-weight:600;"
               : "#c9d4de; color:#3c4a55;"),
          go: () => this.setState({ vencFiltro: f.key }),
        }));
      })(),
      vencPersonas: (() => {
        const esContrato = lt === "contratos";
        const todas = esContrato ? (this.state.vencContratos || []) : (this.state.vencDocs || []);
        const lista = this.filtradas(todas, ["persona", "nombre", "tipo", "area", "cargo"],
                                     this.state.busLegajo);
        const filtro = this.state.vencFiltro || "todos";
        const cfg = {
          vencido:         [RED_D, RED_T, "Vencido"],
          por_vencer:      [GOLD_D, GOLD_T, "Por vencer"],
          vigente:         [GREEN_D, GREEN_T, "Vigente"],
          sin_vencimiento: ["#5b7185", "#f0ede9", "Sin vencimiento"],
        };
        const orden = { vencido: 0, por_vencer: 1, vigente: 2, sin_vencimiento: 3 };
        const fila = (d) => {
          const c = cfg[d.estado] || cfg.sin_vencimiento;
          let vig = d.vence || "Sin vencimiento";
          if (d.vence && d.dias !== null && d.dias !== undefined) {
            vig += d.dias < 0 ? (" · hace " + Math.abs(d.dias) + " d")
                 : d.dias === 0 ? " · hoy" : (" · en " + d.dias + " d");
          }
          return {
            nombre: d.nombre, vigencia: vig,
            color: c[0], tint: c[1], etiqueta: c[2],
            /* Sin adjunto no se ofrece abrirlo: un botón que da 404 es
               peor que no tener botón. */
            tieneArchivo: !!d.archivo,
            archivoTitulo: d.archivo_nombre
              ? ("Abrir " + d.archivo_nombre + " (" + Component.pesoLegible(d.archivo_tam) + ")")
              : "",
            ver: () => window.open("/api/documentos/" + d.id + "/archivo", "_blank"),
            editar: () => this.abrirDocumento(esContrato ? "contrato" : "documento", d, d.personal_id),
            borrar: () => this.abrirBorrarDocumento(d),
          };
        };
        return (this.state.personal || []).map((p) => {
          const suyos = lista
            .filter((d) => d.personal_id === p.id)
            .filter((d) => filtro === "todos" || d.estado === filtro)
            .sort((a, b) => (orden[a.estado] - orden[b.estado])
                         || String(a.vence).localeCompare(String(b.vence)));
          /* Con un filtro puesto, quien no tenga nada en ese estado no
             estorba; sin filtro aparece todo el mundo, que es el punto. */
          if (filtro !== "todos" && !suyos.length) return null;
          const pal = p.ambito === "adm" ? [BLUE_T, BLUE_D] : [RED_T, RED_D];
          const urgente = suyos.some((d) => d.estado === "vencido")
            ? [RED_D, RED_T] : suyos.some((d) => d.estado === "por_vencer")
            ? [GOLD_D, GOLD_T] : suyos.length ? [GREEN_D, GREEN_T] : ["#9aa7b2", "#f0ede9"];
          const cosa = esContrato ? "contrato" : "documento";
          return {
            nombre: p.nombre, cargo: p.cargo || "Sin cargo registrado",
            ini: ini(p.nombre), tint: pal[0], dark: pal[1],
            papeles: suyos.map(fila),
            tiene: suyos.length > 0,
            vacio: suyos.length === 0,
            resumen: suyos.length ? (suyos.length + " " + (suyos.length === 1 ? cosa : cosa + "s")) : "Ninguno",
            resumenStyle: "font-size:11.5px; letter-spacing:0.05em; text-transform:uppercase; padding:4px 9px; border-radius:2px; white-space:nowrap; color:"
              + urgente[0] + "; background:" + urgente[1] + ";",
            agregar: () => this.abrirDocumento(esContrato ? "contrato" : "documento", null, p.id),
            abrir: () => this.abrirFichaEn(p.id, esContrato ? "contratos" : "docs"),
          };
        }).filter(Boolean);
      })(),
      hayVenc: (this.state.personal || []).length > 0
        && ((this.state.vencFiltro || "todos") === "todos"
            || (lt === "contratos" ? (this.state.vencContratos || []) : (this.state.vencDocs || []))
                 .some((d) => d.estado === this.state.vencFiltro)),
      sinVenc: !((this.state.personal || []).length > 0
        && ((this.state.vencFiltro || "todos") === "todos"
            || (lt === "contratos" ? (this.state.vencContratos || []) : (this.state.vencDocs || []))
                 .some((d) => d.estado === this.state.vencFiltro))),
      vencVacio: (() => {
        if (!(this.state.personal || []).length)
          return "Todavía no hay personas registradas. Usa «Agregar usuario» para crear la primera ficha.";
        const esContrato = lt === "contratos";
        return "Ningún " + (esContrato ? "contrato" : "documento")
          + " en ese estado. Prueba con otro filtro.";
      })(),
      isPersonas: v === "personas",
      isBiometria: v === "biometria",
      isMisPermisos: v === "misPermisos",

