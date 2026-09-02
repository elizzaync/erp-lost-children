// Asistencia terminada: sección propia para personas reales, selector de
// fecha, y huella reactivada. Contra el backend REAL (7801).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const SP = __dirname;
// El corredor levanta el banco en otro puerto para no pisar el 7801
// del equipo. Por defecto el 7801, para poder lanzarla suelta.
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
// Desde que LOGIN_ESTRICTO está activo no existe "entrar sin
// cuenta": hay que identificarse. El banco siembra esta cuenta
// en SU copia, que se borra al terminar.
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
// Entrar es una función y no un bloque copiado: varias suites se
// identifican más de una vez (tras cada recarga), y repetir el
// bloque declaraba dos veces la misma constante.
let __ent, __recargar;
async function entrar() {
  const st = await __ent(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar con la cuenta del banco: " + st);
  await __recargar({});
  await new Promise(r => setTimeout(r, 3000));
  /* La recarga se lleva por delante los ayudantes: viven en window y la
     página se rehace entera. Antes se definían una vez al principio y
     desaparecían al identificarse, así que todo lo que venía después
     reventaba sin decir por qué. */
  /* Los fetch crudos de las suites no llevaban el token CSRF: antes no
     hacía falta porque no había sesión, y ahora toda escritura
     identificada lo exige. Se envuelve fetch una sola vez, que es lo
     que hace la aplicación real en su ayudante api(). */
  await __ent(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || s.csrf || "";
    if (!window.__fetchOriginal) window.__fetchOriginal = window.fetch;
    window.fetch = (u, o) => {
      o = o || {};
      const m = (o.method || "GET").toUpperCase();
      if (csrf && ["POST","PUT","PATCH","DELETE"].indexOf(m) >= 0)
        o.headers = Object.assign({}, o.headers, {"X-CSRF-Token": csrf});
      return window.__fetchOriginal(u, o);
    };
    return csrf ? "ok" : "sin csrf";})()`);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const { execSync } = require("child_process");
/* Esta suite necesita gente enrolada con marcas. Antes usaba a luis, hari
   y edward —fichas reales que se borraron por ser de prueba—, así que
   ahora se crea su propia fixtura y se la lleva al terminar. */
const fixtura = (accion) =>
  JSON.parse(execSync(`py "${path.join(__dirname, "fixtura.py")}" ${accion}`,
                      { encoding: "utf8" }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

fixtura('crear');

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9340","--user-data-dir="+path.join(SP,"edge-asist"),
  "--window-size=1440,1300",BASE + "/"], { stdio:"ignore" });

let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const evaluar=async(e)=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9340/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await dormir(2500);


  await entrar();

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página, y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const proto=el.tagName==='INPUT'?window.HTMLInputElement.prototype:window.HTMLTextAreaElement.prototype;
      const f=Object.getOwnPropertyDescriptor(proto,'value').set; f.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    window.__texto=()=>document.body.innerText.toLowerCase();
    window.__seccion=()=>{const h=[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Asistencia del d'));
      return h? h.closest('div').parentElement.innerText.replace(/\\s+/g,' ').trim() : null;};
    true;`);

  /* Aquí había una SEGUNDA inyección de los mismos ayudantes, sin
     recarga en medio que la justificara. Copiar y pegar de otra
     suite: no añadía nada y podía pisar una versión mejor de
     __esc, que es como el organigrama acabó acusando al sistema de
     algo que hacía bien. Retirada el 31/08/2026. */
  await evaluar(`__t('Registro de Asistencia').click(),true`); await dormir(1200);
  /* Las marcas reales son del 12; se ancla el día para que la prueba
     no dependa de la fecha del sistema. */
  await evaluar(`__esc('input[type=date]','2026-08-12')`); await dormir(1700);

  console.log("\n1. Sección propia de personas reales");
  const sec = await evaluar(`__seccion()`);
  check(sec !== null, "existe la tabla del día");
  console.log("   " + (sec||"").slice(0, 260));
  check(sec && /entrada/i.test(sec) && /salida/i.test(sec) && /horas/i.test(sec),
        "tiene encabezados Entrada / Salida / Horas (no Pres./Aus./Alm.)");
  check(sec && sec.includes("12:27"), "Zzz Marca Incompleta muestra su entrada real");
  check(sec && /rol/i.test(sec), "muestra la columna Rol");

  // La tabla de la maqueta ya no debe contener a las personas reales
  const maqueta = await evaluar(`(()=>{const h=[...document.querySelectorAll('h2')].find(x=>/presencia por grupo|marcaciones de hoy|control de ingreso/i.test(x.innerText));
    return h? h.parentElement.parentElement.innerText.replace(/\\s+/g,' ') : '';})()`);
  check(!/enrolado aquí/i.test(maqueta), "las personas reales ya NO se mezclan en la tabla de la maqueta");

  /* Aqui se comprobaba que "Huella" volviera a estar disponible en el
     formulario de enrolar. Ese formulario ya no vive en Asistencia: se
     movio a Gestion Biometrica, y prueba_biometria_lista comprueba lo
     mismo sobre la pantalla nueva, incluido que el boton de Huella solo
     aparece si el terminal lo soporta. */

  console.log("\n3. Selector de fecha");
  const hayFecha = await evaluar(`!!document.querySelector('input[type=date]')`);
  check(hayFecha, "existe el selector de día");
  const hoy = await evaluar(`document.querySelector('input[type=date]').value`);
  console.log("   valor inicial:", hoy);
  check(/^\d{4}-\d{2}-\d{2}$/.test(hoy||""), "el selector tiene una fecha válida");

  await evaluar(`__esc('input[type=date]','2026-08-11')`);
  await dormir(1500);
  const ayer = await evaluar(`__seccion()`);
  console.log("   al cambiar al 11:", (ayer||"").slice(0,180));
  check(ayer && !ayer.includes("12:27"), "al cambiar de día desaparece la marca del 12");
  check(ayer && /sin marcar/i.test(ayer), "ese día figuran como Sin marcar");

  await evaluar(`__esc('input[type=date]','2026-08-12')`);
  await dormir(1500);
  const vuelta = await evaluar(`__seccion()`);
  check(vuelta && vuelta.includes("12:27"), "al volver a hoy reaparece la marca");

  console.log("\n4. Filtro por pestaña con las personas reales");
  /* Los nombres de la tabla del día. Antes se buscaban por el atributo
     `style` de cada fila, que cambió al rehacer la vista; ahora se leen
     del texto de la sección, que es lo que ve una persona. */
  const nombresEn = () => evaluar(`(()=>{
    const h=[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Asistencia del d'));
    if(!h) return [];
    const cont = h.closest('div').parentElement;
    /* fromCharCode(10) y no el escape: dentro de la plantilla, la
       barra se convierte en un salto de verdad y parte la cadena. */
    return (cont.innerText||'').split(String.fromCharCode(10))
      .map(l=>l.trim().toLowerCase())
      .filter(l=>l.startsWith('zzz '));})()`);

  const donde = { "zzz sin marcas": [], "zzz marca incompleta": [], "zzz marca completa": [] };
  for (const etiqueta of ["General","Beneficiarios","Colaboradores","Administración"]) {
    /* Acotado a <main>: "Beneficiarios" es también un submódulo del menú
       lateral, y al buscar en todo el documento el clic se iba allí y
       abandonaba Asistencia sin que la prueba se enterara. */
    await evaluar(`(()=>{const m=document.querySelector('main')||document.body;
      const b=[...m.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(etiqueta)}); if(b)b.click();})()`);
    await dormir(700);
    const ns = await nombresEn();
    for (const n of Object.keys(donde)) if (ns.includes(n)) donde[n].push(etiqueta);
  }
  for (const n of Object.keys(donde)) console.log("   " + n.padEnd(22) + " visible en: " + JSON.stringify(donde[n]));
  check(JSON.stringify(donde["zzz sin marcas"])==='["General"]',
        "el voluntario solo aparece en General");
  check(JSON.stringify(donde["zzz marca incompleta"])==='["General","Colaboradores"]',
        "el colaborador de casa hogar, en General y Colaboradores");
  check(JSON.stringify(donde["zzz marca completa"])==='["General","Administración"]',
        "el de oficina, en General y Administración");

  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='General'); if(b)b.click();})()`);
  await dormir(600);
  await evaluar(`[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Personas enroladas'))?.scrollIntoView({block:'center'});true`);
  await dormir(400);
  const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"asistencia.png"),Buffer.from(s.data,"base64"));

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  ASISTENCIA OK");
  fixtura('borrar');
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);
  try{fixtura("borrar");}catch(_){}
  edge.kill();process.exit(1);});
