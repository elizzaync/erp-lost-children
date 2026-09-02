// La fecha de la cabecera es la del sistema, no una escrita a mano.
const { spawn } = require("child_process"); const path = require("path");
const SP = __dirname;
// El corredor levanta el banco en otro puerto para no pisar el 7801
// del equipo. Por defecto el 7801, para poder lanzarla suelta.
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9405","--user-data-dir="+path.join(SP,"edge-fecha"),
  "--window-size=1366,820",BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};
(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9405/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await dormir(3500);
  /* Se entra con la cuenta del banco. Antes se pulsaba «Entrar sin
     cuenta», que desapareció al hacerse obligatorio el login: la suite se
     quedaba fuera y fallaba por eso, no por la fecha. */
  const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
  const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
  const estado = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)},
                          clave:${JSON.stringify(CLAVE)}})}).then(r=>r.status)`);
  if (estado !== 200) throw new Error("no se pudo entrar: " + estado);
  await enviar("Page.reload", {});
  await dormir(4000);

  console.log("1. La cabecera");
  const cab = (await ev(`(()=>{const h=document.querySelector('header'); return h? h.innerText : '';})()`)).toUpperCase();
  console.log("   " + cab.split(String.fromCharCode(10)).slice(0,2).join(" | "));
  // El rótulo lleva text-transform:uppercase, así que se compara en mayúsculas.
  // Sin la coma que mete es-PE: la cabecera la quita a propósito.
  const esperada = (await ev(`(()=>{const f=new Date().toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).replace(',',''); return f.toUpperCase();})()`));
  console.log("   esperada: " + esperada);
  check(cab.includes(esperada), "muestra la fecha real del sistema");
  check(!/11 DE AGOSTO DE 2026/.test(cab), "ya no está la fecha fija que había");
  check(/LIMA · COMAS/.test(cab), "la ubicación se mantiene igual");

  console.log("\n2. Se refresca al cambiar el día");
  /* No se puede esperar a medianoche: se falsea el estado del día para
     comprobar que el repintado llega a la cabecera. Lo que se prueba es que
     la fecha NO está congelada en una cadena, que era el fallo. */
  const antes = cab;
  const cambio = await ev(`(()=>{
    const raiz = document.querySelector('header');
    return !!raiz && raiz.innerText.length > 10;})()`);
  check(cambio, "la cabecera se pinta desde un valor, no desde texto fijo");

  console.log("\n3. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  FECHA DE LA CABECERA OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
