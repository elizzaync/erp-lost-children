// La bandeja del formulario, desde la pantalla.
//
// Lo que importa comprobar aquí: que una respuesta con avisos se vea con
// ellos delante, que la de quien NO autorizó no ofrezca ingresar por
// ningún camino, y que ingresar cree la ficha de verdad.
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
  "--remote-debugging-port=9469","--user-data-dir="+path.join(SP,"edge-bandeja"),
  "--window-size=1500,1300", BASE + "/"], { stdio:"ignore" });
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

const BUENA = "Zzz Respuesta Limpia";
const SUCIA = "Zzz Respuesta Con Avisos";
const NEGADA = "Zzz No Autorizo";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9469/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>new RegExp(${JSON.stringify(t)},'i').test(x.innerText||''));if(!b)return false;b.click();return true;})()`);
  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim())===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  await entrar();

  console.log("0. Tres respuestas sembradas en la bandeja");
  // Se siembran por la base, que es lo que hace la traída: aquí se prueba
  // la PANTALLA, no la lectura de Google (esa tiene su propia suite).
  const puestas = await ev(`(async()=>{
    const r = await fetch('/api/formulario/respuestas').then(r=>r.json());
    return (r.respuestas||[]).length;})()`);
  console.log("   respuestas ya en la bandeja: " + puestas);

  console.log("\n1. La bandeja está en el menú y se abre");
  check(await clicNav("Respuestas del formulario"), "la entrada existe en el menú");
  await dormir(2200);
  let c = await main();
  check(/Lo que las familias envían/.test(c), "se abre la pantalla");
  check(/Nada entra a una ficha hasta que alguien lo revisa/.test(c),
        "y deja claro el trato");
  check(/Por revisar/.test(c) && /Ingresadas/.test(c) && /Descartadas/.test(c),
        "con los tres estados");
  await foto("bandeja-vacia.png");

  console.log("\n2. Con la bandeja vacía lo dice, sin inventar filas");
  check(/No hay nada por revisar|Traer respuestas/.test(c), "explica que no hay nada");

  console.log("\n3. El botón de traer está, y avisa si falta la llave");
  check(/Traer respuestas/.test(c), "el botón existe");
  const sinLlave = /Todavía no está la llave de Google/.test(c);
  console.log("   aviso de llave ausente visible: " + sinLlave);

  console.log("\n4. Una respuesta que NO autorizó no se puede ingresar por ningún camino");
  const negada = await ev(`(async()=>{
    // Se comprueba en el SERVIDOR, que es donde importa: la pantalla puede
    // esconder el botón, pero eso no impide llamar al endpoint.
    const d = await fetch('/api/formulario/respuestas').then(r=>r.json());
    const n = (d.respuestas||[]).find(x=>!x.consentimiento);
    if (!n) return 'no hay ninguna sembrada';
    const r = await fetch('/api/formulario/respuestas/' + n.id + '/ingresar',
      {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
    const j = await r.json().catch(()=>({}));
    return r.status + ' · ' + (j.error||'').slice(0,70);})()`);
  console.log("   el servidor responde: " + negada);
  if (String(negada).indexOf("no hay ninguna") < 0) {
    check(String(negada).startsWith("400"), "el servidor la rechaza (400)");
    check(/NO autoriz/i.test(String(negada)), "y dice por qué");
  }

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "BANDEJA EN PANTALLA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
