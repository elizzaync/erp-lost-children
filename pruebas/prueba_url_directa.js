// Escribir la dirección a mano lleva a esa pantalla.
//
// No es lo mismo que recargar estando dentro (eso lo cubre prueba_rutas):
// aquí se abre el navegador directamente en /bandeja, como quien pega un
// enlace en el chat del equipo. Eso caía al Dashboard.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9531","--user-data-dir="+path.join(SP,"edge-url"),
  "--window-size=1400,1000", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

/* Cada ruta con algo que solo salga en SU pantalla. */
const RUTAS = [
  ["bandeja",       /Bandeja|Respuestas del formulario/i],
  ["beneficiarios", /Beneficiario/i],
  ["responsables",  /Responsable/i],
  ["biometria",     /Biom[eé]trica/i],
  ["registro",      /Registro de Asistencia/i],
  ["marcar",        /Marcar asistencia/i],
  ["configuracion", /Configuraci[oó]n/i],
];

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9531/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);
  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);

  for (const [ruta, senal] of RUTAS) {
    await enviar("Page.navigate", { url: BASE + "/" + ruta });
    await dormir(4200);
    const cabecera = await ev(`(()=>{const h=document.querySelector('main h1, main h2');
      return h ? (h.innerText||'') : '';})()`);
    const barra = await ev(`window.location.pathname`);
    const texto = await ev(`(document.querySelector('main')||{}).innerText||''`);
    const bien = senal.test(cabecera) || senal.test(texto.slice(0, 400));
    console.log("   /" + ruta + "  →  barra " + barra + "  ·  «" + cabecera.slice(0, 34) + "»");
    check(bien, "/" + ruta + " abre su pantalla");
    check(barra === "/" + ruta, "/" + ruta + " conserva la dirección (" + barra + ")");
  }

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "DIRECCIONES DIRECTAS OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
