// Flujo completo: Dashboard → "Documentos por vencer" → vista consolidada
// dentro de Ficha de vida, ya filtrada, y de ahí a la ficha.
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
  "--remote-debugging-port=9355","--user-data-dir="+path.join(SP,"edge-cons"),
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

const filas = () => evaluar(`[...document.querySelectorAll('div[style*="grid-template-columns"]')]
  .filter(d=>d.querySelector('i.ph-arrow-square-out'))
  .map(d=>d.innerText.replace(/\\s+/g,' ').trim())`);
const chipActivo = () => evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
  .filter(x=>/^(Todos|Vencidos|Por vencer|Vigentes)/.test(x.innerText.trim()))
  .filter(x=>Number(getComputedStyle(x).fontWeight)>=600);
  return b.length? b[0].innerText.trim().split(String.fromCharCode(10))[0] : null;})()`);

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9355/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText.toLowerCase(); true;`);
  await entrar();

  console.log("\n1. Dashboard → Documentos por vencer");
  const avisoDoc = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Documentos por vencer'));
    return b? b.innerText.replace(/\\s+/g,' ').trim() : null;})()`);
  console.log("   " + avisoDoc);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Documentos por vencer')); if(b)b.click();})()`);
  await dormir(1800);

  const txt = await evaluar(`__texto()`);
  check(/documentos de todo el personal/i.test(txt), "aterriza en la vista consolidada de Documentos");
  check(/ficha de vida/i.test(txt), "dentro de Ficha de vida");
  check(!/ficha del colaborador/i.test(txt), "NO abre la ficha de una persona");
  console.log("   filtro activo: " + await chipActivo());
  check(await chipActivo() === "Por vencer", "llega con el filtro 'Por vencer' aplicado");

  const f1 = await filas();
  console.log("   filas: " + JSON.stringify(f1));
  check(f1.length >= 1, "lista al menos un documento");
  check(f1.every(x=>/POR VENCER/i.test(x)), "solo muestra los que tocan");
  const s1=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"consolidada-docs.png"),Buffer.from(s1.data,"base64"));

  console.log("\n2. Quitar el filtro ordena por urgencia");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Todos/.test(x.innerText.trim())); if(b)b.click();})()`);
  await dormir(900);
  const f2 = await filas();
  console.log("   " + f2.map(x=>x.match(/VENCIDO|POR VENCER|VIGENTE/i)||"").join(" > "));
  check(/VENCIDO/i.test(f2[0]||""), "el vencido sale primero");

  console.log("\n3. Cada fila lleva a la ficha de esa persona");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.querySelector('i.ph-arrow-square-out'))[0]; if(b)b.click();})()`);
  await dormir(1700);
  const t3 = await evaluar(`__texto()`);
  check(/ficha del colaborador/i.test(t3), "abre la ficha");
  const secActiva = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>/^(Datos|Documentos|Contratos)/.test(x.innerText.trim()))
    .filter(x=>Number(getComputedStyle(x).fontWeight)>=600);
    return b.length? b[0].innerText.trim().split(String.fromCharCode(10))[0] : null;})()`);
  check(secActiva === "Documentos", "y en su pestaña Documentos");

  console.log("\n4. Dashboard → Contratos por renovar");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Dashboard'); if(b)b.click();})()`);
  await dormir(1400);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Contratos por renovar')); if(b)b.click();})()`);
  await dormir(1800);
  const t4 = await evaluar(`__texto()`);
  check(/contratos de todo el personal/i.test(t4), "aterriza en la vista consolidada de Contratos");
  check(await chipActivo() === "Por vencer", "también con el filtro aplicado");
  const f4 = await filas();
  console.log("   filas: " + JSON.stringify(f4));
  check(f4.length >= 1 && /contrato/i.test(f4[0]), "muestra contratos, no documentos");
  const s2=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"consolidada-contratos.png"),Buffer.from(s2.data,"base64"));

  console.log("\n5. Las dos pestañas están separadas en el módulo");
  const tabs = await evaluar(`[...document.querySelectorAll('button')]
    .map(x=>x.innerText.trim().split(String.fromCharCode(10))[0])
    .filter(x=>['Directorio','Organigrama','Documentos','Contratos','Beneficiarios'].includes(x))`);
  console.log("   pestañas: " + JSON.stringify(tabs));
  check(tabs.includes("Documentos") && tabs.includes("Contratos"), "hay pestaña de cada una");
  const combinada = await evaluar(`[...document.querySelectorAll('button')]
    .some(x=>/^Documentos y contratos/.test(x.innerText.trim()))`);
  check(!combinada, "ya no existe la pestaña combinada");

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  VISTA CONSOLIDADA OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
