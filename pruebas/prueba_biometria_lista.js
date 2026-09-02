// Gestión Biométrica: las tres entidades aparecen solas como candidatas y
// cada fila enrola en un clic.
//
// NO se llega a mandar nada al terminal: sin credenciales de yunatt el
// backend responde error, y eso es justo lo que se comprueba — que el clic
// dispara la orden de verdad en vez de quedarse mudo.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
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
  await __ent(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);
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
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9424","--user-data-dir="+path.join(SP,"edge-bio"),
  "--window-size=1500,1250",BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const foto=async n=>{const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,n),Buffer.from(s.data,"base64"));};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

const TRABAJADOR  = "Zzz Bio Trabajador";
const TUTOR       = "Zzz Bio Tutor";
const BENEFICIARIO= "Zzz Bio Nino";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9424/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("el servidor de pruebas no responde en " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  await entrar();

  console.log("0. Una persona de cada tipo, recién creada");
  const ids = await ev(`(async()=>{
    const j = (u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
    const p = await j('/api/personal',      {nombre:${JSON.stringify(TRABAJADOR)}, cargo:'Educador'});
    const r = await j('/api/responsables',  {nombre:${JSON.stringify(TUTOR)}, documento:'70000001'});
    const b = await j('/api/beneficiarios', {nombre:${JSON.stringify(BENEFICIARIO)}});
    return {p:(p.persona||p).id||p.id, r:(r.responsable||r).id||r.id, b:(b.beneficiario||b).id||b.id};})()`);
  console.log("   " + JSON.stringify(ids));
  check(!!(ids.p && ids.r && ids.b), "se crean las tres fichas");

  console.log("\n1. Las tres salen como candidatas SIN darlas de alta aquí");
  const cand = await ev(`fetch('/api/candidatos').then(r=>r.json()).then(d=>d.candidatos)`);
  const mias = cand.filter(c => /^Zzz Bio /.test(c.nombre));
  console.log("   " + JSON.stringify(mias.map(c=>c.tipo+":"+c.nombre)));
  check(mias.some(c=>c.tipo==="personal"     && c.nombre===TRABAJADOR),   "el trabajador aparece solo");
  check(mias.some(c=>c.tipo==="responsable"  && c.nombre===TUTOR),        "el tutor aparece solo");
  check(mias.some(c=>c.tipo==="beneficiario" && c.nombre===BENEFICIARIO), "el beneficiario aparece solo");

  console.log("\n2. La pantalla los lista");
  await enviar("Page.reload", {}); await dormir(3200);
  /* La recarga de arriba se llevó el envoltorio que firma con CSRF: se
     repone, o todo lo que cambie datos a partir de aquí se rechaza. */
  await ev(`(async()=>{
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
  await entrar();
  check(await clicNav("Gestión Biométrica"), "se llega desde el menú");
  await dormir(2200);
  /* Ya no hay botón que abrir: la pantalla ES la lista. Antes el
     enrolamiento vivía dentro de Registro de Asistencia detrás de
     "Agregar registro". */
  await dormir(1200);
  let c = await main();
  for (const n of [TRABAJADOR, TUTOR, BENEFICIARIO])
    check(c.includes(n), `la lista muestra "${n}"`);
  check(/Trabajador/.test(c) && /Responsable/.test(c) && /Beneficiario/.test(c),
        "cada uno con su tipo a la vista");
  check(!/<select|Persona\s*$/.test(c), "ya no hay que abrir un desplegable para verlos");
  await foto("bio-lista.png");

  console.log("\n3. Cada fila tiene sus dos botones");
  const botones = await ev(`(()=>{
    const filas=[...document.querySelectorAll('main div')].filter(d=>d.textContent.includes(${JSON.stringify(TUTOR)}) && d.querySelectorAll('button').length);
    if(!filas.length) return null;
    const fila=filas[filas.length-1];
    return [...fila.querySelectorAll('button')].map(b=>b.innerText.trim());})()`);
  console.log("   " + JSON.stringify(botones));
  check(!!botones && botones.includes("Rostro"), "botón de Rostro en la fila del tutor");
  check(!!botones && botones.includes("Huella"), "y botón de Huella");

  console.log("\n4. El clic manda la orden de verdad");
  /* Sin credenciales de yunatt el backend contesta error. Da igual: lo que
     se comprueba es que el botón dispara la petición en vez de no hacer
     nada, y que la pantalla dice qué pasó en vez de quedarse muda. */
  const antes = await main();
  await ev(`(()=>{
    const filas=[...document.querySelectorAll('main div')].filter(d=>d.textContent.includes(${JSON.stringify(TUTOR)}) && d.querySelectorAll('button').length);
    const fila=filas[filas.length-1];
    const b=[...fila.querySelectorAll('button')].find(x=>/Rostro/.test(x.innerText));
    if(b) b.click();})()`);
  await dormir(3000);
  const despues = await main();
  check(despues !== antes, "la pantalla reacciona al clic");
  check(/Enviando|terminal|yunatt|\.env|error/i.test(despues),
        "y dice qué está pasando con el terminal");
  await foto("bio-clic.png");

  console.log("\n5. Limpieza");
  const queda = await ev(`(async()=>{
    await fetch('/api/personal/${ids.p}',      {method:'DELETE'});
    await fetch('/api/responsables/${ids.r}',  {method:'DELETE'});
    await fetch('/api/beneficiarios/${ids.b}', {method:'DELETE'});
    const d = await fetch('/api/candidatos').then(r=>r.json());
    return d.candidatos.filter(x=>/^Zzz Bio /.test(x.nombre)).length;})()`);
  check(queda === 0, `las tres fichas se retiran (${queda})`);

  console.log("\n6. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404|502|Failed to fetch/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  BIOMETRÍA · LISTA DE CANDIDATOS OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
