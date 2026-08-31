  periodoPlanilla() {
    if (this.state.plaPeriodo) return this.state.plaPeriodo;
    const h = new Date();
    return h.getFullYear() + "-" + String(h.getMonth() + 1).padStart(2, "0");
  }

/*§CORTE§ linea original 7574 §*/
  cargarPlanilla(periodo) {
    const p = periodo || this.periodoPlanilla();
    this.api("/api/planillas?periodo=" + p)
      .then((d) => { if (this._vivo) this.setState({ plaDatos: d }); })
      .catch(() => { if (this._vivo) this.setState({ plaDatos: null }); });
  }

/*§CORTE§ linea original 7581 §*/
  cerrarPlanilla() {
    const p = this.periodoPlanilla();
    this.setState({ plaOcupado: true, plaMsg: "" });
    this.api("/api/planillas/" + p + "/cerrar", { method: "POST" })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ plaOcupado: false, plaMsgError: false,
          plaMsg: d.cerradas + " boleta(s) cerradas. Los montos quedaron congelados: "
                  + "las marcas que lleguen después ya no alteran este mes." });
        this.cargarPlanilla(p);
      })
      .catch((e) => {
        if (this._vivo) this.setState({ plaOcupado: false, plaMsgError: true,
          plaMsg: String((e && e.message) || "No se pudo cerrar el mes.") });
      });
  }

/*§CORTE§ linea original 7598 §*/
  reabrirPlanilla() {
    const p = this.periodoPlanilla();
    this.api("/api/planillas/" + p + "/reabrir", { method: "POST" })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ plaMsgError: false,
          plaMsg: "Mes reabierto. Los montos se vuelven a calcular desde las marcas actuales." });
        this.cargarPlanilla(p);
      })
      .catch((e) => {
        if (this._vivo) this.setState({ plaMsgError: true,
          plaMsg: String((e && e.message) || "No se pudo reabrir el mes.") });
      });
  }

  /* El botón de estado hace lo único que tiene sentido en cada punto:
     en borrador no hay pago que marcar, hay que cerrar el mes primero. */
/*§CORTE§ linea original 7615 §*/
  accionBoleta(fila) {
    const p = this.periodoPlanilla();
    if (fila.estado === "borrador") {
      this.setState({ plaMsgError: true,
        plaMsg: "Hay que cerrar el mes antes de marcar pagos." });
      return;
    }
    const ruta = fila.estado === "pagada" ? "/revertir" : "/pagar";
    this.api("/api/planillas/" + p + "/" + fila.personal_id + ruta, { method: "POST" })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ plaMsgError: false,
          plaMsg: fila.nombre + (fila.estado === "pagada" ? ": pago revertido." : ": pago registrado.") });
        this.cargarPlanilla(p);
      })
      .catch((e) => {
        if (this._vivo) this.setState({ plaMsgError: true,
          plaMsg: String((e && e.message) || "No se pudo cambiar el estado.") });
      });
  }

  /* Por ahora lleva a la ficha, que es donde está el origen del monto. La
     pantalla de detalle de boleta es el paso 6. */
/*§CORTE§ linea original 7638 §*/
  abrirBoleta(fila) {
    this.abrirFichaEn(fila.personal_id, "condiciones");
  }

/*§CORTE§ linea original 10718 §*/
      /* ── Planillas ──────────────────────────────────────────────────
         Todo sale de /api/planillas: el sueldo de las condiciones de cada
         ficha y los días de las marcas del terminal. Aqui no hay ni un
         monto escrito a mano. */
      plaPeriodo: this.periodoPlanilla(),
      setPlaPeriodo: (e) => {
        const p = e.target.value;
        this.setState({ plaPeriodo: p, plaMsg: "" }, () => this.cargarPlanilla(p));
      },
      plaPeriodos: ((this.state.plaDatos || {}).periodos || [this.periodoPlanilla()])
        .map(p => ({ valor: p, etiqueta: Component.mesLargo(p) })),

      plaEstadoLabel: Component.etiquetaPeriodo((this.state.plaDatos || {}).estado),
      plaEstadoStyle: (() => {
        const e = (this.state.plaDatos || {}).estado || "abierto";
        const pal = e === "pagado" ? [GREEN_D, GREEN_T] : e === "cerrado" ? [BLUE_D, BLUE_T] : [GOLD_D, GOLD_T];
        return "font-size:11.5px; letter-spacing:0.06em; text-transform:uppercase; padding:5px 11px; border-radius:2px; color:"
          + pal[0] + "; background:" + pal[1] + ";";
      })(),

      /* Solo se ofrece lo que tiene sentido en cada estado. */
      plaPuedeCerrar: ((this.state.plaDatos || {}).filas || []).length > 0
        && (this.state.plaDatos || {}).estado === "abierto",
      plaPuedeReabrir: ((this.state.plaDatos || {}).estado || "abierto") !== "abierto",
      plaCerrarLabel: this.state.plaOcupado ? "Cerrando…" : "Cerrar el mes",
      plaCerrar: () => this.cerrarPlanilla(),
      plaReabrir: () => this.reabrirPlanilla(),

      plaMsg: this.state.plaMsg || "",
      plaMsgHay: !!this.state.plaMsg,
      plaMsgStyle: "margin:0 0 20px; padding:12px 15px; border-radius:2px; font-size:13.5px; max-width:820px; "
        + (this.state.plaMsgError
           ? "background:#fbe7e3; border-left:4px solid #e2503c; color:#a8321f;"
           : "background:#e2f1e8; border-left:4px solid #2f8f5b; color:#1c5f3a;"),

      plaKpis: (() => {
        const t = (this.state.plaDatos || {}).totales || {};
        const n = t.personas || 0;
        return [
          { label: "Bruto del mes", value: Component.soles(t.bruto || 0),
            note: n + (n === 1 ? " boleta" : " boletas") + " en este período",
            color: BLUE, tint: BLUE_T, dark: BLUE_D },
          { label: "Descuentos", value: Component.soles(t.descuentos || 0),
            note: "Según el porcentaje de cada régimen",
            color: GOLD, tint: GOLD_T, dark: GOLD_D },
          { label: "Neto a pagar", value: Component.soles(t.neto || 0),
            note: "Lo que efectivamente se transfiere",
            color: GREEN, tint: GREEN_T, dark: GREEN_D },
          { label: "Boletas cerradas", value: String(t.cerradas || 0) + " / " + n,
            note: (t.pagadas || 0) + " ya marcadas como pagadas",
            color: RED, tint: RED_T, dark: RED_D }
        ];
      })(),

      plaHayIncompletos: (((this.state.plaDatos || {}).totales || {}).dias_incompletos || 0) > 0,
      plaIncompletosMsg: (() => {
        const d = ((this.state.plaDatos || {}).totales || {}).dias_incompletos || 0;
        return d + (d === 1 ? " día con marca incompleta" : " días con marca incompleta")
          + " (entrada sin salida). Se cuentan como presentes y no reducen el pago; "
          + "el cierre del mes no se bloquea por esto.";
      })(),

      plaTitulo: "Planilla de " + Component.mesLargo(this.periodoPlanilla()),
      plaSubtitulo: "El sueldo sale de las condiciones de cada ficha; la asistencia, de las marcas del terminal. Los montos están en soles.",

      plaFilas: ((this.state.plaDatos || {}).filas || []).map(f => {
        const pal = f.estado === "pagada" ? [GREEN_D, GREEN_T, "ph-check-circle", "Pagada"]
                  : f.estado === "cerrada" ? [BLUE_D, BLUE_T, "ph-lock-simple", "Cerrada"]
                  : [GOLD_D, GOLD_T, "ph-pencil-simple-line", "Borrador"];
        /* Sin identidad biométrica no hay marcas posibles: decir "0 días"
           sería mentir, porque no es que faltara, es que no puede marcar. */
        const asist = !f.enrolado
          ? "Sin enrolar"
          : f.dias_marcados + " de " + f.dias_habiles + " días"
            + (f.dias_incompletos ? " · " + f.dias_incompletos + " incompleto" + (f.dias_incompletos === 1 ? "" : "s") : "");
        return {
          nombre: f.nombre,
          cargo: f.cargo || "Sin cargo registrado",
          régimen: Component.etiquetaRegimen(f.regimen),
          asistencia: asist,
          asistColor: !f.enrolado ? "#9aa7b2" : (f.dias_incompletos ? GOLD_D : "#4d5b66"),
          bruto: Component.soles(f.bruto),
          neto: Component.soles(f.neto),
          estado: pal[3], icon: pal[2],
          estadoStyle: "display:flex; align-items:center; gap:7px; font-size:11.5px; letter-spacing:0.05em; text-transform:uppercase; padding:6px 11px; border-radius:2px; max-width:100%; color:"
            + pal[0] + "; background:" + pal[1] + ";",
          accionTitulo: f.estado === "borrador" ? "Hay que cerrar el mes antes de marcar el pago"
                      : f.estado === "cerrada" ? "Marcar como pagada"
                      : "Revertir el pago",
          accion: () => this.accionBoleta(f),
          abrir: () => this.abrirBoleta(f)
        };
      }),
      plaHayFilas: ((this.state.plaDatos || {}).filas || []).length > 0,
      plaSinFilas: ((this.state.plaDatos || {}).filas || []).length === 0,
      plaTotalPersonas: (() => {
        const n = (((this.state.plaDatos || {}).totales || {}).personas) || 0;
        return n + (n === 1 ? " persona" : " personas");
      })(),
      plaTotalBruto: Component.soles(((this.state.plaDatos || {}).totales || {}).bruto || 0),
      plaTotalNeto: Component.soles(((this.state.plaDatos || {}).totales || {}).neto || 0),
      plaNotaDescuentos: (() => {
        const p = (this.state.plaDatos || {}).porcentajes || {};
        return "Descuentos aplicados: " + (p.planilla || 0) + " % en planilla y "
          + (p.honorarios || 0) + " % en honorarios. Se cambian en Configuración.";
      })(),

      /* Mismo criterio que "sin jefe asignado": se muestran, no se ocultan. */
      plaSinCondicion: ((this.state.plaDatos || {}).sin_condicion || []).map(s => ({
        nombre: s.nombre,
        cargo: s.cargo || "Sin cargo registrado",
        abrir: () => this.abrirFichaEn(s.personal_id, "condiciones")
      })),
      plaHaySinCondicion: ((this.state.plaDatos || {}).sin_condicion || []).length > 0,
      plaSinCondicionTitulo: (() => {
        const n = ((this.state.plaDatos || {}).sin_condicion || []).length;
        return n === 1 ? "1 persona sin condiciones laborales registradas"
                       : n + " personas sin condiciones laborales registradas";
      })(),

      docFilters: [
        {label:"Todos · 7", color:BLUE_D, tint:BLUE_T},
        {label:"Vigentes · 2", color:GREEN_D, tint:GREEN_T},
        {label:"Por vencer · 3", color:GOLD_D, tint:GOLD_T},
        {label:"Vencidos · 2", color:RED_D, tint:RED_T}
      ],
      documentos: [
        {id:6, doc:"Certificado de salud ocupacional", vence:"18/08/2026", estado:"Por vencer", color:GOLD_D, tint:GOLD_T},
        {id:12, doc:"Certificado de antecedentes penales", vence:"27/08/2026", estado:"Por vencer", color:GOLD_D, tint:GOLD_T},
        {id:9, doc:"Certificado de salud ocupacional", vence:"30/08/2026", estado:"Por vencer", color:GOLD_D, tint:GOLD_T},
        {id:3, doc:"Certificado de salud ocupacional", vence:"02/07/2026", estado:"Vencido", color:RED_D, tint:RED_T},
        {id:15, doc:"Póliza de seguro complementario", vence:"12/06/2026", estado:"Vencido", color:RED_D, tint:RED_T},
        {id:13, doc:"Política de salvaguarda infantil", vence:"14/03/2027", estado:"Vigente", color:GREEN_D, tint:GREEN_T},
        {id:20, doc:"Contrato de trabajo firmado", vence:"04/11/2027", estado:"Vigente", color:GREEN_D, tint:GREEN_T}
      ].map(d => ({ ...d, nombre: byId(d.id).n, open: () => this.go("ficha", d.id) })),

      evalKpis: [
        {label:"Ciclo 2026-I", value:"7", note:"Evaluaciones abiertas de 20", color:BLUE, tint:BLUE_T, dark:BLUE_D},
        {label:"Completadas", value:"13", note:"Con acta firmada por ambas partes", color:GREEN, tint:GREEN_T, dark:GREEN_D},
        {label:"Promedio general", value:"4.1", note:"Sobre una escala de 5 puntos", color:GOLD, tint:GOLD_T, dark:GOLD_D},
        {label:"Vencen este mes", value:"2", note:"Sin iniciar al 11 de agosto", color:RED, tint:RED_T, dark:RED_D}
      ],
      evaluaciones: [
        {id:12, evaluador:"Marco Ancco Puma", vence:"22/08/2026", estado:"Sin iniciar", color:RED_D, tint:RED_T, resultado:"—"},
        {id:13, evaluador:"Marco Ancco Puma", vence:"22/08/2026", estado:"Sin iniciar", color:RED_D, tint:RED_T, resultado:"—"},
        {id:16, evaluador:"Silvia Paredes León", vence:"29/08/2026", estado:"En curso", color:GOLD_D, tint:GOLD_T, resultado:"—"},
        {id:17, evaluador:"Silvia Paredes León", vence:"29/08/2026", estado:"En curso", color:GOLD_D, tint:GOLD_T, resultado:"—"},
        {id:4, evaluador:"Luis Ferreyra Soto", vence:"05/09/2026", estado:"Sin iniciar", color:RED_D, tint:RED_T, resultado:"—"},
        {id:11, evaluador:"Ps. Elena Huamán Ccama", vence:"31/07/2026", estado:"Completada", color:GREEN_D, tint:GREEN_T, resultado:"4.6"},
        {id:15, evaluador:"Ps. Elena Huamán Ccama", vence:"31/07/2026", estado:"Completada", color:GREEN_D, tint:GREEN_T, resultado:"4.4"},
        {id:8, evaluador:"Mariela Quispe Ríos", vence:"31/07/2026", estado:"Completada", color:GREEN_D, tint:GREEN_T, resultado:"3.9"}
      ].map(e => ({ ...e, nombre: byId(e.id).n, open: () => this.go("ficha", e.id) })),

      capacitaciones: [
        {fecha:"Marzo — junio", titulo:"Salvaguarda infantil, nivel 2", detalle:"Obligatoria para todo el personal con contacto directo con beneficiarios.", pct:"85%", avance:"17/20", color:GREEN, tint:GREEN_T, dark:GREEN_D},
        {fecha:"Agosto", titulo:"Primeros auxilios y evacuación", detalle:"Dictada por Bomberos Voluntarios en la casa de Lima.", pct:"45%", avance:"9/20", color:GOLD, tint:GOLD_T, dark:GOLD_D},
        {fecha:"Setiembre — noviembre", titulo:"Acompañamiento pastoral y escucha", detalle:"Para tutores, docentes y el equipo de bienestar.", pct:"10%", avance:"2/20", color:RED, tint:RED_T, dark:RED_D}
      ],
      sesiones: [
        {fecha:"19/08", titulo:"Primeros auxilios · grupo A", lugar:"Casa Lima, sala común", inscritos:"12 de 20", color:GOLD_D},
        {fecha:"26/08", titulo:"Primeros auxilios · grupo B", lugar:"Casa Lima, sala común", inscritos:"8 de 20", color:GOLD_D},
        {fecha:"09/09", titulo:"Escucha activa con niños", lugar:"Sede Comas", inscritos:"6 de 9", color:RED_D},
        {fecha:"23/09", titulo:"Protocolo de reporte de incidentes", lugar:"Virtual", inscritos:"20 de 20", color:GREEN_D}
      ],

      volKpis: [
        {label:"Voluntarios activos", value:"6", note:"Fuera de planilla, con convenio firmado", color:BLUE, tint:BLUE_T, dark:BLUE_D},
        {label:"Horas del mes", value:"148", note:"Registradas por el coordinador", color:GREEN, tint:GREEN_T, dark:GREEN_D},
        {label:"Convenios por renovar", value:"2", note:"Vencen en setiembre", color:GOLD, tint:GOLD_T, dark:GOLD_D}
      ],
      /* Aquí vivían seis voluntarios inventados —nombres, horas y
         convenios— que no salían de la base y que ninguna pantalla
         llegaba a pintar. Se van con la pantalla de Reportes de
         maqueta, el 28/08/2026: personas que no existen no se
         guardan «por si acaso». */

    };
  }
