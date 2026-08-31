  montarLienzo() {
    const c = document.getElementById("lienzoFirma");
    if (!c) { this._lienzo = null; return; }
    if (this._lienzo === c) return;
    this._lienzo = c;
    const caja = c.getBoundingClientRect();
    /* El lienzo se pinta al doble de resolución que su tamaño en pantalla:
       si no, el trazo sale con los bordes dentados. */
    const escala = 2;
    c.width = Math.max(1, Math.round(caja.width * escala));
    c.height = Math.max(1, Math.round(caja.height * escala));
    const ctx = c.getContext("2d");
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    c.style.touchAction = "none";   // que el dedo dibuje, no que desplace
    this._hayTrazo = false;
    let pintando = false;
    const donde = (e) => {
      const b = c.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    c.addEventListener("pointerdown", (e) => {
      pintando = true;
      this._hayTrazo = true;
      try { c.setPointerCapture(e.pointerId); } catch (x) {}
      const [x, y] = donde(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      /* Un punto suelto también es trazo: quien firma con un toque corto
         no debe encontrarse el lienzo vacío. */
      ctx.lineTo(x + 0.01, y);
      ctx.stroke();
    });
    c.addEventListener("pointermove", (e) => {
      if (!pintando) return;
      const [x, y] = donde(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    const fin = () => { pintando = false; };
    c.addEventListener("pointerup", fin);
    c.addEventListener("pointercancel", fin);
    c.addEventListener("pointerleave", fin);
  }

/*§CORTE§ linea original 4601 §*/
  limpiarLienzo() {
    const c = this._lienzo;
    if (!c) return;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    this._hayTrazo = false;
    this.setState({ firmaAviso: "" });
  }

  /* Guarda el trazo. Devuelve una promesa para poder encadenar «firmar y
     aprobar» sin duplicar el manejo de errores. */
/*§CORTE§ linea original 4611 §*/
  guardarFirma() {
    const c = this._lienzo;
    if (!c || !this._hayTrazo) {
      return Promise.reject(new Error("Dibuja tu firma antes de guardarla."));
    }
    return this.api("/api/mi-firma", {
      method: "POST",
      body: JSON.stringify({ imagen: c.toDataURL("image/png") }),
    }).then((d) => {
      if (this._vivo) this.setState({ firmaUrl: d.url || null });
      return d;
    });
  }

/*§CORTE§ linea original 4625 §*/
  cargarMiFirma() {
    this.api("/api/mi-firma")
      .then((d) => { if (this._vivo) this.setState({ firmaUrl: d.url || null }); })
      .catch(() => {});
  }

/*§CORTE§ linea original 4631 §*/
  abrirFirma(solicitud) {
    this._hayTrazo = false;
    this._lienzo = null;
    this.setState({
      modal: "firma", modalError: "", modalOcupado: false, firmaAviso: "",
      frId: solicitud ? solicitud.id : null,
      frDetalle: solicitud
        ? (solicitud.persona + " · " + solicitud.tipo_etiqueta + " · "
           + (solicitud.desde === solicitud.hasta ? solicitud.desde
              : solicitud.desde + " a " + solicitud.hasta))
        : "",
    });
    this.cargarMiFirma();
  }

  /* El botón del diálogo. Con firma guardada, aprueba. Sin ella, la
     guarda primero: si el guardado falla no se aprueba nada, porque el
     documento saldría sin la firma que dice que alguien lo autorizó. */
/*§CORTE§ linea original 4649 §*/
  confirmarFirma() {
    const id = this.state.frId;
    const seguir = () => {
      if (!id) {
        this.setState({ modal: "", modalOcupado: false,
                        syncEstado: "ok", syncMsg: "Firma guardada." });
        return;
      }
      this.setState({ modal: "", modalOcupado: false });
      this.resolverPermiso(id, "aprobar", "");
    };
    this.setState({ modalOcupado: true, modalError: "" });
    if (this.state.firmaUrl && !this._hayTrazo) {
      seguir();
      return;
    }
    this.guardarFirma()
      .then(seguir)
      .catch((e) => {
        if (this._vivo) {
          this.setState({ modalOcupado: false,
                          modalError: String(e.message || e) });
        }
      });
  }

/*§CORTE§ linea original 4675 §*/
  borrarMiFirma() {
    this.api("/api/mi-firma", { method: "DELETE" })
      .then(() => {
        if (!this._vivo) return;
        this._hayTrazo = false;
        this.setState({ firmaUrl: null, firmaAviso: "Firma borrada. Dibuja una nueva." });
      })
      .catch((e) => {
        if (this._vivo) this.setState({ modalError: String(e.message || e) });
      });
  }

