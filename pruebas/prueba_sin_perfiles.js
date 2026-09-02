// Beneficiarios no muestra ningún perfil verosímil de un menor.
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
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9383","--user-data-dir="+path.join(SP,"edge-sinp"),
  "--window-size=1440,1200",BASE + "/"], { stdio:"ignore" });

let ws,id=0; const pend=new Map(); const errores=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const evaluar=async(e)=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};
const foto=async(n)=>{const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,n),Buffer.from(s.data,"base64"));};

/* DATOS inventados de un caso: nombres, números de expediente, parentescos,
   lengua materna. Nada de esto puede aparecer en ninguna pantalla, porque
   describe a un menor que no existe y se lee como si existiera. */
const PROHIBIDO = [
  "Dayana", "Ángel M.", "Briana", "Cristhian", "Elías R.", "Fabiana",
  "Gael", "Heidi", "Iván L.", "Jazmín", "Kevin H.", "Luana",
  "EXP-", "UPE / MIMP", "Tía materna", "DNI 7",
  "José Puma", "Nayeli Condori", "Fiorella Núñez", "Lengua materna: Quechua",
];

/* RÓTULOS de campo de la estructura aprobada. Son otra cosa: "Vía de ingreso"
   es el nombre de una casilla vacía, no el caso de nadie. Estaban mezclados
   con la lista de arriba, así que la prueba fallaba por que el formulario de
   alta existiera — es decir, exigía que la ficha NO tuviera los campos que se
   pidió que tuviera. Aquí se comprueba lo contrario: que estén, y vacíos. */
const ROTULOS = [
  "Expediente judicial", "Vía de ingreso",
  "Régimen de visitas", "Referente familiar",
];
/* "Derivación judicial" y "Medida de protección" no están aquí: no son
   rótulos de ningún campo, son ejemplos dentro del placeholder de "Vía de
   ingreso". Un placeholder no se renderiza como texto, así que exigirlos en
   la ficha era exigir algo que nunca podría cumplirse. */

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9383/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails; errores.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await entrar();

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página, y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};true;`);

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await __ent(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);

  console.log("\n1. Pestaña Beneficiarios");
  await evaluar(`__t('Personal').click(),true`); await dormir(1800);
  await evaluar(`(()=>{const m=document.querySelector('main');
    const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios'); if(b)b.click();})()`);
  await dormir(1800);
  const lista = await evaluar(`document.body.innerText`);
  for (const p of PROHIBIDO) {
    if (lista.includes(p)) check(false, `la lista NO debe mostrar "${p}"`);
  }
  check(!PROHIBIDO.some(p => lista.includes(p)), "la lista no muestra ningún perfil verosímil");
  /* La maqueta de doce marcadores se borró. Antes esta prueba exigía que
     estuvieran y se vieran falsos; ahora exige que no estén: un marcador de
     relleno en una pantalla de menores acaba leyéndose como un caso real. */
  check(!/Beneficiario de prueba [0-9]/.test(lista),
        "no queda ni un marcador numerado de la maqueta");
  check(!/Mostrando 12 de 26/.test(lista),
        "ni el pie que decía cuántos residentes había");
  check(!/Maqueta de dise/i.test(lista),
        "ni el rótulo que separaba lo real de lo inventado");
  await foto("benef-generico-lista.png");

  console.log("\n2. Abrir una ficha para revisar su estructura");
  /* Se crea una propia en vez de abrir una de relleno: ya no hay relleno, y
     depender de una ficha ajena hacía que la prueba revisara la pantalla
     equivocada cuando otra suite dejaba la suya a medias. */
  const BEN = "Zzz Estructura Ficha";
  const bid = await evaluar(`fetch('/api/beneficiarios',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:${JSON.stringify(BEN)}})})
    .then(r=>r.json()).then(d=>(d.beneficiario||{}).id||d.id)`);
  console.log("   beneficiario " + bid);
  await enviar("Page.reload", {}); await dormir(3200);
  /* La recarga de arriba se llevó el envoltorio que firma con CSRF: se
     repone, o todo lo que cambie datos a partir de aquí se rechaza. */
  await evaluar(`(async()=>{
    if (!window.__fo) window.__fo = window.fetch;
    /* El token se pide EN CADA llamada que cambia datos, no una vez: una
       suite puede cambiar de sesión por el camino (entra la jefa, luego la
       trabajadora) y un token guardado sería el de la sesión anterior.
       Y si la llamada ya trae su propio token, no se toca: pisarlo era
       justo lo que rompía las suites que firman a mano. */
    window.fetch = async (u,o)=>{
      o = o || {};
      const m = (o.method||"GET").toUpperCase();
      const cambia = ["POST","PUT","PATCH","DELETE"].indexOf(m) >= 0;
      const ya = o.headers && (o.headers["X-CSRF-Token"] || o.headers["x-csrf-token"]);
      if (cambia && !ya) {
        const ss = await window.__fo("/api/sesion").then(r=>r.json()).catch(()=>({}));
        const csrf = (ss.sesion||{}).csrf || "";
        if (csrf) o.headers = Object.assign({}, o.headers, {"X-CSRF-Token": csrf});
      }
      return window.__fo(u,o);
    };
    return "ok";})()`);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/entrar sin cuenta/i.test(x.innerText||''));if(b)b.click();})()`);
  await dormir(2500);
  /* El reload se lleva por delante el ayudante: vive en window. */
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));true;`);
  await evaluar(`__t('Personal').click(),true`); await dormir(1800);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios'); if(b)b.click();})()`);
  await dormir(1800);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(BEN)}));if(b)b.click();})()`);
  await dormir(1800);
  const ficha = await evaluar(`document.body.innerText`);
  const h1 = await evaluar(`(document.querySelector('h1')||{}).innerText`);
  console.log("   título: " + h1);
  for (const p of PROHIBIDO) {
    if (ficha.includes(p)) check(false, `la ficha NO debe mostrar "${p}"`);
  }
  check(!PROHIBIDO.some(p => ficha.includes(p)), "la ficha no inventa ningún dato de caso");
  check(/Sin registrar/.test(ficha), "los campos dicen que no hay dato");

  /* Los rótulos SÍ deben estar: son la estructura aprobada, y quitarlos
     sería quitar campos que se pidieron. Que no lleven datos inventados ya
     lo cubre la lista PROHIBIDO de arriba; intentar además comprobar el
     valor pegado al rótulo no funciona, porque la rejilla los agrupa y
     innerText devuelve un rótulo seguido del siguiente. */
  /* Sin distinguir mayúsculas: los rótulos llevan text-transform:uppercase,
     así que innerText devuelve "VÍA DE INGRESO". */
  const fichaLower = ficha.toLowerCase();
  for (const r of ROTULOS) {
    check(fichaLower.includes(r.toLowerCase()), `la ficha conserva el campo "${r}"`);
  }

  console.log("\n3. La estructura aprobada sigue ahí");
  const secciones = await evaluar(`[...document.querySelectorAll('h3')].map(x=>x.innerText.trim())`);
  console.log("   " + JSON.stringify(secciones));
  for (const s of ["Educación", "Salud", "Acompañamiento", "Documentos", "Historia de vida"]) {
    check(secciones.includes(s), `conserva la sección "${s}"`);
  }
  await foto("benef-generico-ficha.png");

  console.log("\n4. Ni rastro tampoco en Asistencia (vista de beneficiarios)");
  await evaluar(`__t('Registro de Asistencia').click(),true`); await dormir(1800);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios'); if(b)b.click();})()`);
  await dormir(1800);
  const asis = await evaluar(`document.body.innerText`);
  const encontrados = PROHIBIDO.filter(p => asis.includes(p));
  console.log("   encontrados: " + (encontrados.length ? JSON.stringify(encontrados) : "ninguno"));
  check(encontrados.length === 0, "la maqueta de Asistencia tampoco los muestra");

  console.log("\n5. La base no contiene ninguno de los perfiles inventados");
  /* No se exige la tabla vacía: el usuario puede tener fichas reales
     suyas. Lo que no puede haber es ninguno de los 12 perfiles de la
     maqueta ni su narrativa de caso. */
  const bd = await evaluar(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>d.beneficiarios.map(b=>b.nombre))`);
  console.log("   en la base: " + JSON.stringify(bd));
  const infiltrados = bd.filter(n => PROHIBIDO.some(p => n.includes(p)));
  check(infiltrados.length === 0, "ninguno de los perfiles de la maqueta está en la base");

  console.log("\n6. Limpieza");
  const queda = await evaluar(`(async()=>{
    /* Se borran TODAS las suyas, no solo la de esta corrida: si una
       ejecución anterior murió a media, su ficha sigue dentro. */
    const todas = await fetch('/api/beneficiarios').then(r=>r.json());
    for (const b of todas.beneficiarios.filter(x=>/^Zzz /.test(x.nombre)))
      await fetch('/api/beneficiarios/' + b.id, {method:'DELETE'});
    const d = await fetch('/api/beneficiarios').then(r=>r.json());
    return d.beneficiarios.filter(b=>/^Zzz /.test(b.nombre)).length;})()`);
  check(queda === 0, `la prueba se lleva su ficha (${queda})`);

  check(errores.length === 0, "cero errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  SIN PERFILES INVENTADOS OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
