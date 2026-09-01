  cargarPersonas() {
    this.api("/api/asistencia?fecha=" + encodeURIComponent(this.state.fecha || this.fechaHoy()))
      .then((d) => { if (this._vivo) this.setState({
          personasReales: d.filas || [],
          /* El radio no limita nada: es con lo que la lista señala quién
             marcó fuera, para que RRHH sepa a quién preguntar. */
          asisRadio: d.radio == null ? null : Number(d.radio) }); })
      .catch(() => {});
  }

  /* Descarga del terminal las marcas del día (las entradas y salidas
     normales, no el enrolamiento).

     Es MANUAL a propósito: cada sincronización consulta el informe mensual
     de yunatt, y la cuenta está compartida con el ERP anterior mientras
     dure la transición. Un hilo en segundo plano multiplicaría esas
     consultas sin que nadie lo pidiera. */
/*§CORTE§ linea original 7312 §*/
  cargarResumenPersonas() {
    this.api("/api/personas/resumen")
      .then((d) => { if (this._vivo) this.setState({ gpResumen: d.resumen || null }); })
      .catch(() => { if (this._vivo) this.setState({ gpResumen: null }); });
  }

/*§CORTE§ linea original 8541 §*/
      /* ── Panel de Gestión de Personas ─────────────────────────────────
         Los seis salen de una sola llamada al servidor. Mientras no haya
         respuesta se muestra un guion, no un cero: cero es un dato, y decir
         "hay cero personas" cuando todavía no se ha preguntado es mentir. */
      gpKpis: (() => {
        const r = this.state.gpResumen;
        const n = (x) => (r ? String(x) : "—");
        return [
          { label: "Niñas, niños y adolescentes", value: n(r && r.nna),
            note: "Fichas de beneficiarios activas",
            color: BLUE, tint: BLUE_T, dark: BLUE_D },
          { label: "Responsables y tutores", value: n(r && r.responsables),
            note: "Personas a cargo de un beneficiario",
            color: GREEN, tint: GREEN_T, dark: GREEN_D },
          { label: "Personal", value: n(r && r.personal),
            note: "El equipo de la organización",
            color: BLUE, tint: BLUE_T, dark: BLUE_D },
          { label: "Nuevos registros", value: n(r && r.nuevos),
            note: r ? ("Altas de los últimos " + r.dias_nuevos + " días")
                    : "Altas recientes",
            /* Sin este aviso el número engaña: las fichas anteriores a que
               existiera la columna de fecha no se pueden contar como altas
               de ningún día, así que quedan fuera del cálculo. */
            hint: r && r.sin_fecha_alta
              ? (r.sin_fecha_alta + (r.sin_fecha_alta === 1
                   ? " ficha no tiene fecha de alta registrada y no entra en esta cuenta."
                   : " fichas no tienen fecha de alta registrada y no entran en esta cuenta."))
              : "",
            color: GOLD, tint: GOLD_T, dark: GOLD_D },
          { label: "Registros activos", value: n(r && r.activos),
            note: "Las tres entidades juntas, sin contar las dadas de baja",
            color: GREEN, tint: GREEN_T, dark: GREEN_D },
          { label: "Registros incompletos", value: n(r && r.incompletos),
            note: "Les falta algún dato mínimo para servir",
            hint: "El alta solo exige el nombre: la ficha se crea igual y aquí queda anotado lo que falta.",
            color: RED, tint: RED_T, dark: RED_D },
        ];
      })(),

      gpAtajos: (() => {
        const r = this.state.gpResumen;
        const cuenta = (x, uno, varios) => {
          if (!r) return "Cargando…";
          return x === 0 ? ("Ninguno todavía")
               : x === 1 ? ("1 " + uno) : (x + " " + varios);
        };
        return [
          { titulo: "Personal", icono: "ph-identification-card",
            detalle: "Hoja de vida, organigrama, documentos y contratos",
            cuenta: cuenta(r && r.personal, "ficha", "fichas"),
            color: BLUE, tint: BLUE_T, dark: BLUE_D,
            ir: () => this.setState({ view: "legajo", legajoTab: "dir" }) },
          { titulo: "Responsables / Tutores", icono: "ph-user-focus",
            detalle: "Quién responde por cada beneficiario",
            cuenta: cuenta(r && r.responsables, "responsable", "responsables"),
            color: GREEN, tint: GREEN_T, dark: GREEN_D,
            ir: () => this.setState({ view: "responsables" }) },
          { titulo: "Beneficiarios", icono: "ph-baby",
            detalle: "Expedientes de niñas, niños y adolescentes",
            cuenta: cuenta(r && r.nna, "ficha", "fichas"),
            color: BLUE, tint: BLUE_T, dark: BLUE_D,
            ir: () => this.setState({ view: "legajo", legajoTab: "benef" }) },
        ];
      })(),
      isUsuarios: v === "usuarios",

      /* Con 'vista' se mira, no se toca: los botones de crear y editar
         desaparecen. Quien pruebe la ruta a mano recibe un 403 igual. */
      puedeAlta: lt === "benef" ? this.puede("beneficiarios", "edicion")
                                : this.puede("personal", "edicion"),
      puedeCondiciones: this.puede("condiciones", "edicion"),
      puedeAsistencia: this.puede("asistencia", "edicion"),
      puedeDocs: this.puede(lt === "contratos" ? "contratos" : "documentos", "edicion"),
      puedeConfig: this.puede("configuracion", "edicion"),

