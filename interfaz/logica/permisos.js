  /* ── Las dos semanas últimas, para los gráficos del panel ───────────
     Sale del mismo endpoint que la vista semanal; lo que cambia es el
     rango. Se pide aparte y no se reutiliza `rango` porque aquel lo manda
     la pestaña que esté abierta, y el panel no debería cambiar de forma
     según dónde estuviera antes el usuario. */
  cargarTendencia() {
    const hoy = new Date();
    const dosSemanas = new Date(hoy.getTime() - 13 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    this.api("/api/asistencia/rango?desde=" + iso(dosSemanas)
             + "&hasta=" + iso(hoy))
      .then((d) => { if (this._vivo) this.setState({
        asTendencia: d.personas || [], asTendenciaDesde: iso(dosSemanas),
        asTendenciaHasta: iso(hoy) }); })
      .catch(() => {});
  }

  cargarResumenAsistencia() {
    this.api("/api/asistencia/resumen")
      .then((d) => { if (this._vivo) this.setState({ asResumen: d }); })
      .catch(() => { if (this._vivo) this.setState({ asResumen: null }); });
  }

/*§CORTE§ linea original 7132 §*/
  cargarPermisos(filtro) {
    const f = filtro === undefined ? (this.state.gsFiltro || "") : filtro;
    this.setState({ gsFiltro: f, gsAviso: "" });
    /* Los tipos los carga normalmente la pantalla de autoservicio. Quien
       entra directo aquí a revisar también necesita el filtro lleno, o
       verá un desplegable con una sola opción y sin saber por qué. */
    if (!(this.state.misTipos || []).length) {
      this.api("/api/permisos/tipos")
        .then((d) => { if (this._vivo) this.setState({ misTipos: d.tipos || [] }); })
        .catch(() => {});
    }
    this.api("/api/permisos" + (f ? "?estado=" + f : ""))
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ gsLista: d.solicitudes || [], gsResumen: d.resumen || {} });
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ gsLista: [], gsAviso: (e && e.message) || "No se pudo cargar." });
      });
  }

  /* Lo que se ve tras aplicar chips, tipo y buscador. En un método y no
     dentro de renderVals porque se usa dos veces: para la lista y para
     el «3 de 12» de arriba, y deben coincidir siempre. */
/*§CORTE§ linea original 7157 §*/
  solicitudesVisibles() {
    const texto = String(this.state.gsBusca || "").trim().toLowerCase();
    const tipo = this.state.gsTipo || "";
    return (this.state.gsLista || []).filter((x) => {
      if (tipo && x.tipo !== tipo) return false;
      if (!texto) return true;
      return (String(x.persona || "") + " " + String(x.tipo_etiqueta || "")
              + " " + String(x.cargo || "")).toLowerCase().indexOf(texto) >= 0;
    });
  }

/*§CORTE§ linea original 7168 §*/
  resolverPermiso(id, accion, nota) {
    this.api("/api/permisos/" + id + "/" + accion,
             { method: "POST", body: JSON.stringify({ nota: nota || "" }) })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modal: "", modalOcupado: false, grId: null, grNota: "" });
        this.cargarPermisos();
      })
      .catch((e) => {
        if (!this._vivo) return;
        /* El error se enseña donde el usuario está mirando: si el diálogo
           sigue abierto, dentro; si no, arriba de la lista. */
        const msg = (e && e.message) || "No se pudo resolver.";
        if (this.state.modal === "rechazar")
          this.setState({ modalOcupado: false, modalError: msg });
        else
          this.setState({ gsAviso: msg });
      });
  }

/*§CORTE§ linea original 7188 §*/
  rechazarPermiso() {
    const nota = (this.state.grNota || "").trim();
    if (!nota) {
      this.setState({ modalError: "Escribe el motivo: quien la pidió tiene "
                                  + "derecho a saber por qué." });
      return;
    }
    this.setState({ modalOcupado: true, modalError: "" });
    this.resolverPermiso(this.state.grId, "rechazar", nota);
  }

/*§CORTE§ linea original 7199 §*/
  cargarMisPermisos() {
    this.api("/api/permisos/mios")
      .then((d) => {
        if (!this._vivo) return;
        this.setState({
          misSolicitudes: d.solicitudes || [],
          /* null no es 0: significa que a esta persona no le aplican las
             vacaciones (no está en planilla, o no tiene fecha de ingreso). */
          miSaldo: d.saldo_vacaciones,
          miUmbral: d.dias_visto_bueno_admin || 7,
          misTipos: d.tipos || [],
          /* La ficha de quien pide, para la cabecera del documento, y el
             formato de papel, para dibujar las diez casillas iguales que
             en el PDF. */
          miFicha: d.yo || null,
          miFormato: d.formato || null,
          miPeriodos: d.periodos || [],
        });
        /* La firma decide el rótulo del botón —«Mi firma» o «Registrar mi
           firma»—, así que hace falta antes de que nadie lo mire. */
        this.cargarMiFirma();
      })
      .catch(() => {
        if (this._vivo) this.setState({ misSolicitudes: [], miSaldo: null });
      });
  }

/*§CORTE§ linea original 7226 §*/
  pedirPermiso() {
    const st = this.state;
    if (!st.mpTipo)  { this.setState({ modalError: "Elige el tipo de permiso." }); return; }
    if (!st.mpDesde) { this.setState({ modalError: "Pon la fecha de inicio." }); return; }
    if (!st.mpHasta) { this.setState({ modalError: "Pon la fecha de fin." }); return; }
    if (st.mpHoraDesde && st.mpHoraHasta && st.mpHoraHasta <= st.mpHoraDesde
        && st.mpDesde === st.mpHasta) {
      this.setState({ modalError: "La hora de fin tiene que ser posterior a la de inicio." });
      return;
    }
    this.setState({ modalOcupado: true, modalError: "" });
    const archivo = st.mpArchivo;
    this.api("/api/permisos", { method: "POST", body: JSON.stringify({
      tipo: st.mpTipo, desde: st.mpDesde, hasta: st.mpHasta,
      motivo: st.mpMotivo || "",
      periodo: st.mpPeriodo || "",
      hora_desde: st.mpHoraDesde || "", hora_hasta: st.mpHoraHasta || ""
    })})
      .then((d) => {
        /* El sustento va aparte porque necesita multipart. Si esta segunda
           petición falla, la solicitud YA está creada: se dice, para que
           la persona sepa que tiene que adjuntar de nuevo y no volver a
           pedir el permiso. */
        if (!archivo || !d || !d.id) return null;
        const fd = new FormData();
        fd.append("archivo", archivo, archivo.name);
        return fetch("/api/permisos/" + d.id + "/sustento",
                     { method: "POST", body: fd, headers: this.cabecerasCsrf() })
          .then((r) => r.json().then((x) => {
            if (!r.ok || x.ok === false) throw new Error(x.error || ("HTTP " + r.status));
            return x;
          }))
          .catch((e) => { throw new Error(
            "La solicitud se creó, pero el documento no se pudo adjuntar: "
            + (e.message || e) + " Ábrela y vuelve a adjuntarlo."); });
      })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modal: "", modalOcupado: false,
                        mpHoraDesde: "", mpHoraHasta: "", mpArchivo: null });
        this.cargarMisPermisos();
      })
      .catch((e) => {
        if (!this._vivo) return;
        /* El motivo del rechazo viene del backend y se enseña tal cual: son
           cosas que la persona puede corregir —fechas cruzadas, saldo corto—
           y decirle cuál es le ahorra adivinar. */
        this.setState({ modalOcupado: false,
                        modalError: (e && e.message) || "No se pudo enviar." });
      });
  }

/*§CORTE§ linea original 7278 §*/
  cancelarMiPermiso(id) {
    this.api("/api/permisos/" + id + "/cancelar", { method: "POST", body: "{}" })
      .then(() => { if (this._vivo) { this.setState({ mpCancelar: null });
                                      this.cargarMisPermisos(); } })
      .catch((e) => { if (this._vivo) this.setState({
        mpCancelar: null, avisoPermiso: (e && e.message) || "No se pudo cancelar." }); });
  }

/*§CORTE§ linea original 8314 §*/
      /* ── Mis Permisos ────────────────────────────────────────────────
         Todo sale de /api/permisos/mios, que responde sobre la persona de
         la sesión. Esta pantalla no sabe siquiera pedir las de otro. */
      miSaldo: String(this.state.miSaldo === null || this.state.miSaldo === undefined
                      ? "—" : this.state.miSaldo),
      /* null significa "no aplica", no "cero": quien no está en planilla no
         genera vacaciones, y enseñarle un 0 le haría creer que se las
         gastó. Son dos mensajes distintos. */
      miSaldoAplica: this.state.miSaldo !== null && this.state.miSaldo !== undefined,
      miSaldoNoAplica: this.state.miSaldo === null || this.state.miSaldo === undefined,
      miSaldoNota: (() => {
        const n = this.state.miSaldo;
        if (n === null || n === undefined) {
          return "Las vacaciones se generan por antigüedad y solo para quien "
               + "está en planilla. Si crees que deberían aplicarte, avisa a RRHH: "
               + "puede faltar tu fecha de ingreso o tu condición laboral.";
        }
        if (n <= 0) return "No te quedan días disponibles.";
        return "Disponibles hoy, generados por tu antigüedad.";
      })(),
      miSaldoColor: (this.state.miSaldo || 0) > 0 ? GREEN : GOLD,
      miSaldoTint:  (this.state.miSaldo || 0) > 0 ? GREEN_T : GOLD_T,
      miSaldoDark:  (this.state.miSaldo || 0) > 0 ? GREEN_D : GOLD_D,

      /* Sin sesión no hay a quién atribuir la solicitud. En convivencia la
         pantalla se ve, pero el botón no: el backend lo rechazaría igual y
         es mejor decirlo antes que después. */
      miPuedePedir: !!this.state.sesion,

      misVacio: (this.state.misSolicitudes || []).length === 0,
      misVacioNota: this.state.sesion
        ? "Cuando pidas uno aparecerá aquí, con el estado en el que va."
        : "Para pedir un permiso hay que entrar con tu usuario: el sistema "
        + "necesita saber a nombre de quién va la solicitud.",

      misSolicitudes: (this.state.misSolicitudes || []).map((x) => {
        const pinta = {
          pendiente:       [GOLD,  GOLD_T,  GOLD_D,  "Esperando a tu jefatura"],
          pendiente_admin: [GOLD,  GOLD_T,  GOLD_D,  "Esperando a Administración"],
          aprobada:        [GREEN, GREEN_T, GREEN_D, "Aprobada"],
          rechazada:       [RED,   RED_T,   RED_D,   "Rechazada"],
          cancelada:       ["#9aa7b2", "#f0ede9", "#5b7185", "Cancelada"],
        }[x.estado] || ["#9aa7b2", "#f0ede9", "#5b7185", x.estado];
        return {
          tipo: x.tipo_etiqueta,
          estado: pinta[3],
          color: pinta[0],
          estiloEstado: "font-size:11px; padding:3px 9px; border-radius:2px; "
            + "white-space:nowrap; color:" + pinta[2] + "; background:" + pinta[1] + ";",
          periodo: x.desde === x.hasta ? x.desde : (x.desde + " → " + x.hasta),
          detalle: (x.dias === 1 ? "1 día" : x.dias + " días")
            + (x.motivo ? " · " + x.motivo : "")
            + (x.jefe ? " · revisa " + x.jefe : ""),
          tieneNota: !!x.nota,
          nota: x.nota,
          /* Se ofrece cancelar solo si el backend dice que cabe. Repetir
             aquí las reglas de transición sería tener dos versiones de la
             misma verdad, y acabarían discrepando. */
          /* Se abre en otra pestaña: el navegador ya sabe enseñar un PDF
             y bajarlo, y así no se pierde lo que hubiera en pantalla. */
          verDocumento: () => window.open("/api/permisos/" + x.id + "/documento.pdf", "_blank"),
          puedeCancelar: (x.acciones || []).indexOf("cancelar") >= 0
                         && !!this.state.sesion,
          cancelar: () => this.cancelarMiPermiso(x.id),
        };
      }),

      avisoPermiso: this.state.avisoPermiso || "",

/*§CORTE§ linea original 8383 §*/
      /* ── El diálogo ─────────────────────────────────────────────────── */
/*§CORTE§ linea original 8384 §*/
      /* ── La firma ────────────────────────────────────────────────── */
      modalFirma: this.state.modal === "firma",
      firmaUrl: this.state.firmaUrl || "",
      /* Con firma guardada se enseña; sin ella, o al pedir otra, se dibuja.
         `firmaRehacer` no borra la de la base: solo abre el lienzo, y la
         anterior sigue valiendo si al final no se dibuja nada. */
      firmaHay: !!this.state.firmaUrl,
      firmaDibujando: !this.state.firmaUrl,
      firmaTitulo: this.state.frId ? "Firmar y aprobar" : "Mi firma",
      firmaSubtitulo: this.state.frId
        ? this.state.frDetalle + ". Al firmar, la solicitud queda aprobada y "
          + "tu firma sale en el documento."
        : (this.state.firmaUrl
           ? "Es la que se estampa en tus permisos cuando los envías, y en "
             + "los que apruebas."
           : "Dibújala una vez. El sistema la pondrá en los documentos que "
             + "firmes, sin volver a pedírtela."),
      firmaBoton: this.state.firmaUrl ? "Mi firma" : "Registrar mi firma",
      firmaAviso: this.state.firmaAviso || "",
      firmaAvisoHay: !!this.state.firmaAviso,
      firmaAbrir: () => this.abrirFirma(null),
      firmaLimpiar: () => this.limpiarLienzo(),
      firmaBorrar: () => this.borrarMiFirma(),
      firmaRehacer: () => { this._hayTrazo = false; this._lienzo = null;
                            this.setState({ firmaUrl: null, firmaAviso: "" }); },

      modalPedirPermiso: this.state.modal === "pedirPermiso",
      /* Solo este diálogo lleva dos paneles; el resto se queda estrecho,
         que es lo que les conviene para leerse de un vistazo. */
      /* El documento es más ancho que la maqueta que había antes: con 1000
         los dos paneles no cabían y se apilaban. */
      /* El formato tiene proporción de hoja: al lado del formulario no
         cabe a un tamaño legible, así que el documento va debajo de los
         campos y no en una segunda columna. Encogerlo hasta que quepa lo
         haría dejar de parecerse al papel, que es justo lo que se busca. */
      modalAncho: this.state.modal === "pedirPermiso" ? "1080px"
                : this.state.modal === "camara" ? "520px" : "560px",
      /* auto-fit y no «1fr 1fr»: en una pantalla estrecha los dos paneles
         se apilan solos, sin necesidad de una hoja de estilos aparte. */
      mpColumnas: "repeat(auto-fit, minmax(340px, 1fr))",
      mpAbrir: () => this.setState({
        modal: "pedirPermiso", modalError: "", avisoPermiso: "",
        mpTipo: ((this.state.misTipos || [])[0] || {}).valor || "",
        mpDesde: "", mpHasta: "", mpMotivo: "", mpPeriodo: ""
      }),
/*§CORTE§ linea original 8428 §*/
      /* ── El documento en vivo ────────────────────────────────────────
         Lo que queda aquí es lo que el formato pinta; el resto de valores
         de la maqueta anterior se fueron con ella. */
      mpDocNombre: (st.miFicha && st.miFicha.nombre)
                   || (st.sesion && st.sesion.nombre) || "",
      mpDocTotal: (() => {
        if (!st.mpDesde) return "";
        const d = this.diasEntre(st.mpDesde, st.mpHasta || st.mpDesde);
        if (d === null) return "";
        return d === 1 ? "1 día" : d + " días";
      })(),
      mpHoraDesde: st.mpHoraDesde || "",
      onMpHoraDesde: (e) => this.setState({ mpHoraDesde: e.target.value, modalError: "" }),
      mpHoraHasta: st.mpHoraHasta || "",
      onMpHoraHasta: (e) => this.setState({ mpHoraHasta: e.target.value, modalError: "" }),
      /* El archivo no va al estado como texto: se guarda el objeto tal
         cual para poder enviarlo después. */
      onMpArchivo: (e) => this.setState({
        mpArchivo: (e.target.files && e.target.files[0]) || null, modalError: "" }),
      mpHoraNota: (st.mpHoraDesde || st.mpHoraHasta)
        ? "Las horas quedan registradas en la solicitud. No cambian el número de días ni el saldo de vacaciones."
        : "Solo si el permiso no ocupa el día entero. Opcional.",
      mpDocSustento: st.mpArchivo ? st.mpArchivo.name : "Sin documento adjunto",
      mpDocMotivo: st.mpMotivo || "Sin motivo indicado",
      /* El jefe sale de la ficha de quien pide, no se escribe aquí. Si no
         tiene jefe asignado se dice, porque entonces la solicitud no
         tiene a quién ir. */
      mpDocJefe: (() => {
        const yo = (this.state.personal || []).find(
          (x) => st.sesion && x.id === st.sesion.personal_id);
        if (!yo) return "Por asignar";
        const jefe = (this.state.personal || []).find((x) => x.id === yo.jefe_id);
        return jefe ? jefe.nombre : "Sin jefe asignado";
      })(),
      mpDocAvisoHay: (() => {
        if (!st.mpDesde) return false;
        const d = this.diasEntre(st.mpDesde, st.mpHasta || st.mpDesde);
        return d !== null && d > (this.state.miUmbral || 7);
      })(),
      mpDocAviso: "Pasa del umbral de " + (this.state.miUmbral || 7)
        + " días: además de tu jefe, necesitará la firma de Administración.",

      mpTipos: (this.state.misTipos || []).map(
        (t) => ({ valor: t.valor, etiqueta: t.etiqueta })),
      mpTipo: this.state.mpTipo || "",
      onMpTipo: (e) => this.setState({ mpTipo: e.target.value, modalError: "" }),
      mpDesde: this.state.mpDesde || "",
      onMpDesde: (e) => this.setState({ mpDesde: e.target.value, modalError: "" }),
      mpHasta: this.state.mpHasta || "",
      onMpHasta: (e) => this.setState({ mpHasta: e.target.value, modalError: "" }),
      mpMotivo: this.state.mpMotivo || "",
      onMpMotivo: (e) => this.setState({ mpMotivo: e.target.value }),
      mpPeriodo: this.state.mpPeriodo || "",
      onMpPeriodo: (e) => this.setState({ mpPeriodo: e.target.value }),
      /* Los periodos se calculan sobre la fecha de ingreso de cada
         persona: en el Perú van de aniversario a aniversario, no de enero
         a diciembre. Los da el servidor. */
      mpPeriodos: (this.state.miPeriodos || []).map((x) => ({
        valor: x.valor,
        etiqueta: x.etiqueta + (x.en_curso ? " · en curso" : ""),
      })),
      mpPeriodoNota: (this.state.miPeriodos || []).length
        ? "A qué periodo se cargan los días. Sale impreso en la autorización."
        : "Opcional. Sale impreso en la autorización.",

/*§CORTE§ linea original 8496 §*/
      /* ── El documento de la vista previa ──────────────────────────────
         Los huecos se ven como huecos: un permiso a medio llenar tiene que
         parecer a medio llenar. */
      mpDocFechaCorta: this.fechaCorta(this.fechaHoy()),
      mpDocArea: (st.miFicha && st.miFicha.area) || "",
      mpDocPuesto: (st.miFicha && st.miFicha.cargo) || "",
      mpDocPeriodo: st.mpPeriodo || "",
      mpDocDesdeCorta: this.fechaCorta(st.mpDesde),
      mpDocHastaCorta: this.fechaCorta(st.mpHasta || st.mpDesde),
      mpDocHoraDesde: st.mpHoraDesde || "",
      mpDocHoraHasta: st.mpHoraHasta || "",
      /* Las diez casillas del papel. La marcada la decide el servidor con
         la misma tabla que usa al imprimir; si aquí se escribiera otra
         vez, un día dirían cosas distintas. */
      mpCasillas: (() => {
        const f = st.miFormato;
        if (!f) return [];
        const marcada = (f.casilla_de || {})[st.mpTipo] || 10;
        const suelto = (f.casilla_de || {})[st.mpTipo]
          ? "" : (((st.misTipos || []).find((x) => x.valor === st.mpTipo) || {}).etiqueta || "");
        return (f.casillas || []).map((c) => ({
          marca: c.numero === marcada ? "X" : "",
          texto: "(" + c.numero + ") " + c.etiqueta
                 + (c.numero === 10 && suelto ? ": " + suelto : ""),
          estilo: c.numero === marcada ? "font-weight:700;" : "",
        }));
      })(),
      mpNota: "La solicitud va a tu jefatura directa. Si dura más de "
        + (this.state.miUmbral || 7) + " días corridos, después necesita "
        + "además el visto bueno de Administración.",
      /* Se dicen los días y a quién le va a tocar ANTES de enviar: es la
         diferencia entre pedir dos semanas sabiéndolo y descubrirlo luego. */
      mpResumen: (() => {
        const d1 = this.state.mpDesde, d2 = this.state.mpHasta;
        if (!d1 || !d2) return "";
        const a = new Date(d1 + "T00:00:00"), b = new Date(d2 + "T00:00:00");
        if (isNaN(a) || isNaN(b) || b < a) return "";
        const dias = Math.round((b - a) / 86400000) + 1;
        const umbral = this.state.miUmbral || 7;
        return (dias === 1 ? "1 día" : dias + " días corridos")
          + (dias > umbral
              ? " · pasa de " + umbral + ", así que también lo verá Administración"
              : " · lo resuelve tu jefatura");
      })(),

