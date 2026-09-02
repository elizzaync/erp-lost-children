// Marcar asistencia desde el celular.
//
// Lo que importa no es que el botón se pinte: es que la marca QUEDE, que
// se vea en la propia pantalla y que aparezca en Asistencia, que es donde
// la mira RRHH. Y que quien no ha entrado no pueda marcar por nadie.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
// Tamaño de celular: la pantalla se hizo para eso.
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9511","--user-data-dir="+path.join(SP,"edge-marcar"),
  "--window-size=430,900", BASE + "/"], { stdio:"ignore" });
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
    try{const l=await fetch("http://127.0.0.1:9511/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3000);

  console.log("1. Sin entrar, nadie marca");
  const sinSesion = await ev(`fetch('/api/asistencia/marcar',{method:'POST',
    headers:{'Content-Type':'application/json'}, body:'{}'}).then(r=>r.status)`);
  check(sinSesion === 401 || sinSesion === 403,
        "sin sesión responde " + sinSesion);

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

  console.log("\n2. La pantalla está en el menú");
  const fue = await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Marcar asistencia/.test(x.innerText||'')); if(!b) return false; b.click(); return true;})()`);
  check(fue, "está «Marcar asistencia» y se abre");
  await dormir(2200);
  const antes = await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>(d.marcas||[]).length)`);
  console.log("   marcas antes: " + antes);
  const pantalla = await ev(`(document.querySelector('main')||{}).innerText||''`);
  check(/Marcar (entrada|salida)/.test(pantalla), "hay un botón para marcar");
  await foto("marcar-antes.png");

  console.log("\n3. Marcar deja la marca en la base");
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Marcar (entrada|salida)/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2500);
  const despues = await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>(d.marcas||[]).length)`);
  console.log("   marcas después: " + despues);
  check(despues > antes, "la marca quedó guardada (" + antes + " → " + despues + ")");
  const conAviso = await ev(`(document.querySelector('main')||{}).innerText||''`);
  check(/Marca registrada a las \d\d:\d\d/.test(conAviso), "y la pantalla lo confirma con la hora");
  check(/Entrada|Salida/.test(conAviso), "y la lista muestra la marca");
  await foto("marcar-despues.png");

  console.log("\n4. Sale por el canal web, no como si fuera del terminal");
  const canal = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>((d.marcas||[]).slice(-1)[0]||{}).canal || '')`);
  console.log("   canal: " + canal);
  check(canal === "web", "la marca queda marcada como web");

  console.log("\n5. Y RRHH la ve en Asistencia");
  const enAsistencia = await ev(`fetch('/api/asistencia').then(r=>r.json())
    .then(d=>{const f=(d.filas||[]).filter(x=>x.entrada); return f.length;})`);
  console.log("   personas con entrada hoy: " + enAsistencia);
  check(enAsistencia > 0, "aparece en la pantalla de Asistencia");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "MARCAR ASISTENCIA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
