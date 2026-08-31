  cargarParametros() {
    this.api("/api/parametros")
      .then((d) => {
        if (!this._vivo) return;
        const pr = d.parametros || {};
        this.setState({
          parametros: pr,
          cfgOrg: pr.organizacion || "",
          cfgCiudad: pr.ciudad || "",
          cfgFundacion: pr.fecha_fundacion || "",
          /* Si ya hay fecha, entra bloqueada: no es un campo que se toque
             a diario y un cambio accidental altera el Dashboard. */
          cfgEditandoFecha: !pr.fecha_fundacion
        });
      })
      .catch(() => {});
  }

/*§CORTE§ linea original 5825 §*/
  guardarParametros() {
    if (this.state.cfgGuardando) return;
    this.setState({ cfgGuardando: true, cfgError: "", cfgOk: "" });
    this.api("/api/parametros", {
      method: "PUT",
      body: JSON.stringify({
        organizacion: this.state.cfgOrg || "",
        ciudad: this.state.cfgCiudad || "",
        fecha_fundacion: this.state.cfgFundacion || ""
      })
    })
      .then((d) => {
        if (!this._vivo) return;
        const pr = d.parametros || {};
        this.setState({
          cfgGuardando: false, parametros: pr,
          cfgEditandoFecha: !pr.fecha_fundacion,
          cfgOk: "Parámetros guardados."
        });
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ cfgGuardando: false, cfgError: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 7470 §*/
  cargarCondiciones(id) {
    this.api("/api/personal/" + id + "/condiciones")
      .then((d) => {
        if (this._vivo) this.setState({ condVigente: d.vigente || null,
                                        condHistorial: d.historial || [] });
      })
      .catch(() => { if (this._vivo) this.setState({ condVigente: null, condHistorial: [] }); });
  }

/*§CORTE§ linea original 7479 §*/
  abrirCondicion() {
    const hoy = new Date().toISOString().slice(0, 10);
    const v = this.state.condVigente;
    this.setState({
      condOpen: true, condErr: "",
      /* Se parte de lo que ya rige para que un cambio de sueldo no obligue
         a reescribir el régimen y la jornada desde cero. */
      condRegimen: (v && v.regimen) || "planilla",
      condSueldo: v && v.regimen !== "sin_pago" ? String(v.sueldo_base) : "",
      condJornada: v ? String(v.jornada_horas) : "8",
      condDesde: hoy, condNota: ""
    });
  }

/*§CORTE§ linea original 7493 §*/
  guardarCondicion() {
    const id = this.state.sel;
    const regimen = this.state.condRegimen || "planilla";
    const sinPago = regimen === "sin_pago";
    const sueldo = sinPago ? 0 : Number(this.state.condSueldo || 0);
    if (!this.state.condDesde) {
      this.setState({ condErr: "Indica desde cuándo rige." }); return;
    }
    if (!sinPago && !(sueldo > 0)) {
      this.setState({ condErr: "El sueldo debe ser mayor que cero." }); return;
    }
    this.setState({ condGuardando: true, condErr: "" });
    this.api("/api/personal/" + id + "/condiciones", {
      method: "POST",
      body: JSON.stringify({ regimen: regimen, sueldo_base: sueldo,
                             jornada_horas: Number(this.state.condJornada || 8),
                             vigente_desde: this.state.condDesde,
                             nota: this.state.condNota || "" })
    })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ condOpen: false, condGuardando: false,
                        condVigente: d.vigente || null,
                        condHistorial: d.historial || [] });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ condGuardando: false,
                                        condErr: (e && e.message) || "No se pudo guardar." });
      });
  }

/*§CORTE§ linea original 7524 §*/
  borrarCondicion(c) {
    this.api("/api/condiciones/" + c.id, { method: "DELETE" })
      .then((d) => {
        if (this._vivo) this.setState({ condVigente: d.vigente || null,
                                        condHistorial: d.historial || [],
                                        condBorrar: null });
      })
      .catch(() => { if (this._vivo) this.setState({ condBorrar: null }); });
  }

  /* S/ 3 500 — separador de miles con espacio fino, como el resto del sistema. */
  static soles(n) {
    const x = Number(n || 0);
    return "S/ " + x.toLocaleString("es-PE", { minimumFractionDigits: 0,
                                               maximumFractionDigits: 2 });
  }

  static etiquetaRegimen(r) {
    return r === "honorarios" ? "Honorarios"
         : r === "sin_pago"   ? "Sin pago"
         : "Planilla";
  }

  /* ── Planillas ──────────────────────────────────────────────────────────
     La pantalla no calcula nada: pide /api/planillas y muestra lo que
     devuelve. El sueldo sale de las condiciones de cada ficha y los días de
     las marcas del terminal. */

  static mesLargo(periodo) {
    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio",
                   "agosto","septiembre","octubre","noviembre","diciembre"];
    const p = String(periodo || "");
    const t = p.split("-");
    if (t.length !== 2) return p;
    const m = meses[Number(t[1]) - 1];
    return m ? (m + " " + t[0]) : p;
  }

  static etiquetaPeriodo(estado) {
    return estado === "pagado" ? "Pagado"
         : estado === "cerrado" ? "Cerrado"
         : "Abierto";
  }

