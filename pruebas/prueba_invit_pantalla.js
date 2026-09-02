// Los enlaces del formulario, desde la pantalla.
//
// El backend ya está probado aparte. Aquí se comprueba lo que solo falla
// en pantalla: que el enlace que se entrega lleve el token de verdad, que
// pedir uno sin decir para quién no rompa nada, y que anular se refleje.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
let __ent, __recargar;
async function entrar() {
  const st = await __ent(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar con la cuenta del banco: " + st);
  await __recargar({});
  await new Promise(r => setTimeout(r, 3000));
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
  "--remote-debugging-port=9463","--user-data-dir="+path.join(SP,"edge-invit"),
  "--window-size=1500,1200", BASE + "/"], { stdio:"ignore" });
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

const FAMILIA = "Zzz Familia De Prueba";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9463/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim())===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);
  const escribir=(rotulo,valor)=>ev(`(()=>{
    const rot=[...document.querySelectorAll('main div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && !x.querySelector('div'));
    if(!rot) return 'sin rotulo';
    const inp=rot.parentElement.querySelector('input');
    if(!inp) return 'sin input';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,${JSON.stringify(valor)});
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);

  await entrar();

  console.log("1. La sección se abre desde Responsables");
  await clicNav("Responsables / Tutores"); await dormir(2200);
  let c = await main();
  check(/Enlaces del formulario/.test(c), "el botón está a la vista");
  check(await clic("Enlaces del formulario"), "se pulsa"); await dormir(2200);
  c = await main();
  check(/Cada familia recibe un enlace propio/.test(c), "se abre y explica para qué sirve");
  check(/no entra a la base/.test(c), "y deja claro que pasa por la bandeja");
  await foto("invit-panel.png");

  console.log("\n2. Se crea un enlace para una familia sin ficha");
  console.log("   nombre:", await escribir("Cómo reconocerla", FAMILIA));
  await dormir(500);
  check(await clic("Crear enlace"), "se pulsa crear"); await dormir(2500);
  c = await main();
  check(new RegExp(FAMILIA).test(c), "aparece en la lista");
  check(/VIGENTE|vigente/i.test(c), "como vigente");
  check(/Caduca el \d{4}-\d{2}-\d{2}/.test(c), "con la fecha en que caduca");
  await foto("invit-creado.png");

  console.log("\n3. El enlace entregado lleva el token de verdad");
  const enlace = await ev(`fetch('/api/invitaciones').then(r=>r.json())
    .then(d=>(d.invitaciones||[]).find(i=>i.para===${JSON.stringify(FAMILIA)}))
    .then(i=>i ? {enlace:i.enlace, token:i.token} : null)`);
  check(!!enlace, "la invitación existe en la base");
  if (enlace) {
    console.log("   " + enlace.enlace.slice(0, 92) + "…");
    check(enlace.enlace.indexOf(enlace.token) > 0, "el enlace contiene su token");
    check(enlace.enlace.indexOf("PLANTILLA") < 0, "y no la palabra de plantilla");
    check(/entry\.\d+=/.test(enlace.enlace), "en el campo del formulario");
  }

  console.log("\n4. El campo del nombre solo se pide cuando hace falta");
  const conFicha = await ev(`(()=>{const s=document.querySelector('main select');
    if(!s) return 'sin desplegable';
    const op=[...s.options].find(o=>o.value);
    if(!op) return 'no hay responsables en la lista';
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(s, op.value);
    s.dispatchEvent(new Event('change',{bubbles:true}));
    return op.text;})()`);
  console.log("   elegida la ficha:", conFicha);
  await dormir(1200);
  c = await main();
  check(!/Cómo reconocerla/.test(c),
        "al elegir una ficha, el campo de nombre a mano desaparece");

  console.log("\n5. Anular se refleja en la pantalla");
  check(await clic("Anular"), "se pulsa anular"); await dormir(2200);
  c = await main();
  check(/ANULADA|anulada/i.test(c), "queda anulada a la vista");
  const tras = await ev(`fetch('/api/invitaciones').then(r=>r.json())
    .then(d=>(d.invitaciones||[]).find(i=>i.para===${JSON.stringify(FAMILIA)}))
    .then(i=>i ? i.situacion : null)`);
  check(tras === "anulada", `y en la base (${tras})`);
  await foto("invit-anulado.png");

  console.log("\n6. Limpieza");
  const limpio = await ev(`(async()=>{
    const d = await fetch('/api/invitaciones').then(r=>r.json());
    const mias = (d.invitaciones||[]).filter(i=>i.para===${JSON.stringify(FAMILIA)});
    return mias.length;})()`);
  console.log("   quedan " + limpio + " invitaciones de prueba en el banco (se van con la copia)");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "ENLACES EN PANTALLA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
