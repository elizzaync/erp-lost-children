// Retirar el rostro, y que RRHH lo vea.
//
// El aviso que se acepta promete «puedes retirar este permiso cuando
// quieras». Esto comprueba que esa promesa se puede cumplir desde la
// pantalla, que el dato se borra de verdad, y que la lista de RRHH refleja
// el antes y el después.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9528","--user-data-dir="+path.join(SP,"edge-retirar"),
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
const foto=async n=>{const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,n),Buffer.from(s.data,"base64"));};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};
const { ayudas, limpiar } = require("./ayuda_marcar.js");

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9528/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable");
  await enviar("Browser.grantPermissions", {origin: BASE,
    permissions: ["geolocation","videoCapture"]}).catch(()=>{});
  await enviar("Emulation.setGeolocationOverride",
    {latitude:-11.9391, longitude:-77.0619, accuracy:9});
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
      return window.__fo(u,o);};})()`);
  const menu = async (rotulo) => {
    await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
      .find(x=>/${rotulo}/.test(x.innerText||'')); if(b) b.click();})()`);
    await dormir(2600);
  };

  console.log("   " + await limpiar(ev, dormir));
  console.log("1. Antes: no hay rostro registrado");
  /* Esto se miraba en un bloque de Gestión Biométrica que dividía al equipo
     en «ya pueden marcar» y «falta que lo registren». Se retiró el
     31/08/2026: marcar en el terminal o por el celular es una elección, no
     un trámite pendiente, y la lista lo presentaba como una falta. El
     estado de partida se comprueba donde vive, en la API. */
  const antesApi = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>JSON.stringify({rostro:!!d.rostro, consintio:!!d.consintio}))`);
  console.log("   " + antesApi);
  check(JSON.parse(antesApi).rostro === false, "se parte sin rostro registrado");

  console.log("\n2. Se registra el rostro");
  await menu("Marcar asistencia");
  const A = ayudas(ev, dormir);
  check(await A.enrolar(), "el rostro queda registrado");
  const conRostro = await ev(`(document.querySelector('main')||{}).innerText||''`);
  check(/Tu rostro está registrado/.test(conRostro), "la pantalla lo dice");
  check(/Retirar mi rostro/.test(conRostro), "y ofrece retirarlo");
  check(/Rehacer la foto/.test(conRostro), "y rehacerlo");

  console.log("\n3. Queda registrado de verdad");
  /* Se comprobaba mirando la columna «Ya pueden marcar». Esa columna ya no
     existe; lo que importa —que el rostro quedó guardado— se pregunta. */
  const medioApi = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>JSON.stringify({rostro:!!d.rostro, consintio:!!d.consintio}))`);
  console.log("   " + medioApi);
  check(JSON.parse(medioApi).rostro === true, "el rostro quedó guardado");
  check(JSON.parse(medioApi).consintio === true, "y el permiso, aceptado");

  console.log("\n4. Se retira, con su confirmación");
  await menu("Marcar asistencia");
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Retirar mi rostro/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(1200);
  const dialogo = await ev(`document.body.innerText`);
  check(/Qué pasa si lo retiras/i.test(dialogo), "avisa de lo que implica");
  check(/Dejas de poder marcar desde el celular/i.test(dialogo), "que deja de marcar por el celular");
  check(/Sigues marcando en el terminal/i.test(dialogo), "y que el terminal sigue igual");
  await foto("retirar-rostro.png");
  await ev(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>/Sí, retirar mi rostro/.test(x.innerText||''));
    if(b.length) b[b.length-1].click();})()`);
  await dormir(3500);
  const borrado = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>JSON.stringify({rostro:!!d.rostro, consintio:!!d.consintio}))`);
  console.log("   " + borrado);
  const b = JSON.parse(borrado);
  check(b.rostro === false, "el rostro se borró");
  check(b.consintio === false, "y el permiso quedó retirado");
  const luego = await ev(`(document.querySelector('main')||{}).innerText||''`);
  check(/Registrar mi rostro/.test(luego), "el botón vuelve a pedir registrarlo");

  console.log("\n5. Y ya no se puede marcar");
  const intento = await ev(`fetch('/api/asistencia/marcar',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({lat:-11.9391, lon:-77.0619, precision:9})})
    .then(async r=>{const j=await r.json(); return JSON.stringify({e:r.status,m:j.motivo});})`);
  console.log("   " + intento);
  check(JSON.parse(intento).m === "sin_rostro", "el servidor lo rechaza");

  console.log("\n6. Gestión Biométrica sigue en pie sin el bloque");
  /* Ya no hay columna a la que volver. Lo que sí tiene que seguir siendo
     cierto es que la pantalla entra y enseña lo del terminal: al retirar el
     bloque era fácil llevarse por delante lo de al lado. */
  await menu("Gestión Biométrica");
  const fin = await ev(`(document.querySelector('main')||{}).innerText||''`);
  check(!/Falta que lo registren/i.test(fin), "el bloque retirado no volvió");
  check(/Personas enroladas/i.test(fin), "y la lista del terminal sigue ahí");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "RETIRAR EL ROSTRO OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
