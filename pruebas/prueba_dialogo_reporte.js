// El diálogo de reporte: que pregunte, que marque y que genere lo pedido.
//
// Lo que puede fallar: que el botón no abra nada, que marcar una persona no
// se registre, o —lo peor— que el PDF salga con todos aunque se marcara a
// uno. Eso último se comprueba pidiendo la dirección que el diálogo arma.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9507","--user-data-dir="+path.join(SP,"edge-repdlg"),
  "--window-size=1500,1200", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[]; const abiertas=[];
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
    try{const l=await fetch("http://127.0.0.1:9507/json/list").then(r=>r.json());
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

  // window.open se sustituye para quedarnos con la dirección que arma el
  // diálogo, en vez de abrir pestañas que luego hay que cerrar.
  await ev(`(()=>{window.__abiertas=[]; window.open=(u)=>{window.__abiertas.push(u); return null;}; return true;})()`);

  console.log("1. El botón de Personal abre el diálogo, no un PDF");
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Personal'); if(b) b.click();})()`);
  await dormir(2400);
  const abrio = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Reporte de personal/i.test(x.innerText||'')); if(!b) return 'sin botón'; b.click(); return 'ok';})()`);
  check(abrio === "ok", "está el botón de reporte (" + abrio + ")");
  await dormir(1600);
  const dlg = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0); return d ? d.innerText.slice(0,80) : 'sin diálogo';})()`);
  check(/Reporte de personal/.test(dlg), "se abre el diálogo, no se descarga nada");
  check((await ev(`window.__abiertas.length`)) === 0, "y todavía no se pidió ningún PDF");
  await foto("dialogo-reporte.png");

  console.log("\n2. «Todos» con ficha completa");
  await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>/Incluir la ficha completa/.test(x.innerText||''));
    if(b) b.click();})()`);
  await dormir(700);
  await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim()==='Generar reporte');
    if(b) b.click();})()`);
  await dormir(1500);
  console.log("   diagnóstico: " + await ev(`JSON.stringify({
    hayArray: Array.isArray(window.__abiertas),
    n: (window.__abiertas||[]).length,
    open: String(window.open).slice(0,40),
    modal: !![...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0)})`));
  const url1 = await ev(`(window.__abiertas||[])[(window.__abiertas||[]).length-1] || ''`);
  console.log("   " + url1);
  check(/\/api\/reportes\/personal\.pdf/.test(url1), "pide el reporte de personal");
  check(/fichas=1/.test(url1), "y con las fichas completas");
  check(!/ids=/.test(url1), "sin limitar a nadie");

  console.log("\n3. Elegir a una sola persona");
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Reporte de personal/i.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(1500);
  await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim()==='Elegir personas');
    if(b) b.click();})()`);
  await dormir(1200);
  const cuantas = await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    return [...d.querySelectorAll('button')].filter(x=>/ph-square|ph-check-square/.test(x.innerHTML)).length;})()`);
  console.log("   personas listadas: " + cuantas);
  check(cuantas > 3, "lista a las personas para marcar (" + cuantas + ")");

  const sinMarcar = await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim()==='Generar reporte');
    b.click(); return d.innerText;})()`);
  await dormir(900);
  check(/Marca al menos una persona/.test(await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0); return d?d.innerText:'';})()`)),
    "sin marcar a nadie, avisa en vez de generar un papel vacío");

  await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].filter(x=>/ph-square/.test(x.innerHTML));
    if(b.length) b[0].click();})()`);
  await dormir(900);
  const nota = await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    return d.innerText;})()`);
  check(/1 persona marcada/.test(nota), "al marcar una, lo dice");
  check(/su ficha completa/.test(nota), "y avisa de que saldrá su ficha");

  await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim()==='Generar reporte');
    if(b) b.click();})()`);
  await dormir(1500);
  const url2 = await ev(`window.__abiertas[window.__abiertas.length-1] || ''`);
  console.log("   " + url2);
  check(/ids=\d+/.test(url2), "la dirección lleva a quién se marcó");
  check(/fichas=1/.test(url2), "y pide su ficha");

  console.log("\n4. Y ese PDF trae una sola ficha, no la lista entera");
  const r = await ev(`fetch(${JSON.stringify("")} + window.__abiertas[window.__abiertas.length-1])
    .then(async x=>({estado:x.status, tam:(await x.arrayBuffer()).byteLength}))`);
  console.log("   " + JSON.stringify(r));
  check(r.estado === 200, "el servidor lo entrega");
  const rTodos = await ev(`fetch('/api/reportes/personal.pdf?fichas=1')
    .then(async x=>({tam:(await x.arrayBuffer()).byteLength}))`);
  console.log("   uno: " + r.tam + " · todos: " + rTodos.tam);
  check(r.tam < rTodos.tam, "y pesa menos que el de todos (" + r.tam + " < " + rTodos.tam + ")");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "DIÁLOGO DE REPORTE OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
