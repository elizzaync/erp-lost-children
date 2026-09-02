// ¿Qué se rompe en un celular?
//
// La medida objetiva es el desbordamiento horizontal: si el ancho del
// contenido supera al de la ventana, hay que arrastrar la página de lado
// para leerla. Eso es lo que hace que una pantalla se sienta rota.
//
// Se mide en cada pantalla y se anota QUÉ elemento se sale, no solo que
// algo se sale: sin el culpable no se puede arreglar.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ANCHO = Number(process.env.ANCHO || 390);
const ALTO = Number(process.env.ALTO || 844);
const dormir = ms => new Promise(r => setTimeout(r, ms));
const carpeta = path.join(SP, "movil");
fs.mkdirSync(carpeta, { recursive: true });
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9515","--user-data-dir="+path.join(SP,"edge-movil"),
  "--window-size=" + ANCHO + "," + ALTO, BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const foto=async n=>{const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(carpeta,n),Buffer.from(s.data,"base64"));};

// El elemento más ancho que la ventana, sin contar los que llevan su
// propio scroll horizontal a propósito (las tablas).
const CULPABLE = `(()=>{
  const w = document.documentElement.clientWidth;
  const malos = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= w + 1 && r.right <= w + 1) return;
    // Los contenedores con scroll propio no cuentan: se arrastran solos.
    let p = el, conScroll = false;
    while (p && p !== document.body) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') { conScroll = true; break; }
      p = p.parentElement;
    }
    if (conScroll) return;
    malos.push({
      etiqueta: el.tagName.toLowerCase(),
      ancho: Math.round(r.width), derecha: Math.round(r.right),
      texto: (el.innerText || '').replace(/\\s+/g,' ').trim().slice(0, 42),
    });
  });
  return JSON.stringify({
    ventana: w,
    scroll: document.documentElement.scrollWidth,
    culpables: malos.slice(0, 4),
  });})()`;

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9515/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);
  await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  await enviar("Page.reload", {}); await dormir(4000);

  console.log("ventana: " + ANCHO + "x" + ALTO + "\n");
  const pantallas = await ev(`[...document.querySelectorAll('nav button')]
    .map(b=>b.innerText.trim().split(String.fromCharCode(10))[0]).filter(x=>x)`);

  let rotas = 0;
  for (const nombre of pantallas) {
    const fue = await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
      .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(nombre)});
      if(!b) return false; b.click(); return true;})()`);
    if (!fue) continue;
    await dormir(1600);
    const m = JSON.parse(await ev(CULPABLE));
    // Dónde acaban los botones de acción de la pantalla: si saltan de fila
    // de forma imprevisible, se nota en que sus tapas no se alinean.
    const bts = JSON.parse(await ev(`(()=>{
      const m = document.querySelector('main');
      if (!m) return '[]';
      const b = [...m.querySelectorAll('button')]
        .filter(x => { const r = x.getBoundingClientRect();
                       return r.width > 60 && r.height > 24 && r.top < 420; })
        .slice(0, 6)
        .map(x => { const r = x.getBoundingClientRect();
                    return { t: (x.innerText||'').replace(/\s+/g,' ').trim().slice(0,22),
                             y: Math.round(r.top), x: Math.round(r.left),
                             an: Math.round(r.width) }; });
      return JSON.stringify(b);})()`));
    if (bts.length) {
      const filas = [...new Set(bts.map(b => b.y))].length;
      console.log("        botones: " + bts.map(b => `«${b.t}» y=${b.y} x=${b.x} ${b.an}px`).join(" | "));
      if (filas > 2) console.log("        ! repartidos en " + filas + " alturas distintas");
    }
    const desborde = m.scroll - m.ventana;
    const mal = desborde > 2;
    if (mal) rotas++;
    console.log(`  ${mal ? "!" : " "} ${nombre.padEnd(26)} scroll ${String(m.scroll).padStart(5)}` +
      (mal ? `  (+${desborde}px)` : "") );
    if (mal && m.culpables.length) {
      m.culpables.forEach(c => console.log(
        `        ${c.etiqueta} de ${c.ancho}px hasta x=${c.derecha}  «${c.texto}»`));
    }
    await foto(nombre.replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase() + ".png");
  }
  console.log(`\n${rotas} de ${pantallas.length} pantallas se desbordan`);
  console.log("fotos en: " + carpeta);
  edge.kill(); process.exit(0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
