// Corregir desde la pantalla, como lo haría una persona.
//
// La API ya se comprueba en prueba_corregir.py. Aquí lo que importa es
// otra cosa: que el botón exista, que el diálogo llegue con los datos
// puestos —no en blanco— y que al guardar cambie la fila y no cree otra.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9542","--user-data-dir="+path.join(SP,"edge-corr"),
  "--window-size=1500,1100", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};
const NINO = "Zzz Corregir Pantalla";

const modal = () => ev(`(()=>{const d=[...document.querySelectorAll('div')]
  .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  return d ? d.innerText.replace(/\\s+/g,' ').trim() : null;})()`);

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9542/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);
  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(4500);
  await ev(`(async()=>{
    const ss = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (ss.sesion||{}).csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};})()`);

  console.log("1. Un niño con una sesión mal escrita");
  const bid = await ev(`(async()=>{
    const b = await fetch('/api/beneficiarios',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({nombre:${JSON.stringify(NINO)}, casa:'Casa Lima'})})
      .then(r=>r.json());
    const id = b.id || (b.beneficiario||{}).id;
    await fetch('/api/beneficiarios/'+id+'/sesiones',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({fecha:'2026-08-02', tipo:'individual',
                            notas:'Prmera sesion mal escrita'})});
    return id;})()`);
  check(!!bid, "creado el niño con su sesión (id " + bid + ")");

  /* La pantalla cargó su lista al entrar, antes de que existiera este
     niño: se recarga para que lo tenga. */
  await enviar("Page.reload", {}); await dormir(4500);
  await ev(`(async()=>{
    const ss = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (ss.sesion||{}).csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Beneficiarios/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2800);
  const abrio = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>(x.innerText||'').includes(${JSON.stringify(NINO)}));
    if(!b) return false; b.click(); return true;})()`);
  if (!abrio) {
    const q = await ev(`(()=>{const m=document.querySelector('main');
      return {texto:(m.innerText||'').replace(/\s+/g,' ').slice(0,200),
              botones:[...m.querySelectorAll('button')].slice(0,12)
                .map(b=>(b.innerText||'').trim().split(String.fromCharCode(10))[0]).filter(x=>x)};})()`);
    console.log("   PANTALLA: " + q.texto);
    console.log("   BOTONES : " + JSON.stringify(q.botones));
  }
  check(abrio, "se abre su expediente");
  await dormir(2500);

  console.log("\n2. El botón «Corregir» está en la fila");
  const hayBoton = await ev(`[...document.querySelectorAll('main button')]
    .filter(x=>(x.innerText||'').trim()==='Corregir').length`);
  console.log("   botones «Corregir» en la pantalla: " + hayBoton);
  check(hayBoton > 0, "hay botones de corregir (" + hayBoton + ")");

  console.log("\n3. El diálogo llega con los datos puestos");
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .filter(x=>(x.innerText||'').trim()==='Corregir'); if(b.length) b[0].click();})()`);
  await dormir(1500);
  const m = await modal();
  console.log("   " + String(m).slice(0, 150));
  check(!!m, "se abre el diálogo");
  const conDatos = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return [];
    return [...d.querySelectorAll('input,textarea')].map(i=>i.value).filter(v=>v);})()`);
  console.log("   campos con valor: " + JSON.stringify(conDatos).slice(0, 130));
  check(conDatos.length > 0, "los campos vienen rellenos, no en blanco");
  check(String(m).includes("Guardar la corrección"),
        "el botón del pie dice «Guardar la corrección»");

  console.log("\n4. Se corrige y la fila cambia, sin duplicarse");
  const antes = await ev(`fetch('/api/beneficiarios/${bid}/acompanamiento')
    .then(r=>r.json()).then(d=>(d.sesiones||[]).length)`);
  await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const ta=[...d.querySelectorAll('textarea')][0]
          || [...d.querySelectorAll('input[type=text]')].slice(-1)[0];
    if(!ta) return;
    const proto = ta.tagName==='TEXTAREA' ? window.HTMLTextAreaElement.prototype
                                          : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(ta,'Primera sesión, ya corregida');
    ta.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await dormir(600);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>/Guardar la corrección/.test(x.innerText||''));
    if(b.length) b[b.length-1].click();})()`);
  await dormir(2800);
  const tras = await ev(`fetch('/api/beneficiarios/${bid}/acompanamiento')
    .then(r=>r.json()).then(d=>JSON.stringify({
      cuantas:(d.sesiones||[]).length,
      notas:((d.sesiones||[])[0]||{}).notas||''}))`);
  console.log("   " + tras);
  const r = JSON.parse(tras);
  check(r.cuantas === antes, "sigue habiendo una sola sesión (" + antes + " → " + r.cuantas + ")");
  check(/ya corregida/.test(r.notas), "y la nota quedó corregida");

  console.log("\n5. Limpieza");
  await ev(`fetch('/api/beneficiarios/${bid}',{method:'DELETE'})`);
  await dormir(900);
  const queda = await ev(`fetch('/api/beneficiarios').then(r=>r.json())
    .then(d=>(d.beneficiarios||[]).filter(b=>b.nombre===${JSON.stringify(NINO)}).length)`);
  check(queda === 0, "el niño de prueba se retira");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "CORREGIR DESDE LA PANTALLA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
