// El circuito entero del reconocimiento facial.
//
//   1. Sin rostro registrado no se puede marcar.
//   2. Se registra el rostro (con su aviso de datos aceptado).
//   3. Con esa misma cara, la marca entra.
//   4. Con OTRA cara, la marca NO entra. Esta es la prueba que importa:
//      un reconocimiento que dice que sí a cualquiera no reconoce nada.
//
// La cámara falsa de Edge dibuja un comecocos verde, así que se le da un
// vídeo con una cara de verdad (ver haz_y4m.py). Las dos caras salen de
// las imágenes de demostración de la propia librería y NO se copian al
// proyecto: viven solo aquí, en el temporal.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const { limpiar } = require("./ayuda_marcar.js");
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

/* Un navegador con una cara concreta metida por la cámara. */
function abrirCon(cara, puerto, perfil) {
  return spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
    "--remote-debugging-port=" + puerto,
    "--user-data-dir=" + path.join(SP, perfil),
    "--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",
    "--use-file-for-fake-video-capture=" + path.join(SP, "caras", cara),
    "--window-size=1400,1000", BASE + "/"], { stdio:"ignore" });
}

async function conectar(puerto) {
  let t=null;
  for (let i=0;i<40&&!t;i++) { await dormir(500);
    try { const l = await fetch("http://127.0.0.1:"+puerto+"/json/list").then(r=>r.json());
      t = l.find(x=>x.type==="page" && x.url.startsWith(BASE)); } catch(e) {} }
  if (!t) throw new Error("no responde el navegador de " + puerto);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  let id=0; const pend=new Map(); const errs=[];
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.method==="Runtime.exceptionThrown") { const d=m.params.exceptionDetails;
      errs.push((d.exception&&d.exception.description)||d.text); }
    if (m.id&&pend.has(m.id)) { const{res,rej}=pend.get(m.id); pend.delete(m.id);
      m.error?rej(new Error(m.error.message)):res(m.result); } };
  const enviar = (m,p) => new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});
    ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
  const ev = async e => { const r = await enviar("Runtime.evaluate",
    {expression:e, returnByValue:true, awaitPromise:true});
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value; };
  await enviar("Runtime.enable"); await enviar("Page.enable");
  await enviar("Browser.grantPermissions", {origin: BASE,
    permissions: ["geolocation","videoCapture"]}).catch(()=>{});
  await enviar("Emulation.setGeolocationOverride",
    {latitude:-11.9391, longitude:-77.0619, accuracy:9});
  await dormir(2000);
  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(4000);
  await ev(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Marcar asistencia/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2500);
  return { ev, enviar, errs };
}

/* Pulsa el botón grande, espera al diálogo, toma la foto y aguarda a que
   el modelo diga si vio una cara. Devuelve lo que quedó escrito. */
async function hastaLaFoto(ev) {
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Marcar (entrada|salida)|Registrar mi rostro/.test(x.innerText||''));
    if(b) b.click();})()`);
  await dormir(4000);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')]
    .find(x=>/Tomar foto/.test(x.innerText||'')); if(b) b.click();})()`);
  // La primera vez el modelo son 7 MB y va por CPU: se le da tiempo.
  for (let i=0;i<30;i++) {
    await dormir(1000);
    const t = await ev(`document.body.innerText`);
    if (/Cara reconocida|no se ve una cara|No se ve ninguna cara/i.test(t)) return t;
  }
  return await ev(`document.body.innerText`);
}
/* El botón del PIE del diálogo. Se toma el último que casa: el mismo
   texto aparece también en el botón grande de la pantalla de detrás, que
   está antes en el documento; pulsar aquel reabría el diálogo. */
const confirmar = async (ev) => {
  await ev(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>/Confirmar y marcar|Registrar mi rostro/.test((x.innerText||'').trim()));
    if(b.length) b[b.length-1].click();})()`);
  await dormir(5000);
};

let A, B;
(async()=>{
  A = abrirCon("rostroA.y4m", 9526, "edge-rostroA");
  const a = await conectar(9526);

  console.log("   " + await limpiar(a.ev, dormir));
  console.log("1. Sin rostro registrado, el botón lleva a registrarlo");
  const inicio = await a.ev(`(document.querySelector('main')||{}).innerText||''`);
  check(/Registrar mi rostro/.test(inicio), "el botón dice «Registrar mi rostro»");
  check(/registrar tu rostro una vez/i.test(inicio), "y explica para qué sirve");
  const sinRostro = await a.ev(`fetch('/api/asistencia/marcar',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({lat:-11.9391, lon:-77.0619, precision:9})})
    .then(async r=>{const j=await r.json(); return JSON.stringify({e:r.status,m:j.motivo});})`);
  console.log("   " + sinRostro);
  check(JSON.parse(sinRostro).m === "sin_rostro", "y el servidor tampoco deja marcar");

  console.log("\n2. Se registra el rostro");
  const t1 = await hastaLaFoto(a.ev);
  check(/Cara reconocida/.test(t1), "el modelo ve la cara en la foto");
  check(/Aviso de tratamiento de datos/i.test(t1), "sale el aviso de datos");
  // Sin aceptar el aviso no se guarda nada.
  await confirmar(a.ev);
  const sinAceptar = await a.ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>!!d.rostro)`);
  check(sinAceptar === false, "sin aceptar el aviso, no se guarda el rostro");
  await a.ev(`(()=>{const b=[...document.querySelectorAll('button')]
    .find(x=>/He leído el aviso/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(600);
  await confirmar(a.ev);
  const guardado = await a.ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>!!d.rostro)`);
  if (guardado !== true) {
    const porQue = await a.ev(`(()=>{const m=document.body.innerText||'';
      const i=m.indexOf('Aviso de tratamiento'); return m.slice(Math.max(0,i-400), i+200);})()`);
    console.log("   ¿por qué no?  " + JSON.stringify(porQue.slice(-420)));
  }
  check(guardado === true, "aceptando el aviso, el rostro queda registrado");

  console.log("\n3. Con esa misma cara, la marca entra");
  const t3 = await hastaLaFoto(a.ev);
  check(/Cara reconocida/.test(t3), "reconoce la cara en la foto de la marca");
  await confirmar(a.ev);
  const marcas = await a.ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>(d.marcas||[]).length)`);
  console.log("   marcas: " + marcas);
  check(marcas === 1, "la marca quedó (" + marcas + ")");

  console.log("\n4. Con OTRA cara, no entra");
  B = abrirCon("rostroB.y4m", 9527, "edge-rostroB");
  const b = await conectar(9527);
  const t4 = await hastaLaFoto(b.ev);
  check(/Cara reconocida/.test(t4), "también ve una cara (es una persona, solo que otra)");
  await confirmar(b.ev);
  const dice = await b.ev(`document.body.innerText`);
  const despues = await b.ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>(d.marcas||[]).length)`);
  console.log("   marcas: " + marcas + " → " + despues);
  check(despues === marcas, "NO se guardó la marca del impostor");
  check(/No pudimos confirmar que eres tú/i.test(dice), "y se lo dice sin acusar a nadie");

  console.log("\n5. Y el servidor lo decide, no la pantalla");
  const aPelo = await b.ev(`fetch('/api/asistencia/marcar',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({lat:-11.9391, lon:-77.0619, precision:9,
      descriptor: Array.from({length:128}, (_,i)=>Math.sin(i)) })})
    .then(async r=>{const j=await r.json();
      return JSON.stringify({e:r.status, m:j.motivo, d:j.distancia});})`);
  console.log("   " + aPelo);
  const r = JSON.parse(aPelo);
  check(r.e === 401 && r.m === "no_coincide", "un descriptor inventado se rechaza");

  const graves = [...a.errs, ...b.errs].filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "RECONOCIMIENTO FACIAL OK"));
  fallos.forEach(f=>console.log("  - " + f));
  A.kill(); B.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message);
  if (A) A.kill(); if (B) B.kill(); process.exit(1)});
