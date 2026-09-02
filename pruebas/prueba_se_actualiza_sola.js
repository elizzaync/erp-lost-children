// La pantalla se entera sola, sin que nadie recargue.
//
// Se deja Registro de Asistencia abierto y quieto, se mete una marca POR
// DETRÁS —como haría el terminal al sincronizar, o el celular de otra
// persona— y se comprueba que la fila aparece sin tocar nada.
//
// Es la única forma de comprobarlo: mirar el código solo dice que hay un
// setInterval, no que la fila llegue a la pantalla.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9557","--user-data-dir="+path.join(SP,"edge-vigila"),
  "--window-size=1400,1000", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){const d=r.exceptionDetails;const x=d.exception||{};
    throw new Error([d.text,x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

/* La marca se mete por FUERA del navegador, con python contra la copia:
   así se parece a lo que pasa de verdad —el terminal sincroniza, u otra
   persona ficha desde su teléfono— y no a un clic en esta misma página. */
const marcarPorDetras = () => require("child_process")
  .execFileSync("py", [path.join(SP, "mete_marca_suelta.py")], { encoding: "utf8" }).trim();

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9557/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2000);

  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(4000);

  console.log("1. La puerta de novedades existe y es barata");
  const nov = await ev(`fetch('/api/novedades').then(r=>r.json())
    .then(d=>JSON.stringify(d))`);
  console.log("   " + nov);
  check(/"sello"/.test(nov), "devuelve un sello");
  check(nov.length < 200, `y pesa poco (${nov.length} caracteres)`);

  console.log("\n2. Con la pantalla abierta y quieta");
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Registro de Asistencia/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(3000);
  console.log("   document.hidden = " + await ev(`String(document.hidden) + " · " + document.visibilityState`));
  // Se cuenta cuántas veces la página pide /api/novedades por su cuenta.
  await ev(`(()=>{window.__nov=0; const f=window.fetch;
    window.fetch=(u,o)=>{ if(String(u).indexOf('/api/novedades')>=0) window.__nov++; return f(u,o); };
    return true;})()`);
  const antes = await ev(`(document.querySelector('main')||{}).innerText||''`);
  const filasAntes = (antes.match(/Zzz Vigilancia/g) || []).length;
  console.log("   filas de la persona nueva, antes: " + filasAntes);
  check(filasAntes === 0, "todavía no está en la pantalla");

  console.log("\n3. Entra una marca por detrás y NADIE recarga");
  console.log("   " + marcarPorDetras());
  /* Se espera algo más que el intervalo del sondeo. Si hiciera falta
     recargar, esto seguiría sin verse por muchos segundos que pasaran. */
  await dormir(17000);
  const despues = await ev(`(document.querySelector('main')||{}).innerText||''`);
  const filasDespues = (despues.match(/Zzz Vigilancia/g) || []).length;
  console.log("   filas de la persona nueva, después: " + filasDespues);
  check(filasDespues > 0, "la marca aparece sola, sin recargar la página");

  console.log("   veces que preguntó por novedades: " + await ev(`window.__nov`));
  const recargas = await ev(`performance.getEntriesByType('navigation').length`);
  console.log("   navegaciones de la página: " + recargas);

  console.log(fallos.length ? `\n  ${fallos.length} FALLOS` : "\n  SE ACTUALIZA SOLA OK");
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.error("ERROR:", e.message); edge.kill(); process.exit(1);});
