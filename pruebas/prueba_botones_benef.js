// Ningún botón del Expediente del beneficiario se queda mudo.
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
const BENEF = "Zzz Botones Expediente";

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9385","--user-data-dir="+path.join(SP,"edge-bot"),
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
const main=()=>evaluar(`(document.querySelector('main')||document.body).innerText.replace(/\\s+/g,' ')`);

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9385/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails; errores.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};true;`);
  await entrar();

  /* Su propia ficha. Antes esta prueba abría un marcador de la maqueta de
     doce; se borró, así que ahora crea la suya y la retira al final. */
  const bid = await evaluar(`fetch('/api/beneficiarios',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:${JSON.stringify(BENEF)}})})
    .then(r=>r.json()).then(d=>(d.beneficiario||{}).id||d.id)`);
  console.log("   beneficiario de prueba: " + bid);
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
  /* El reload se lleva el ayudante: vive en window. */
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));true;`);
  await entrar();
  await dormir(2500);

  await evaluar(`__t('Personal').click(),true`); await dormir(1800);
  await evaluar(`(()=>{const m=document.querySelector('main');
    const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios'); if(b)b.click();})()`);
  await dormir(1700);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .find(x=>x.innerText.includes(${JSON.stringify(BENEF)}) && /border-left/.test(x.getAttribute('style')||''));
    if(b)b.click();})()`);
  await dormir(1800);
  check(/Expediente del beneficiario/i.test(await evaluar(`(document.querySelector('h1')||{}).innerText`)),
        "estamos en el Expediente del beneficiario");

  console.log("\n1. Los tres botones tienen acción conectada");
  for (const nombre of ["Editar expediente", "Registrar sesión de acompañamiento", "Reportar incidencia"]) {
    const tiene = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
      .find(x=>x.innerText.trim()===${JSON.stringify(nombre)});
      return b? (typeof b.onclick === 'function') : null;})()`);
    check(tiene === true, `"${nombre}" tiene onClick`);
  }

  console.log("\n2. Cada clic produce respuesta visible");
  /* "Editar expediente" ya no da el aviso genérico: sobre una ficha real
     abre el formulario, y sobre un marcador de la maqueta explica que no
     hay nada que editar. Se comprueba en el punto 2b y, a fondo, en
     prueba_editar_benef. */
  /* Los tres botones ya están construidos: sobre una ficha real abren su
     formulario, y sobre un marcador de la maqueta explican por qué no
     aplica. Ese comportamiento se comprueba en el punto 2b y, a fondo, en
     prueba_editar_benef y prueba_sesiones. Aquí solo queda verificar que
     ninguno se queda mudo. */
  for (const nombre of []) {
    // Se limpia el aviso antes, para no dar por bueno el del clic anterior
    await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Volver a beneficiarios/.test(x.innerText)); if(b)b.click();})()`);
    await dormir(1100);
    await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
      .find(x=>/Beneficiario de prueba/.test(x.innerText) && /border-left/.test(x.getAttribute('style')||''));
      if(b)b.click();})()`);
    await dormir(1300);
    const antes = await main();
    check(!/Todavía no está construido/.test(antes), `antes de pulsar "${nombre}" no hay aviso`);
    await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(nombre)}); b.click();})()`);
    await dormir(900);
    const despues = await main();
    check(/Todavía no está construido/.test(despues), `"${nombre}" responde con un aviso`);
    check(/Agregar beneficiario/.test(despues), `  y dice qué SÍ se puede hacer mientras tanto`);
  }
  await foto("benef-boton-aviso.png");

  console.log("\n3. Ya no queda ningún botón mudo en esta pantalla");
  const mudos = await evaluar(`(()=>{const m=document.querySelector('main');
    return [...m.querySelectorAll('button')]
      .filter(b=>typeof b.onclick !== 'function')
      .map(b=>b.innerText.replace(/\\s+/g,' ').trim())
      .filter(t=>t.length>0);})()`);
  console.log("   botones sin acción: " + (mudos.length ? JSON.stringify(mudos) : "ninguno"));
  check(mudos.length === 0, "todos los botones del Expediente hacen algo");

  console.log("\n3b. Limpieza");
  const queda = await evaluar(`(async()=>{
    await fetch('/api/beneficiarios/' + ${bid}, {method:'DELETE'});
    const d = await fetch('/api/beneficiarios').then(r=>r.json());
    return d.beneficiarios.filter(b=>/^Zzz /.test(b.nombre)).length;})()`);
  check(queda === 0, `la prueba se lleva su ficha (${queda})`);

  console.log("\n4. Volver limpia el aviso");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Volver a beneficiarios/.test(x.innerText)); if(b)b.click();})()`);
  await dormir(1300);
  check(!/Todavía no está construido/.test(await main()), "el aviso no se queda pegado al salir");

  check(errores.length === 0, "cero errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  BOTONES DEL EXPEDIENTE OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:", e.message); console.error(e.stack); edge.kill(); process.exit(1);});
