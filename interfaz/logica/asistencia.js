  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
      + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* Rango que corresponde a la pestaña activa: la semana del día elegido
     (lunes a domingo) o el mes completo en el calendario. */
/*§CORTE§ linea original 5741 §*/
  rangoDeVista() {
    const f = this.state.fecha || this.fechaHoy();
    const [a, m] = f.split("-").map(Number);
    if (this.state.attTab === "cal") {
      const ultimo = new Date(a, m, 0).getDate();   // día 0 del mes siguiente
      const mm = String(m).padStart(2, "0");
      return [a + "-" + mm + "-01", a + "-" + mm + "-" + String(ultimo).padStart(2, "0")];
    }
    const d = new Date(a, m - 1, Number(f.split("-")[2]));
    const desdeLunes = (d.getDay() + 6) % 7;        // getDay(): 0 = domingo
    const lunes = new Date(d); lunes.setDate(d.getDate() - desdeLunes);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return [this.iso(lunes), this.iso(domingo)];
  }

/*§CORTE§ linea original 5756 §*/
  cargarRango() {
    const [desde, hasta] = this.rangoDeVista();
    this.api("/api/asistencia/rango?desde=" + desde + "&hasta=" + hasta)
      .then((d) => {
        if (this._vivo) this.setState({ rango: d.personas || [], rangoDesde: desde, rangoHasta: hasta });
      })
      .catch(() => {});
  }

  /* Las mismas reglas de ámbito que la vista diaria, sobre los datos del rango */
/*§CORTE§ linea original 5766 §*/
  rangoVisible(sc) {
    return (this.state.rango || []).filter(
      (p) => sc === "todos" || (p.ambito || null) === sc);
  }

/*§CORTE§ linea original 5771 §*/
  diasDelRango() {
    const [desde, hasta] = this.rangoDeVista();
    const [a1, m1, d1] = desde.split("-").map(Number);
    const [a2, m2, d2] = hasta.split("-").map(Number);
    const ini = new Date(a1, m1 - 1, d1), fin = new Date(a2, m2 - 1, d2);
    const dias = [];
    for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) dias.push(this.iso(new Date(d)));
    return dias;
  }

  /* Quiénes pueden enrolarse: los que ya tienen ficha y aún no tienen
     identidad biométrica. Sustituye a escribir un nombre a mano. */
  /* Lee la MISMA tabla que la ficha, solo agrupada por tipo en vez de por
     persona. No hay copia del dato. */
/*§CORTE§ linea original 5891 §*/
  sincronizarMarcas() {
    if (this.state.syncEstado === "cargando") return;
    this.setState({ syncEstado: "cargando", syncMsg: "" });
    this.api("/api/asistencia/sync", { method: "POST" })
      .then((d) => {
        if (!this._vivo) return;
        const n = d.nuevas || 0;
        this.setState({
          syncEstado: "ok",
          syncMsg: n === 0
            ? "Sin marcas nuevas. La asistencia ya estaba al día."
            : (n === 1 ? "1 marca nueva registrada." : n + " marcas nuevas registradas.")
        });
        this.cargarPersonas();
        this.cargarRango();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ syncEstado: "error", syncMsg: "No se pudieron traer las marcas: " + (e.message || e) });
      });
  }

  /* Con argumentos enrola a esa persona con ese método —es el clic de la
     lista—; sin ellos usa lo que hubiera seleccionado, que es como lo llama
     el botón de reintentar. */
/*§CORTE§ linea original 6375 §*/
  /* Lo que la fila necesita para pintarse: iniciales, un color estable por
     persona y el fondo de aviso. Va aparte de filasReales() porque eso es
     el dato y esto es el aspecto; mezclarlos obligaría a tocar el dato
     cada vez que cambie el diseño. */
  /* Desde dónde marcó, dicho en una línea. Devuelve texto y color.

     Sin marcas no dice nada: quien todavía no ha fichado no tiene
     ubicación que enseñar, y escribir «sin ubicación» ahí lo señalaría
     por algo que no ha hecho. */
  /* Qué se puede decir de dónde marcó. Tres situaciones distintas que es
     fácil confundir en una sola:

       · Dio coordenadas Y hay sede → se sabe la distancia: «a 340 m».
       · Dio coordenadas y NO hay sede → se sabe que las dio, pero no hay
         punto contra el que medir: «con ubicación». Decir «sin ubicación»
         aquí sería acusarla de algo que sí hizo.
       · No dio coordenadas → «sin ubicación», sin más.

     El terminal nunca da coordenadas y eso no es un descuido de nadie: no
     tiene GPS. Por eso quien lo llama decide si preguntar. */
  /* DÓNDE marcó, dicho con el nombre del sitio.

     Antes esto decía «a 340 m de la sede». Una distancia no dice dónde
     está nadie: quien fichó desde China aparecía como «a 18.000 km», que
     es un dato inútil para quien tiene que decidir algo. El nombre del
     sitio lo resuelve el servidor al guardar la marca y viaja con ella.

     La distancia no se tira: sigue sirviendo para pintar en ámbar a quien
     marcó fuera del radio, cuando hay sede configurada. Pero lo que se LEE
     es el lugar. */
  /* DÓNDE marcó. El nombre del sitio, y nada más.

     Aquí hubo un rato una distancia —«a 340 m de la sede»— y un color
     ámbar para quien pasara del radio. Se retiró el 31/08/2026 por
     decisión de la ONG: lo que hay que ver es dónde estaba la persona, no
     si estaba cerca o lejos de la casa. Medir la distancia convertía la
     columna en un juicio, y pintaba de sospechoso a quien fichó desde
     donde le tocaba estar ese día. */
  static ubicacionFila(f) {
    if (!(f.total > 0)) return { texto: "", color: "#7d8e9c" };
    if (f.lugar) return { texto: f.lugar, color: "#5b7185" };
    /* Sin nombre hay dos casos distintos y conviene no confundirlos: que
       no diera ubicación, o que la diera y el servicio de mapas no
       contestara cuando se guardó. */
    const dioAlguna = (f.sin_ubicacion || 0) < (f.total || 0);
    return { texto: dioAlguna ? "con ubicación, sin nombre" : "sin ubicación",
             color: "#9aa7b2" };
  }

  /* De dónde vino la marca de ese día, y desde dónde si fue del celular.

     La columna se llamaba «Registro» y enseñaba el método biométrico
     —Rostro o Huella—, que describe el enrolamiento y no el fichaje. Lo
     que hace falta saber al mirar un día es si la persona estuvo delante
     del equipo o fichó desde el teléfono, y en ese caso desde dónde. */
  static origenFila(f) {
    if (!(f.total > 0)) return { texto: "—", icono: "ph-minus", color: "#9aa7b2" };
    const cs = String(f.canales || "").split(",").filter(Boolean);
    const web = cs.indexOf("web") >= 0;
    const term = cs.indexOf("terminal") >= 0;

    if (term && !web) {
      /* El terminal no tiene GPS: no hay ubicación que enseñar y tampoco
         que echar en falta. Estuvo en la puerta, y con eso basta. */
      return { texto: "Terminal", icono: "ph-identification-card", color: "#0e3d69" };
    }
    const u = Component.ubicacionFila(f);
    const donde = u.texto ? (" · " + u.texto) : "";
    if (web && term) {
      return { texto: "Terminal y celular" + donde,
               icono: "ph-arrows-left-right", color: u.color };
    }
    return { texto: "Celular" + donde, icono: "ph-device-mobile", color: u.color };
  }

  static adornoFila(f) {
    const PALETA = [
      [BLUE_T, BLUE_D], [GREEN_T, GREEN_D], [GOLD_T, GOLD_D],
      [RED_T, RED_D], ["#efe7f5", "#5b3a7a"], ["#e6f0f2", "#2b5f68"],
    ];
    const nombre = String(f.nombre || "");
    let suma = 0;
    for (let i = 0; i < nombre.length; i++) suma = (suma + nombre.charCodeAt(i)) % 997;
    const par = PALETA[suma % PALETA.length];
    return {
      iniciales: ini(nombre) || "?",
      iniTint: par[0], iniColor: par[1],
      /* Solo el rol. La distancia estuvo aquí un rato por falta de sitio
         mejor; ahora tiene el suyo, en la columna «Registro». */
      subtitulo: f.rolLabel || "",
      subColor: "#7d8e9c",
      origen: Component.origenFila(f).texto,
      origenIcono: Component.origenFila(f).icono,
      origenColor: Component.origenFila(f).color,
      /* Abrir el punto exacto en un mapa.
         Solo cuando hay coordenadas Y nombre: sin nombre no hay nada que
         pulsar, y sin coordenadas el enlace llevaría a ninguna parte.
         Se usa la búsqueda por coordenadas de Google Maps, que funciona
         igual en el navegador y en la aplicación del teléfono.
         Ojo: al pulsarlo se le dice a Google dónde estuvo esa persona.
         Por eso es un clic deliberado de quien mira, y no algo que la
         pantalla cargue sola al abrirse. */
      mapaUrl: (f.lat != null && f.lon != null && f.lugar)
        ? ("https://www.google.com/maps/search/?api=1&query="
           + encodeURIComponent(f.lat + "," + f.lon))
        : "",
      hayMapa: !!(f.lat != null && f.lon != null && f.lugar),
      /* El runtime no tiene sc-else: la condición contraria se
         declara a mano o la fila se quedaría sin texto. */
      sinMapa: !(f.lat != null && f.lon != null && f.lugar),
      /* Fondo de aviso solo para quien NO PUEDE marcar. A quien puede y
         todavía no ha marcado no se le pinta nada: puede que aún no haya
         llegado, y teñirle la fila lo señalaría sin motivo. */
      filaFondo: f.enrolado ? "transparent" : "#fdf4f2",
    };
  }

  realesVisibles(mtd, sc) {
    const enAmbito = (f) => sc === "todos" || f.ambito === sc;
    const enMetodo = (m) => mtd === "todos" || (mtd === "huella"
      ? (m.metodo === "Huella" || m.metodo === "Rostro y huella")
      : (m.metodo === "Rostro" || m.metodo === "Rostro y huella"));
    return this.filasReales().filter(enAmbito).filter(enMetodo);
  }

/*§CORTE§ linea original 6389 §*/
  person(p) {
    const isHead = p.d === 0;
    const c = p.br === "adm" ? BLUE : RED;
    const t = p.br === "adm" ? BLUE_T : RED_T;
    const dark = p.br === "adm" ? BLUE_D : RED_D;
    return {
      nombre: p.n, cargo: p.c, ini: ini(p.n), sede: p.sede,
      indent: (10 + p.d * 24) + "px",
      weight: isHead ? "600" : "400",
      rail: isHead ? c : (p.d === 1 ? "#cfd8e0" : "transparent"),
      chipBg: isHead ? t : "#eef2f6",
      chipFg: isHead ? dark : "#4d5b66",
      open: () => this.go("ficha", p.id)
    };
  }

  /* Expediente de un beneficiario REAL, leído de la base. Misma estructura
     que la ficha de maqueta, pero con datos guardados: si un campo está
     vacío lo dice, no lo inventa. */
/*§CORTE§ linea original 8092 §*/
      /* ── Panel de Asistencia ─────────────────────────────────────────
         Los cinco salen de /api/asistencia/resumen. Mientras no llegue la
         respuesta se muestra un guion, no un cero: cero es un dato, y decir
         "hoy no vino nadie" antes de preguntar sería mentir. */
      asKpis: (() => {
        const r = this.state.asResumen;
        const n = (x) => (r ? String(x) : "—");
        const esperados = r ? r.esperados : 0;
        return [
          { label: "Esperados hoy", valor: n(r && r.esperados),
            nota: "Personas enroladas en el terminal, que son las únicas que pueden marcar",
            color: BLUE, tint: BLUE_T, dark: BLUE_D },
          { label: "Marcaron", valor: n(r && r.presentes),
            nota: r && esperados
              ? (r.presentes + " de " + esperados + " registraron entrada")
              : "Todavía sin marcas hoy",
            color: GREEN, tint: GREEN_T, dark: GREEN_D },
          { label: "Jornada cerrada", valor: n(r && r.jornada_cerrada),
            nota: "Con entrada y salida registradas",
            color: GREEN, tint: GREEN_T, dark: GREEN_D },
          { label: "Sin marcar", valor: n(r && r.sin_marcar),
            nota: "Enroladas que hoy no registraron nada todavía",
            color: (r && r.sin_marcar) ? GOLD : "#c9d4de",
            tint:  (r && r.sin_marcar) ? GOLD_T : "#f0ede9",
            dark:  (r && r.sin_marcar) ? GOLD_D : "#5b7185" },
          { label: "Con permiso hoy", valor: n(r && r.con_permiso),
            nota: "Permisos aprobados que cubren el día de hoy",
            color: BLUE, tint: BLUE_T, dark: BLUE_D },
        ];
      })(),

      /* Se dice en la pantalla lo que el panel NO mide, y por qué. Callarlo
         haría creer que está completo, y que un cero significa algo que no
         se ha medido. */
      asNotaFaltantes: (() => {
        const r = this.state.asResumen;
        const partes = [];
        if (r && r.sin_enrolar) {
          partes.push(
            r.sin_enrolar + (r.sin_enrolar === 1
              ? " persona tiene ficha pero todavía no está enrolada, así que no puede marcar: no cuenta como ausencia."
              : " personas tienen ficha pero todavía no están enroladas, así que no pueden marcar: no cuentan como ausencias."));
        }
        partes.push("No se muestran tardanzas: haría falta el horario de "
                    + "cada persona, y hoy el sistema no lo guarda.");
        return partes.join(" ");
      })(),

      asAtajos: (() => {
        const r = this.state.asResumen;
        const cuenta = (x, uno, varios) => {
          if (!r) return "Cargando…";
          return x === 0 ? "Nada pendiente" : (x === 1 ? "1 " + uno : x + " " + varios);
        };
        return [
          { titulo: "Registro de Asistencia", icono: "ph-list-checks",
            detalle: "Las marcas del terminal, día a día",
            cuenta: r ? (r.esperados + " enroladas") : "Cargando…",
            color: BLUE, tint: BLUE_T, dark: BLUE_D,
            ir: () => this.go("asistencia") },
          { titulo: "Gestión Biométrica", icono: "ph-fingerprint",
            detalle: "Enrolar rostro o huella en el terminal",
            cuenta: cuenta(r && r.sin_enrolar, "persona por enrolar",
                           "personas por enrolar"),
            color: GREEN, tint: GREEN_T, dark: GREEN_D,
            ir: () => this.go("biometria") },
          { titulo: "Gestión de Permisos", icono: "ph-calendar-check",
            detalle: "Aprobar o rechazar lo que pide el equipo",
            cuenta: cuenta(r && r.permisos_por_resolver, "solicitud por resolver",
                           "solicitudes por resolver"),
            color: GOLD, tint: GOLD_T, dark: GOLD_D,
            ir: () => this.go("permisos") },
        ];
      })(),

/*§CORTE§ linea original 10474 §*/
      /* ── Sincronización de marcas ─────────────────────────────────── */
      sincronizarMarcas: () => this.sincronizarMarcas(),
      syncLabel: this.state.syncEstado === "cargando" ? "Sincronizando…" : "Sincronizar marcas",
      syncIcono: this.state.syncEstado === "cargando" ? "ph-circle-notch" : "ph-arrows-clockwise",
      syncBotonStyle: "display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:2px; font-size:14px; border:1px solid #c9d4de; color:"
        + (this.state.syncEstado === "cargando" ? "#9aa7b2;" : "#0e3d69;"),
      syncMsg: this.state.syncMsg || "",
      syncColor: this.state.syncEstado === "error" ? RED_D : GREEN_D,
      syncTint: this.state.syncEstado === "error" ? RED_T : GREEN_T,
      syncMsgIcono: this.state.syncEstado === "error" ? "ph-warning-circle" : "ph-check-circle",

/*§CORTE§ linea original 10579 §*/
      /* ── Vista semanal con datos reales ───────────────────────────── */
      semanaDias: this.diasDelRango().map((f) => {
        const [a, m, d] = f.split("-").map(Number);
        const dw = new Date(a, m - 1, d).getDay();
        return { iso: f, etiqueta: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][dw] + " " + d };
      }),
      semanaReales: this.rangoVisible(sc).map((p) => {
        const celdas = this.diasDelRango().map((f) => {
          const dia = p.dias[f];
          if (!dia) return { v: "—", bg: "#f4f3f1", fg: "#b0aca6" };
          if (dia.horas) return { v: dia.horas, bg: GREEN_T, fg: GREEN_D };
          /* Una sola marca: se sabe que vino, no cuánto estuvo. */
          return { v: dia.entrada, bg: BLUE_T, fg: BLUE_D };
        });
        const minutos = this.diasDelRango().reduce((acc, f) => {
          const h = (p.dias[f] || {}).horas;
          if (!h) return acc;
          const [hh, mm] = h.split(":").map(Number);
          return acc + hh * 60 + mm;
        }, 0);
        const diasConMarca = this.diasDelRango().filter((f) => p.dias[f]).length;
        return {
          nombre: p.nombre,
          dias: celdas,
          total: minutos ? Math.floor(minutos / 60) + ":" + String(minutos % 60).padStart(2, "0")
                         : (diasConMarca ? "—" : "0:00")
        };
      }),
      haySemanaReal: this.rangoVisible(sc).length > 0,
      semanaRotulo: this.state.rangoDesde
        ? "Del " + this.state.rangoDesde.split("-").reverse().join("/") + " al " + this.state.rangoHasta.split("-").reverse().join("/")
        : "",

/*§CORTE§ linea original 10612 §*/
      /* ── Calendario mensual con datos reales ──────────────────────── */
      mesDias: (() => {
        const dias = this.diasDelRango();
        const gente = this.rangoVisible(sc);
        if (!dias.length) return [];
        const [a1, m1, d1] = dias[0].split("-").map(Number);
        /* Huecos hasta el primer día, para que caiga en su columna */
        const hueco = (new Date(a1, m1 - 1, d1).getDay() + 6) % 7;
        const celdas = [];
        for (let i = 0; i < hueco; i++) celdas.push({ vacio: true, num: "", presentes: "", bg: "transparent", fg: "transparent", borde: "transparent" });
        for (const f of dias) {
          const n = gente.filter((p) => p.dias[f]).length;
          const pct = gente.length ? n / gente.length : 0;
          celdas.push({
            vacio: false,
            num: String(Number(f.split("-")[2])),
            presentes: n ? String(n) : "",
            bg: !gente.length ? "#f4f3f1" : n === 0 ? "#f4f3f1" : pct >= 0.8 ? GREEN_T : pct >= 0.4 ? GOLD_T : RED_T,
            fg: n === 0 ? "#b0aca6" : pct >= 0.8 ? GREEN_D : pct >= 0.4 ? GOLD_D : RED_D,
            borde: f === (this.state.fecha || this.fechaHoy()) ? BLUE : "transparent"
          });
        }
        return celdas;
      })(),
      hayMesReal: this.rangoVisible(sc).length > 0,
      mesRotulo: this.rangoVisible(sc).length
        ? this.rangoVisible(sc).length + (this.rangoVisible(sc).length === 1 ? " persona enrolada" : " personas enroladas") + " · el número es cuántas marcaron ese día"
        : "",

/*§CORTE§ linea original 10641 §*/
      /* ── La tabla del día ────────────────────────────────────────────
         Primero quien puede marcar; al final quien falta por enrolar. El
         orden importa: lo de arriba es el día de hoy, lo de abajo es una
         tarea pendiente. */
      /* ── El resumen de arriba ─────────────────────────────────────────
         Cuatro cifras que salen de las mismas filas que la tabla, así que
         no pueden discrepar de lo que se ve debajo. */
      attResumen: (() => {
        const enAmbito = (f) => sc === "todos" || f.ambito === sc;
        const reales = this.realesVisibles(mtd, sc);
        const sinEnrolar = mtd === "todos"
          ? this.filasSinEnrolar().filter(enAmbito) : [];
        const presentes = reales.filter((f) => f.presente).length;
        return [
          { clave: "total", rotulo: "Total personal",
            valor: String(reales.length + sinEnrolar.length),
            icono: "ph-users-three", tint: BLUE_T, color: BLUE_D },
          { clave: "aldia", rotulo: "Al día", valor: String(presentes),
            icono: "ph-check-circle", tint: GREEN_T, color: GREEN_D },
          /* «Sin marcar», no «con faltas»: sin horario nadie sabe si a esa
             persona ya le tocaba marcar. Llamarlo falta sería juzgar. */
          { clave: "sinmarcar", rotulo: "Sin marcar",
            valor: String(reales.length - presentes),
            icono: "ph-clock-countdown", tint: GOLD_T, color: GOLD_D },
          /* La advertencia de verdad de este sistema: quien no puede
             marcar aunque quiera. */
          { clave: "sinenrolar", rotulo: "Sin enrolar",
            valor: String(sinEnrolar.length),
            icono: "ph-warning", tint: RED_T, color: RED_D },
        ];
      })(),

      /* ── La barra de filtros ──────────────────────────────────────── */
      attBusca: this.state.attBusca || "",
      onAttBusca: (e) => this.setState({ attBusca: e.target.value }),
      diaAnterior: () => this.moverDia(-1),
      diaSiguiente: () => this.moverDia(1),
      /* La insignia dice lo que este sistema sabe de verdad. Una meta de
         horas necesitaría el horario de cada persona, que no existe. */
      attInsignia: (() => {
        const enAmbito = (f) => sc === "todos" || f.ambito === sc;
        const n = this.realesVisibles(mtd, sc).length;
        const sin = mtd === "todos"
          ? this.filasSinEnrolar().filter(enAmbito).length : 0;
        return n + (n === 1 ? " enrolada" : " enroladas")
          + (sin ? " · " + sin + " sin enrolar" : "");
      })(),

      diaFilas: (() => {
        const enAmbito = (f) => sc === "todos" || f.ambito === sc;
        const texto = String(this.state.attBusca || "").trim().toLowerCase();
        const coincide = (f) => !texto
          || (String(f.nombre || "") + " " + String(f.rolLabel || ""))
               .toLowerCase().indexOf(texto) >= 0;
        return this.realesVisibles(mtd, sc)
          .concat(mtd === "todos" ? this.filasSinEnrolar().filter(enAmbito) : [])
          .filter(coincide)
          .map((f) => Object.assign({}, f, Component.adornoFila(f)));
      })(),
      diaHay: (() => {
        const enAmbito = (f) => sc === "todos" || f.ambito === sc;
        return this.realesVisibles(mtd, sc).length > 0
            || (mtd === "todos" && this.filasSinEnrolar().filter(enAmbito).length > 0);
      })(),
      diaVacio: (() => {
        const enAmbito = (f) => sc === "todos" || f.ambito === sc;
        return this.realesVisibles(mtd, sc).length === 0
            && !(mtd === "todos" && this.filasSinEnrolar().filter(enAmbito).length > 0);
      })(),
      diaNota: this.fechaEnLetra(this.state.fecha)
        + " · lo que el terminal ha sincronizado",
      diaPie: "Las horas salen de la primera y la última marca del día. No se "
        + "señalan tardanzas: el sistema todavía no conoce el horario de cada persona.",
      irAlPanel: (e) => { if (e && e.preventDefault) e.preventDefault();
                          this.setState({ view: "asistenciaHome" }); },

/*§CORTE§ linea original 10667 §*/
      /* ── El recado para cocina ───────────────────────────────────────
         Cuenta a quien marcó de verdad hoy. Solo pueden marcar las
         personas enroladas, así que mientras quede gente por enrolar el
         número se queda corto — y eso se dice, porque una cifra corta que
         se cree exacta deja a alguien sin almorzar. */
      almuerzoLinea: (() => {
        const filas = this.realesVisibles(mtd, sc);
        const presentes = filas.filter((f) => f.presente).length;
        if (!filas.length) return "Todavía no hay nadie enrolado, así que no se puede contar almuerzos desde aquí.";
        return presentes === 0
          ? "Nadie ha marcado todavía hoy. El conteo de almuerzos se llena según van marcando."
          : "Almuerzos a preparar: " + presentes
            + (presentes === 1 ? " · una persona ha marcado hoy" : " · personas que han marcado hoy");
      })(),
      /* Verde solo cuando hay un número que llevar a cocina. Si no hay
         nadie enrolado, o nadie ha marcado, no es un logro: es que todavía
         no hay nada que contar, y en verde se lee como «todo en orden». */
      almuerzoTint: (() => {
        const filas = this.realesVisibles(mtd, sc);
        const hay = filas.length > 0 && filas.filter((f) => f.presente).length > 0;
        return hay ? "#e2f1e8" : "#f0ede9";
      })(),
      almuerzoColor: (() => {
        const filas = this.realesVisibles(mtd, sc);
        const hay = filas.length > 0 && filas.filter((f) => f.presente).length > 0;
        return hay ? "#2f8f5b" : "#9aa7b2";
      })(),
      almuerzoDark: (() => {
        const filas = this.realesVisibles(mtd, sc);
        const hay = filas.length > 0 && filas.filter((f) => f.presente).length > 0;
        return hay ? "#1c5f3a" : "#5b7185";
      })(),
      almuerzoIncompleto: (() => {
        const enAmbito = (f) => sc === "todos" || f.ambito === sc;
        return this.filasSinEnrolar().filter(enAmbito).length > 0;
      })(),
      almuerzoAviso: (() => {
        const enAmbito = (f) => sc === "todos" || f.ambito === sc;
        const n = this.filasSinEnrolar().filter(enAmbito).length;
        return "Ojo: " + (n === 1 ? "1 persona no está enrolada" : n + " personas no están enroladas")
          + " y no pueden marcar, así que no entran en este conteo.";
      })(),


      /* Los avisos de pantalla vacía. Van en positivo porque el marcado no
         entiende de «si no»: cada uno es su propia condición. */
      sinSemanaReal: this.rangoVisible(sc).length === 0,
      sinMesReal: this.rangoVisible(sc).length === 0,

      weekDays: ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"],

