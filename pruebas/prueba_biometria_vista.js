// Gestión Biométrica: que se vea bien y que el buscador filtre.
//
// Se comprueba con gente YA enrolada, que es el caso de su base: si se
// prueba con cero, la mitad de la pantalla no se ejercita.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9517","--user-data-dir="+path.join(SP,"edge-bio"),
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

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9517/json/list").then(r=>r.json());
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

  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Gestión Biométrica/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2600);

  console.log("1. La pantalla usa el ancho, no una columna estrecha");
  const anchos = await ev(`(()=>{const m=document.querySelector('main');
    const hijos=[...m.querySelectorAll('div')]
      .filter(d=>{const r=d.getBoundingClientRect(); return r.width>300 && r.height>120;})
      .map(d=>Math.round(d.getBoundingClientRect().width));
    return JSON.stringify({main: Math.round(m.getBoundingClientRect().width),
                           mayor: Math.max.apply(null, anchos0(hijos))});
    function anchos0(a){return a.length?a:[0];}})()`);
  console.log("   " + anchos);
  const a = JSON.parse(anchos);
  check(a.mayor > a.main * 0.55, "algún bloque pasa del 55 % del ancho (" + a.mayor + " de " + a.main + ")");

  console.log("\n2. No hay un scroll dentro de otro");
  const cajones = await ev(`(()=>{const m=document.querySelector('main');
    return [...m.querySelectorAll('div')]
      .filter(d=>{const o=getComputedStyle(d);
        return (o.overflowY==='auto'||o.overflowY==='scroll') && d.scrollHeight > d.clientHeight + 8;})
      .length;})()`);
  console.log("   cajones con scroll propio: " + cajones);
  check(cajones === 0, "la lista fluye con la página");

  console.log("\n3. El buscador filtra");
  const antes = await ev(`(()=>{const m=document.querySelector('main');
    return [...m.querySelectorAll('button')].filter(b=>/Rostro$/.test((b.innerText||'').trim())).length;})()`);
  const puesto = await ev(`(()=>{
    const i=[...document.querySelectorAll('main input[type=text]')]
      .find(x=>/enrolar/i.test(x.placeholder||''));
    if(!i) return 'sin buscador';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')
      .set.call(i, 'Mariela');
    i.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);
  check(puesto === "ok", "está el buscador (" + puesto + ")");
  await dormir(1300);
  const despues = await ev(`(()=>{const m=document.querySelector('main');
    return [...m.querySelectorAll('button')].filter(b=>/Rostro$/.test((b.innerText||'').trim())).length;})()`);
  console.log("   personas en la cola: " + antes + " → " + despues);
  check(despues < antes && despues > 0, "recorta la cola (" + antes + " → " + despues + ")");
  await foto("biometria-nueva.png");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "BIOMÉTRICA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
