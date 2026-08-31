  cargarPersonal() {
    this.api("/api/personal")
      .then((d) => { if (this._vivo) this.setState({ personal: d.personal || [] }); })
      .catch(() => {});
  }

/*§CORTE§ linea original 6116 §*/
  abrirEditar(p) {
    /* Editar desde Asistencia lleva a la ficha del titular: el nombre y el
       documento viven en Hoja de Vida (o en Beneficiarios), no en la
       biométrica. Así no hay dos sitios donde cambiar lo mismo. */
    if (p.tipo === "beneficiario") {
      this.setState({ syncEstado: "error",
        syncMsg: "Los datos de " + p.nombre + " se editan en el módulo Beneficiarios." });
      return;
    }
    const ficha = (this.state.personal || []).find((x) => x.staff_number === p.staff_number);
    if (!ficha) {
      this.setState({ syncEstado: "error", syncMsg: "No se encontró la ficha de " + p.nombre + "." });
      return;
    }
    this.abrirFicha(ficha);
  }

/*§CORTE§ linea original 6232 §*/
  filasReales() {
    const metodoLabel = { facial: "Rostro", huella: "Huella", ambos: "Rostro y huella" };
    /* Todo lo que llega aquí está enrolado: el backend solo devuelve
       identidades confirmadas por el terminal. */
    return (this.state.personasReales || []).map((p) => {
      const marco = !!p.entrada;
      return {
        nombre: p.nombre,
        ambito: p.ambito || null,
        rolLabel: Component.etiquetaRol(p),
        sub: Component.etiquetaRol(p) + " · enrolado aquí",
        metodo: metodoLabel[p.metodo] || "Rostro",
        metodoIcon: p.metodo === "huella" ? "ph-fingerprint" : p.metodo === "ambos" ? "ph-shield-check" : "ph-scan-smiley",
        metodoColor: p.metodo === "huella" ? GREEN : BLUE,
        entrada: p.entrada || "—",
        salida: p.salida || "—",
        horas: p.horas || "—",
        /* Sin marcas del día no es "ausente": puede que aún no haya
           llegado o que no se haya sincronizado todavía. Y nunca se dice
           "tardanza": el sistema todavía no sabe el horario de cada
           persona, así que no puede juzgar si llegó tarde. */
        estado: marco ? "Presente" : "Sin marcar",
        /* El sí/no va aparte del rótulo: el conteo de almuerzos se apoyaba
           en comparar el texto "Presente", así que cambiar esa palabra
           habría puesto el número a cero sin romper nada visible. */
        presente: marco,
        color: marco ? GREEN_D : BLUE_D,
        tint: marco ? GREEN_T : BLUE_T,
        entradaColor: "#3c4a55",
        enrolado: true,
        puedeAcciones: true,
        puedeEnrolar: false,
        editar: () => this.abrirEditar(p),
        borrar: () => this.abrirBorrar(p),
        open: () => {}
      };
    });
  }

  /* Las personas reales NO se mezclan con las filas de la maqueta: van en su
     propia sección, con sus propios encabezados.

     El motivo es que cada pestaña usa un juego de columnas distinto. En
     General la tabla agrega por grupo (Pres./Aus./Alm.), así que una hora
     de entrada caía bajo una columna titulada "Pres." y no significaba
     nada. Separarlas también deja claro de un vistazo qué dato es real y
     qué es maqueta.

     Se filtran por DOS criterios independientes:
       - sc  : la pestaña de ámbito. "todos" muestra a cualquiera.
       - mtd : el chip de método biométrico. */
  /* ══════════════════════════════════════════════════════════════════
     ORGANIGRAMA

     Se arma recorriendo jefe_id en profundidad. No se agrupa por área
     fija como hacía la maqueta: la jerarquía sale del dato de cada ficha,
     así que al cambiar el jefe de alguien el árbol se reordena solo.

     Quien no tiene jefe y tampoco tiene gente a cargo NO se cuelga del
     primer nodo que haya: va a una sección aparte, visible, para que se
     note que le falta asignación en vez de inventarle un sitio.
     ══════════════════════════════════════════════════════════════════ */
/*§CORTE§ linea original 10131 §*/
      /* ── Editar / borrar ──────────────────────────────────────────── */
      modalAbierto: !!this.state.modal,
      modalFicha: this.state.modal === "ficha",
      modalDoc: this.state.modal === "documento",
      modalBenef: this.state.modal === "beneficiario",
      beTitulo: this.state.beId ? "Editar expediente" : "Nuevo beneficiario",
      beSubtitulo: this.state.beId
        ? "Se corrige la ficha que ya existe. No se crea una segunda."
        : "Un niño, niña o adolescente acogido. Se registra en Beneficiarios, que es una tabla aparte del personal.",
      beNombre: this.state.beNombre || "",
      onBeNombre: (e) => this.setState({ beNombre: e.target.value }),
      beDoc: this.state.beDoc || "",
      onBeDoc: (e) => this.setState({ beDoc: e.target.value }),
      beNac: this.state.beNac || "",
      onBeNac: (e) => this.setState({ beNac: e.target.value }),
      beSala: this.state.beSala || "",
      onBeSala: (e) => this.setState({ beSala: e.target.value }),
      beGrado: this.state.beGrado || "",
      onBeGrado: (e) => this.setState({ beGrado: e.target.value }),
      beAnio: this.state.beAnio || "",
      onBeAnio: (e) => this.setState({ beAnio: e.target.value }),
      beProcedencia: this.state.beProcedencia || "",
      onBeProcedencia: (e) => this.setState({ beProcedencia: e.target.value }),
      beLengua: this.state.beLengua || "",
      onBeLengua: (e) => this.setState({ beLengua: e.target.value }),
      beViaIngreso: this.state.beViaIngreso || "",
      onBeViaIngreso: (e) => this.setState({ beViaIngreso: e.target.value }),
      beSituacion: this.state.beSituacion || "",
      onBeSituacion: (e) => this.setState({ beSituacion: e.target.value }),
      beExpediente: this.state.beExpediente || "",
      onBeExpediente: (e) => this.setState({ beExpediente: e.target.value }),
      beReferente: this.state.beReferente || "",
      onBeReferente: (e) => this.setState({ beReferente: e.target.value }),
      beVisitas: this.state.beVisitas || "",
      onBeVisitas: (e) => this.setState({ beVisitas: e.target.value }),
      beInstitucion: this.state.beInstitucion || "",
      onBeInstitucion: (e) => this.setState({ beInstitucion: e.target.value }),
      beRendimiento: this.state.beRendimiento || "",
      onBeRendimiento: (e) => this.setState({ beRendimiento: e.target.value }),
      beRefuerzo: this.state.beRefuerzo || "",
      onBeRefuerzo: (e) => this.setState({ beRefuerzo: e.target.value }),
      beSeguro: this.state.beSeguro || "",
      onBeSeguro: (e) => this.setState({ beSeguro: e.target.value }),
      beAlergias: this.state.beAlergias || "",
      onBeAlergias: (e) => this.setState({ beAlergias: e.target.value }),
      beControl: this.state.beControl || "",
      onBeControl: (e) => this.setState({ beControl: e.target.value }),
      beTratamiento: this.state.beTratamiento || "",
      onBeTratamiento: (e) => this.setState({ beTratamiento: e.target.value }),
      bePlanVida: this.state.bePlanVida || "",
      onBePlanVida: (e) => this.setState({ bePlanVida: e.target.value }),
      beTutor: this.state.beTutor || "",
      onBeTutor: (e) => this.setState({ beTutor: e.target.value }),
      bePsicologo: this.state.bePsicologo || "",
      onBePsicologo: (e) => this.setState({ bePsicologo: e.target.value }),
      /* Dos listas iguales: el runtime no deja reutilizar el mismo sc-for
         en dos <select> distintos dentro del mismo diálogo. */
      bePersonas: [{ valor: "", etiqueta: "— Sin asignar —" }].concat(
        (this.state.personal || []).map(x => ({
          valor: String(x.id),
          etiqueta: x.nombre + (x.cargo ? " — " + x.cargo : "") }))),
      bePersonas2: [{ valor: "", etiqueta: "— Sin asignar —" }].concat(
        (this.state.personal || []).map(x => ({
          valor: String(x.id),
          etiqueta: x.nombre + (x.cargo ? " — " + x.cargo : "") }))),
      beCasas: ["Casa Lima", "Casa Comas"].map(c => ({
        label: c,
        style: "display:flex; align-items:center; gap:8px; padding:9px 15px; border-radius:2px; font-size:14px; border:1px solid "
          + ((this.state.beCasa || "Casa Lima") === c
             ? BLUE + "; background:#ffffff; color:" + BLUE_D + "; font-weight:600;"
             : "#c9d4de; color:#3c4a55;"),
        go: () => this.setState({ beCasa: c })
      })),
      beEdad: (() => {
        const f = this.state.beNac;
        if (!f) return "";
        const n = new Date(f + "T00:00:00");
        if (isNaN(n)) return "";
        const hoy = new Date();
        let a = hoy.getFullYear() - n.getFullYear();
        const m = hoy.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) a--;
        if (a < 0) return "";
        return a === 1 ? "1 año" : a + " años";
      })(),
      beTieneEdad: !!(this.state.beNac),
      /* Ficha completa: valor y onChange de cada campo, generados para
         que no se quede ninguno sin enlazar. */
      beCodigo: st.beCodigo,
      onBeCodigo: (e) => this.setState({ beCodigo: e.target.value }),
      beSexo: st.beSexo,
      onBeSexo: (e) => this.setState({ beSexo: e.target.value }),
      beNacionalidad: st.beNacionalidad,
      onBeNacionalidad: (e) => this.setState({ beNacionalidad: e.target.value }),
      beLugarNac: st.beLugarNac,
      onBeLugarNac: (e) => this.setState({ beLugarNac: e.target.value }),
      beDepto: st.beDepto,
      onBeDepto: (e) => this.setState({ beDepto: e.target.value }),
      beProv: st.beProv,
      onBeProv: (e) => this.setState({ beProv: e.target.value }),
      beDistrito: st.beDistrito,
      onBeDistrito: (e) => this.setState({ beDistrito: e.target.value }),
      beDireccion: st.beDireccion,
      onBeDireccion: (e) => this.setState({ beDireccion: e.target.value }),
      beReferencia: st.beReferencia,
      onBeReferencia: (e) => this.setState({ beReferencia: e.target.value }),
      beTipoVivienda: st.beTipoVivienda,
      onBeTipoVivienda: (e) => this.setState({ beTipoVivienda: e.target.value }),
      beServicios: st.beServicios,
      onBeServicios: (e) => this.setState({ beServicios: e.target.value }),
      beNivel: st.beNivel,
      onBeNivel: (e) => this.setState({ beNivel: e.target.value }),
      beSeccion: st.beSeccion,
      onBeSeccion: (e) => this.setState({ beSeccion: e.target.value }),
      beTurno: st.beTurno,
      onBeTurno: (e) => this.setState({ beTurno: e.target.value }),
      beAnioAcad: st.beAnioAcad,
      onBeAnioAcad: (e) => this.setState({ beAnioAcad: e.target.value }),
      beSitAcad: st.beSitAcad,
      onBeSitAcad: (e) => this.setState({ beSitAcad: e.target.value }),
      beAsisEscolar: st.beAsisEscolar,
      onBeAsisEscolar: (e) => this.setState({ beAsisEscolar: e.target.value }),
      beDificultades: st.beDificultades,
      onBeDificultades: (e) => this.setState({ beDificultades: e.target.value }),
      beNotaEdu: st.beNotaEdu,
      onBeNotaEdu: (e) => this.setState({ beNotaEdu: e.target.value }),
      beTipoSeguro: st.beTipoSeguro,
      onBeTipoSeguro: (e) => this.setState({ beTipoSeguro: e.target.value }),
      beCentroSalud: st.beCentroSalud,
      onBeCentroSalud: (e) => this.setState({ beCentroSalud: e.target.value }),
      beDiscapacidad: st.beDiscapacidad,
      onBeDiscapacidad: (e) => this.setState({ beDiscapacidad: e.target.value }),
      beNecesidades: st.beNecesidades,
      onBeNecesidades: (e) => this.setState({ beNecesidades: e.target.value }),
      beInfoMedica: st.beInfoMedica,
      onBeInfoMedica: (e) => this.setState({ beInfoMedica: e.target.value }),
      beEmergNombre: st.beEmergNombre,
      onBeEmergNombre: (e) => this.setState({ beEmergNombre: e.target.value }),
      beEmergTel: st.beEmergTel,
      onBeEmergTel: (e) => this.setState({ beEmergTel: e.target.value }),
      beNotaSalud: st.beNotaSalud,
      onBeNotaSalud: (e) => this.setState({ beNotaSalud: e.target.value }),
      beIntegrantes: st.beIntegrantes,
      onBeIntegrantes: (e) => this.setState({ beIntegrantes: e.target.value }),
      beHermanos: st.beHermanos,
      onBeHermanos: (e) => this.setState({ beHermanos: e.target.value }),
      beConQuienVive: st.beConQuienVive,
      onBeConQuienVive: (e) => this.setState({ beConQuienVive: e.target.value }),
      beRespEconomico: st.beRespEconomico,
      onBeRespEconomico: (e) => this.setState({ beRespEconomico: e.target.value }),
      beTenencia: st.beTenencia,
      onBeTenencia: (e) => this.setState({ beTenencia: e.target.value }),
      beIngresos: st.beIngresos,
      onBeIngresos: (e) => this.setState({ beIngresos: e.target.value }),
      beDependientes: st.beDependientes,
      onBeDependientes: (e) => this.setState({ beDependientes: e.target.value }),
      beNotaSocio: st.beNotaSocio,
      onBeNotaSocio: (e) => this.setState({ beNotaSocio: e.target.value }),
      modalBorrarDoc: this.state.modal === "borrarDoc",
      docTitulo: this.state.docId
        ? "Corregir documento"
        : (this.state.docTipo === "contrato" ? "Nuevo contrato" : "Nuevo documento"),
      docSubtitulo: this.state.docId
        ? "Actualiza la fecha y el estado se recalcula solo."
        : "Se registra en la ficha de esta persona y entra en las alertas de vencimiento.",
      docTipos: (this.state.docTipo === "contrato" ? Component.TIPOS_CTR : Component.TIPOS_DOC)
        .map(t => ({
          label: t,
          style: "padding:8px 14px; border-radius:2px; font-size:14px; border:1px solid "
            + (this.state.docSel === t ? BLUE + "; background:#ffffff; color:" + BLUE_D + "; font-weight:600;" : "#c9d4de; color:#3c4a55;"),
          go: () => this.setState({ docSel: t, modalError: "" })
        })),
      docEsOtro: this.state.docSel === "Otro",
      docNombre: this.state.docNombre || "",
      docEmitido: this.state.docEmitido || "",
      docVence: this.state.docVence || "",
      onDocNombre: (e) => this.setState({ docNombre: e.target.value, modalError: "" }),
      onDocEmitido: (e) => this.setState({ docEmitido: e.target.value }),
      onDocVence: (e) => this.setState({ docVence: e.target.value }),
      onDocArchivo: (e) => this.elegirArchivo(e),
      docTieneArchivo: !!this.state.docArchivoNombre,
      docArchivoNombre: this.state.docArchivoNombre || "",
      docArchivoTam: Component.pesoLegible(this.state.docArchivoTam),
      docQuitarArchivo: () => this.setState({ docArchivo: null,
                                              docArchivoNombre: "", docArchivoTam: 0 }),
      docArchivoAyuda: this.state.docId && !this.state.docArchivo && this.state.docArchivoNombre
        ? "Ya tiene un archivo. Elige otro solo si quieres reemplazarlo."
        : "PDF, Word, ODT o imagen. Hasta 15 MB. El sistema guarda el archivo que subas; no genera documentos.",
      docPrevio: Component.estadoPrevio(this.state.docVence),
      fiNombre: this.state.fiNombre || "",
      fiDoc: this.state.fiDoc || "",
      fiCargo: this.state.fiCargo || "",
      fiArea: this.state.fiArea || "",
      fiSede: this.state.fiSede || "",
      onFiNombre: (e) => this.setState({ fiNombre: e.target.value, modalError: "" }),
      onFiDoc: (e) => this.setState({ fiDoc: e.target.value }),
      onFiCargo: (e) => this.setState({ fiCargo: e.target.value }),
      onFiArea: (e) => this.setState({ fiArea: e.target.value }),
      onFiSede: (e) => this.setState({ fiSede: e.target.value }),
      fiIngreso: this.state.fiIngreso || "",
      onFiIngreso: (e) => this.setState({ fiIngreso: e.target.value }),
      fiNac: this.state.fiNac || "",
      onFiNac: (e) => this.setState({ fiNac: e.target.value }),
      fiEmail: this.state.fiEmail || "",
      onFiEmail: (e) => this.setState({ fiEmail: e.target.value }),
      fiTelefono: this.state.fiTelefono || "",
      onFiTelefono: (e) => this.setState({ fiTelefono: e.target.value }),
      fiDireccion: this.state.fiDireccion || "",
      onFiDireccion: (e) => this.setState({ fiDireccion: e.target.value }),
      fiEmerNombre: this.state.fiEmerNombre || "",
      onFiEmerNombre: (e) => this.setState({ fiEmerNombre: e.target.value }),
      fiEmerTelefono: this.state.fiEmerTelefono || "",
      onFiEmerTelefono: (e) => this.setState({ fiEmerTelefono: e.target.value }),

