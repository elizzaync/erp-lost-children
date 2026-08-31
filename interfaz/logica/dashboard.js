  cargarAlertas() {
    this.api("/api/alertas")
      .then((d) => { if (this._vivo) this.setState({ vencimientos: d.vencimientos || {} }); })
      .catch(() => {});
  }

