// Una entrada y una salida al día. Ni una más.
//
// Se comprueba por los DOS caminos: el botón de la pantalla (que debe
// desaparecer) y el endpoint a pelo (que es el que de verdad decide).
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9521","--user-data-dir="+path.join(SP,"edge-tope"),
  "--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",
  "--use-file-for-fake-video-capture=" + path.join(SP,"caras","rostroA.y4m"),
  "--window-size=1500,1100", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

/* El recorrido del diálogo vive en ayuda_marcar.js. */
const { ayudas, limpiar } = require("./ayuda_marcar.js");
let marcarDeVerdad, enrolarRostro;
const cuantas = () => ev(`fetch('/api/asistencia/mias').then(r=>r.json())
  .then(d=>(d.marcas||[]).length)`);
const atrasar = () => require("child_process")
  .execFileSync("py", [path.join(SP, "retrasa_marca.py")], { encoding: "utf8" }).trim();

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9521/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable");
  await enviar("Browser.grantPermissions", {origin: BASE,
    permissions: ["geolocation", "videoCapture"]}).catch(()=>{});
  await enviar("Emulation.setGeolocationOverride",
    {latitude: -11.9391, longitude: -77.0619, accuracy: 9});
  await dormir(2500);
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
      return window.__fo(u,o);};
    return "ok";})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Marcar asistencia/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2600);

  console.log("   " + await limpiar(ev, dormir));
  const A = ayudas(ev, dormir);
  enrolarRostro = A.enrolar;
  marcarDeVerdad = async () => (await A.marcar()).dialogo;
  check(await enrolarRostro(), "se registra el rostro de referencia");

  console.log("1. Entrada y salida entran");
  check(await marcarDeVerdad(), "la entrada entra");
  console.log("   " + atrasar());
  check(await marcarDeVerdad(), "la salida entra");
  const dos = await cuantas();
  console.log("   marcas del día: " + dos);
  check(dos === 2, "quedan exactamente 2 (" + dos + ")");

  console.log("\n2. La pantalla retira el botón y dice por qué");
  const pantalla = await ev(`(document.querySelector('main')||{}).innerText||''`);
  const hayBoton = await ev(`[...document.querySelectorAll('main button')]
    .some(x=>/Marcar (entrada|salida)/.test(x.innerText||''))`);
  check(!hayBoton, "ya no hay botón de marcar");
  check(/Ya marcaste tu entrada y tu salida/.test(pantalla),
        "y explica que el día ya está completo");

  console.log("\n3. El servidor rechaza la tercera aunque se salte la pantalla");
  const directo = await ev(`fetch('/api/asistencia/marcar',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({lat:-11.9391, lon:-77.0619, precision:9})})
    .then(async r=>{const j=await r.json();
      return JSON.stringify({estado:r.status, motivo:j.motivo, error:j.error});})`);
  console.log("   " + directo);
  const d = JSON.parse(directo);
  check(d.estado === 409 && d.motivo === "completo", "responde 409 · completo");
  check(/entrada \(\d\d:\d\d/.test(d.error || "") && /salida \(\d\d:\d\d/.test(d.error || ""),
        "y dice a qué hora fueron");
  const tres = await cuantas();
  check(tres === 2, "y no se guardó ninguna tercera (" + tres + ")");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "TOPE DE DOS MARCAS OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
