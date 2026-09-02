// Listado de Planillas leyendo de la base, sin maqueta.
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
  "--remote-debugging-port=9367","--user-data-dir="+path.join(SP,"edge-pla"),
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
    try{const l=await fetch("http://127.0.0.1:9367/json/list").then(r=>r.json());
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

  console.log("\n1. La pantalla abre sin errores");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Planillas'); b.click();})()`);
  await dormir(2200);
  const txt = await main();
  check((await evaluar(`(document.querySelector('h1')||{}).innerText`)) === "Planillas", "el título es Planillas");
  check(errores.length === 0, "sin errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);

  console.log("\n2. Ya no queda nada de la maqueta");
  for (const inventado of ["61 400", "5 200", "4 576", "Agregar colaborador", "AFP, ONP y EsSalud", "20 colaboradores"]) {
    check(!txt.includes(inventado), `no aparece "${inventado}"`);
  }

  console.log("\n3. Muestra datos reales de la base");
  const api = await evaluar(`fetch('/api/planillas?periodo=2026-08').then(r=>r.json())`);
  console.log(`   API: ${api.filas.length} boletas · ${api.sin_condicion.length} sin condiciones · neto ${api.totales.neto}`);
  for (const f of api.filas) check(txt.includes(f.nombre), `lista a ${f.nombre}`);
  check(/Total del mes/.test(txt), "hay fila de totales");
  check(new RegExp(String(api.totales.personas) + " persona").test(txt), "el total dice cuántas personas");

  console.log("\n4. Sin enrolar se distingue de 0 días");
  const sinEnrolar = api.filas.filter(f => !f.enrolado).length;
  console.log(`   ${sinEnrolar} de ${api.filas.length} sin identidad biométrica`);
  if (sinEnrolar) check(/Sin enrolar/.test(txt), "dice 'Sin enrolar', no '0 días'");

  console.log("\n5. Personas sin condiciones, aparte");
  check(/personas sin condiciones laborales registradas/i.test(txt), "hay sección aparte");
  check(/No se les genera boleta/i.test(txt), "explica la consecuencia");
  await foto("planillas-lista.png");

  console.log("\n6. El período se puede cambiar");
  const opciones = await evaluar(`(()=>{const ss=[...document.querySelectorAll('select')];
    if(!ss.length) return {sinSelect:true, selects:0};
    const s=ss[0];
    return {selects:ss.length, n:s.options.length, primeras:[...s.options].slice(0,3).map(o=>o.text), valor:s.value};})()`);
  console.log("   " + JSON.stringify(opciones));
  check(!opciones.sinSelect && opciones.n >= 2 && /agosto 2026/.test(opciones.primeras[0]), "el selector ofrece meses en español");
  /* Que tenga opciones no basta: hay que comprobar que al cambiarlas pasa
     algo. El onChange estuvo roto por un identificador desalineado. */
  await evaluar(`(()=>{const s=document.querySelector('select');
    const f=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
    f.call(s, '2026-07'); s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await dormir(2200);
  const tJul = await main();
  console.log("   tras elegir julio: " + (tJul.match(/Planilla de \w+ \d{4}/)||["(sin título)"])[0]);
  check(/Planilla de julio 2026/.test(tJul), "cambiar el período recarga la planilla");
  await evaluar(`(()=>{const s=document.querySelector('select');
    const f=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
    f.call(s, '2026-08'); s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await dormir(2200);

  console.log("\n7. Cerrar el mes");
  check(!!(await evaluar(`!!__t('Cerrar el mes')`)), "hay botón de cierre");
  await evaluar(`__t('Cerrar el mes').click(),true`); await dormir(2600);
  const t2 = await main();
  check(/boleta\(s\) cerradas/i.test(t2), "confirma el cierre");
  check(/congelados/i.test(t2), "explica que los montos quedaron congelados");
  check(/CERRADO/i.test(t2), "el período figura como cerrado");
  check(!(await evaluar(`!!__t('Cerrar el mes')`)), "ya no ofrece cerrar otra vez");
  check(!!(await evaluar(`!!__t('Reabrir el mes')`)), "ahora ofrece reabrir");
  await foto("planillas-cerrada.png");

  console.log("\n8. Marcar pago y revertir");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Cerrada$/i.test(x.innerText.trim())); if(b)b.click();})()`);
  await dormir(2300);
  const t3 = await main();
  check(/pago registrado/i.test(t3), "registra el pago");
  check(/pagada/i.test(t3), "la fila pasa a Pagada");

  console.log("\n9. Reabrir con una pagada avisa, no rompe");
  await evaluar(`__t('Reabrir el mes').click(),true`); await dormir(2300);
  const t4 = await main();
  check(/ya están pagadas/i.test(t4), "avisa que hay que revertir primero");

  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Pagada$/i.test(x.innerText.trim())); if(b)b.click();})()`);
  await dormir(2300);
  check(/pago revertido/i.test(await main()), "revierte el pago");
  await evaluar(`__t('Reabrir el mes').click(),true`); await dormir(2400);
  const t5 = await main();
  check(/vuelven a calcular/i.test(t5), "reabre y avisa que recalcula");
  check(/ABIERTO/i.test(t5), "el período vuelve a abierto");
  check(/borrador/i.test(t5), "las boletas vuelven a borrador");

  console.log("\n10. Cada fila lleva a sus condiciones");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Elvis Quispe/.test(x.innerText)); if(b)b.click();})()`);
  await dormir(1900);
  const t6 = await evaluar(`(document.querySelector('main')||document.body).innerText`);
  check(/Ficha del colaborador/i.test(t6), "abre la ficha");
  check(/Condiciones laborales/i.test(t6), "en su pestaña Condiciones");

  console.log("\n11. Nada más del sistema se rompió");
  await evaluar(`__t('Personal').click(),true`); await dormir(1600);
  check((await evaluar(`(document.querySelector('h1')||{}).innerText`)) === "Hoja de Vida", "Ficha de vida OK");
  await evaluar(`__t('Registro de Asistencia').click(),true`); await dormir(1600);
  check(/Asistencia/.test(await evaluar(`(document.querySelector('h1')||{}).innerText`)), "Asistencia OK");
  await evaluar(`__t('Dashboard').click(),true`); await dormir(1600);
  check(/Dashboard/.test(await evaluar(`(document.querySelector('h1')||{}).innerText`)), "Dashboard OK");
  check(errores.length === 0, "cero errores JS en todo el recorrido");

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  PLANILLAS OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
