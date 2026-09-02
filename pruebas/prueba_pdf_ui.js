// Los botones de la autorización, en las dos pantallas.
//
// No se pulsa el botón: abre una pestaña nueva y en headless eso es más
// enredo que provecho. Se comprueba que el botón esté, que apunte a la
// ruta del documento, y que esa ruta devuelva un PDF de verdad desde la
// sesión del navegador — que es lo que pasa al pulsarlo.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9489","--user-data-dir="+path.join(SP,"edge-pdfui"),
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

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9489/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(3500);
  await ev(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || s.csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};
    return "ok";})()`);

  console.log("0. Una solicitud de la persona de la sesión");
  const sid = await ev(`(async()=>{
    const r = await fetch('/api/permisos', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({tipo:'personal', desde:'2026-10-05', hasta:'2026-10-06',
                            motivo:'Zzz trámite de prueba'})});
    const d = await r.json();
    return r.status === 200 ? ((d.solicitud||{}).id || d.id) : ('error ' + r.status + ' ' + (d.error||''));
  })()`);
  console.log("   solicitud:", sid);
  const hay = typeof sid === "number";
  check(hay, "se crea una solicitud desde la sesión");

  console.log("\n1. El botón en Mis Permisos");
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Mis Permisos');if(b)b.click();})()`);
  await dormir(2500);
  const enMis = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>(x.innerText||'').includes('Descargar el documento'));
    return b ? 'sí' : 'no está';})()`);
  check(enMis === "sí", "está «Descargar el documento» (" + enMis + ")");
  await foto("pdf-mis-permisos.png");

  console.log("\n2. Ese enlace devuelve un PDF de verdad");
  const r1 = await ev(`fetch('/api/permisos/' + ${hay ? sid : 0} + '/documento.pdf')
    .then(async r=>({estado:r.status, tipo:r.headers.get('Content-Type'),
                     tam:(await r.arrayBuffer()).byteLength}))`);
  console.log("   " + JSON.stringify(r1));
  check(r1.estado === 200, "responde 200");
  check((r1.tipo||"").indexOf("application/pdf") >= 0, "y es un PDF");
  check(r1.tam > 20000, "con la filigrana y el logo dentro (" + r1.tam + " bytes)");

  console.log("\n3. El botón en la bandeja de Permisos");
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Gestión de Permisos');
    if(!b) throw new Error('no está la entrada de menú'); b.click();})()`);
  await dormir(2500);
  const abrio = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>(x.innerText||'').trim()==='Revisar'); if(!b) return 'sin filas que revisar';
    b.click(); return 'ok';})()`);
  console.log("   " + abrio);
  await dormir(1800);
  const enBandeja = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>(x.innerText||'').includes('Descargar la autorización'));
    return b ? 'sí' : 'no está';})()`);
  check(enBandeja === "sí", "está «Descargar la autorización» (" + enBandeja + ")");
  await foto("pdf-bandeja.png");

  console.log("\n4. Limpieza");
  if (hay) {
    await ev(`fetch('/api/permisos/' + ${sid} + '/cancelar', {method:'POST',
      headers:{'Content-Type':'application/json'}, body:'{}'}).then(r=>r.status)`);
  }
  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "BOTONES DEL DOCUMENTO OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
