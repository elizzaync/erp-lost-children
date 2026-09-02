// Prueba del botón "Sincronizar marcas" contra yunatt REAL.
// Las marcas locales se han borrado antes, así que si hari aparece es
// porque el botón las trajo de verdad del terminal.
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
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9339","--user-data-dir="+path.join(SP,"edge-sync"),
  "--window-size=1440,1200",BASE + "/"], { stdio:"ignore" });

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
    try{const l=await fetch("http://127.0.0.1:9339/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText.toLowerCase();
    /* Las personas reales viven en su propia sección; sus filas son divs
       con grid-template-columns, no botones como las de la maqueta. */
    window.__fila=(n)=>{
      const h=[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Personas enroladas en este sistema'));
      if(!h) return null;
      const cont=h.parentElement.parentElement;
      const filas=[...cont.querySelectorAll('div')].filter(d=>(d.getAttribute('style')||'').includes('grid-template-columns'));
      const f=filas.find(d=>d.innerText.trim().toLowerCase().startsWith(n));
      return f? f.innerText.replace(/\\s+/g,' ').trim() : null;}; true;`);

  await entrar();
  await evaluar(`__t('Registro de Asistencia').click(),true`); await dormir(1200);

  console.log("\n1. Estado antes de sincronizar (marcas borradas de la base)");
  const antes = await evaluar(`__fila('hari')`);
  console.log("   fila de hari:", antes);
  check(antes !== null, "hari está en la tabla (enrolado)");
  check(antes && !antes.includes("12:27"), "todavía SIN su marca del día");

  console.log("\n2. Pulsar 'Sincronizar marcas'");
  const hayBoton = await evaluar(`!!__t('Sincronizar marcas')`);
  check(hayBoton, "el botón existe en la interfaz");
  await evaluar(`__t('Sincronizar marcas').click(),true`);
  await dormir(600);
  const cargando = await evaluar(`__texto().includes('sincronizando')`);
  check(cargando, "muestra 'Sincronizando…' mientras trabaja");

  // El informe mensual de yunatt puede tardar
  for (let i=0; i<20; i++) {
    await dormir(1000);
    if (!(await evaluar(`__texto().includes('sincronizando')`))) break;
  }

  const msg = await evaluar(`(()=>{const t=document.body.innerText;
    const m=t.match(/(\\d+ marcas? nuevas? registradas?|Sin marcas nuevas[^\\n]*|No se pudieron traer[^\\n]*)/);
    return m?m[0]:null;})()`);
  console.log("   mensaje mostrado:", msg);
  check(msg && !msg.startsWith("No se pudieron"), "informa del resultado sin errores");

  console.log("\n3. La marca de hari aparece en la tabla");
  const despues = await evaluar(`__fila('hari')`);
  console.log("   fila de hari:", despues);
  check(despues && despues.includes("12:27"), "hari muestra su entrada de las 12:27");
  check(despues && /presente/i.test(despues), "hari aparece como Presente");

  const edward = await evaluar(`__fila('edward')`);
  console.log("   fila de edward:", edward);
  check(edward && edward.includes("12:33") && edward.includes("12:39"),
        "edward muestra entrada 12:33 y salida 12:39 (4 marcas)");
  check(edward && edward.includes("0:06"), "edward muestra las horas trabajadas");

  const luis = await evaluar(`__fila('luis')`);
  console.log("   fila de luis:", luis);
  check(luis && /sin marcar/i.test(luis), "luis, sin marcas, aparece como 'Sin marcar' (no como ausente)");

  await evaluar(`document.querySelector('h2')?.scrollIntoView({block:'start'});true`);
  await dormir(400);
  const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"sync.png"),Buffer.from(s.data,"base64"));

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  SINCRONIZACIÓN OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
