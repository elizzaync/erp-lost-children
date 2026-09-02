// Los buscadores nuevos: que filtren, no que estén.
//
// Un buscador que se ve pero no recorta la lista es peor que ninguno:
// quien lo usa cree que ya no hay más resultados. Así que cada prueba
// cuenta filas antes y después de escribir.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9503","--user-data-dir="+path.join(SP,"edge-buscar"),
  "--window-size=1600,1200", BASE + "/"], { stdio:"ignore" });
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

// Escribe en el buscador visible de la pantalla.
const escribir = (texto) => `(()=>{
  const i=[...document.querySelectorAll('main input[type=text]')]
    .find(x=>/buscar/i.test(x.placeholder||''));
  if(!i) return 'sin buscador';
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')
    .set.call(i, ${JSON.stringify(texto)});
  i.dispatchEvent(new Event('input',{bubbles:true}));
  return 'ok';})()`;

// Cuenta filas de la lista principal: los bloques con borde inferior.
const filas = `(()=>{const m=document.querySelector('main');
  if(!m) return -1;
  return [...m.querySelectorAll('div')]
    .filter(d=>/^1px solid/.test(getComputedStyle(d).borderBottom||'')
             && d.getBoundingClientRect().height>28).length;})()`;

const irA = async (menu) => {
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(menu)});
    if(!b) throw new Error('no está ' + ${JSON.stringify(menu)}); b.click();})()`);
  await dormir(2300);
};

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9503/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3000);
  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(4000);

  console.log("1. El título de Respuestas del formulario");
  await irA("Respuestas del formulario");
  const titulo = await ev(`(document.querySelector('main h1')||{}).innerText||'—'`);
  console.log("   «" + titulo + "»");
  check(!/Dashboard/.test(titulo), "ya no se llama «Dashboard General»");
  check(/Respuestas/.test(titulo), "se llama por su nombre");
  check((await ev(escribir("zzz"))) === "ok", "y tiene buscador");

  console.log("\n2. Hoja de Vida: el buscador recorta el Directorio");
  await irA("Personal");
  const antes = await ev(filas);
  console.log("   filas sin filtrar: " + antes);
  check(antes > 3, "hay filas que filtrar (" + antes + ")");
  check((await ev(escribir("Mariela"))) === "ok", "está el buscador");
  await dormir(1200);
  const despues = await ev(filas);
  console.log("   filas con «Mariela»: " + despues);
  check(despues < antes, "la lista se recorta de verdad (" + antes + " → " + despues + ")");
  check(despues > 0, "y encuentra a alguien");
  const texto = await ev(`(document.querySelector('main')||{}).innerText||''`);
  check(/Mariela/.test(texto), "quien queda es quien se buscó");
  await foto("buscador-personal.png");

  console.log("\n3. Algo que no existe deja la lista vacía, no entera");
  await ev(escribir("qqqzzzxxx")); await dormir(1200);
  const vacio = await ev(filas);
  console.log("   filas: " + vacio);
  check(vacio < despues, "se vacía (" + vacio + ")");

  console.log("\n4. El filtro no se hereda al cambiar de pestaña");
  await ev(escribir("Mariela")); await dormir(1000);
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Organigrama/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2000);
  const heredado = await ev(`(()=>{const i=[...document.querySelectorAll('main input[type=text]')]
    .find(x=>/buscar/i.test(x.placeholder||'')); return i ? i.value : '(sin buscador)';})()`);
  console.log("   el buscador dice: «" + heredado + "»");
  check(heredado === "", "se limpia al cambiar de pestaña");

  console.log("\n5. Beneficiarios también busca");
  await irA("Beneficiarios");
  check((await ev(escribir("zzz"))) === "ok", "tiene buscador");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "BUSCADORES OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
