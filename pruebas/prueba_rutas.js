// Recargar ya no te devuelve al Dashboard.
//
// Es la molestia concreta que se quiso arreglar: estabas en Beneficiarios,
// pulsabas F5 y aparecías en otro sitio. Se comprueba con recargas de
// verdad, no mirando el estado interno.
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
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await __recargar({});
  await new Promise(r => setTimeout(r, 3000));
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9475","--user-data-dir="+path.join(SP,"edge-rutas"),
  "--window-size=1440,1100", BASE + "/"], { stdio:"ignore" });
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

/* La dirección va en la RUTA, sin almohadilla, desde el 25/08. Esta suite
   seguía mirando el hash y por eso fallaba entera aunque las pantallas
   estuvieran bien. Los enlaces con # siguen valiendo una vez, y eso se
   comprueba más abajo. */
const hash = () => ev(`String(window.location.pathname || "(vacío)")`);
const titulo = () => ev(`(()=>{const h=document.querySelector('main h1, main h2');
  return h ? h.innerText.trim() : (document.querySelector('main')||document.body).innerText.slice(0,40);})()`);

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9475/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);
  await entrar();

  const irA = t => ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>new RegExp(${JSON.stringify(t)},'i').test(x.innerText||''));if(!b)return false;b.click();return true;})()`);

  console.log("1. Navegar escribe la dirección");
  await irA("Beneficiarios"); await dormir(1800);
  let h = await hash();
  console.log("   tras ir a Beneficiarios: " + h);
  check(h === "/beneficiarios", "la barra dice /beneficiarios");

  console.log("\n2. Recargar deja donde estaba — la molestia original");
  await enviar("Page.reload", {}); await dormir(3800);
  h = await hash();
  const t2 = await titulo();
  console.log("   tras recargar: " + h + " · pantalla: " + t2);
  check(h === "/beneficiarios", "la dirección se conserva");
  check(/Beneficiario/i.test(t2), `y la pantalla es la misma (${t2})`);
  await foto("rutas-recarga.png");

  console.log("\n3. Otro módulo, misma prueba");
  await irA("Responsables"); await dormir(1800);
  check(await hash() === "/responsables", "la barra dice /responsables");
  await enviar("Page.reload", {}); await dormir(3800);
  const t3 = await titulo();
  console.log("   tras recargar: " + (await hash()) + " · pantalla: " + t3);
  check(/Responsable/i.test(t3), `sigue en Responsables (${t3})`);

  console.log("\n4. El botón «atrás» del navegador");
  await ev(`window.history.back()`); await dormir(2200);
  const h4 = await hash();
  console.log("   tras atrás: " + h4);
  check(h4 === "/beneficiarios", "vuelve a la pantalla anterior");

  console.log("\n5. Una dirección escrita a mano");
  await ev(`window.location.hash = "#/biometria"`); await dormir(2200);
  const t5 = await titulo();
  console.log("   #/biometria · pantalla: " + t5);
  check(/Biom/i.test(t5), `lleva a Gestión Biométrica (${t5})`);

  console.log("\n6. Una dirección que no existe no rompe nada");
  const antes6 = await titulo();
  await ev(`window.location.hash = "#/inventada-que-no-existe"`); await dormir(2000);
  const t6 = await titulo();
  console.log("   pantalla: " + t6);
  check(t6 === antes6, "se queda donde estaba, sin pantalla en blanco");

  console.log("\n7. Al salir de la sesión no queda rastro de la pantalla");
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Cerrar sesión|Salir/i.test(x.title||x.innerText||''));if(b)b.click();})()`);
  await dormir(2500);
  const enLogin = await ev(`(document.body.innerText||'').slice(0,300)`);
  console.log("   ¿está en la pantalla de entrada?", /Entrar|Usuario|Contraseña/i.test(enLogin));

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "DIRECCIONES OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
