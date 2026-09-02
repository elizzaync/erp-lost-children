// Verifica que cada persona real aparezca SOLO en las pestañas que le tocan.
// Las reales viven en renderVals().reales, su propia seccion, separadas de
// las filas de la maqueta (renderVals().marcaciones).
const fs = require("fs");

class DCLogic {
  constructor(p) { this.props = p || {}; this.state = {}; }
  setState(u) { const q = typeof u === "function" ? u(this.state) : u; this.state = Object.assign({}, this.state, q); }
  forceUpdate() {} componentDidMount() {} componentWillUnmount() {}
  renderVals() { return {}; }
}

const src = fs.readFileSync(
  "C:\\Users\\NIEVES\\Módulo RRHH Lost Children Perú\\_check.js", "utf8");
const Component = new Function("DCLogic", "React", src + '\n;return Component;')(DCLogic, {});

const PESTANAS = { todos: "General", ninos: "Beneficiarios", min: "Colaboradores", adm: "Administración" };

// Una persona por rol, todas con rostro para no mezclar con el filtro de método
const PERSONAS = [
  { staff_number: 9000, nombre: "Vol Uno",    tipo:"personal", ambito:null,   vinculo:"voluntario", metodo: "facial", estado: "enrolado", entrada: null, salida: null, total: 0 },
  { staff_number: 9001, nombre: "Benef Uno",  tipo:"beneficiario", ambito:"ninos", vinculo:null, metodo: "facial", estado: "enrolado", entrada: null, salida: null, total: 0 },
  { staff_number: 9002, nombre: "Colab Uno",  tipo:"personal", ambito:"min",  vinculo:"staff", metodo: "facial", estado: "enrolado", entrada: null, salida: null, total: 0 },
  { staff_number: 9003, nombre: "Admin Uno",  tipo:"personal", ambito:"adm",  vinculo:"staff", metodo: "facial", estado: "enrolado", entrada: null, salida: null, total: 0 },
];

// Dónde DEBE verse cada uno
const ESPERADO = {
  "Vol Uno":   ["todos"],
  "Benef Uno": ["todos", "ninos"],
  "Colab Uno": ["todos", "min"],
  "Admin Uno": ["todos", "adm"],
};

const fallos = [];
console.log("  persona      | " + Object.values(PESTANAS).map(p => p.slice(0, 13).padEnd(14)).join("") + "| veredicto");
console.log("  " + "-".repeat(78));

for (const p of PERSONAS) {
  const visto = [];
  for (const sc of Object.keys(PESTANAS)) {
    const c = new Component({});
    c.state = Object.assign({}, c.state, { view: "dash", scope: sc, metodo: "todos", personasReales: PERSONAS });
    const filas = c.renderVals().reales.filter(m => m.nombre === p.nombre);
    if (filas.length > 1) fallos.push(`${p.nombre} sale ${filas.length} veces en ${PESTANAS[sc]}`);
    if (filas.length) visto.push(sc);
  }
  const esperado = ESPERADO[p.nombre];
  const ok = JSON.stringify(visto) === JSON.stringify(esperado);
  if (!ok) fallos.push(`${p.nombre}: visible en [${visto}] pero se esperaba [${esperado}]`);
  const celdas = Object.keys(PESTANAS).map(sc => (visto.includes(sc) ? "    SI        " : "    --        ")).join("");
  console.log(`  ${p.nombre.padEnd(12)} | ${celdas}| ${ok ? "OK" : "FALLO"}`);
}

// El filtro de método debe seguir funcionando y ser independiente del ámbito
console.log("\n  filtro por método biométrico (pestaña General):");
const mixto = [
  { staff_number: 9010, nombre: "Solo Rostro", tipo:"personal", ambito:"min", vinculo:"staff", metodo: "facial", estado: "enrolado", entrada: null, salida: null, total: 0 },
  { staff_number: 9011, nombre: "Solo Huella", tipo:"personal", ambito:"min", vinculo:"staff", metodo: "huella", estado: "enrolado", entrada: null, salida: null, total: 0 },
  { staff_number: 9012, nombre: "Los Dos",     tipo:"personal", ambito:"min", vinculo:"staff", metodo: "ambos",  estado: "enrolado", entrada: null, salida: null, total: 0 },
];
for (const [mtd, esperados] of [
  ["todos",  ["Solo Rostro", "Solo Huella", "Los Dos"]],
  ["facial", ["Solo Rostro", "Los Dos"]],
  ["huella", ["Solo Huella", "Los Dos"]],
]) {
  const c = new Component({});
  c.state = Object.assign({}, c.state, { view: "dash", scope: "todos", metodo: mtd, personasReales: mixto });
  const vistos = c.renderVals().reales.map(m => m.nombre);
  const ok = JSON.stringify(vistos) === JSON.stringify(esperados);
  if (!ok) fallos.push(`método ${mtd}: [${vistos}] != [${esperados}]`);
  console.log(`    ${mtd.padEnd(7)} -> [${vistos.join(", ")}]  ${ok ? "OK" : "FALLO"}`);
}

// Combinado: voluntario NO debe colarse en Colaboradores ni con filtro de método
console.log("\n  combinado ámbito + método:");
for (const sc of ["ninos", "min", "adm"]) {
  for (const mtd of ["todos", "facial", "huella"]) {
    const c = new Component({});
    c.state = Object.assign({}, c.state, { view: "dash", scope: sc, metodo: mtd, personasReales: PERSONAS });
    const cuela = c.renderVals().reales.some(m => m.nombre === "Vol Uno");
    if (cuela) fallos.push(`Vol Uno se cuela en ${PESTANAS[sc]} con método ${mtd}`);
  }
}
console.log("    el voluntario no se cuela en ninguna combinación:", fallos.some(f => f.includes("cuela")) ? "FALLO" : "OK");

console.log(fallos.length ? "\n  FALLOS:\n   - " + fallos.join("\n   - ") : "\n  TODO OK");
process.exit(fallos.length ? 1 : 0);
