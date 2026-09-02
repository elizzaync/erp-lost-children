// Qué funciona y qué no en Registro de Asistencia.
//
// Se comprueban las cuatro cosas que se pidieron: las tarjetas de resumen,
// el buscador (que FILTRE, no que esté), las flechas de día y el botón de
// reporte (que pida el PDF con el día y el filtro puestos).
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9509","--user-data-dir="+path.join(SP,"edge-asis"),
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

const filas = `(()=>{const m=document.querySelector('main'); if(!m) return -1;
  return [...m.querySelectorAll('div')]
    .filter(d=>/^1px solid/.test(getComputedStyle(d).borderBottom||'')
             && d.getBoundingClientRect().height>28).length;})()`;

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9509/json/list").then(r=>r.json());
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
  await ev(`(()=>{window.__abiertas=[]; window.open=(u)=>{window.__abiertas.push(u); return null;}; return true;})()`);

  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Registro de Asistencia');
    if(!b) throw new Error('no está en el menú'); b.click();})()`);
  await dormir(2600);
  await foto("asistencia-estado.png");

  console.log("1. Las cuatro tarjetas de resumen");
  const tarjetas = await ev(`(()=>{const m=document.querySelector('main');
    const t=(m?m.innerText:'');
    return ['TOTAL PERSONAL','AL DÍA','SIN MARCAR','SIN ENROLAR'].filter(x=>t.indexOf(x)>=0);})()`);
  console.log("   " + JSON.stringify(tarjetas));
  check(tarjetas.length === 4, "están las cuatro (" + tarjetas.length + ")");

  console.log("\n2. El buscador filtra");
  const antes = await ev(filas);
  const puesto = await ev(`(()=>{
    const i=[...document.querySelectorAll('main input[type=text]')]
      .find(x=>/buscar/i.test(x.placeholder||''));
    if(!i) return 'sin buscador';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')
      .set.call(i, 'Mariela');
    i.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);
  check(puesto === "ok", "hay buscador (" + puesto + ")");
  await dormir(1300);
  const despues = await ev(filas);
  console.log("   filas: " + antes + " → " + despues);
  check(despues < antes && despues > 0,
        "recorta la tabla (" + antes + " → " + despues + ")");

  console.log("\n3. Las flechas cambian de día");
  await ev(`(()=>{const i=[...document.querySelectorAll('main input[type=text]')]
    .find(x=>/buscar/i.test(x.placeholder||''));
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,'');
    i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await dormir(900);
  const dia1 = await ev(`(document.querySelector('main input[type=date]')||{}).value||''`);
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>(x.getAttribute('title')||'')==='Día anterior'); if(!b) throw new Error('sin flecha'); b.click();})()`);
  await dormir(2200);
  const dia2 = await ev(`(document.querySelector('main input[type=date]')||{}).value||''`);
  console.log("   " + dia1 + " → " + dia2);
  check(dia1 && dia2 && dia1 !== dia2, "la flecha retrocede un día");

  console.log("\n4. El botón de reporte pide el PDF del día");
  const pulso = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Reporte del d/i.test(x.innerText||''));
    if(!b) return 'sin botón'; b.click(); return 'ok';})()`);
  check(pulso === "ok", "está el botón (" + pulso + ")");
  await dormir(1400);
  const url = await ev(`(window.__abiertas||[])[(window.__abiertas||[]).length-1] || ''`);
  console.log("   " + url);
  check(/\/api\/reportes\/asistencia\.pdf/.test(url), "pide el reporte de asistencia");
  check(/fecha=/.test(url), "con el día que se está viendo");
  if (url) {
    const r = await ev(`fetch(${JSON.stringify("")} + (window.__abiertas||[]).slice(-1)[0])
      .then(async x=>({estado:x.status, tipo:x.headers.get('Content-Type'),
                       tam:(await x.arrayBuffer()).byteLength}))`);
    console.log("   " + JSON.stringify(r));
    check(r.estado === 200 && (r.tipo||"").indexOf("pdf") >= 0,
          "y el servidor devuelve un PDF");
  }

  console.log("\n5. ¿Hay gráficos en Asistencia?");
  const graficos = await ev(`(()=>{const m=document.querySelector('main');
    const t=(m?m.innerText:'');
    return /gr[áa]fic|por d[íi]a|tendencia|semana/i.test(t);})()`);
  check(graficos, "hay algún gráfico (pedido y NO construido todavía)");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "ASISTENCIA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
