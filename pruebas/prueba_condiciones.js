// Pestaña "Condiciones" en la ficha: alta, historial y borrado.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const SP = __dirname;
// El corredor levanta el banco en otro puerto para no pisar el 7801
// del equipo. Por defecto el 7801, para poder lanzarla suelta.
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
// Desde que LOGIN_ESTRICTO está activo no existe "entrar sin
// cuenta": hay que identificarse. El banco siembra esta cuenta
// en SU copia, que se borra al terminar.
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
// Entrar es una función y no un bloque copiado: varias suites se
// identifican más de una vez (tras cada recarga), y repetir el
// bloque declaraba dos veces la misma constante.
let __ent, __recargar;
async function entrar() {
  const st = await __ent(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar con la cuenta del banco: " + st);
  await __recargar({});
  await new Promise(r => setTimeout(r, 3000));
  /* La recarga se lleva por delante los ayudantes: viven en window y la
     página se rehace entera. Antes se definían una vez al principio y
     desaparecían al identificarse, así que todo lo que venía después
     reventaba sin decir por qué. */
  await __ent(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);
  /* Los fetch crudos de las suites no llevaban el token CSRF: antes no
     hacía falta porque no había sesión, y ahora toda escritura
     identificada lo exige. Se envuelve fetch una sola vez, que es lo
     que hace la aplicación real en su ayudante api(). */
  await __ent(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || s.csrf || "";
    if (!window.__fetchOriginal) window.__fetchOriginal = window.fetch;
    window.fetch = (u, o) => {
      o = o || {};
      const m = (o.method || "GET").toUpperCase();
      if (csrf && ["POST","PUT","PATCH","DELETE"].indexOf(m) >= 0)
        o.headers = Object.assign({}, o.headers, {"X-CSRF-Token": csrf});
      return window.__fetchOriginal(u, o);
    };
    return csrf ? "ok" : "sin csrf";})()`);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9363","--user-data-dir="+path.join(SP,"edge-cond"),
  "--window-size=1440,1100",BASE + "/"], { stdio:"ignore" });

let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const evaluar=async(e)=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};
const foto=async(n)=>{const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,n),Buffer.from(s.data,"base64"));};
const modal=()=>evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  return d? d.innerText.replace(/\\s+/g,' ').trim():null;})()`);
const enModal=(tipo,valor)=>evaluar(`(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  const i=[...d.querySelectorAll('input')].filter(x=>x.type===${JSON.stringify(tipo)});
  if(!i.length) return 'no hay';
  const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  f.call(i[0], ${JSON.stringify(valor)});
  i[0].dispatchEvent(new Event('input',{bubbles:true}));
  i[0].dispatchEvent(new Event('change',{bubbles:true}));
  return 'ok';})()`);

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9363/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);
  await entrar();

  console.log("\n1. La ficha tiene la pestaña Condiciones");
  await evaluar(`__t('Personal').click(),true`); await dormir(1500);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Elvis Quispe/.test(x.innerText.trim())); if(b)b.click();})()`);
  await dormir(1700);
  const secs = await evaluar(`[...document.querySelectorAll('button')].map(b=>b.innerText.trim().split(String.fromCharCode(10))[0])
    .filter(x=>['Datos','Documentos','Contratos','Condiciones'].includes(x))`);
  console.log("   pestañas: " + JSON.stringify(secs));
  check(secs.includes("Condiciones"), "existe la pestaña Condiciones");

  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Condiciones'); if(b)b.click();})()`);
  await dormir(1300);

  console.log("\n2. Muestra la condición vigente (creada por API)");
  const cuerpo = await evaluar(`(document.querySelector('main')||document.body).innerText.replace(/\\s+/g,' ')`);
  console.log("   " + (cuerpo.match(/Condiciones laborales.{0,240}/)||[""])[0]);
  check(/S\/\s*3[\s,.]?100/.test(cuerpo), "muestra el sueldo vigente S/ 3 100");
  check(/Planilla/.test(cuerpo), "muestra el régimen");
  check(/2026-06-01/.test(cuerpo), "dice desde cuándo rige");
  check(/historial/i.test(cuerpo), "hay sección de historial");
  check(/2026-01-01 → 2026-05-31/.test(cuerpo), "el tramo anterior quedó cerrado y visible");
  check(/S\/\s*2[\s,.]?600/.test(cuerpo), "y conserva el sueldo viejo");
  await foto("cond-vigente.png");

  console.log("\n3. Registrar un cambio desde la interfaz");
  await evaluar(`__t('Registrar cambio de condiciones').click(),true`); await dormir(1000);
  const m1 = await modal();
  console.log("   " + (m1||"").slice(0,230));
  check(/Condiciones laborales/i.test(m1||""), "abre el formulario");
  check(/Planilla/.test(m1||"") && /Honorarios/.test(m1||"") && /Sin pago/.test(m1||""), "ofrece los tres regímenes");
  await foto("cond-form.png");

  await enModal("number", "3600");
  await enModal("date", "2026-08-01");
  await dormir(600);
  const m2 = await modal();
  check(/se cerrará el día anterior/i.test(m2||""), "avisa que la anterior se cierra, no se pisa");

  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Registrar'); if(b)b.click();})()`);
  await dormir(2200);
  check(await modal() === null, "el diálogo se cierra");
  const c2 = await evaluar(`(document.querySelector('main')||document.body).innerText.replace(/\\s+/g,' ')`);
  check(/S\/\s*3[\s,.]?600/.test(c2), "el nuevo sueldo pasa a ser el vigente");
  check(/2026-06-01 → 2026-07-31/.test(c2), "el tramo de junio se cerró el 31 de julio");
  const tramos = (c2.match(/2026-\d\d-\d\d → 2026-\d\d-\d\d/g)||[]);
  console.log("   tramos en historial: " + JSON.stringify(tramos));
  check(tramos.length === 2, "el historial guarda los dos tramos anteriores");
  await foto("cond-historial.png");

  console.log("\n4. Sin pago (voluntarios) no pide sueldo");
  await evaluar(`__t('Registrar cambio de condiciones').click(),true`); await dormir(900);
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Sin pago'); if(b)b.click();})()`);
  await dormir(700);
  const m3 = await modal();
  check(!/Sueldo base mensual/i.test(m3||""), "esconde el campo de sueldo");
  check(/S\/ 0 y sin descuentos/i.test(m3||""), "explica qué implica");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Cancelar'); if(b)b.click();})()`);
  await dormir(700);

  console.log("\n5. Validación: sueldo vacío no pasa");
  await evaluar(`__t('Registrar cambio de condiciones').click(),true`); await dormir(900);
  await enModal("number", "");
  await dormir(300);
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Registrar'); if(b)b.click();})()`);
  await dormir(1200);
  const m4 = await modal();
  check(m4 !== null && /mayor que cero/i.test(m4), "avisa y no guarda");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Cancelar'); if(b)b.click();})()`);
  await dormir(700);

  console.log("\n6. Alguien sin condiciones lo dice claramente");
  await evaluar(`__t('Personal').click(),true`); await dormir(1500);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Ana Ch[áa]vez/.test(x.innerText.trim())); if(b)b.click();})()`);
  await dormir(1700);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Condiciones'); if(b)b.click();})()`);
  await dormir(1300);
  const c6 = await evaluar(`(document.querySelector('main')||document.body).innerText.replace(/\\s+/g,' ')`);
  check(/Sin condiciones laborales registradas/i.test(c6), "avisa que no tiene");
  check(/no se le genera boleta/i.test(c6), "explica la consecuencia");
  check(/Registrar condiciones laborales/.test(c6), "el botón invita a crearlas");
  await foto("cond-sin.png");

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  CONDICIONES OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
