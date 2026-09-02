  state = {
    view: "login", loginUser: "", loginPass: "", showPass: false,
    loginErr: "", loading: false, sel: 11, scope: "todos", legajoTab: "dir",
    /* Identidad: quién está conectado y qué puede hacer. 'sesion' en null
       con estricto=false es el modo convivencia (entra cualquiera). */
    sesion: null, csrf: "", estricto: false, sesionLista: false,
    /* Cambia solo cuando cambia el día: es lo que hace que la fecha de la
       cabecera se refresque sin recargar la página. */
    hoyISO: "",
    clAct: "", clNueva: "", clNueva2: "", clErr: "", clOcupado: false,
    usuTab: "cuentas", usuarios: [], roles: [], sinUsuario: [],
    modulosPerm: [], accesos: [], usuErr: "",
    uxId: null, uxPersona: "", uxUsuario: "", uxRol: "", uxClave: "",
    rxId: null, rxNombre: "", rxPermisos: {}, rxSistema: false, rxRolClave: "",
    usuBorrarId: null, usuBorrarNombre: "", rolBorrarId: null,
    /* Responsables / tutores. Prefijo 'rsp' para no chocar con el 'rx' de
       los roles ni con el 'be' de beneficiarios. */
    responsables: [], rspBusca: "", rspCargando: false, rspErr: "",
    rspId: null, rspNombre: "", rspDoc: "", rspNac: "", rspSexo: "",
    rspNacionalidad: "", rspTel: "", rspTel2: "", rspCorreo: "",
    rspDepto: "", rspProv: "", rspDistrito: "", rspDireccion: "", rspRef: "",
    rspOcupacion: "", rspSituacion: "", rspCentro: "", rspTipoTrabajo: "",
    rspIngresos: "", rspACargo: "", rspNota: "",
    rspVer: null, rspVerBenefs: [], rspBorrar: null,
    /* La foto: si se está subiendo, y el último aviso (que puede ser el
       motivo de un rechazo, y por eso se enseña al lado de la ficha y no
       en un rincón). */
    rspFotoOcupado: false, rspFotoMsg: "", rspFotoMal: false,
    /* Los enlaces del formulario. 'invCopiado' guarda el último copiado
       solo para poder decirlo en el botón. */
    /* La bandeja del formulario. 'bjCruda' guarda de qué respuesta se está
       mirando el original, que es una a la vez. */
    bandeja: [], bjFiltro: "por_revisar", bjCruda: null, bjOcupado: false,
    bjSondeo: null,
    bjMsg: "", bjMal: false, bjCredencial: true,
    invAbierto: false, invLista: [], invConfig: true, invOcupado: false,
    invErr: "", invPara: "", invEtiqueta: "", invDias: "30", invCopiado: 0,
    /* Vínculo responsable–beneficiario, visto desde la ficha del niño. */
    /* Ficha completa del beneficiario (paso 4). */
    beCodigo: "", beSexo: "", beNacionalidad: "", beLugarNac: "",
    beDepto: "", beProv: "", beDistrito: "", beDireccion: "",
    beReferencia: "", beTipoVivienda: "", beServicios: "", beNivel: "",
    beSeccion: "", beTurno: "", beAnioAcad: "", beSitAcad: "",
    beAsisEscolar: "", beDificultades: "", beNotaEdu: "", beTipoSeguro: "",
    beCentroSalud: "", beDiscapacidad: "", beNecesidades: "",
    beInfoMedica: "", beEmergNombre: "", beEmergTel: "", beNotaSalud: "",
    beIntegrantes: "", beHermanos: "", beConQuienVive: "",
    beRespEconomico: "", beTenencia: "", beIngresos: "",
    beDependientes: "", beNotaSocio: "",
    /* Trayectoria: formación y experiencia de la ficha abierta. */
    trFormacion: [], trExperiencia: [],
    trNivel: "", trInstitucion: "", trCarrera: "", trGrado: "",
    trDesde: "", trHasta: "", trNota: "",
    trEmpresa: "", trCargo: "", trDesde2: "", trHasta2: "", trFunciones: "",
    vinculos: [], vinBusca: "", vinCandidatos: [], vinElegido: null,
    vinParentesco: "", vinPrincipal: 0, vinLegal: 0, vinRecoger: 0,
    vinEmergencia: 0, vinEditando: null, vinQuitar: null,
    attTab: "diaria", metodo: "todos",
    // Captura biométrica real (ver los métodos más abajo)
    capFase: "", capMsg: "", capSn: null, candidatos: [], candidatoSel: "",
    /* Quiénes están enrolados en el terminal. Es distinto de las marcas
       del día: alguien enrolado que hoy no vino sigue estando enrolado. */
    identidades: [], terminal: null,
    /* Qué fila del expediente se está corrigiendo. Vacío = se crea una
       nueva. Vive aquí y no en cada diálogo porque los seis comparten
       el mismo camino de guardado. */
    trEditId: null, serieEditId: null,
    capEtiqueta: "", capPaso: 1, capTotalPasos: 1, capRestante: 0,
    capRostro: false, capHuella: false,
    personasReales: [], backendVivo: false, backendConfigurado: false, backendFaltan: [],
    syncEstado: "", syncMsg: "", fecha: "",
    rango: [], rangoDesde: "", rangoHasta: "",
    asTendencia: [], asTendenciaDesde: "", asTendenciaHasta: "",
    modal: "", modalSn: null, modalNombre: "", modalRol: "", modalError: "",
    modalOcupado: false,
    personal: [], vencimientos: {}, fichaSec: "datos",
    gpResumen: null,
    /* Las reglas de qué se exige vienen del servidor. 'sdFaltan' son los
       campos que bloquean el guardado ahora mismo, y 'sdMarcados' los que
       quien edita declaró sin dato. */
    camposReq: null, sdFaltan: [], sdMarcados: [],
    misSolicitudes: [], miSaldo: null, miUmbral: 7, misTipos: [],
    gsLista: [], gsResumen: {}, gsFiltro: "", gsAviso: "",
    /* La bandeja: qué se busca, qué tipo se mira y qué fila está abierta.
       Una a la vez: dos detalles abiertos obligan a desplazarse para
       comparar, que es justo lo que se quiere evitar. */
    gsBusca: "", gsTipo: "", gsAbierta: null,
    asResumen: null,
    grId: null, grNota: "", grDetalle: "",
    mpTipo: "", mpDesde: "", mpHasta: "", mpMotivo: "", mpCancelar: null,
    mpPeriodo: "", miFicha: null, miFormato: null,
    /* Un buscador para las cuatro vistas de Hoja de Vida. Ver la cabecera
       de tanda1_buscadores.py. */
    busLegajo: "", busBenef: "", busBandeja: "",
    /* El diálogo de reporte: qué módulo, qué alcance y a quiénes. */
    mkMarcas: [], mkOcupado: false, mkAviso: "", mkAvisoTipo: "bien",
    mkPaso: "", camBuscandoUbi: false,
    mkTic: 0, mkGps: "preguntar", mkDonde: null, mkSemana: [], mkMeta: 40,
    mkRostro: false, mkConsintio: false,
    camPensando: false,
    /* El diálogo de la cámara sirve para dos cosas: marcar y registrar el
       rostro de referencia. camModo dice cuál de las dos. */
    camModo: "marca", camDescriptor: null, camModelo: "",
    camConsiento: false, camTextoAviso: "",
    menuAbierto: false, bioBusca: "",
    repModulo: "", repAlcance: "todos", repFichas: false,
    repElegidos: [], repBusca: "",
    /* La firma dibujada. `firmaUrl` es null mientras no haya ninguna;
       `frId` es la solicitud que se está firmando, si se llegó aquí desde
       la bandeja en vez de desde «Mi firma». */
    firmaUrl: null, firmaAviso: "", frId: null, frDetalle: "",
    miPeriodos: [],
    mpHoraDesde: "", mpHoraHasta: "", mpArchivo: null,
    vencDocs: [], vencContratos: [], vencFiltro: "todos",
    docTipo: "documento", docId: null, docSel: "", docNombre: "",
    docEmitido: "", docVence: "", fichaDocs: [], fichaContratos: [], parametros: {}, cfgOrg: "", cfgCiudad: "", cfgFundacion: "",
    cfgEditandoFecha: false, cfgGuardando: false, cfgError: "", cfgOk: "",
    modalId: null, fiNombre: "", fiDoc: "", fiCargo: "",
    fiArea: "", fiSede: "", fiAmbito: "min", fiVinculo: "staff", fiJefe: "",
    fiSexo: "", fiNacionalidad: "", fiLugarNac: "", fiJornada: "",
    fiEstadoLaboral: "activo", fiDepartamento: "", fiProvincia: "", fiDistrito: "",
    // null = todavía no sabemos qué sabe hacer el terminal; no restringir aún
    metodosDisponibles: null
  };

/*§CORTE§ linea original 4472 §*/
  go(view, sel) {
    /* El cajón de menú se cierra al navegar: quedarse abierto tapando la
       pantalla que se acaba de abrir es el fallo clásico del patrón. En
       pantalla grande el cajón no existe, así que esto no molesta. */
    this.setState(sel ? { view, sel, menuAbierto: false }
                      : { view, menuAbierto: false });
    /* El panel de personas se recalcula cada vez que se entra, no una sola
       vez al arrancar: si alguien acaba de dar de alta una ficha, el número
       tiene que reflejarlo al volver, no al recargar la página. */
    if (view === "personas") this.cargarResumenPersonas();
    if (view === "misPermisos") this.cargarMisPermisos();
    if (view === "permisos") this.cargarPermisos();
    if (view === "asistenciaHome") { this.cargarResumenAsistencia();
                                     this.cargarTendencia(); }
    /* Quién tiene rostro cambia sin que RRHH toque nada: lo registra cada
       persona desde su propio celular. Se relee al entrar, no al arrancar,
       o la lista enseñaría la foto de esta mañana. */
    if (view === "biometria") { this.cargarEstadoTerminal();
                                /* Y se le pregunta al equipo por los que se
                                   quedaron a medias: sin esto, una ficha
                                   enrolada en el Timmy podía quedarse en
                                   «esperando» para siempre. */
                                this.revisarEnrolamientos(); }
    /* Las marcas del terminal no llegan solas. Antes había que acordarse de
       pulsar «Sincronizar», y quien acababa de fichar se veía ausente y no
       entendía por qué. Entrar a la pantalla ya es pedirlo. */
    if (view === "asistencia") this.sincronizarMarcas();
  }

  /* ══════════════════════════════════════════════════════════════════════
     CAPTURA BIOMÉTRICA REAL

     Habla con backend/app.py, que a su vez manda el comando al terminal
     Timmy a través de yunatt.com. Todo en el mismo origen, así que no hay
     CORS: la interfaz debe abrirse desde http://127.0.0.1:7801/ y no
     haciendo doble click en el archivo.

     yunatt no notifica cuándo termina la captura, así que el backend
     expone un endpoint de estado y aquí lo sondeamos hasta que resuelve.
     ══════════════════════════════════════════════════════════════════════ */

  /* La dirección que hay ahora en la barra, sin el «#/». */
/*§CORTE§ linea original 4496 §*/
  /* Filtra una lista por varios campos a la vez. En un solo sitio: cada
     pantalla que necesite buscar dice QUÉ campos mirar, y el cómo —pasar a
     minúsculas, aceptar coincidencias parciales— se decide aquí. Si mañana
     hay que ignorar tildes, se ignoran en todas de una vez. */
  /* El año de una fecha, venga como venga: 2026-08-18 o 03/02/2014. Vacío
     si no hay ninguno reconocible, para que quien la use pueda descartarla
     en vez de dibujar un NaN. */
  static anioDe(fecha) {
    const t = String(fecha == null ? "" : fecha).trim();
    /* OJO: aquí se coló un carácter de control (0x08) dentro de la
       expresión regular en alguna edición. El patrón dejó de casar
       nunca, así que anioDe() devolvía vacío para TODAS las fechas y
       el gráfico «Altas por año» anunciaba que ninguna ficha tenía
       fecha de ingreso, teniéndolas todas. No se veía leyendo el
       código: el carácter es invisible. Corregido el 31/08/2026. */
    let m = t.match(/^(\d{4})/);
    if (m) return m[1];
    m = t.match(/(\d{4})$/);
    return m ? m[1] : "";
  }

  /* Abre el reporte de un módulo con los filtros que se estén viendo.
     Uno solo para los siete: siete copias acabarían olvidándose de pasar
     algún filtro, y el papel diría otra cosa que la pantalla. */
  /* Abre el diálogo de reporte de un módulo con ficha. */
  /* ── Marcar asistencia desde el celular ──────────────────────────────
     El otro canal es el terminal de la puerta; los dos escriben en la
     misma tabla. Ver marcar_web.py. */
  cargarMisMarcas() {
    this.api("/api/asistencia/mias")
      .then((d) => {
        if (!this._vivo) return;
        this.setState({ mkMarcas: d.marcas || [],
                        /* mkExigeUbicacion ya no existe: la ubicación no
                           condiciona nada. El radio se conserva porque lo
                           usa la lista de asistencia para señalar quién
                           marcó fuera. */
                        mkSemana: d.semana || [], mkMeta: d.meta || 40,
                        mkRostro: !!d.rostro, mkConsintio: !!d.consintio });
        this.sincronizarReloj(d.ahora);
        this.revisarGps();
      })
      .catch(() => {});
  }

  /* ── Marcar con foto y ubicación ─────────────────────────────────────
     Primero la ubicación: si está lejos, se le dice ANTES de pedirle que
     pose para una foto que se iba a rechazar. */
  /* El reloj se ata a la hora del SERVIDOR una sola vez: se guarda la
     diferencia con la del aparato y a partir de ahí cuenta el navegador.
     Ni se fía del teléfono ni pregunta cada segundo. */
  sincronizarReloj(horaServidor) {
    if (!horaServidor) return;
    const [h, m, s] = String(horaServidor).split(":").map(Number);
    const ahora = new Date();
    const servidor = new Date(ahora);
    servidor.setHours(h, m, s || 0, 0);
    this._desfase = servidor.getTime() - ahora.getTime();
    if (!this._latido) {
      this._latido = setInterval(() => {
        if (this._vivo && this.state.view === "marcar") {
          this.setState({ mkTic: Date.now() });
        }
      }, 1000);
    }
  }

  horaDelServidor() {
    return new Date(Date.now() + (this._desfase || 0));
  }

  /* El estado del permiso de ubicación, sin pedirlo. Preguntar por el
     permiso no abre el cuadro; leer la posición sí. Se lee solo si ya
     estaba concedido. */
  async revisarGps() {
    if (!window.isSecureContext) {
      this.setState({ mkGps: "inseguro" });
      return;
    }
    if (!navigator.geolocation) { this.setState({ mkGps: "no" }); return; }
    let estado = "preguntar";
    try {
      if (navigator.permissions) {
        const p = await navigator.permissions.query({ name: "geolocation" });
        estado = p.state === "granted" ? "si"
               : p.state === "denied" ? "no" : "preguntar";
      }
    } catch (e) { /* Firefox viejo: se queda en «preguntar». */ }
    this.setState({ mkGps: estado });
    if (estado !== "si") return;
    try {
      const d = await this.ubicacionActual();
      if (this._vivo) this.setState({ mkDonde: d });
    } catch (e) {
      if (this._vivo) this.setState({ mkGps: "no" });
    }
  }

  /* Metros entre dos coordenadas. La misma cuenta que hace el servidor
     antes de aceptar la marca; aquí solo sirve para enseñarla antes. */
  /* Aquí estaba metrosHasta(), que medía la distancia a la sede.
     Se fue con el resto del cerco el 31/08/2026: no se mide nada.
     Lo que se guarda y se lee es DÓNDE, no a cuánto. */


  /* Marcar son dos pasos: primero la ubicación —que puede tardar y puede
     fallar, y no tiene sentido encender la cámara si va a fallar—, y luego
     el diálogo donde la persona se ve y toma su foto. Antes la foto se
     capturaba a escondidas: nadie sabía qué había quedado guardado. */
  async marcarAhora() {
    if (this.state.mkOcupado) return;
    if ((this.state.mkMarcas || []).length >= 2) return;   // ya no queda qué marcar
    /* Sin paso intermedio: la cámara se abre en el acto. Decía «Buscando
       tu ubicación…» porque antes se esperaba al GPS; ahora no se espera,
       así que ese cartel solo sería un parpadeo. */
    this.setState({ mkOcupado: true, mkAviso: "" });

    /* La ubicación se pide SIEMPRE, y no se espera por ella.

       Dos cosas que antes estaban mal, y la segunda la traje yo al
       arreglar la primera:

       · Solo se pedía si había una sede configurada. Sin sede el navegador
         no llegaba ni a preguntar, la marca quedaba sin coordenadas, y la
         pantalla mientras tanto prometía que se guardaban «como
         constancia». Además era circular: sin marcas con ubicación no hay
         forma de saber dónde está la sede.

       · Al pedirla siempre, quien no da permiso se quedaba doce segundos
         —lo que tarda el navegador en rendirse— mirando «Buscando tu
         ubicación…». Esperar tanto por un dato que no condiciona nada es
         peor que no pedirlo.

       Así que se lanza la petición y se sigue: la cámara se abre en el
       acto y la respuesta se recoge al enviar la marca, en
       ubicacionSiLlego(). Entre medias la persona se acomoda y se hace la
       foto, que es tiempo de sobra para que conteste un GPS.

       Nunca se le niega el fichaje a nadie por la ubicación: ni por no
       darla, ni por estar lejos. Lo que quede registrado —o lo que falte—
       lo mira RRHH, que es quien puede preguntar qué pasó. */
    this._ubicacion = this.ubicacionActual().catch(() => null);
    /* En cuanto conteste el GPS, el diálogo lo enseña: la persona ve
       «Buscándola…» pasar a «Registrada» mientras se acomoda, en vez de
       enterarse al final de que había una ubicación. */
    this._ubicacion.then((d) => {
      if (this._vivo) this.setState({ camDonde: d || null,
                                      camBuscandoUbi: false,
                                      mkDonde: d || this.state.mkDonde });
    });

    this.setState({
      mkOcupado: false, mkPaso: "",
      modal: "camara", modalError: "", modalOcupado: false, camModo: "marca",
      /* Todavía no hay coordenadas: llegarán mientras se hace la foto. */
      camDonde: null, camBuscandoUbi: true,
      camFoto: "", camDescriptor: null,
      camListo: false, camError: "",
    });
    /* El modelo se va cargando mientras la persona se acomoda: son 7 MB y
       esperar con la cara puesta se hace largo. */
    this.cargarRostro().catch(() => {});
  }

  /* ── La cámara del diálogo ───────────────────────────────────────────
     Se enciende cuando el <video> aparece y se apaga en cuanto deja de
     estar: al cerrar el diálogo, y también al tomar la foto, porque
     mientras se revisa la foto la cámara ya no hace falta. */
  montarCamara() {
    const v = document.getElementById("videoMarca");
    if (!v) { this.apagarCamara(); return; }
    if (this._camVideo === v || this._camPidiendo) return;
    this._camVideo = v;
    this._camPidiendo = true;
    (async () => {
      try {
        if (!window.isSecureContext) {
          throw new Error("El navegador bloquea la cámara fuera de una "
            + "conexión segura (https). Desde el celular hace falta https.");
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Este navegador no da acceso a la cámara.");
        }
        const flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
        /* Si cerró el diálogo mientras el permiso estaba en pantalla, se
           apaga lo que se acaba de encender. */
        if (!this._vivo || this.state.modal !== "camara") {
          flujo.getTracks().forEach((t) => t.stop());
          return;
        }
        this._camFlujo = flujo;
        v.srcObject = flujo;
        v.muted = true;
        v.playsInline = true;
        await v.play();
        this.setState({ camListo: true, camError: "" });
      } catch (e) {
        this._camVideo = null;
        if (this._vivo) this.setState({ camListo: false, camError:
          e && e.name === "NotAllowedError"
            ? "No diste permiso de cámara. Actívalo en el navegador y vuelve a abrir esta ventana."
            : String((e && e.message) || e) });
      } finally {
        this._camPidiendo = false;
      }
    })();
  }

  apagarCamara() {
    if (this._camFlujo) this._camFlujo.getTracks().forEach((t) => t.stop());
    this._camFlujo = null;
    this._camVideo = null;
  }

  /* El vídeo se ve espejado, que es como uno espera verse; lo que se
     guarda NO se espeja, para que la foto sirva de registro y, el día que
     se compare con un rostro de referencia, no haya que deshacer nada. */
  tomarFoto() {
    const v = this._camVideo;
    if (!v || !this._camFlujo) {
      this.setState({ camError: "La cámara todavía no está lista." });
      return;
    }
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    this.setState({ camFoto: c.toDataURL("image/jpeg", 0.82), camError: "",
                    camDescriptor: null, camPensando: true });
    this.apagarCamara();
    /* La cara se busca sobre el lienzo recién capturado, no sobre el vídeo:
       así lo que se compara es exactamente la foto que la persona vio. */
    this.descriptorDe(c)
      .then((d) => { if (this._vivo)
        this.setState({ camDescriptor: d, camPensando: false, camError: "" }); })
      .catch((e) => { if (this._vivo)
        this.setState({ camPensando: false, camDescriptor: null,
                        camError: String(e.message || e) }); });
  }

  repetirFoto() {
    this.setState({ camFoto: "", camListo: false, camError: "",
                    camDescriptor: null, camPensando: false });
  }

  /* El botón de confirmar del diálogo. La marca se manda con la foto que
     la persona vio y aceptó, no con otra. */
  /* Lo que haya contestado el GPS mientras la persona se hacía la foto.

     Se espera un poco, pero no los 12 segundos que tarda el navegador en
     rendirse: a estas alturas o ya contestó o no va a contestar, y vale
     más una marca puntual sin ubicación que una persona esperando delante
     de la cámara por un dato que no condiciona nada. */
  async ubicacionSiLlego() {
    if (!this._ubicacion) return null;
    const corte = new Promise((r) => setTimeout(() => r(null), 2500));
    try {
      return await Promise.race([this._ubicacion, corte]);
    } catch (e) {
      return null;
    }
  }

  async confirmarMarca() {
    if (this.state.modalOcupado) return;
    if (!this.state.camFoto) {
      this.setState({ modalError: "Toma la foto antes de marcar." });
      return;
    }
    if (!this.state.camDescriptor) {
      this.setState({ modalError: this.state.camPensando
        ? "Espera un segundo: se está reconociendo la cara."
        : "En esa foto no se ve una cara. Repítela." });
      return;
    }
    this.setState({ modalOcupado: true, modalError: "" });
    /* La ubicación se pidió al abrir la cámara y se recoge aquí: para
       cuando la persona termina su foto, el GPS ya suele haber contestado
       y nadie ha esperado por él. */
    const donde = this.state.camDonde || await this.ubicacionSiLlego();
    const cuerpo = Object.assign(
      { foto: this.state.camFoto, descriptor: this.state.camDescriptor,
        modelo: MODELO_ROSTRO },
      donde || {});
    this.api("/api/asistencia/marcar",
             { method: "POST", body: JSON.stringify(cuerpo) })
      .then((d) => {
        if (!this._vivo) return;
        this.apagarCamara();
        this.setState({
          modalOcupado: false, modal: "", modalError: "",
          /* El sitio queda a la vista en el recuadro «Dónde» hasta la
             siguiente marca: es la confirmación de que se registró. */
          mkLugar: d.lugar || "",
          camFoto: "", camDonde: null, camListo: false, camError: "",
          mkAviso: d.repetida ? d.aviso
            /* El sitio, no la distancia: «a 340 m de la sede» no le dice
               a nadie dónde está. Si el servicio de mapas no contestó, se
               cae a los metros, que es mejor que nada. */
            /* El sitio, si se supo. Antes caía a los metros cuando el
               servicio de mapas no contestaba; ya no hay metros que
               enseñar, así que se calla y basta. */
            : "Marca registrada a las " + d.hora
              + (d.lugar ? " · " + d.lugar : ""),
          mkAvisoTipo: d.repetida ? "aviso" : "bien",
        });
        this.cargarMisMarcas();
      })
      .catch((e) => {
        if (this._vivo) this.setState({ modalOcupado: false,
                                        modalError: String(e.message || e) });
      });
  }


  /* ── El modelo de rostro ─────────────────────────────────────────────
     Se carga la primera vez que hace falta y no antes: son 7 MB, y quien
     entra a ver sus permisos no tiene por qué descargarlos. Sale de
     /web/rostro/ —de este mismo servidor—, no de internet: así funciona
     sin conexión y nadie de fuera se entera de quién marca. */
  cargarRostro() {
    if (this._rostroListo) return this._rostroListo;
    this.setState({ camModelo: "cargando" });
    this._rostroListo = (async () => {
      if (!window.faceapi) {
        await new Promise((ok, mal) => {
          const s = document.createElement("script");
          s.src = "/web/rostro/face-api.min.js";
          s.onload = ok;
          s.onerror = () => mal(new Error(
            "No se pudo cargar el modelo de rostro. Recarga la página."));
          document.head.appendChild(s);
        });
      }
      const f = window.faceapi;
      /* El motor de cálculo se fija a mano. Por defecto la librería elige
         «wasm», que se descargaría de internet: aquí no hay internet que
         valga. WebGL usa la tarjeta gráfica y es mucho más rápido; si el
         aparato no lo tiene, la CPU también sirve, solo que más lenta. */
      const tf = f.tf;
      try {
        await tf.setBackend("webgl");
        await tf.ready();
      } catch (e) { /* sin webgl: se prueba con la CPU */ }
      if (tf.getBackend() !== "webgl") {
        await tf.setBackend("cpu");
        await tf.ready();
      }
      const d = "/web/rostro/modelos";
      await Promise.all([
        f.nets.tinyFaceDetector.loadFromUri(d),
        f.nets.faceLandmark68Net.loadFromUri(d),
        f.nets.faceRecognitionNet.loadFromUri(d),
      ]);
      if (this._vivo) this.setState({ camModelo: "listo" });
      return f;
    })().catch((e) => {
      this._rostroListo = null;          // que se pueda reintentar
      if (this._vivo) this.setState({ camModelo: "error" });
      throw e;
    });
    return this._rostroListo;
  }

  /* Los 128 números que describen esta cara. No es la foto: de este vector
     no se reconstruye un rostro, y es lo único que se guarda. */
  async descriptorDe(lienzo) {
    const f = await this.cargarRostro();
    const hallado = await f
      .detectSingleFace(lienzo, new f.TinyFaceDetectorOptions({
        inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!hallado) {
      throw new Error("No se ve ninguna cara en la foto. Ponte de frente, "
        + "con luz, sin gorra ni mascarilla, y repítela.");
    }
    return Array.from(hallado.descriptor);
  }

  /* ── Registrar el rostro de referencia ───────────────────────────────
     Se hace una sola vez. Antes hay que aceptar el aviso: un rostro es
     dato biométrico y guardarlo sin permiso no es una opción. */
  async abrirRostroBase() {
    this.setState({
      modal: "camara", camModo: "base", modalError: "", modalOcupado: false,
      camFoto: "", camDescriptor: null, camListo: false, camError: "",
      camConsiento: this.state.mkConsintio, camTextoAviso: "",
    });
    this.cargarRostro().catch(() => {});
    this.api("/api/consentimiento/rostro")
      .then((d) => { if (this._vivo) this.setState({
        camTextoAviso: d.texto || "", camConsiento: !!d.al_dia }); })
      .catch(() => {});
  }

  /* Retirar el rostro. Va con confirmación porque deja a la persona sin
     poder marcar por el celular, y eso no debe pasar por un clic torpe. */
  pedirRetirarRostro() {
    this.setState({ modal: "retirarRostro", modalError: "",
                    modalOcupado: false });
  }

  confirmarRetirarRostro() {
    if (this.state.modalOcupado) return;
    this.setState({ modalOcupado: true, modalError: "" });
    /* Se retira el CONSENTIMIENTO, no solo el rostro: borrar el dato y
       dejar el permiso vivo sería quedarse a medias. */
    this.api("/api/consentimiento/rostro", { method: "DELETE" })
      .then(() => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modal: "",
                        mkRostro: false, mkConsintio: false,
                        mkAviso: "Retiraste tu permiso y tu rostro se borró. "
                          + "Puedes marcar en el terminal, y volver a "
                          + "registrarlo cuando quieras.",
                        mkAvisoTipo: "aviso" });
        this.cargarMisMarcas();
      })
      .catch((e) => {
        if (this._vivo) this.setState({ modalOcupado: false,
                                        modalError: String(e.message || e) });
      });
  }

  guardarRostroBase() {
    if (!this.state.camDescriptor) {
      this.setState({ modalError: "Toma la foto antes de registrar tu rostro." });
      return;
    }
    if (!this.state.camConsiento) {
      this.setState({ modalError: "Para registrar tu rostro tienes que "
        + "aceptar el aviso de tratamiento de datos." });
      return;
    }
    this.setState({ modalOcupado: true, modalError: "" });
    this.api("/api/consentimiento/rostro",
             { method: "POST", body: JSON.stringify({ acepto: true }) })
      .then(() => this.api("/api/rostro-web", { method: "POST",
        body: JSON.stringify({ descriptor: this.state.camDescriptor,
                               dimension: this.state.camDescriptor.length,
                               modelo: MODELO_ROSTRO }) }))
      .then(() => {
        if (!this._vivo) return;
        this.apagarCamara();
        this.setState({ modalOcupado: false, modal: "", camFoto: "",
                        camDescriptor: null, camModo: "marca",
                        mkRostro: true, mkConsintio: true,
                        mkAviso: "Tu rostro quedó registrado. Desde ahora la "
                          + "marca comprueba que eres tú.",
                        mkAvisoTipo: "bien" });
        this.cargarMisMarcas();
      })
      .catch((e) => {
        if (this._vivo) this.setState({ modalOcupado: false,
                                        modalError: String(e.message || e) });
      });
  }

  /* La ubicación del navegador. Los tres motivos de fallo llevan mensajes
     distintos porque tienen soluciones distintas. */
  ubicacionActual() {
    return new Promise((ok, mal) => {
      if (!window.isSecureContext) {
        mal(new Error("El navegador bloquea la ubicación y la cámara fuera de "
          + "una conexión segura (https). Desde el celular hace falta https; "
          + "en esta misma computadora funciona."));
        return;
      }
      if (!navigator.geolocation) {
        mal(new Error("Este navegador no sabe dar la ubicación."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude,
                    precision: p.coords.accuracy }),
        (e) => mal(new Error(e.code === 1
          ? "No diste permiso de ubicación. Actívalo en el navegador y vuelve a intentarlo."
          : "No se pudo obtener tu ubicación. Sal al patio o acércate a una ventana e intenta otra vez.")),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    });
  }

  abrirDialogoReporte(modulo) {
    this.setState({ modal: "reporte", modalError: "", repModulo: modulo,
                    repAlcance: "todos", repFichas: false,
                    repElegidos: [], repBusca: "" });
  }

  /* Las personas que el diálogo puede listar, según el módulo. Salen del
     mismo estado que pinta la pantalla, así que lo que se marca es lo que
     se está viendo. */
  personasDelReporte() {
    const m = this.state.repModulo;
    if (m === "beneficiarios") return this.state.beneficiarios || [];
    if (m === "responsables") return this.state.responsables || [];
    return this.state.personal || [];
  }

  alternarElegido(id) {
    const ya = (this.state.repElegidos || []).slice();
    const i = ya.indexOf(id);
    if (i >= 0) ya.splice(i, 1); else ya.push(id);
    this.setState({ repElegidos: ya, modalError: "" });
  }

  confirmarReporte() {
    const st = this.state;
    const porElegidos = st.repAlcance === "elegidos";
    if (porElegidos && !(st.repElegidos || []).length) {
      this.setState({ modalError: "Marca al menos una persona, o elige «Todos»." });
      return;
    }
    /* El filtro de la PANTALLA viaja siempre: define qué lista se imprime.
       El del diálogo solo servía para encontrar a quién marcar. */
    const esAsistencia = st.repModulo === "asistencia";
    const filtros = esAsistencia
      ? { vista: st.attTab || "diaria", fecha: st.fecha || "",
          desde: st.rangoDesde || "", hasta: st.rangoHasta || "" }
      : { busca: porElegidos ? "" : (st.busLegajo || "") };
    if (porElegidos) filtros.ids = (st.repElegidos || []).join(",");
    /* La ficha completa solo existe donde hay ficha. */
    if (!esAsistencia && (st.repFichas || porElegidos)) filtros.fichas = "1";
    this.setState({ modal: "" });
    this.abrirReporte(st.repModulo, filtros);
  }

  abrirReporte(modulo, filtros) {
    const q = Object.keys(filtros || {})
      .filter((k) => filtros[k] !== "" && filtros[k] != null)
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(filtros[k]))
      .join("&");
    window.open("/api/reportes/" + modulo + ".pdf" + (q ? "?" + q : ""), "_blank");
  }

  filtradas(lista, campos, texto) {
    const t = String(texto || "").trim().toLowerCase();
    if (!t) return lista || [];
    return (lista || []).filter((x) =>
      campos.some((c) => String(x[c] == null ? "" : x[c]).toLowerCase().indexOf(t) >= 0));
  }

  rutaEnLaBarra() {
    /* De la ruta de verdad, no del `#`. Se sigue leyendo el `#` por si
       alguien guardó un enlace viejo: vale una vez, y al primer cambio de
       pantalla la barra queda limpia. */
    const h = String(window.location.hash || "").replace(/^#\/?/, "").split("?")[0];
    if (h) return h;
    return String(window.location.pathname || "").replace(/^\//, "").split("?")[0];
  }

  /* Lleva la aplicación a donde diga la dirección. Se usa al cargar y
     cuando alguien pulsa «atrás». */
/*§CORTE§ linea original 4502 §*/
  /* `ses` se pasa desde cargarSesion() con la sesión recién recibida.
     Sin ese argumento esto leería `this.state.sesion`, que en ese momento
     todavía no está puesta —setState acaba de llamarse—, y toda ruta que
     exija un módulo caería al Dashboard por «falta de permisos». Era el
     motivo de que /permisos funcionara y /bandeja no. */
  irADondeDiceLaBarra(ses, pedida) {
    const sesion = ses !== undefined ? ses : this.state.sesion;
    /* Sin sesión y con login estricto, la dirección no manda. Antes esto
       no se comprobaba: la ruta caía al Dashboard por falta de permisos,
       y el Dashboard también está dentro del sistema. */
    if (this.state.estricto && !sesion) return;
    /* `pedida` es la dirección tal y como estaba ANTES de que el arranque
       tocara el estado. Sin ella se lee la barra ya reescrita por
       anotarRuta() y todo el mundo acaba en el Dashboard. */
    const nombre = pedida !== undefined ? pedida : this.rutaEnLaBarra();
    if (!nombre) return;
    const destino = estadoDe(nombre);
    /* Una dirección que no existe —un enlace viejo, un dedazo— no deja la
       pantalla en blanco: se ignora y se sigue donde se esté. */
    if (!destino) return;
    /* Y una a la que este cargo no llega, tampoco: cae al Dashboard, que
       es lo que vería igualmente al entrar. */
    const permitida = this.puedeVerRuta(destino, sesion);
    this._ignorarRuta = true;
    this.setState(permitida ? destino : { view: "dash" });
  }

  /* ¿Alcanza esta persona la pantalla que pide la dirección? Se apoya en
     el mismo menú: si la entrada no le aparece, la dirección tampoco vale. */
/*§CORTE§ linea original 4522 §*/
  puedeVerRuta(destino, ses) {
    const mods = {
      responsables: ["responsables"], bandeja: ["responsables"],
      legajo: ["personal", "beneficiarios", "organigrama", "documentos", "contratos"],
      personas: ["personal", "responsables", "beneficiarios"],
      asistenciaHome: ["asistencia", "permisos"], asistencia: ["asistencia"],
      biometria: ["asistencia"], permisos: ["permisos"],
      usuarios: ["usuarios"], nomina: ["planillas"], config: ["configuracion"],
    }[destino.view];
    if (!mods) return true;      // dash y misPermisos: para cualquiera
    return mods.some((m) => this.puede(m, "vista", ses));
  }

  /* Escribe la pantalla actual en la barra. No se toca durante el login ni
     el cambio de contraseña: esas no son sitios a los que volver. */
/*§CORTE§ linea original 4537 §*/
  anotarRuta() {
    const v = this.state.view;
    if (v === "login" || v === "clave") return;
    const nombre = rutaDe(this.state);
    if (!nombre) return;
    const actual = this.rutaEnLaBarra();
    if (actual === nombre) return;
    /* replace y no push cuando la pantalla no cambió de módulo: si no, el
       botón «atrás» se llenaría de pasos que no llevan a ninguna parte. */
    /* pushState y no `hash`: cambia la barra de verdad, sin almohadilla,
       y sin recargar — la pantalla ya pintada se queda donde está. */
    window.history.pushState({}, "", "/" + nombre);
  }

  /* ── La pizarrita ────────────────────────────────────────────────────
     Se engancha una sola vez por lienzo. Mientras se dibuja no se toca el
     estado: un setState volvería a pintar y el <canvas> nuevo saldría en
     blanco a media firma. */
/*§CORTE§ linea original 4687 §*/
  componentDidUpdate() {
    this.montarLienzo();
    this.montarCamara();
    /* Si el cambio vino de la propia barra, no se reescribe: se entraría
       en un ida y vuelta entre la dirección y el estado. */
    if (this._ignorarRuta) { this._ignorarRuta = false; return; }
    this.anotarRuta();
  }

/*§CORTE§ linea original 4695 §*/
  componentDidMount() {
    this._vivo = true;
    /* El botón «atrás» del navegador. */
    this._alCambiarRuta = () => { if (this._vivo) this.irADondeDiceLaBarra(); };
    /* popstate es el «atrás» y «adelante» cuando se usa pushState.
       hashchange se mantiene por los enlaces viejos con almohadilla. */
    window.addEventListener("popstate", this._alCambiarRuta);
    window.addEventListener("hashchange", this._alCambiarRuta);
    /* Primero se pregunta quién es: cargar datos antes sería pedir cosas
       para las que quizá no hay permiso, y llenaría el registro de accesos
       de negaciones que no cometió nadie. */
    this.cargarSesion();
    this._esc = (e) => this.cerrarConEscape(e);
    document.addEventListener("keydown", this._esc);

    /* La fecha de la cabecera estaba escrita a mano y se quedó congelada en
       un día de agosto. Ahora sale del sistema y se refresca sola.

       Se comprueba cada minuto en vez de programar un disparo a medianoche:
       si el equipo se suspende, ese disparo único se pierde y la fecha queda
       colgada en el día anterior. Comparar una cadena una vez por minuto no
       cuesta nada. */
    const alDia = () => {
      const hoy = this.fechaHoy();
      if (hoy !== this.state.hoyISO) this.setState({ hoyISO: hoy });
    };
    alDia();
    this._reloj = setInterval(alDia, 60000);

    /* Y que la pantalla se entere sola de lo que pase en el terminal o en
       el celular de otra persona, sin que nadie tenga que recargar. */
    this.arrancarVigilancia();
  }

/*§CORTE§ linea original 4722 §*/
  componentWillUnmount() {
    this._vivo = false;
    if (this._alCambiarRuta) {
      window.removeEventListener("popstate", this._alCambiarRuta);
      window.removeEventListener("hashchange", this._alCambiarRuta);
      this._alCambiarRuta = null;
    }
    if (this._sondeo) { clearTimeout(this._sondeo); this._sondeo = null; }
    if (this._vigila) { clearInterval(this._vigila); this._vigila = null; }
    if (this._esc) { document.removeEventListener("keydown", this._esc); this._esc = null; }
    if (this._reloj) { clearInterval(this._reloj); this._reloj = null; }
  }

/*§CORTE§ linea original 4733 §*/
  api(ruta, opciones) {
    const o = Object.assign({}, opciones || {});
    const cabeceras = Object.assign({ "Content-Type": "application/json" }, o.headers || {});
    /* El backend exige este token en toda escritura. Sin él, un formulario
       alojado en otra web podría disparar peticiones aprovechando la cookie
       de sesión que el navegador manda sola. */
    const metodo = (o.method || "GET").toUpperCase();
    if (this.state.csrf && ["POST", "PUT", "PATCH", "DELETE"].indexOf(metodo) >= 0)
      cabeceras["X-CSRF-Token"] = this.state.csrf;
    o.headers = cabeceras;
    return fetch(ruta, o)
      .then((r) => r.json().then((d) => {
        /* La sesión pudo caducar o cerrarse desde Usuarios mientras la
           pestaña seguía abierta: en vez de un error suelto, de vuelta al
           login. */
        if (r.status === 401 && this.state.sesion) this.expulsar(d.error);
        if (!r.ok || d.ok === false) throw new Error(d.error || ("HTTP " + r.status));
        return d;
      }));
  }

  /* ══════════════════════════════════════════════════════════════════════
     SESIÓN
     Los permisos llegan ya resueltos dentro de la sesión; la interfaz solo
     los consulta. Nunca son la barrera —esa está en el backend— sino lo que
     evita enseñar botones que acabarían en un 403.
     ══════════════════════════════════════════════════════════════════════ */

/*§CORTE§ linea original 4761 §*/
  hacerLogin() {
    const st = this.state;
    if (!st.loginUser || !st.loginPass) {
      this.setState({ loginErr: "Escribe tu usuario y tu contraseña." });
      return;
    }
    if (st.loading) return;
    this.setState({ loading: true, loginErr: "" });
    this.api("/api/login", {
      method: "POST",
      body: JSON.stringify({ usuario: st.loginUser.trim().toLowerCase(),
                             clave: st.loginPass })
    })
      .then((d) => {
        if (!this._vivo) return;
        const ses = d.sesion;
        this.setState({
          sesion: ses, csrf: ses.csrf, loading: false, loginPass: "",
          /* Si la clave se la puso otro, no se entra a ninguna pantalla
             hasta cambiarla: hasta entonces la cuenta la conocen dos. */
          view: ses.debe_cambiar ? "clave" : "dash"
        });
        this.cargarTodo();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ loading: false, loginPass: "", loginErr: String(e.message || e) });
      });
  }

/*§CORTE§ linea original 4791 §*/
  cambiarClave() {
    const st = this.state;
    if (st.clOcupado) return;
    if (!st.clAct || !st.clNueva) {
      this.setState({ clErr: "Completa los tres campos." });
      return;
    }
    if (st.clNueva !== st.clNueva2) {
      this.setState({ clErr: "La contraseña nueva no coincide con la repetición." });
      return;
    }
    this.setState({ clOcupado: true, clErr: "" });
    this.api("/api/cambiar-clave", {
      method: "POST",
      body: JSON.stringify({ actual: st.clAct, nueva: st.clNueva })
    })
      .then((d) => {
        if (!this._vivo) return;
        this.setState({
          sesion: d.sesion, csrf: d.sesion.csrf, clOcupado: false,
          clAct: "", clNueva: "", clNueva2: "", clErr: "", view: "dash"
        });
        this.cargarTodo();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ clOcupado: false, clErr: String(e.message || e) });
      });
  }


  /* ══════════════════════════════════════════════════════════════════════
     USUARIOS, CARGOS Y PERMISOS
     Todo lo que se decide aquí lo vuelve a comprobar el backend. Esta
     pantalla es la comodidad; la barrera está allí.
     ══════════════════════════════════════════════════════════════════════ */

  /* "2026-08-14 09:31:02" -> "hoy 09:31" / "ayer 18:04" / "12 ago 09:31".
     En un registro de accesos lo que se busca es "¿esto fue hace un rato?",
     y una marca de tiempo completa obliga a calcularlo de cabeza. */
/*§CORTE§ linea original 4831 §*/
  cuandoCorto(iso) {
    const t = String(iso || "").trim();
    if (!t) return "—";
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return t;
    const hora = m[4] + ":" + m[5];
    const dia = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dif = Math.round((hoy - dia) / 86400000);
    if (dif === 0) return "hoy " + hora;
    if (dif === 1) return "ayer " + hora;
    const MES = ["ene","feb","mar","abr","may","jun","jul","ago","set","oct","nov","dic"];
    return Number(m[3]) + " " + MES[Number(m[2]) - 1] + " " + hora;
  }

/*§CORTE§ linea original 4846 §*/
  nombreModulo(clave) {
    const m = (this.state.modulosPerm || []).find((x) => x.clave === clave);
    return m ? m.nombre : (clave || "—");
  }

  /* ══════════════════════════════════════════════════════════════════════
     RESPONSABLES / TUTORES

     Entidad propia: la madre o la abuela de un beneficiario no trabaja en la
     ONG. Se registra una vez y se vincula a los niños que corresponda.
     ══════════════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════════════
     VÍNCULO RESPONSABLE ↔ BENEFICIARIO
     Se ve desde las dos puntas: en la ficha del niño, quién responde por él;
     en la del responsable, de qué niños está a cargo. Los datos de la
     persona no se repiten en ninguna de las dos: vienen de su ficha.
     ══════════════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════════════
     TRAYECTORIA DEL PERSONAL
     ══════════════════════════════════════════════════════════════════════ */

/*§CORTE§ linea original 5597 §*/
  cabecerasCsrf() {
    /* Para las subidas de archivo, que van por fetch directo. No se fija
       Content-Type a propósito: FormData genera el suyo con el boundary y
       pisarlo rompe la subida. */
    return this.state.csrf ? { "X-CSRF-Token": this.state.csrf } : {};
  }

/*§CORTE§ linea original 5604 §*/
  cargarSesion() {
    /* Se anota a dónde quería ir ANTES de tocar el estado: el propio
       arranque reescribe la barra al repintar. */
    const pedida = this.rutaEnLaBarra();
    return this.api("/api/sesion")
      .then((d) => {
        if (!this._vivo) return;
        const ses = d.sesion || null;
        const parche = {
          sesion: ses, csrf: ses ? ses.csrf : "",
          estricto: !!d.estricto, sesionLista: true
        };
        if (ses) parche.view = ses.debe_cambiar ? "clave" : "dash";
        /* Y si NO hay sesión, se dice: antes se dejaba `view` como
           estuviera, que es como una dirección escrita a mano acababa
           dentro. */
        else if (d.estricto) parche.view = "login";
        this.setState(parche);
        if (ses) this.cargarTodo();
        if (ses && ses.personal_id) this.cargarMisMarcas();
        /* Solo después de saber quién es: la dirección puede apuntar a un
           módulo que esta persona no alcanza, y eso se decide con sus
           permisos ya cargados. El cambio de contraseña manda sobre
           cualquier dirección guardada. */
        if (ses && !ses.debe_cambiar) this.irADondeDiceLaBarra(ses, pedida);
      })
      .catch(() => { if (this._vivo) this.setState({ sesionLista: true }); });
  }

/*§CORTE§ linea original 5629 §*/
  /* ══════════════════════════════════════════════════════════════════
     QUE LA PANTALLA SE ENTERE SOLA

     Se pidieron websockets. Aquí no caben: el servidor corre con un solo
     proceso —obligatorio, porque el enrolamiento vive en su memoria— y
     ocho hilos, y cada websocket ocuparía uno mientras la pestaña siga
     abierta. Con ocho personas mirando, el servidor dejaría de atender
     nada, ni siquiera marcar.

     Así que se pregunta. Una consulta minúscula cada pocos segundos que
     devuelve un sello; si el sello no cambió, no se hace nada más.

     Si algún día el enrolamiento sale de la memoria del proceso y se
     pueden levantar varios, esto se sustituye por websockets sin tocar
     ninguna pantalla: lo único que sabe la interfaz es «algo cambió». */
  arrancarVigilancia() {
    if (this._vigila) return;
    /* Cada 5 segundos. Estuvo en 12 y se quedaba corto: alguien fichaba en
       el Timmy y tardaba en verse. La consulta son dos MAX() sobre índices
       y no devuelve datos, solo un sello, así que preguntar más a menudo
       no cuesta apenas — y con la pestaña de fondo ni se pregunta. */
    const CADA = 5000;

    const mirar = (soloApuntar) => {
      /* Con la pestaña de fondo no se pregunta: no hay nadie mirando, y en
         un teléfono eso es batería y datos regalados. */
      if (!this._vivo || (!soloApuntar && document.hidden)) return;
      this.api("/api/novedades")
        .then((d) => {
          if (!this._vivo || !d || !d.sello) return;
          /* La primera vez solo se apunta cómo estaban las cosas. Eso se
             hace AQUÍ, al arrancar, y no en el primer latido: si se
             esperaba al primer latido, cualquier cambio ocurrido en esos
             segundos se tomaba por el punto de partida y no se veía nunca.
             Pasó de verdad, y por eso está escrito. */
          if (this._sello === undefined || soloApuntar) {
            this._sello = d.sello;
            return;
          }
          if (d.sello === this._sello) return;
          this._sello = d.sello;
          this.alCambiarAlgo();
        })
        .catch(() => { /* un fallo suelto de red no merece aviso */ });
    };

    mirar(true);
    this._vigila = setInterval(() => mirar(false), CADA);
  }

  /* Qué recargar cuando algo cambió. Solo lo de la pantalla que se está
     mirando: recargarlo todo en cada cambio haría lo contrario de lo que
     se busca. */
  alCambiarAlgo() {
    const v = this.state.view;
    if (v === "asistencia" || v === "dash" || v === "personas") {
      this.cargarPersonas();
      this.cargarRango();
    }
    if (v === "biometria") {
      this.cargarIdentidades();
      this.cargarCandidatos();
    }
    if (v === "marcar") this.cargarMisMarcas();
  }

  cargarTodo() {
    this.revisarBackend();
    this.cargarPersonas();
    this.cargarRango();
    this.cargarCandidatos();
    this.cargarIdentidades();
    this.cargarPersonal();
    this.cargarParametros();
    this.cargarAlertas();
    this.cargarVencimientos();
    this.cargarPlanilla();
    this.cargarBeneficiarios();
    this.cargarCamposRequeridos();
    if (this.puede("responsables", "vista")) this.cargarBandeja();
    if (this.puede("usuarios", "vista")) this.cargarUsuarios();
    if (this.puede("responsables", "vista")) this.cargarResponsables();
  }

/*§CORTE§ linea original 5647 §*/
  expulsar(motivo) {
    this.setState({
      view: "login", sesion: null, csrf: "", loginPass: "",
      loginErr: motivo || "Tu sesión se cerró. Vuelve a entrar."
    });
  }

  /* Un módulo al que no llegas ni siquiera aparece en el menú; uno en el
     que solo tienes vista aparece sin sus botones de crear o borrar. */
/*§CORTE§ linea original 5656 §*/
  puede(modulo, nivel, sesForzada) {
    /* Casi siempre la sesión sale del estado. La excepción es el arranque:
       ver el comentario de irADondeDiceLaBarra(). */
    const ses = sesForzada !== undefined ? sesForzada : this.state.sesion;
    if (!ses) return !this.state.estricto;   // convivencia: todo abierto
    if (ses.rol === "director") return true;
    const tiene = (ses.permisos || {})[modulo] || "ninguno";
    const orden = ["ninguno", "vista", "edicion"];
    return orden.indexOf(tiene) >= orden.indexOf(nivel || "vista");
  }

/*§CORTE§ linea original 5665 §*/
  puedeAlguno(modulos, nivel) {
    return modulos.some((m) => this.puede(m, nivel));
  }

/*§CORTE§ linea original 5669 §*/
  revisarBackend() {
    this.api("/api/health")
      .then((d) => {
        if (!this._vivo) return;
        const disponibles = d.metodos_disponibles || null;
        const parche = {
          backendVivo: true,
          backendConfigurado: !!d.configurado,
          backendFaltan: d.faltan || [],
          metodosDisponibles: disponibles
        };
        /* Si el método elegido resulta no estar soportado por el terminal,
           volver a Rostro en vez de dejar seleccionada una opción imposible. */
        const elegido = this.state.addMetodo || "facial";
        if (disponibles && disponibles.indexOf(elegido) < 0) parche.addMetodo = disponibles[0] || "facial";
        this.setState(parche);
      })
      .catch(() => { if (this._vivo) this.setState({ backendVivo: false }); });
  }

/*§CORTE§ linea original 5689 §*/
  fechaHoy() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
      + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* La fecha elegida, en letra. Se arma con los números partidos y no con
     new Date(iso): esa forma la interpreta en UTC y en Lima devuelve el día
     anterior. */
  /* Días entre dos fechas, ambas incluidas. Devuelve null si no se
     entienden o están al revés: eso lo dirá el formulario al enviar, y
     mientras tanto el documento enseña un hueco en vez de un número
     falso. */
/*§CORTE§ linea original 5702 §*/
  diasEntre(desde, hasta) {
    const a = String(desde || "").split("-").map(Number);
    const b = String(hasta || "").split("-").map(Number);
    if (a.length !== 3 || b.length !== 3) return null;
    const d1 = new Date(a[0], a[1] - 1, a[2]);
    const d2 = new Date(b[0], b[1] - 1, b[2]);
    if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
    return Math.round((d2 - d1) / 86400000) + 1;
  }

/*§CORTE§ linea original 5712 §*/
  fechaEnLetra(iso) {
    const f = String(iso || this.fechaHoy());
    const [a, m, d] = f.split("-").map(Number);
    const texto = new Date(a, m - 1, d).toLocaleDateString("es-PE",
      { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  /* dd/mm/aaaa, que es como el formato de papel escribe las fechas en
     sus huecos estrechos. Vacío si no hay fecha: un hueco tiene que
     verse como un hueco. */
/*§CORTE§ linea original 5723 §*/
  fechaCorta(iso) {
    const f = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return "";
    const [a, m, d] = f.split("-");
    return d + "/" + m + "/" + a;
  }

  /* ── Vistas semanal y mensual ─────────────────────────────────────────
     Ambas necesitan varios días a la vez, así que se piden de una sola
     consulta al endpoint de rango en vez de un día por petición. */

/*§CORTE§ linea original 6133 §*/
  cerrarModal() {
    if (this.state.modalOcupado) return;   // no cerrar a media operación
    /* Cerrar el diálogo apaga la cámara. Dejarla encendida detrás de una
       pantalla cerrada sería tenerla mirando sin motivo. */
    this.apagarCamara();
    /* Las marcas «sin dato» se olvidan al salir: pertenecen a la ficha que
       se estaba editando, no a la siguiente que se abra. */
    this.setState({ modal: "", modalError: "", sdFaltan: [], sdMarcados: [],
                    camModo: "marca", camFoto: "", camDescriptor: null,
                    camPensando: false });
  }

  /* Solo cierra si el clic fue en el fondo. Sin esta comprobación,
     cualquier clic dentro del formulario cerraría el diálogo, porque el
     evento sube hasta el fondo. */
/*§CORTE§ linea original 6143 §*/
  cerrarPorFondo(e) {
    if (e.target === e.currentTarget) this.cerrarModal();
  }

  /* Escape cierra el diálogo que esté abierto, sea cual sea. Se ignora
     mientras hay una operación en curso, igual que el resto de cierres. */
/*§CORTE§ linea original 6149 §*/
  cerrarConEscape(e) {
    if (e.key !== "Escape" && e.key !== "Esc") return;
    if (this.state.modalOcupado || this.state.condGuardando) return;
    if (this.state.condBorrar) { this.setState({ condBorrar: null }); return; }
    if (this.state.condOpen) { this.setState({ condOpen: false, condErr: "" }); return; }
    if (this.state.modal) this.cerrarModal();
  }

/*§CORTE§ linea original 6157 §*/
  confirmarModal() {
    if (this.state.modalOcupado) return;
    if (this.state.modal === "rechazar") return this.rechazarPermiso();
    if (this.state.modal === "pedirPermiso") return this.pedirPermiso();
    if (this.state.modal === "formacion") return this.guardarTrayectoria("formacion");
    if (this.state.modal === "experiencia") return this.guardarTrayectoria("experiencia");
    if (this.state.modal === "vinculo") return this.guardarVinculo();
    if (this.state.modal === "quitarVinculo") return this.confirmarQuitarVinculo();
    if (this.state.modal === "responsable") return this.guardarResponsable();
    if (this.state.modal === "borrarResp") return this.confirmarBorrarResponsable();
    if (this.state.modal === "usuario") return this.guardarUsuario();
    if (this.state.modal === "rol") return this.guardarRol();
    if (this.state.modal === "ficha") return this.guardarFicha();
    if (this.state.modal === "beneficiario") return this.guardarBeneficiario();
    if (this.state.modal === "reporte") return this.confirmarReporte();
    if (this.state.modal === "retirarRostro") return this.confirmarRetirarRostro();
    if (this.state.modal === "camara") {
      return this.state.camModo === "base"
        ? this.guardarRostroBase() : this.confirmarMarca();
    }
    if (this.state.modal === "firma") return this.confirmarFirma();
    if (this.state.modal === "programa") return this.guardarSerie("programa");
    if (this.state.modal === "historial") return this.guardarSerie("historial");
    if (this.state.modal === "seguimiento") return this.guardarSerie("seguimiento");
    if (this.state.modal === "sesion") return this.guardarSesion();
    if (this.state.modal === "incidencia") return this.guardarIncidencia();
    if (this.state.modal === "documento") return this.guardarDocumento();
    if (this.state.modal === "borrarDoc") return this.confirmarBorrarDocumento();
    return this.confirmarBorrado();
  }

  /* Abre la confirmación de quitar a alguien del terminal.
     No borra nada por sí solo: quitar a una persona del dispositivo
     biométrico le impide marcar, así que se pregunta antes. La ficha de la
     persona no se toca. */
/*§CORTE§ linea original 6186 §*/
  pedirBorrado(sn, nombre, rol) {
    this.setState({
      modal: "borrar", modalSn: sn, modalNombre: nombre,
      modalRol: rol || "", modalError: "", modalOcupado: false,
    });
  }

  /* La tabla de Asistencia pasa la fila entera; la lista de Gestión
     Biométrica, los datos sueltos. Un solo camino para las dos. */
/*§CORTE§ linea original 6195 §*/
  abrirBorrar(p) {
    this.pedirBorrado(p.sn || p.staff_number, p.nombre, p.rolLabel || p.rol || "");
  }

/*§CORTE§ linea original 6199 §*/
  confirmarBorrado() {
    const sn = this.state.modalSn;
    const nombre = this.state.modalNombre;
    this.setState({ modalOcupado: true, modalError: "" });
    this.api("/api/identidades/" + sn, { method: "DELETE" })
      .then((d) => {
        if (!this._vivo) return;
        const avisos = d.avisos || [];
        this.setState({
          modal: "", modalOcupado: false,
          syncEstado: avisos.length ? "error" : "ok",
          syncMsg: avisos.length
            ? (nombre + " se quitó de aquí, pero: " + avisos.join(" "))
            : (nombre + " se quitó del terminal y de yunatt. Su ficha se conserva.")
        });
        this.cargarPersonas();
        this.cargarCandidatos();
        this.cargarIdentidades();
    this.cargarIdentidades();
        this.cargarPersonal();
      })
      .catch((e) => {
        if (!this._vivo) return;
        this.setState({ modalOcupado: false, modalError: String(e.message || e) });
      });
  }

  /* El ámbito (a qué pestaña pertenece cada persona) lo resuelve el backend
     en la vista v_identidades, a partir de si es beneficiario, personal de
     administración o de ministerio. Los voluntarios llegan con ámbito nulo
     porque no tienen pestaña propia: solo salen en General. */

  /* Filas reales del backend, mezcladas con las maquetadas en la tabla */
/*§CORTE§ linea original 6383 §*/
  navStyle(active, color) {
    return "display:flex; align-items:center; gap:10px; padding:8px 10px; font-size:15px; border-radius:2px; width:100%;"
      + (active ? "background:#ffffff; font-weight:600; color:" + BLUE_D + "; box-shadow:inset 3px 0 0 " + color + ";"
                : "color:#3c4a55;");
  }

/*§CORTE§ linea original 7457 §*/
  abrirFichaEn(id, seccion) {
    this.setState({ view: "ficha", sel: Number(id), fichaSec: seccion || "datos" },
                  () => {
                    this.cargarDocumentos(id);
                    this.cargarCondiciones(id);
                    this.cargarTrayectoria(id);
                  });
  }

  /* ── Condiciones laborales ──────────────────────────────────────────────
     El sueldo vive aquí, en la ficha de la persona, no en Planillas:
     Planillas solo lo lee. Una sola pantalla donde cambiarlo. */

/*§CORTE§ linea original 7642 §*/
  renderVals() {
    const v = this.state.view;
    const sc = this.state.scope;
    const lt = this.state.legajoTab;
    const at = this.state.attTab, mtd = this.state.metodo;
    const esNinos = sc === "ninos", esAdm = sc === "adm", esTodos = sc === "todos";
    /* Cuenta real de enrolados en el ámbito visible. Antes eran cifras
       inventadas justo encima de la tabla de datos reales, y no cuadraban. */
    const _visibles = (this.state.personasReales || [])
      .filter(x => sc === "todos" || (x.ambito || null) === sc);
    const enrol = [
      _visibles.length,
      _visibles.filter(x => x.metodo === "facial" || x.metodo === "ambos").length,
      _visibles.filter(x => x.metodo === "huella" || x.metodo === "ambos").length,
    ];
    const fs = this.state.fichaScope || "colab";
    /* El id de la ficha abierta. Antes esto resolvía un objeto de la
       maqueta; ahora fichaFor() busca en la base por id. */
    const sel = this.state.sel;
    const titles = {
      personas: ["Gestión de Personas",
        "Beneficiarios, sus responsables y el personal de la organización. Cada persona se registra una sola vez y el resto del sistema reutiliza su ficha."],
      responsables: ["Responsables / Tutores",
        "Adultos a cargo de uno o más beneficiarios. Se registran una vez y se vinculan a los niños, niñas y adolescentes que correspondan."],
      asistenciaHome: ["Asistencia",
        "Registro diario, enrolamiento en el terminal biométrico y permisos del personal."],
      biometria: ["Gestión Biométrica",
        "Enrolamiento de rostro y huella en el terminal TIMMY, a través de yunatt."],
      marcar: ["Marcar asistencia",
        "Registra tu entrada y tu salida desde el celular. Queda con tu nombre y la hora del servidor."],
      misPermisos: ["Mis Permisos",
        "Tus solicitudes de permiso y vacaciones: lo que pediste, en qué estado va y a quién le toca resolverlo."],
      permisos: ["Gestión de Permisos",
        "Solicitudes de permiso del personal, con los mismos tipos que el formato en papel de la casa."],
      /* Sin esta entrada, la bandeja caía en `titles.dash` y se
         anunciaba como «Dashboard General». */
      bandeja: ["Respuestas del formulario",
        "Lo que envían las familias desde el formulario público. Nada entra en una ficha hasta que alguien lo revisa e ingresa."],
      dash: ["Dashboard General",
        "Estado general de la organización."],
      legajo: [lt === "benef" ? "Beneficiarios" : "Hoja de Vida",
        lt === "org" ? "La jerarquía se arma con el jefe indicado en cada ficha. Cambiarlo reordena el árbol."
        : lt === "docs" ? "Los documentos de todo el personal en una sola lista, con su vigencia."
        : lt === "contratos" ? "Los contratos de todo el personal en una sola lista, con su vigencia."
        : lt === "benef" ? "Niñas, niños y adolescentes acogidos, con su casa, su grado y quién responde por cada uno."
        : "Un expediente digital por colaborador: datos personales, cargo, área y sus documentos y contratos en la misma vista."],
      benef: ["Expediente del beneficiario", "Datos de ingreso, situación legal, educación, salud, acompañamiento y expediente completo."],
      ficha: ["Ficha del colaborador", "Datos personales, contrato, documentos y trayectoria dentro de la organización."],
      asistencia: ["Registro de Asistencia",
        esTodos
          ? "Marcaciones de todas las personas enroladas en el terminal, sin separar por ámbito."
          : (esNinos
            ? "Beneficiarios registrados y sus marcaciones, cuando estén enrolados en el terminal."
            : "Marcaciones del día que el terminal TIMMY ha sincronizado, con su semana y su mes.")],
      nomina: ["Planillas", "Planilla mensual del personal, recibos por honorarios y estado de los pagos. Solo aplica a colaboradores."],
      documentos: ["Documentos", "Expedientes del personal, vigencias y renovaciones por vencer."],
      evaluaciones: ["Evaluación de Desempeño", "Ciclo 2026-I de desempeño, con evaluador y fecha de cierre."],
      capacitaciones: ["Capacitaciones", "Programa anual de formación, salvaguarda infantil y sesiones próximas."],
      config: ["Configuración", "Parámetros institucionales del sistema: nombre, sede y fecha de fundación."],
      reportes: ["Reportes", "Reportes de personal listos para descargar o enviar a donantes."],
      usuarios: ["Usuarios y permisos", "Quién entra al sistema, con qué cargo y hasta dónde llega."]
    };

    /* El cuarto dato es de qué módulos de permisos depende la entrada. Un
       apartado se ve si se alcanza AL MENOS uno: Hoja de Vida agrupa cinco
       pestañas y esconderla entera porque falte una sería demasiado. */
    /* Los módulos raíz del sistema. Un módulo se ve si se alcanza AL MENOS
       uno de sus 'mods'; sus hijos se filtran por separado, así que se puede
       ver Gestión de Personas sin ver todos sus submódulos.

       Solo llevan cifra los que ya leen de la base; el resto la mostraría
       inventada. Añadir un módulo nuevo es añadir una entrada aquí. */
    const navDef = [
      {clave:"dash", label:"Dashboard General", icon:"ph-squares-four",
       mods:["dashboard"], vista:"dash"},

      {clave:"personas", label:"Gestión de Personas", icon:"ph-users-three",
       mods:["personal", "organigrama", "documentos", "contratos", "beneficiarios", "responsables"],
       vista:"personas", tambien:["ficha", "benef"], hijos:[
        {label:"Personal", icon:"ph-identification-card",
         mods:["personal", "organigrama", "documentos", "contratos"],
         vista:"legajo", tab:"dir", tambien:["ficha"],
         badge:String((this.state.personal || []).length || "")},
        {label:"Responsables / Tutores", icon:"ph-user-focus",
         mods:["responsables"], vista:"responsables"},
        {label:"Beneficiarios", icon:"ph-baby", mods:["beneficiarios"],
         vista:"legajo", tab:"benef", tambien:["benef"],
         badge:String((this.state.beneficiarios || []).length || "")},
        /* La bandeja va aquí y no en un módulo aparte: lo que llega son
           fichas de tutores a medio hacer. La cifra cuenta solo lo que
           espera revisión, que es lo único accionable. */
        {label:"Respuestas del formulario", icon:"ph-tray",
         mods:["responsables"], vista:"bandeja",
         badge:String((this.state.bandeja || [])
                        .filter((x) => x.estado === "por_revisar").length || "")}
      ]},

      {clave:"asistencia", label:"Asistencia", icon:"ph-clock-user",
       mods:["asistencia", "permisos"], vista:"asistenciaHome", hijos:[
        {label:"Registro de Asistencia", icon:"ph-list-checks", mods:["asistencia"],
         vista:"asistencia",
         badge:String((this.state.personasReales || []).length || "")},
        {label:"Gestión Biométrica", icon:"ph-fingerprint", mods:["asistencia"],
         vista:"biometria"},
        {label:"Gestión de Permisos", icon:"ph-calendar-check", mods:["permisos"],
         vista:"permisos"},
        /* Sin 'mods': no depende de ningún módulo. Pedir un permiso propio
           no puede exigir el permiso que autoriza a aprobarlos. */
        {label:"Marcar asistencia", icon:"ph-fingerprint", mods:[],
         vista:"marcar"},
        {label:"Mis Permisos", icon:"ph-hand-palm", mods:[],
         vista:"misPermisos",
         badge:String((this.state.misSolicitudes || [])
                        .filter((x) => x.abierta).length || "")}
      ]}
    ];

    const st = this.state;

    /* La puerta NO depende de `view`. Con login estricto, la sesión ya
       consultada y ninguna sesión, se pinta la entrada venga el estado de
       donde venga: antes bastaba escribir #/personal para salirse, porque
       el enrutado escribía `view` sin preguntar por la sesión. */
    const sinEntrar = st.sesionLista && st.estricto && !st.sesion;

    return {
      /* El cajón de menú, solo visible en pantalla pequeña. */
      menuClase: this.state.menuAbierto ? "abierto" : "",
      alternarMenu: () => this.setState({ menuAbierto: !this.state.menuAbierto }),
      cerrarMenu: () => this.setState({ menuAbierto: false }),

      isMarcar: v === "marcar",
      isLogin: sinEntrar || v === "login",
      isClave: !sinEntrar && v === "clave",

      /* Fecha real del sistema. Lee st.hoyISO a propósito: sin esa
         dependencia el repintado del cambio de día no llegaría aquí. */
      fechaCabecera: (() => {
        const _dia = st.hoyISO;
        /* es-PE devuelve "martes, 18 de agosto de 2026"; la coma no estaba en
           el diseño original de la cabecera, así que se quita. */
        const f = new Date().toLocaleDateString("es-PE",
          { weekday: "long", day: "numeric", month: "long", year: "numeric" })
          .replace(",", "");
        return f.charAt(0).toUpperCase() + f.slice(1);
      })(),

      /* Quién está conectado. Sin sesión (convivencia) se dice claramente,
         para que nadie crea que el sistema sabe quién es. */
      yoNombre: st.sesion ? st.sesion.nombre : "Sin identificar",
      yoRol: st.sesion ? (st.sesion.rol_nombre || "—") : "Modo convivencia",
      yoRolColor: st.sesion ? "#7d8e9c" : "#8a5c05",
      yoFondo: st.sesion ? BLUE : "#9aa7b2",
      yoIniciales: st.sesion ? (ini(st.sesion.nombre) || "?") : "?",
      yoSalirTitulo: st.sesion ? "Cerrar sesión" : "Volver a la pantalla de entrada",
      notLogin: !sinEntrar && v !== "login" && v !== "clave",

      /* Cambio de contraseña obligatorio */
      clNombre: (st.sesion && first(st.sesion.nombre)) || "",
      clAct: st.clAct, clNueva: st.clNueva, clNueva2: st.clNueva2, clErr: st.clErr,
      clMinimo: "Mínimo 8 caracteres. Distinta de la actual.",
      clInput: "width:100%; padding:12px 14px; font-family:inherit; font-size:16px; color:#201e1d; background:#ffffff; border:1px solid "
        + (st.clErr ? RED : "#c9d4de") + "; border-radius:2px; outline:none;",
      onClAct: (e) => this.setState({ clAct: e.target.value, clErr: "" }),
      onClNueva: (e) => this.setState({ clNueva: e.target.value, clErr: "" }),
      onClNueva2: (e) => this.setState({ clNueva2: e.target.value, clErr: "" }),
      onClKey: (e) => { if (e.key === "Enter") this.cambiarClave(); },
      guardarClave: () => this.cambiarClave(),
      clBotonLabel: st.clOcupado ? "Guardando…" : "Guardar y entrar",
      clBoton: "display:flex; align-items:center; justify-content:center; gap:9px; width:100%; padding:13px 18px; border-radius:2px; font-size:15.5px; font-weight:600; color:#f4f3f1; background:"
        + (st.clOcupado ? "#5b7185" : BLUE) + ";",
      /* Saludo según la hora: además de dar vida, evita el género que
         tenía "Bienvenida de vuelta" y que no encaja con todo el personal. */
      saludo: (() => {
        const h = new Date().getHours();
        return h < 5 ? "Buenas noches" : h < 12 ? "Buenos días"
             : h < 19 ? "Buenas tardes" : "Buenas noches";
      })(),
      saludoSub: (() => {
        const h = new Date().getHours();
        return h < 5 || h >= 19
          ? "Ingresa con tu usuario para revisar el cierre del día."
          : "Ingresa con tu usuario para entrar al módulo de Recursos Humanos.";
      })(),
      /* Misma fecha que muestra la cabecera del sistema una vez dentro:
         da contexto y ancla la pantalla en el día de hoy. */
      loginFecha: (() => {
        const f = new Date().toLocaleDateString("es-PE",
          { weekday: "long", day: "numeric", month: "long" });
        return f.charAt(0).toUpperCase() + f.slice(1) + " · Lima";
      })(),
      loginUser: st.loginUser,
      loginPass: st.loginPass,
      loginErr: st.loginErr,
      onUser: (e) => this.setState({ loginUser: e.target.value, loginErr: "" }),
      onPass: (e) => this.setState({ loginPass: e.target.value, loginErr: "" }),
      passType: st.showPass ? "text" : "password",
      passIcon: st.showPass ? "ph-eye-slash" : "ph-eye",
      togglePass: () => this.setState({ showPass: !st.showPass }),
      userBorder: st.loginErr && !st.loginUser ? RED : "#c9d4de",
      passBorder: st.loginErr && !st.loginPass ? RED : "#c9d4de",
      /* La duración real de la sesión, tal como la aplica el servidor. */
      politicaSesion: "La sesión se cierra a las 8 h o tras 45 min sin uso",
      loginBtnLabel: st.loading ? "Verificando…" : "Ingresar al sistema",
      loginBtnIcon: st.loading ? "ph-spinner-gap" : "ph-sign-in",
      loginBtnStyle: "display:flex; align-items:center; justify-content:center; gap:9px; width:100%; padding:13px 18px; border-radius:2px; font-size:16px; font-weight:600; background:"
        + (st.loading ? "#5b7185" : BLUE) + "; color:#f4f3f1;",
      /* Solo aparece antes del corte. Si LOGIN_ESTRICTO está activo el
         backend no devuelve 'convivencia' y este camino no existe. */
      hayConvivencia: st.sesionLista && !st.estricto && !st.sesion,
      entrarSinCuenta: () => {
        this.setState({ view: "dash", loginPass: "", loginErr: "" });
        this.cargarTodo();
      },
      olvide: () => this.setState({
        loginErr: "Pídele a RRHH o a la Dirección que te asigne una contraseña "
                + "nueva: al entrar con ella el sistema te hará elegir la tuya."
      }),
      onPassKey: (e) => { if (e.key === "Enter") this.hacerLogin(); },
      doLogin: () => this.hacerLogin(),
      doLogout: () => {
        this.api("/api/logout", { method: "POST" })
          .catch(() => {})
          .then(() => this.setState({
            view: "login", sesion: null, csrf: "", loginPass: "",
            loginUser: "", loginErr: ""
          }));
      },
      /* ── Los buscadores ─────────────────────────────────────────── */
      busLegajo: this.state.busLegajo || "",
      onBusLegajo: (e) => this.setState({ busLegajo: e.target.value }),
      busLegajoPista: (() => {
        return { dir: "Buscar por nombre, cargo, área o documento...",
                 org: "Buscar en el organigrama por nombre o cargo...",
                 docs: "Buscar por persona o documento...",
                 contratos: "Buscar por persona o contrato...",
                 benef: "Buscar por nombre, casa o sala..." }[lt]
               || "Buscar...";
      })(),
      hayBusLegajo: !!String(this.state.busLegajo || "").trim(),
      limpiarBusLegajo: () => this.setState({ busLegajo: "" }),

      /* ── Reportes ───────────────────────────────────────────────────
         Cada uno se lleva lo que su pantalla tenga filtrado. */
      /* ── El diálogo de reporte ──────────────────────────────────────── */
      modalReporte: this.state.modal === "reporte",
      repTitulo: { personal: "Reporte de personal",
                   beneficiarios: "Reporte de beneficiarios",
                   responsables: "Reporte de responsables",
                   asistencia: "Reporte de asistencia por persona" }[this.state.repModulo]
                 || "Reporte",
      repNotaModulo: this.state.repModulo === "asistencia"
        ? "Sale la asistencia del día que tengas puesto en la pantalla."
        : "Lo que salga respeta el buscador que tengas puesto en la pantalla.",
      repTodosConFicha: this.state.repAlcance === "todos"
                        && this.state.repModulo !== "asistencia",
      repPorElegidos: this.state.repAlcance === "elegidos",
      repEstiloTodos: this.state.repAlcance === "todos"
        ? "padding:9px 16px; border-radius:2px; font-size:14px; font-weight:600; color:#ffffff; background:" + BLUE + ";"
        : "padding:9px 16px; border-radius:2px; font-size:14px; color:#3c4a55; border:1px solid #c9d4de; background:#ffffff;",
      repEstiloElegidos: this.state.repAlcance === "elegidos"
        ? "padding:9px 16px; border-radius:2px; font-size:14px; font-weight:600; color:#ffffff; background:" + BLUE + ";"
        : "padding:9px 16px; border-radius:2px; font-size:14px; color:#3c4a55; border:1px solid #c9d4de; background:#ffffff;",
      repVerTodos: () => this.setState({ repAlcance: "todos", modalError: "" }),
      repVerElegidos: () => this.setState({ repAlcance: "elegidos", modalError: "" }),
      repIconoFichas: this.state.repFichas ? "ph-check-square" : "ph-square",
      repTonoFichas: this.state.repFichas ? BLUE_D : "#9aa7b2",
      repAlternarFichas: () => this.setState({ repFichas: !this.state.repFichas }),
      repBusca: this.state.repBusca || "",
      onRepBusca: (e) => this.setState({ repBusca: e.target.value }),
      repPersonas: this.filtradas(this.personasDelReporte(),
                                  ["nombre", "documento", "cargo", "casa"],
                                  this.state.repBusca).map((p) => {
        const marcado = (this.state.repElegidos || []).indexOf(p.id) >= 0;
        return {
          nombre: p.nombre,
          sub: p.cargo || p.casa || p.documento || "—",
          marca: marcado ? "ph-check-square" : "ph-square",
          tono: marcado ? BLUE_D : "#9aa7b2",
          alternar: () => this.alternarElegido(p.id),
        };
      }),
      repCuantos: (() => {
        const n = (this.state.repElegidos || []).length;
        if (this.state.repAlcance === "todos") {
          const t = this.personasDelReporte().length;
          return t + (t === 1 ? " registro" : " registros")
            + (this.state.repFichas ? ", con su ficha completa" : ", solo la tabla");
        }
        return n ? n + (n === 1 ? " persona marcada · saldrá su ficha completa"
                                : " personas marcadas · tabla y sus fichas")
                 : "Todavía no has marcado a nadie";
      })(),

      repPersonal: () => this.abrirDialogoReporte(
        lt === "benef" ? "beneficiarios" : "personal"),
      repPersonalLabel: lt === "benef" ? "Reporte de beneficiarios" : "Reporte de personal",
      repResponsables: () => this.abrirDialogoReporte("responsables"),
      repPermisos: () => this.abrirReporte("permisos",
        { estado: this.state.gsFiltro || "", tipo: this.state.gsTipo || "",
          busca: this.state.gsBusca || "" }),
      /* Imprime la pestaña que se esté viendo. Un reporte que no
         corresponde a lo que se estaba mirando confunde más que ayuda. */
      repAsistencia: () => this.abrirReporte("asistencia", {
        vista: this.state.attTab || "diaria",
        fecha: this.state.fecha || "",
        desde: this.state.rangoDesde || "", hasta: this.state.rangoHasta || "",
        busca: this.state.attBusca || "",
      }),
      repAsistenciaLabel: { diaria: "Reporte del día",
                            semanal: "Reporte de la semana",
                            just: "Reporte de justificaciones",
                            cal: "Reporte del mes" }[this.state.attTab] || "Reporte",
      repAsistPersona: () => this.abrirDialogoReporte("asistencia"),
      repUsuarios: () => this.abrirReporte("usuarios",
        { busca: this.state.usBusca || "" }),
      repRespuestas: () => this.abrirReporte("respuestas",
        { estado: this.state.bjFiltro || "", busca: this.state.busBandeja || "" }),

      /* ── Marcar asistencia ──────────────────────────────────────────── */
      mkFechaLarga: this.fechaEnLetra(this.fechaHoy()),
      mkReloj: (() => {
        const _ = st.mkTic;              // repinta cada segundo
        const d = this.horaDelServidor();
        const h = d.getHours() % 12 || 12;
        return h + ":" + String(d.getMinutes()).padStart(2, "0")
                 + ":" + String(d.getSeconds()).padStart(2, "0");
      })(),
      mkMeridiano: (() => {
        const _ = st.mkTic;
        return this.horaDelServidor().getHours() < 12 ? "a. m." : "p. m.";
      })(),
      mkQuien: (st.sesion && st.sesion.nombre) || "—",

      /* La insignia del título. «En curso» solo con una marca: con dos o
         más, la última cuenta como salida y la jornada está cerrada. */
      mkJornada: (() => {
        const _ = st.mkTic;
        const m = st.mkMarcas || [];
        if (!m.length) return "Sin iniciar";
        if (m.length === 1) {
          const [a, b] = m[0].hora.split(":").map(Number);
          const d = this.horaDelServidor();
          let t = (d.getHours() * 60 + d.getMinutes()) - (a * 60 + b);
          if (t < 0) t = 0;
          return "Jornada en curso · " + Math.floor(t / 60) + " h "
                 + String(t % 60).padStart(2, "0") + " m";
        }
        return "Jornada finalizada";
      })(),
      mkJornadaColor: (() => {
        const n = (st.mkMarcas || []).length;
        return n === 1 ? GREEN_D : n ? BLUE_D : "#7d8e9c";
      })(),
      mkJornadaTint: (() => {
        const n = (st.mkMarcas || []).length;
        return n === 1 ? GREEN_T : n ? BLUE_T : "#f0ede9";
      })(),
      mkPuede: !!(st.sesion && st.sesion.personal_id)
        && (!st.mkRostro || (st.mkMarcas || []).length < 2),
      mkSinRostro: !!(st.sesion && st.sesion.personal_id) && !st.mkRostro,
      /* Con el rostro puesto, las dos salidas: rehacerlo o retirarlo. */
      mkConRostro: !!st.mkRostro,
      mkRehacerRostro: () => this.abrirRostroBase(),
      mkRetirarRostro: () => this.pedirRetirarRostro(),
      modalRetirarRostro: st.modal === "retirarRostro",
      mkSinRostroNota: "Para marcar hay que registrar tu rostro una vez. "
        + "Con él el sistema comprueba que eres tú y no otra persona con tu "
        + "cuenta. Se guardan 128 números calculados en tu propio teléfono, "
        + "no la foto.",
      mkCompleto: (st.mkMarcas || []).length >= 2,
      mkCompletoNota: "Ya marcaste tu entrada y tu salida de hoy. Solo se "
        + "marca una vez cada una; si hay algo que corregir, avisa a RRHH.",
      mkSinFicha: !!(st.sesion && !st.sesion.personal_id),
      mkSinFichaNota: "Tu cuenta no está vinculada a una ficha de personal, "
        + "así que no hay a quién atribuir la marca. Avisa a RRHH.",
      mkMarcar: () => (this.state.mkRostro
        ? this.marcarAhora() : this.abrirRostroBase()),

      /* ── El diálogo de la cámara ────────────────────────────────────── */
      modalCamara: st.modal === "camara",
      camEsBase: st.camModo === "base",
      camTitulo: st.camModo === "base" ? "Registrar mi rostro"
        : (st.mkMarcas || []).length ? "Marcar salida" : "Marcar entrada",
      camSubtitulo: st.camModo === "base"
        ? "Esta foto es la de referencia: con ella el sistema comprobará "
          + "que eres tú cada vez que marques. Se toma una sola vez."
        : "Mírate a la cámara y toma la foto. El sistema comprueba que eres "
          + "tú y la guarda junto a la marca, con tu hora y tu ubicación.",
      camSinFoto: !st.camFoto,
      camHayFoto: !!st.camFoto,
      camFoto: st.camFoto || "",
      camEncendiendo: !st.camListo && !st.camError,
      camModeloCargando: st.camModelo === "cargando",
      camErrorHay: !!st.camError,
      camErrorTexto: st.camError || "",
      camTomar: () => this.tomarFoto(),
      camRepetir: () => this.repetirFoto(),
      camTomarStyle: "display:flex; align-items:center; justify-content:center; "
        + "gap:10px; width:100%; margin-top:14px; padding:15px; border-radius:3px; "
        + "font-size:16px; font-weight:600; color:#ffffff; background:"
        + (st.camListo ? BLUE : "#9aa7b2") + ";",
      /* Qué dice el reconocimiento de la foto que se acaba de tomar. */
      camVerdicto: st.camPensando ? "Buscando tu cara en la foto..."
        : st.camDescriptor ? "Cara reconocida en la foto."
        : "En esta foto no se ve una cara. Repítela.",
      camVerdictoTono: st.camPensando ? "#7d8e9c"
        : st.camDescriptor ? GREEN_D : GOLD_D,
      camVerdictoIcono: st.camPensando ? "ph-circle-notch"
        : st.camDescriptor ? "ph-check-circle" : "ph-warning-circle",
      camTextoAviso: st.camTextoAviso
        || "Cargando el aviso de tratamiento de datos...",
      camConsientoIcono: st.camConsiento ? "ph-check-square" : "ph-square",
      camConsientoTono: st.camConsiento ? GREEN_D : "#9aa7b2",
      camAlternarConsiento: () => this.setState({
        camConsiento: !this.state.camConsiento, modalError: "" }),
      camNotaPie: st.camModo === "base"
        ? "No se guarda la foto: se guardan 128 números calculados a partir "
          + "de ella, con los que no se puede reconstruir una cara. El "
          + "cálculo ocurre en tu propio teléfono."
        : "El sistema compara tu cara con la de referencia antes de aceptar "
          + "la marca. La foto queda guardada junto a la marca, con la hora "
          + "y las coordenadas.",
      camQueMarca: st.camModo === "base" ? "Tu rostro de referencia"
        : (st.mkMarcas || []).length ? "Tu salida de hoy" : "Tu entrada de hoy",
      /* Decía «No se exige ubicación» mientras el GPS todavía estaba
         contestando: falso y desconcertante. Y al llegar enseñaba dos
         decimales que no le dicen nada a nadie —«-12.0210, -77.1040» no
         distingue la casa de la otra punta de Lima—.

         Ahora dice en qué punto está la cosa, y la PRECISIÓN, que es lo
         único de ese dato que una persona puede juzgar: ±26 m sirve,
         ±2000 m no sirve para nada. Las coordenadas exactas quedan
         guardadas para RRHH, que es quien las necesita. */
      camDondeTexto: st.camDonde
        ? ("Registrada · ±" + Math.round(st.camDonde.precision || 0) + " m")
        : (st.camBuscandoUbi ? "Buscándola…" : "Sin ubicación"),
      camDondeColor: st.camDonde ? "#1c5f3a"
                   : (st.camBuscandoUbi ? "#7d8e9c" : "#8a5c05"),
      /* Si no llegó, se dice por qué no pasa nada: nadie deja de marcar
         por esto, y callarlo dejaría a la persona pensando que hizo algo
         mal. */
      camDondeNota: st.camDonde ? ""
        : (st.camBuscandoUbi
             ? "Se guarda con la marca si llega a tiempo."
             : "No pasa nada: la marca se registra igual y consta que vino sin ubicación."),
      camHayNotaUbi: !st.camDonde,

      /* ── El GPS ─────────────────────────────────────────────────────── */
      mkGpsDenegado: st.mkGps === "no" || st.mkGps === "inseguro",
      mkGpsColor: st.mkGps === "si" ? GREEN_D
                : (st.mkGps === "no" || st.mkGps === "inseguro") ? RED_D : GOLD_D,
      mkGpsTint: st.mkGps === "si" ? GREEN_T
               : (st.mkGps === "no" || st.mkGps === "inseguro") ? RED_T : GOLD_T,
      mkGpsTag: st.mkGps === "si" ? "Ubicación activa"
              : st.mkGps === "inseguro" ? "Sin https" : "Sin GPS",
      mkGpsTexto: st.mkGps === "si" ? "Ubicación activa"
        : st.mkGps === "inseguro"
          ? "El navegador bloquea la ubicación fuera de una conexión segura"
        : st.mkGps === "no" ? "Permiso de ubicación denegado"
        : "Se pedirá tu ubicación al marcar",
      /* Aquí se enseñaba la distancia a la sede en metros. Se retiró el
         31/08/2026: la ubicación de una marca no tiene que ver con la de
         la casa. Lo que se enseña es el SITIO, cuando se sabe. */
      mkLugar: st.mkLugar || (st.mkDonde ? "Registrada" : "—"),
      mkSinSede: false,
      mkSinSedeNota: "",
      mkPrecision: st.mkDonde && st.mkDonde.precision
        ? "± " + Math.round(st.mkDonde.precision) + " m" : "—",
      mkCoords: st.mkDonde
        ? st.mkDonde.lat.toFixed(4) + ", " + st.mkDonde.lon.toFixed(4) : "—",

      /* ── Las cifras del día ─────────────────────────────────────────── */
      mkEntrada: ((st.mkMarcas || [])[0] || {}).hora || "—",
      mkUltima: ((st.mkMarcas || []).slice(-1)[0] || {}).hora || "—",
      mkTrabajado: (() => {
        const m = st.mkMarcas || [];
        /* Con una sola marca no se sabe cuánto lleva: poner cero diría que
           no ha trabajado, y poner «hasta ahora» supondría que sigue. */
        if (m.length < 2) return "—";
        const min = (h) => { const [a, b] = h.split(":").map(Number);
                             return a * 60 + b; };
        const t = min(m[m.length - 1].hora) - min(m[0].hora);
        return Math.floor(t / 60) + " h " + String(t % 60).padStart(2, "0") + " m";
      })(),
      mkPista: (st.mkMarcas || []).length >= 2
        ? "Tu día quedó registrado: entrada y salida."
        : (st.mkMarcas || []).length
        ? "La segunda marca del día cuenta como tu salida."
        : "La primera marca del día cuenta como tu entrada.",

      /* ── El botón ───────────────────────────────────────────────────── */
      mkBotonLabel: st.mkOcupado ? (st.mkPaso || "Registrando...")
        : !st.mkRostro ? "Registrar mi rostro"
        : ((st.mkMarcas || []).length ? "Marcar salida" : "Marcar entrada"),
      mkBotonIcono: !st.mkRostro ? "ph-user-focus"
        : (st.mkMarcas || []).length ? "ph-arrow-left" : "ph-arrow-right",
      mkBotonStyle: "display:flex; align-items:center; justify-content:center; "
        + "gap:12px; width:100%; margin-top:20px; padding:20px; border-radius:3px; "
        + "font-size:18px; font-weight:600; color:#ffffff; background:"
        + (st.mkOcupado ? "#9aa7b2" : st.mkRostro ? GREEN : BLUE) + ";",

      mkAviso: st.mkAviso || "",
      mkAvisoHay: !!st.mkAviso,
      mkAvisoColor: st.mkAvisoTipo === "mal" ? RED_D
                  : st.mkAvisoTipo === "aviso" ? GOLD_D : GREEN_D,
      mkAvisoTint: st.mkAvisoTipo === "mal" ? RED_T
                 : st.mkAvisoTipo === "aviso" ? GOLD_T : GREEN_T,
      mkAvisoIcono: st.mkAvisoTipo === "mal" ? "ph-warning-circle"
                  : st.mkAvisoTipo === "aviso" ? "ph-info" : "ph-check-circle",

      /* ── Las marcas, de la más reciente a la más antigua ────────────── */
      mkCuantas: (() => {
        const n = (st.mkMarcas || []).length;
        return n === 1 ? "1 marca" : n + " marcas";
      })(),
      mkSinMarcas: (st.mkMarcas || []).length === 0,
      mkHayMarcas: (st.mkMarcas || []).length > 0,
      mkMarcas: (st.mkMarcas || []).map((m, i, todas) => ({
        hora: m.hora,
        icono: i === 0 ? "ph-arrow-right"
             : (i === todas.length - 1 ? "ph-arrow-left" : "ph-dot-outline"),
        color: i === 0 ? GREEN_D : (i === todas.length - 1 ? BLUE_D : "#9aa7b2"),
        etiqueta: i === 0 ? "Entrada"
                : (i === todas.length - 1 ? "Salida" : "Marca"),
        origen: m.canal === "web" ? "Desde el celular" : "En el terminal",
      })).slice().reverse(),

      /* ── La semana ──────────────────────────────────────────────────── */
      mkSemana: (() => {
        const dias = st.mkSemana || [];
        const horas = (d) => {
          if (!d.entrada || !d.salida) return 0;
          const min = (h) => { const [a, b] = h.split(":").map(Number);
                               return a * 60 + b; };
          return (min(d.salida) - min(d.entrada)) / 60;
        };
        const alto = Math.max(1, ...dias.map(horas));
        return dias.map((d) => {
          const h = horas(d);
          return {
            dia: d.dia,
            horas: h ? h.toFixed(1).replace(".0", "") + " h" : "—",
            /* 3 px de mínimo: un día sin barra se lee como «no hay dato»,
               y aquí significa que no marcó. */
            alto: h ? Math.max(8, Math.round(h / alto * 100)) + "%" : "3px",
            tono: d.hoy ? GREEN : (h ? "#c9d4de" : "#e7e3de"),
            tonoDia: d.hoy ? GREEN_D : "#7d8e9c",
          };
        });
      })(),
      mkAcumulado: (() => {
        const dias = st.mkSemana || [];
        let t = 0;
        dias.forEach((d) => {
          if (!d.entrada || !d.salida) return;
          const min = (h) => { const [a, b] = h.split(":").map(Number);
                               return a * 60 + b; };
          t += min(d.salida) - min(d.entrada);
        });
        return Math.floor(t / 60) + " h " + String(t % 60).padStart(2, "0") + " m";
      })(),
      /* Puesta a mano en Parámetros: el sistema no conoce el horario de
         nadie, así que no puede deducirla. */
      mkMeta: (st.mkMeta || 40) + " h",

      pageTitle: (titles[v] || titles.dash)[0], pageLede: (titles[v] || titles.dash)[1],
      isDash: v === "dash", isFicha: v === "ficha", isBenef: v === "benef",
      isLegajo: v === "legajo",
      isDir: v === "legajo" && lt === "dir",
      isOrg: v === "legajo" && (lt === "org" || lt === "benef"),
      /* Cada pestaña es un módulo distinto a efectos de permisos: quien
         no llega a Contratos no debe ver ni la pestaña. */
      /* Beneficiarios tiene una sola vista: una fila con una pestaña sola
         sería ruido, así que la segunda fila solo sale en Empleados. */
      hvHayPestanas: lt !== "benef",

      legajoTabs: [
        {key:"dir", label:"Directorio", icon:"ph-users", mod:"personal", count:String((this.state.personal || []).length || "")},
        {key:"org", label:"Organigrama", icon:"ph-tree-structure", mod:"organigrama", count:""},
        {key:"docs", label:"Documentos", icon:"ph-file-text", mod:"documentos", count:String((this.state.vencDocs || []).length || "")},
        {key:"contratos", label:"Contratos", icon:"ph-scroll", mod:"contratos", count:String((this.state.vencContratos || []).length || "")}
      ].filter(t => this.puede(t.mod, "vista")).map(t => ({
        ...t,
        style: "display:flex; align-items:center; gap:8px; padding:8px 15px; border-radius:2px; font-size:14.5px;"
          + (lt === t.key ? "background:#ffffff; font-weight:600; color:" + BLUE_D + "; box-shadow:inset 0 -3px 0 " + BLUE + ";" : "color:#5b7185;"),
        /* El filtro no viaja de una pestaña a otra: una lista recortada
           sin motivo visible se lee como «no hay datos». */
        go: () => this.setState({ view: "legajo", legajoTab: t.key, busLegajo: "" })
      })),
      /* Hoja de Vida: fichas reales de la base, no la maqueta. La
         columna "Terminal" muestra si esa persona está enrolada. */
      directorio: this.filtradas(this.state.personal || [],
                                 ["nombre", "cargo", "area", "sede", "documento"],
                                 this.state.busLegajo).map(p => {
        const pal = p.ambito === "adm" ? [BLUE_T, BLUE_D] : [RED_T, RED_D];
        /* Enrolada es lo que el terminal confirmó, y lo calcula la base
           en un solo sitio. Antes se decidía aquí con el estado de la
           captura, que es otra cosa: una que quedó a medias figuraba
           como enrolada. */
        const enrolada = !!p.enrolado;
        return {
          nombre: p.nombre, cargo: p.cargo || "—", area: p.area || "—",
          sede: p.sede || "—",
          contrato: p.contrato === "Indeterminado" ? "Indefinido" : (p.contrato || "—"),
          ini: ini(p.nombre), tint: pal[0], dark: pal[1],
          /* La cara que tomó el terminal al enrolar. Quien no la tenga
             sigue con sus iniciales de colores, que es lo que había. */
          tieneFoto: !!p.foto,
          sinFoto: !p.foto,
          fotoUrl: p.foto ? ("/api/personal/" + p.id + "/foto?v=" + p.foto) : "",
          bio: enrolada ? ("ID " + p.staff_number) : (p.staff_number ? "Pendiente" : "Sin enrolar"),
          bioColor: enrolada ? GREEN_D : (p.staff_number ? GOLD_D : "#7d8e9c"),
          bioTint: enrolada ? GREEN_T : (p.staff_number ? GOLD_T : "#efece8"),
          editar: () => this.abrirFicha(p),
          /* El nombre abre el expediente completo; el lápiz, la edición
             rápida. Antes desde el directorio solo se podía editar. */
          abrir: () => this.abrirFichaEn(p.id, "datos")
        };
      }),
      legajoNota: (this.state.personal || []).length
        + ((this.state.personal || []).length === 1 ? " ficha activa" : " fichas activas")
        + (this.puede("personal", "edicion")
            ? " · el lápiz edita la ficha"
            : " · solo lectura"),
      /* El botón de alta del módulo cambia según la pestaña: un
         beneficiario no es un colaborador y no comparte tabla ni campos. */
      altaLabel: lt === "benef" ? "Agregar beneficiario" : "Agregar usuario",
      altaIcono: lt === "benef" ? "ph-baby" : "ph-user-plus",
      altaTitulo: lt === "benef"
        ? "Registra a un niño o adolescente acogido en la tabla de beneficiarios"
        : "Crea la ficha en Directorio; aparece sola en Organigrama, Documentos y Contratos",
      altaGo: lt === "benef" ? () => this.abrirBeneficiario() : () => this.abrirFicha(null),

      /* Los beneficiarios que existen de verdad en la base. La maqueta de
         26 niños sigue debajo, etiquetada, hasta que se cargue el dato
         real: son datos de menores y se cargan con calma. */
      benefReales: this.filtradas(this.state.beneficiarios || [],
                                  ["nombre", "casa", "sala", "grado", "documento"],
                                  this.state.busLegajo).map((b, i) => {
        const pal = [[BLUE, BLUE_T, BLUE_D], [GREEN, GREEN_T, GREEN_D],
                     [GOLD, GOLD_T, GOLD_D], [RED, RED_T, RED_D]][i % 4];
        const edad = (() => {
          if (!b.fecha_nac) return "";
          const n = new Date(String(b.fecha_nac) + "T00:00:00");
          if (isNaN(n)) return "";
          const hoy = new Date();
          let a = hoy.getFullYear() - n.getFullYear();
          const m = hoy.getMonth() - n.getMonth();
          if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) a--;
          return a >= 0 ? (a === 1 ? "1 año" : a + " años") : "";
        })();
        const partes = [b.grado, edad].filter(Boolean);
        const faltan = b.faltantes || [];
        return {
          nombre: b.nombre,
          casa: [b.casa, b.sala].filter(Boolean).join(" · ") || "Sin casa asignada",
          detalle: partes.length ? partes.join(" · ") : "Sin grado registrado",
          ingreso: b.anio_ingreso ? ("Ingresó en " + b.anio_ingreso) : "Sin año de ingreso",
          ini: ini(b.nombre), color: pal[0], tint: pal[1], dark: pal[2],
          /* El alta solo exige el nombre; en vez de bloquear, la ficha
             dice qué le falta. Mismo criterio que "sin jefe asignado". */
          incompleta: faltan.length > 0,
          faltan: faltan.length
            ? ("Ficha incompleta · falta " + faltan.slice(0, 3).join(", ")
               + (faltan.length > 3 ? " y " + (faltan.length - 3) + " más" : ""))
            : "",
          abrir: () => this.setState({ view: "benef", benefRealSel: b, benAviso: "" },
                                      () => {
                                        this.cargarAcompanamiento(b.id);
                                        this.cargarVinculos(b.id);
                                      })
        };
      }),
      hayBenefReales: (this.state.beneficiarios || []).length > 0,
      benefRealesNota: (() => {
        const n = (this.state.beneficiarios || []).length;
        return n === 1 ? "1 beneficiario con ficha real"
                       : n + " beneficiarios con ficha real";
      })(),

      isAsistencia: v === "asistencia", isNomina: v === "nomina", isDocs: v === "legajo" && (lt === "docs" || lt === "contratos"),

/*§CORTE§ linea original 8811 §*/
      /* ── Ramas todavía sin pantalla ────────────────────────────────
         Se listan aquí para que quede a la vista qué falta del árbol y en
         qué orden se va a construir. Cada una desaparece de esta lista en
         cuanto tenga su pantalla. */
      /* Vacío: ya no queda ninguna rama del árbol sin pantalla. */
      enConstruccion: []
        .indexOf(v) >= 0,
      ecIcono: ({
        personas: "ph-users-three", responsables: "ph-user-focus",
        asistenciaHome: "ph-clock-user", biometria: "ph-fingerprint",
        permisos: "ph-calendar-check"
      })[v] || "ph-wrench",
      ecEtapa: ({
        personas: "Paso 4 del plan · dashboard del módulo",
        responsables: "Paso 4 del plan · entidad nueva",
        asistenciaHome: "Paso 3 del plan · dashboard del módulo",
        biometria: "Paso 6 del plan · reubicación de pantalla",
        permisos: "Paso 5 del plan · módulo nuevo"
      })[v] || "",
      ecTitulo: ({
        personas: "El resumen de Gestión de Personas está por construir",
        responsables: "Responsables / Tutores está por construir",
        asistenciaHome: "El resumen de Asistencia está por construir",
        biometria: "Gestión Biométrica está por reubicar",
        permisos: "Gestión de Permisos está por construir"
      })[v] || "Módulo en construcción",
      ecTexto: ({
        personas: "Aquí irán los indicadores del módulo —beneficiarios, responsables y personal— con los accesos rápidos a cada submódulo y los últimos registros. Los submódulos que ya existen se usan desde el menú de la izquierda.",
        responsables: "Hoy el tutor de un beneficiario apunta a una ficha de personal, es decir, a un trabajador de la organización. Los responsables pasarán a ser entidad propia, con su ficha y la posibilidad de estar a cargo de varios beneficiarios a la vez. Eso implica tablas nuevas y una migración de los vínculos que ya existen, que se hará con un plan a la vista y confirmación previa.",
        asistenciaHome: "Aquí irán los indicadores del día —esperados, presentes, ausentes, tardanzas, permisos y pendientes de enrolar— con acceso a los tres submódulos. El registro diario ya funciona: está en Registro de Asistencia.",
        biometria: "El enrolamiento contra el terminal TIMMY ya está construido y funcionando; hoy vive dentro de la pantalla de Registro de Asistencia. Lo que falta es traerlo aquí, que es mover pantalla: el backend no se toca.",
        permisos: "Se construirá desde cero con el flujo acordado: Pendiente, Aprobado, Rechazado y Cancelado, con tipo de permiso, motivo y documento de sustento opcional."
      })[v] || "",
      ecHayLista: v === "personas" || v === "asistenciaHome",
      ecListaTitulo: "Submódulos de este módulo",
      ecLista: ({
        personas: [
          {texto:"Beneficiarios — ya funciona", icono:"ph-check-circle", color:"#2f8f5b"},
          {texto:"Personal — ya funciona", icono:"ph-check-circle", color:"#2f8f5b"},
          {texto:"Responsables / Tutores — ya funciona", icono:"ph-check-circle", color:"#2f8f5b"}
        ],
        asistenciaHome: [
          {texto:"Registro de Asistencia — ya funciona", icono:"ph-check-circle", color:"#2f8f5b"},
          {texto:"Gestión Biométrica — funciona, pendiente de reubicar", icono:"ph-arrow-square-out", color:"#d8a13a"},
          {texto:"Gestión de Permisos — por construir", icono:"ph-circle-dashed", color:"#9aa7b2"}
        ]
      })[v] || [],
      ecHayAtajo: v === "asistenciaHome" || v === "biometria" || v === "personas",
      ecAtajo: ({
        personas: "Ir al Personal",
        asistenciaHome: "Ir al Registro de Asistencia",
        biometria: "Ir al enrolamiento, donde está hoy"
      })[v] || "",
      ecAtajoIr: () => {
        if (v === "personas") this.setState({ view: "legajo", legajoTab: "dir" });
        else this.go("asistencia");
      },

      isResponsables: v === "responsables",

