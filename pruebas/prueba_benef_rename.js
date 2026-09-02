// El detalle del beneficiario se llama "Expediente del beneficiario".
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
  "--remote-debugging-port=9359","--user-data-dir="+path.join(SP,"edge-ben"),
  "--window-size=1440,1100",BASE + "/"], { stdio:"ignore" });

let ws,id=0; const pend=new Map();
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

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9359/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);
  await entrar();

  console.log("\n1. En el Dashboard nada lo llama 'ficha de vida del beneficiario'");
  const dash = await evaluar(`__texto()`);
  check(!/ficha de vida del beneficiario/i.test(dash), "el Dashboard no usa el nombre viejo");

  console.log("\n2. La pestaña Beneficiarios manda al expediente");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Personal')); b.click();})()`);
  await dormir(1600);
  /* Hay dos botones "Beneficiarios": el del menú lateral (bloqueado, 2027)
     y la pestaña del módulo. Hay que quedarse con el de la pestaña. */
  const cual = await evaluar(`(()=>{const main=document.querySelector('main')||document.body;
    const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios');
    if(b){b.click(); return 'pestaña';} return 'no encontrada';})()`);
  console.log("   pestaña: " + cual);
  await dormir(1600);
  /* El pie decía "Mostrando 12 de 26 residentes" y contaba la maqueta de
     doce marcadores. Se borró la maqueta, así que el pie se fue con ella:
     lo que se comprueba ahora es que la pantalla no haya recuperado el
     vocabulario viejo. */
  const lista = await evaluar(`(document.querySelector('main')||document.body).innerText`);
  check(!/Mostrando \\d+ de \\d+ residentes/.test(lista),
        "ya no hay pie de maqueta contando residentes");
  check(!/hoja de vida/i.test(lista), "la lista no dice 'Hoja de Vida'");
  await foto("benef-lista.png");

  console.log("\n3. El detalle de un beneficiario");
  /* Una ficha propia: las tarjetas con línea "Tutor:" eran las de la
     maqueta, que ya no existe. */
  const BENEF = "Zzz Rename Expediente";
  await evaluar(`fetch('/api/beneficiarios',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:${JSON.stringify(BENEF)}})}).then(r=>r.json())`);
  await enviar("Page.reload", {}); await dormir(3000);
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
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));true;`);
  await entrar();
  await dormir(2500);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Personal')); b.click();})()`);
  await dormir(1600);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios'); if(b)b.click();})()`);
  await dormir(1700);
  const tarjeta = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .find(x=>x.innerText.includes(${JSON.stringify(BENEF)}) && /border-left/.test(x.getAttribute('style')||''));
    if(b){b.click(); return b.innerText.replace(/\\s+/g,' ').slice(0,60);} return 'sin tarjeta';})()`);
  console.log("   tarjeta: " + tarjeta);
  await dormir(1700);
  const h1 = await evaluar(`document.querySelector('h1').innerText.trim()`);
  console.log("   título: " + h1);
  check(h1 === "Expediente del beneficiario", "el título es 'Expediente del beneficiario'");
  /* Solo el panel central: el menú lateral sí dice "Hoja de Vida" y ahí
     está bien, porque es el módulo de personal. */
  const cuerpo = await evaluar(`(document.querySelector('main')||document.body).innerText`);
  check(!/hoja de vida/i.test(cuerpo), "no queda ningún 'ficha de vida' en el expediente");
  const botones = await evaluar(`[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(x=>/Editar|Registrar sesi|Reportar/i.test(x)&&x.length<45)`);
  console.log("   botones: " + JSON.stringify(botones));
  check(botones.includes("Editar expediente"), "el botón dice 'Editar expediente'");
  const h3 = await evaluar(`[...document.querySelectorAll('h3')].map(x=>x.innerText.trim())`);
  console.log("   secciones: " + JSON.stringify(h3));
  /* Esto es sobre la pantalla del BENEFICIARIO, que sigue llamándose
     "Expediente del beneficiario": no debe tener dentro otra sección con
     el mismo nombre. Nada que ver con el módulo de personal. */
  check(!h3.includes("Expediente"), "no hay una sección 'Expediente' dentro del Expediente");
  check(h3.includes("Documentos"), "esa sección ahora se llama 'Documentos'");
  const volver = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Volver a beneficiarios/i.test(x.innerText)); return b? b.innerText.trim():null;})()`);
  console.log("   volver: " + volver);
  check(volver !== null, "el enlace de volver sigue funcionando");
  await foto("benef-expediente.png");

  console.log("\n4. El módulo de personal conserva su nombre");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Personal')); b.click();})()`);
  await dormir(1600);
  check(await evaluar(`document.querySelector('h1').innerText.trim()`) === "Hoja de Vida",
        "el módulo de personal sigue siendo 'Hoja de Vida'");

  console.log("\n5. Limpieza");
  const queda = await evaluar(`(async()=>{
    const d = await fetch('/api/beneficiarios').then(r=>r.json());
    for (const b of d.beneficiarios.filter(x=>/^Zzz /.test(x.nombre)))
      await fetch('/api/beneficiarios/' + b.id, {method:'DELETE'});
    const e = await fetch('/api/beneficiarios').then(r=>r.json());
    return e.beneficiarios.filter(x=>/^Zzz /.test(x.nombre)).length;})()`);
  check(queda === 0, `la prueba se lleva su ficha (${queda})`);

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  RENOMBRADO BENEFICIARIOS OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
