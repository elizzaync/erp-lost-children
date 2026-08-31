  arbolOrganigrama() {
    const gente = this.state.personal || [];
    const porId = new Map(gente.map((p) => [p.id, p]));
    const hijos = new Map();
    for (const p of gente) {
      /* Un jefe que ya no existe (ficha borrada) equivale a no tener jefe:
         si no, esa rama entera desaparecería del árbol. */
      const jefe = p.jefe_id && porId.has(p.jefe_id) ? p.jefe_id : null;
      if (!hijos.has(jefe)) hijos.set(jefe, []);
      hijos.get(jefe).push(p);
    }

    const raices = hijos.get(null) || [];
    const conEquipo = raices.filter((p) => (hijos.get(p.id) || []).length > 0);
    const sueltos = raices.filter((p) => (hijos.get(p.id) || []).length === 0);

    const filas = [];
    const recorrer = (p, nivel) => {
      const equipo = hijos.get(p.id) || [];
      filas.push({ persona: p, nivel: nivel, equipo: equipo.length });
      for (const h of equipo) recorrer(h, nivel + 1);
    };
    for (const r of conEquipo) recorrer(r, 0);

    return { filas: filas, sueltos: sueltos, total: gente.length };
  }

/*§CORTE§ linea original 6321 §*/
  filaOrganigrama(f) {
    const p = f.persona;
    const esRaiz = f.nivel === 0;
    const color = p.ambito === "adm" ? BLUE : RED;
    return {
      nombre: p.nombre,
      cargo: p.cargo || "Sin cargo registrado",
      area: p.area || "Sin área",
      sede: p.sede || "—",
      ini: ini(p.nombre),
      sangria: (8 + f.nivel * 26) + "px",
      peso: esRaiz ? "600" : (f.equipo ? "600" : "400"),
      rail: esRaiz ? color : (f.nivel === 1 ? "#cfd8e0" : "transparent"),
      chipBg: esRaiz ? BLUE_T : (f.equipo ? "#eef2f6" : "transparent"),
      chipFg: esRaiz ? BLUE_D : "#4d5b66",
      equipo: f.equipo ? (f.equipo + (f.equipo === 1 ? " a cargo" : " a cargo")) : "",
      bio: p.staff_number ? ("ID " + p.staff_number) : "",
      editar: () => this.abrirFicha(p)
    };
  }

  /* Cómo se nombra a cada quien en la tabla, según de qué entidad viene */
  static etiquetaRol(p) {
    if (p.tipo === "beneficiario") return "Beneficiario";
    if (p.vinculo === "voluntario") return "Voluntario";
    return p.ambito === "adm" ? "Administración" : "Colaborador";
  }

  /* Las personas que aún no pueden marcar. Salen de la misma cola que
     alimenta Gestión Biométrica, así que las dos pantallas no se pueden
     contradecir. */
