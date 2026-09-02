// Direcciones sin almohadilla.
//
// Lo que puede romperse al quitar el `#` no es que la barra se vea bonita:
// es recargar estando dentro —el servidor tiene que saber responder a
// /bandeja— y el botón «atrás», que con pushState deja de avisar por
// hashchange y avisa por popstate.
//
// Y una comprobación que no es de aspecto: que el comodín del servidor NO
// se trague /api/. Si lo hiciera, un endpoint mal escrito devolvería la
// página entera y quien lo llamó creería que fue bien.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9499","--user-data-dir="+path.join(SP,"edge-rutas"),
  "--window-size=1500,1200", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};
const entrar = async () => {
  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
};
// El título de la pantalla es el h1, no la primera línea del <main>:
// esa es la cabecera con la ciudad y la fecha, que dice lo mismo en todas.
const pantalla = () => ev(`(()=>{const h=document.querySelector('main h1');
  return h ? h.innerText.trim().slice(0,40) : '(sin título)';})()`);
const barra = () => ev(`location.pathname + location.hash`);

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9499/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3000);
  await entrar();
  await enviar("Page.reload", {}); await dormir(3800);

  console.log("1. Navegar deja la dirección limpia");
  const ir = async (menu) => {
    await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
      .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(menu)});
      if(!b) throw new Error('no está ' + ${JSON.stringify(menu)}); b.click();})()`);
    await dormir(2000);
    return await barra();
  };
  const b1 = await ir("Gestión de Permisos");
  console.log("   " + b1);
  check(!/#/.test(b1), "sin almohadilla (" + b1 + ")");
  check(b1.length > 1, "y con nombre de pantalla, no solo «/»");

  console.log("\n2. Recargar estando dentro se queda dentro");
  await enviar("Page.reload", {}); await dormir(4000);
  const b2 = await barra();
  const p2 = await pantalla();
  console.log("   " + b2 + "  ·  «" + p2 + "»");
  check(b2 === b1, "la dirección aguanta la recarga");
  check(!/Dashboard/.test(p2), "y NO cae al Dashboard (" + p2 + ")");

  console.log("\n3. El botón «atrás» del navegador");
  const b3 = await ir("Mis Permisos");
  console.log("   ahora en " + b3);
  await enviar("Page.navigateToHistoryEntry", {entryId: -1}).catch(()=>{});
  await ev(`window.history.back()`);
  await dormir(2200);
  const b4 = await barra();
  const p4 = await pantalla();
  console.log("   tras «atrás»: " + b4 + "  ·  «" + p4 + "»");
  check(b4 === b1, "vuelve a la pantalla anterior (" + b4 + ")");

  console.log("\n4. El comodín no se traga las API");
  const api = await ev(`fetch('/api/no-existe-esto')
    .then(async r=>{const t=await r.text();
      return JSON.stringify({e:r.status, tipo:r.headers.get('Content-Type'), n:t.length});})`);
  const d = JSON.parse(api);
  console.log("   " + api);
  check(d.e === 404, "un endpoint inventado da 404 (" + d.e + ")");
  check((d.tipo||"").indexOf("json") >= 0, "y en JSON, no la página entera");

  console.log("\n5. Un enlace viejo con almohadilla sigue valiendo");
  await ev(`location.href = '/#/bandeja'`);
  await dormir(4000);
  const p5 = await pantalla();
  console.log("   «" + p5 + "»  ·  " + (await barra()));
  check(!/Dashboard/.test(p5), "lleva a donde decía (" + p5 + ")");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "RUTAS LIMPIAS OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
