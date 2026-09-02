// Interfaz de la Fase 2 conducida en un navegador real.
// 7803 = convivencia · 7804 = estricto. Ambos sobre una COPIA de la base.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const SP = __dirname;
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9384","--user-data-dir="+path.join(SP,"edge-login"),
  "--window-size=1366,820","about:blank"], { stdio:"ignore" });

let ws, id = 0; const pend = new Map(); const errores = [];
const enviar = (m,p) => new Promise((res,rej) => {
  const n = ++id; pend.set(n,{res,rej});
  ws.send(JSON.stringify({ id:n, method:m, params:p||{} }));
});
const evaluar = async (e) => {
  const r = await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const fallos = []; const check = (c,m) => { console.log((c?"  OK    ":"  FALLO ")+m); if(!c) fallos.push(m); };
const foto = async (n) => { const s = await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,n), Buffer.from(s.data,"base64")); };

const ir = async (url) => {
  await enviar("Page.navigate",{url});
  await dormir(3000);
  // El arranque hace /api/sesion antes de pintar nada útil
  for (let i=0;i<20;i++){ if (await evaluar(`document.body.innerText.trim().length>40`)) break; await dormir(400); }
  await dormir(900);
};
const texto = () => evaluar(`document.body.innerText`);
const boton = (t) => evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
  .find(x=>((x.innerText||'').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));
  if(!b) return false; b.click(); return true;})()`);
const porTitulo = (t) => evaluar(`(()=>{const b=document.querySelector('button[title*=' + JSON.stringify(${JSON.stringify(t)}) + ']');
  if(!b) return false; b.click(); return true;})()`);
const salir = async () => {
  // El botón de cerrar sesión es solo un icono: se busca por su title.
  const ok = await porTitulo("Cerrar sesión");
  if (!ok) throw new Error("no encontré el botón de cerrar sesión");
  await dormir(2000);
};
const escribir = (sel, val) => evaluar(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});
  if(!el) return false;
  const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  f.call(el,${JSON.stringify(val)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);

const CONV = "http://127.0.0.1:7803/";
const EST  = "http://127.0.0.1:7804/";

(async () => {
  let t = null;
  for (let i=0;i<40 && !t;i++){ await dormir(500);
    try { const l = await fetch("http://127.0.0.1:9384/json/list").then(r=>r.json());
      t = l.find(x=>x.type==="page"); } catch(e) {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.method==="Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      errores.push((d.exception&&d.exception.description)||d.text);
    }
    if (m.id && pend.has(m.id)) { const {res,rej} = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  await enviar("Runtime.enable"); await enviar("Page.enable");

  // ── 1. Convivencia ────────────────────────────────────────────────────
  console.log("1. Pantalla de entrada en modo convivencia");
  await ir(CONV);
  let tx = await texto();
  // El rótulo lleva text-transform:uppercase, así que innerText lo devuelve
  // en mayúsculas: la comparación tiene que ignorar el caso.
  check(/usuario/i.test(tx) && !/correo institucional/i.test(tx),
        "pide usuario, ya no correo institucional");
  check((await evaluar(`!!document.querySelector('input[type=text]') && !document.querySelector('input[type=email]')`)),
        "el campo dejó de ser de tipo email");
  check(/Todavía no se reparten las cuentas/.test(tx), "avisa de que el corte no se ha hecho");
  check(/Entrar sin cuenta/.test(tx), "ofrece la puerta de convivencia");
  // Había una casilla "Mantener sesión abierta" que no hacía nada.
  check(!/Mantener sesión abierta/.test(tx), "sin la casilla decorativa que no hacía nada");
  check(/45 min sin uso/.test(tx), "y sí dice cuánto dura la sesión de verdad");
  await foto("f2-login-convivencia.png");

  console.log("\n2. Entrar sin cuenta lleva al sistema, identificado como tal");
  await boton("Entrar sin cuenta"); await dormir(1800);
  tx = await texto();
  check(/Dashboard/.test(tx), "entra al Dashboard");
  check(/Sin identificar/.test(tx) && /Modo convivencia/.test(tx),
        "el pie de la barra no finge saber quién es");
  const pie = await evaluar(`(()=>{const a=document.querySelector('aside');
    return a ? a.innerText.slice(-160) : '';})()`);
  check(!/Mariela Quispe/.test(pie),
        "el pie ya no muestra el nombre fijo de mentira");
  await foto("f2-convivencia-dentro.png");

  // ── 2. Estricto ───────────────────────────────────────────────────────
  console.log("\n3. Con el acceso restringido esa puerta no existe");
  await ir(EST);
  tx = await texto();
  check(!/Entrar sin cuenta/.test(tx), "no hay forma de entrar sin cuenta");
  check(!/Todavía no se reparten/.test(tx), "ni el aviso de convivencia");
  await foto("f2-login-estricto.png");

  console.log("\n4. Una contraseña incorrecta no entra");
  await escribir("input[type=text]", "zzdir");
  await escribir("input[type=password]", "la-que-no-es");
  await boton("Ingresar al sistema"); await dormir(1600);
  tx = await texto();
  check(/incorrect/i.test(tx), "avisa del error: " + (tx.match(/Usuario o contrase[^\n]*/)||[""])[0]);
  check(!/Dashboard/.test(tx), "sigue fuera");
  check((await evaluar(`document.querySelector('input[type=password]').value===''`)),
        "limpia la contraseña tecleada");
  await foto("f2-login-fallido.png");

  console.log("\n5. Con la correcta entra y el sistema sabe quién es");
  await escribir("input[type=text]", "zzdir");
  await escribir("input[type=password]", "clave-de-prueba");
  await boton("Ingresar al sistema"); await dormir(2600);
  tx = await texto();
  check(/Dashboard/.test(tx), "entra");
  check(/Director/.test(tx), "el pie muestra su cargo");
  check(!/Sin identificar/.test(tx), "y ya no dice 'sin identificar'");
  await foto("f2-director-dentro.png");

  console.log("\n6. Un Director ve el módulo de Usuarios y sus tres pestañas");
  check(/Usuarios y permisos/.test(tx), "aparece en la barra lateral");
  await boton("Usuarios y permisos"); await dormir(1800);
  tx = await texto();
  check(/Cuentas/.test(tx) && /Cargos y permisos/.test(tx) && /Registro de accesos/.test(tx),
        "las tres pestañas");
  check(/zzdir/.test(tx) && /zzvol/.test(tx), "lista las cuentas creadas");
  check(/Es tu cuenta/.test(tx), "no ofrece borrarse a sí mismo");
  check(/Clave sin estrenar/.test(tx), "distingue a quien no ha cambiado la clave inicial");
  await foto("f2-usuarios-cuentas.png");

  console.log("\n7. La matriz de permisos de un cargo");
  await boton("Cargos y permisos"); await dormir(1200);
  tx = await texto();
  check(/Voluntario Prueba/.test(tx), "lista el cargo de prueba");
  check(/sistema/i.test(tx), "marca los cargos del sistema");
  await boton("Ver y editar permisos"); await dormir(1600);
  tx = await texto();
  const celdas = await evaluar(`[...document.querySelectorAll('button')].filter(b=>/^(Nada|Ver|Ver y editar)$/.test((b.innerText||'').trim())).length`);
  // El catálogo cambia cuando se añade o retira un módulo (Homologación/SST
  // se retiró el 17/08). Se compara contra lo que declara el backend, no
  // contra un número fijo que hay que recordar actualizar.
  const nModulos = await evaluar(`fetch('/api/usuarios').then(r=>r.json()).then(d=>d.modulos.length)`);
  check(celdas >= nModulos*3 - 3,
        `la matriz trae los ${nModulos} módulos del catálogo (${celdas} botones)`);
  check(/Da acceso a datos de menores/.test(tx) || /Incluye los sueldos/.test(tx),
        "avisa en los módulos delicados");
  await foto("f2-matriz-permisos.png");
  await evaluar(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await dormir(700);

  console.log("\n8. El rol Director no se puede recortar");
  await boton("Ver permisos"); await dormir(1500);
  tx = await texto();
  check(/no se puede recortar|no admite cambios/.test(tx), "lo dice y lo impide");
  await foto("f2-rol-director.png");
  await evaluar(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await dormir(700);

  console.log("\n9. El registro de accesos ya tiene qué contar");
  await boton("Registro de accesos"); await dormir(1600);
  tx = await texto();
  check(/zzdir/.test(tx), "aparece quién lo hizo");
  check(/Permitido/.test(tx), "y con qué resultado");
  await foto("f2-accesos.png");

  // ── 3. Un cargo limitado ──────────────────────────────────────────────
  console.log("\n10. Un cargo limitado ve un sistema más pequeño");
  await salir();
  await escribir("input[type=text]", "zzvol");
  await escribir("input[type=password]", "clave-de-prueba");
  await boton("Ingresar al sistema"); await dormir(2600);
  tx = await texto();
  // Se mira solo la sección de módulos activos: "Otros módulos" lista además
  // los desactivados, y contarlos aquí daría un falso negativo.
  const menu = await evaluar(`[...document.querySelectorAll('nav > div:first-child button')].map(b=>(b.innerText||'').trim().split('\\n')[0])`);
  const otros = await evaluar(`[...document.querySelectorAll('nav > div:last-child button')].map(b=>(b.innerText||'').trim().split('\\n')[0])`);
  console.log("       menú visible: " + JSON.stringify(menu));
  console.log("       otros módulos: " + JSON.stringify(otros));
  check(menu.includes("Asistencia"), "conserva Asistencia, que sí alcanza");
  // Lo que de verdad esconde el permiso, ahora que el menú activo es corto:
  check(!otros.some(x=>/Usuarios/.test(x)), "Usuarios y permisos no aparece");
  check(!otros.some(x=>/Configuración/.test(x)), "Configuración tampoco: no tiene ese permiso");
  await foto("f2-menu-limitado.png");

  console.log("\n11. Con solo-ver la pantalla se abre, pero sin botones de crear");
  check(menu.includes("Personal"), "Personal sí aparece: tiene vista sobre personal");
  await boton("Personal"); await dormir(2200);
  tx = await texto();
  check(/Directorio|Organigrama/i.test(tx), "la pantalla se abre y muestra el directorio");
  check(!/Agregar usuario/i.test(tx), "pero no ofrece «Agregar usuario»");
  // La captura enseñó lo que la comprobación no medía: los lápices de
  // editar de cada fila seguían ahí, y las pestañas de módulos ajenos.
  const lapices = await evaluar(`document.querySelectorAll('button[title="Editar ficha"]').length`);
  check(lapices === 0, `sin lápices de editar en las filas (${lapices})`);
  /* Las pestañas se identifican por su icono + rótulo, así que se busca
     dentro del texto del botón, no al principio: el icono mete su propio
     carácter delante. La comprobación positiva evita pasar en vacío. */
  const pestanas = await evaluar(`[...document.querySelectorAll('button')]
    .map(b => (b.innerText||'').replace(/\s+/g,' ').trim())
    .filter(x => /Directorio|Organigrama|Documentos|Contratos|Beneficiarios/.test(x))`);
  check(pestanas.some(x => /Directorio/.test(x)),
        "las pestañas se localizan: " + JSON.stringify(pestanas));
  check(!pestanas.some(x => /Contratos|Beneficiarios/.test(x)),
        "y no está ninguna de las que no alcanza");
  await foto("f2-solo-ver.png");
  await boton("Registro de Asistencia"); await dormir(2000);
  tx = await texto();
  check(!/Agregar registro/i.test(tx) && !/Sincronizar/i.test(tx),
        "en Asistencia tampoco aparecen sincronizar ni enrolar");
  await foto("f2-solo-ver-asistencia.png");

  console.log("\n12. Escribir la ruta a mano tampoco sirve");
  const r403 = await evaluar(`fetch('/api/planillas').then(r=>r.status)`);
  check(r403 === 403, `la API responde ${r403} aunque el botón no esté`);

  // ── 4. Cambio de clave obligatorio ────────────────────────────────────
  console.log("\n13. A quien le pusieron la clave, se le exige cambiarla");
  await salir();
  await escribir("input[type=text]", "zznuevo");
  await escribir("input[type=password]", "clave-de-prueba");
  await boton("Ingresar al sistema"); await dormir(2600);
  tx = await texto();
  check(/Elige tu contraseña/.test(tx), "corta el paso con la pantalla de cambio");
  // El saludo tomaba el título por nombre y decía "Hola Ps..".
  const saludo = (tx.match(/Hola [^.]*\./) || [""])[0];
  check(/^Hola [A-ZÁÉÍÓÚ]/.test(saludo) && !/Hola (Ps|Lic|Mg|Dr|Ing)/.test(saludo),
        "y saluda por el nombre, no por el título: " + JSON.stringify(saludo));
  check(!/Dashboard/.test(tx), "no llega a ninguna pantalla del sistema");
  await foto("f2-cambio-obligatorio.png");

  console.log("\n14. Rechaza lo que no debe aceptar");
  await evaluar(`(()=>{const i=document.querySelectorAll('input[type=password]');
    const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    f.call(i[0],'clave-de-prueba'); i[0].dispatchEvent(new Event('input',{bubbles:true}));
    f.call(i[1],'nueva-larga-1'); i[1].dispatchEvent(new Event('input',{bubbles:true}));
    f.call(i[2],'otra-distinta'); i[2].dispatchEvent(new Event('input',{bubbles:true}));
    return true;})()`);
  await boton("Guardar y entrar"); await dormir(1200);
  tx = await texto();
  check(/no coincide/i.test(tx), "detecta que la repetición no coincide");

  await evaluar(`(()=>{const i=document.querySelectorAll('input[type=password]');
    const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    f.call(i[1],'corta'); i[1].dispatchEvent(new Event('input',{bubbles:true}));
    f.call(i[2],'corta'); i[2].dispatchEvent(new Event('input',{bubbles:true}));
    return true;})()`);
  await boton("Guardar y entrar"); await dormir(1500);
  tx = await texto();
  check(/8/.test(tx) && /Elige tu contraseña/.test(tx), "y que es demasiado corta");

  console.log("\n15. Con una válida, entra");
  await evaluar(`(()=>{const i=document.querySelectorAll('input[type=password]');
    const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    f.call(i[1],'la-mia-de-verdad'); i[1].dispatchEvent(new Event('input',{bubbles:true}));
    f.call(i[2],'la-mia-de-verdad'); i[2].dispatchEvent(new Event('input',{bubbles:true}));
    return true;})()`);
  await boton("Guardar y entrar"); await dormir(2600);
  tx = await texto();
  check(/Dashboard/.test(tx), "ya sí entra al sistema");
  check(!/Elige tu contraseña/.test(tx), "y no vuelve a pedirlo");
  await foto("f2-tras-cambiar.png");

  console.log("\n16. La contraseña vieja dejó de servir");
  await salir();
  await escribir("input[type=text]", "zznuevo");
  await escribir("input[type=password]", "clave-de-prueba");
  await boton("Ingresar al sistema"); await dormir(1800);
  tx = await texto();
  check(/incorrect/i.test(tx), "la anterior ya no entra");

  // ── Errores de consola ────────────────────────────────────────────────
  console.log("\n17. Sin errores en la consola del navegador");
  const graves = errores.filter(e => !/favicon|404/.test(e));
  check(graves.length === 0, graves.length ? "errores: " + graves.slice(0,3).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length ? `  ${fallos.length} FALLOS` : "  NAVEGADOR OK"));
  fallos.forEach(f => console.log("   - " + f));
  edge.kill();
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.log("REVENTÓ: " + e.message); edge.kill(); process.exit(1); });
