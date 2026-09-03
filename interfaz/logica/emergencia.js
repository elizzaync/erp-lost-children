  /* ══════════════════════════════════════════════════════════════════════
     PASAR LISTA EN UNA EMERGENCIA

     La salida para los días en que ni el terminal ni el celular sirven.
     Nació del 01/09/2026: se cayó la nube del proveedor y la casa se
     quedó sin forma de dejar constancia de que la gente vino.

     Sirve para niños y para el equipo. Para los niños es la ÚNICA vía
     cuando el terminal falla —no tienen teléfono con el que fichar— y por
     eso está pensada para usarse de pie, con el móvil en la mano,
     mirando a quien tienes delante.
     ══════════════════════════════════════════════════════════════════════ */

  /* Al entrar se rellenan día y hora con AHORA. Casi siempre se pasa
     lista en el momento, y obligar a escribir la fecha cada vez sería
     pedir trabajo para el caso raro. */
  prepararEmergencia() {
    const ahora = new Date();
    const dos = (n) => String(n).padStart(2, "0");
    this.setState({
      emgFecha: ahora.getFullYear() + "-" + dos(ahora.getMonth() + 1) + "-" + dos(ahora.getDate()),
      emgHora: dos(ahora.getHours()) + ":" + dos(ahora.getMinutes()),
      emgError: "", emgOk: "",
      emgQuienes: this.state.emgQuienes || "ninos",
    });
    this.cargarEstadoTerminal();
  }

  /* Anota la asistencia de una persona.

     El motivo se exige aquí y también en el servidor. Aquí para no hacer
     ir y volver por algo que se ve de antemano; allí porque la pantalla
     se puede saltar. */
  anotarEmergencia(tipo, id, nombre) {
    const motivo = (this.state.emgMotivo || "").trim();
    if (motivo.length < 4) {
      this.setState({ emgError: "Escribe primero por qué se anota a mano.", emgOk: "" });
      return;
    }
    this.setState({ emgError: "", emgOk: "", emgAnotando: tipo + ":" + id });

    this.api("/api/asistencia/manual", {
      method: "POST",
      body: JSON.stringify({
        tipo: tipo, titular_id: id,
        fecha: this.state.emgFecha, hora: this.state.emgHora,
        motivo: motivo,
      }),
    })
      .then((d) => {
        if (!this._vivo) return;
        const ya = (this.state.emgHechos || []).slice();
        ya.push(tipo + ":" + id);
        this.setState({
          emgHechos: ya,
          emgAnotando: "",
          emgOk: d.repetida
            ? (nombre + " ya tenía una marca a esa hora.")
            : (nombre + " anotado a las " + this.state.emgHora + "."),
        });
        /* Que el registro de asistencia lo refleje sin recargar: es la
           pantalla a la que se va después a comprobar. */
        this.cargarPersonas();
        this.cargarRango();
      })
      .catch((e) => {
        if (this._vivo) this.setState({ emgAnotando: "",
          emgError: String((e && e.message) || e) });
      });
  }

  valoresEmergencia() {
    const v = this.state.view;
    const quienes = this.state.emgQuienes || "ninos";
    const hechos = this.state.emgHechos || [];
    const anotando = this.state.emgAnotando || "";

    /* Quién se lista. Los niños primero porque son el motivo de que esta
       pantalla exista: el equipo tiene el celular como alternativa, ellos
       no. */
    const fuente = quienes === "ninos"
      ? (this.state.beneficiarios || []).map((b) => ({ tipo: "beneficiario", id: b.id, nombre: b.nombre }))
      : (this.state.personal || []).map((p) => ({ tipo: "personal", id: p.id, nombre: p.nombre }));

    const PALETA = [
      ["#e4eef7", "#0e3d69"], ["#e2f1e8", "#1c5f3a"], ["#fbf0d9", "#8a5c05"],
      ["#fbe7e3", "#a8321f"], ["#efe7f5", "#5b3a7a"], ["#e6f0f2", "#2b5f68"],
    ];
    const inicialesDe = (n) => String(n || "").trim().split(/\s+/)
      .slice(0, 2).map((x) => x[0] || "").join("").toUpperCase() || "?";

    const boton = (activo, hecho) => {
      if (hecho) return "font-size:13px; color:#1c5f3a; background:#e2f1e8; "
        + "padding:8px 14px; border-radius:2px; border:1px solid #a9d5bb; flex-shrink:0;";
      if (activo) return "font-size:13px; color:#7d8e9c; background:#f0ede9; "
        + "padding:8px 14px; border-radius:2px; border:1px solid #c9d4de; flex-shrink:0;";
      return "font-size:13px; color:#ffffff; background:#2f8f5b; "
        + "padding:8px 14px; border-radius:2px; border:1px solid #2f8f5b; flex-shrink:0;";
    };

    const t = this.state.terminal;
    const termBien = !!(t && t.configurado && t.sesion_activa && !t.ultimo_error);

    return {
      isEmergencia: v === "emergencia",

      emgMotivo: this.state.emgMotivo || "",
      onEmgMotivo: (e) => this.setState({ emgMotivo: e.target.value, emgError: "", emgOk: "" }),
      emgFecha: this.state.emgFecha || "",
      onEmgFecha: (e) => this.setState({ emgFecha: e.target.value, emgError: "", emgOk: "" }),
      emgHora: this.state.emgHora || "",
      onEmgHora: (e) => this.setState({ emgHora: e.target.value, emgError: "", emgOk: "" }),

      emgVerNinos: () => this.setState({ emgQuienes: "ninos", emgOk: "", emgError: "" }),
      emgVerEquipo: () => this.setState({ emgQuienes: "equipo", emgOk: "", emgError: "" }),
      emgEstiloNinos: "font-size:13.5px; padding:8px 16px; border-radius:2px; flex:1; "
        + (quienes === "ninos"
          ? "background:#e4eef7; color:#0e3d69; border:1px solid #1462a5;"
          : "background:#ffffff; color:#5b7185; border:1px solid #c9d4de;"),
      emgEstiloEquipo: "font-size:13.5px; padding:8px 16px; border-radius:2px; flex:1; "
        + (quienes === "equipo"
          ? "background:#e4eef7; color:#0e3d69; border:1px solid #1462a5;"
          : "background:#ffffff; color:#5b7185; border:1px solid #c9d4de;"),

      emgLista: fuente.map((p) => {
        const clave = p.tipo + ":" + p.id;
        const hecho = hechos.indexOf(clave) >= 0;
        const activo = anotando === clave;
        const par = PALETA[String(p.nombre || "").length % PALETA.length];
        return {
          nombre: p.nombre,
          iniciales: inicialesDe(p.nombre),
          tint: par[0], color: par[1],
          estado: hecho ? "Anotado" : (activo ? "Anotando…" : "Sin anotar"),
          estadoColor: hecho ? "#1c5f3a" : "#9aa7b2",
          botonTexto: hecho ? "Hecho" : (activo ? "…" : "Anotar"),
          botonEstilo: boton(activo, hecho),
          anotar: () => { if (!hecho && !activo) this.anotarEmergencia(p.tipo, p.id, p.nombre); },
        };
      }),
      emgVacio: fuente.length === 0,

      /* El estado del terminal, para que quien abra esto vea de una que
         quizá no le hace falta. */
      emgTermTitulo: termBien ? "El terminal está funcionando"
        : (t && !t.configurado) ? "El terminal no está configurado"
        : "El terminal no está disponible",
      emgTermDetalle: termBien
        ? "Si puede fichar en el equipo, mejor usa el equipo."
        : ((t && (t.diagnostico || t.ultimo_error)) || "No se pudo consultar su estado.").slice(0, 150),
      emgTermTint: termBien ? "#e2f1e8" : "#fbf0d9",
      emgTermBorde: termBien ? "#a9d5bb" : "#e8d09a",
      emgTermColor: termBien ? "#1c5f3a" : "#8a5c05",
      emgTermIcono: termBien ? "ph-check-circle" : "ph-warning-circle",

      emgError: this.state.emgError || "",
      emgOk: this.state.emgOk || "",
    };
  }
/*§CORTE§ linea original 9001 §*/
      /* Los valores de la pantalla de emergencia. Se calculan en su
         propio método y se esparcen aquí: meter treinta líneas de
         cálculo dentro de este objeto lo haría ilegible. */
      ...this.valoresEmergencia(),
