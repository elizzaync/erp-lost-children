// Editar y borrar personas enroladas, contra el backend REAL (7801).
// Comprueba sobre todo que el botón de la papelera NO borra por sí solo:
// abre un diálogo que exige una confirmación explícita.
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
  "--remote-debugging-port=9341","--user-data-dir="+path.join(SP,"edge-crud"),
  "--window-size=1440,1300",BASE + "/"], { stdio:"ignore" });

let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const evaluar=async(e)=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9341/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);
      const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; f.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    window.__texto=()=>document.body.innerText.toLowerCase();
    window.__filas=()=>{
      const h=[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Personas enroladas en este sistema'));
      if(!h) return [];
      return [...h.parentElement.parentElement.querySelectorAll('div')]
        .filter(d=>(d.getAttribute('style')||'').includes('grid-template-columns'))
        .filter(d=>!/^NOMBRE/i.test(d.innerText.trim()));};
    window.__nombres=()=>__filas().map(d=>d.innerText.trim().split('\\n')[0].trim());
    window.__accion=(nombre,cual)=>{
      const f=__filas().find(d=>d.innerText.trim().toLowerCase().startsWith(nombre));
      if(!f) return 'fila no encontrada';
      const bs=[...f.querySelectorAll('button')];
      if(bs.length<2) return 'sin botones';
      bs[cual==='editar'?0:1].click(); return 'ok';};
    window.__modal=()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
      return d? d.innerText.replace(/\\s+/g,' ').trim() : null;};
    true;`);

  await entrar();
  await evaluar(`__t('Registro de Asistencia').click(),true`); await dormir(1500);

  const inicial = await evaluar(`__nombres()`);
  console.log("\n  personas en la tabla:", JSON.stringify(inicial));
  check(inicial.length >= 3, "la tabla lista las personas reales");

  console.log("\n1. El botón de borrar NO borra: abre un diálogo");
  check(await evaluar(`__accion('borrame','borrar')`) === "ok", "hay botón de borrar en la fila");
  await dormir(700);
  const modal = await evaluar(`__modal()`);
  check(modal !== null, "se abre un diálogo de confirmación");
  console.log("   " + (modal||"").slice(0,330));
  check(/dispositivo biométrico físico/i.test(modal||""), "avisa de que afecta al dispositivo FÍSICO");
  check(/compartidos con el erp anterior/i.test(modal||""), "avisa de que está compartido con producción");
  check(/volver a enrolarla/i.test(modal||""), "avisa de que habrá que re-enrolar");
  check(/sí, borrar del terminal y de yunatt/i.test(modal||""), "el botón de confirmar dice lo que hace");

  const trasAbrir = await evaluar(`fetch('/api/personas').then(r=>r.json()).then(d=>d.personas.map(p=>p.nombre))`);
  check(trasAbrir.some(n=>/borrame/i.test(n)), "abrir el diálogo NO borró nada todavía");

  console.log("\n2. Cancelar deja todo intacto");
  await evaluar(`__t('Cancelar').click(),true`); await dormir(600);
  check(await evaluar(`__modal()`) === null, "el diálogo se cierra");
  const trasCancelar = await evaluar(`fetch('/api/personas').then(r=>r.json()).then(d=>d.personas.map(p=>p.nombre))`);
  check(trasCancelar.some(n=>/borrame/i.test(n)), "tras cancelar la persona sigue existiendo");

  console.log("\n3. Editar");
  check(await evaluar(`__accion('luis','editar')`) === "ok", "hay botón de editar en la fila");
  await dormir(700);
  const modalEd = await evaluar(`__modal()`);
  check(/editar persona/i.test(modalEd||""), "abre el diálogo de edición");
  check(/también lo actualiza en el terminal/i.test(modalEd||""), "advierte que el nombre va al terminal");
  const inputs = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    return [...d.querySelectorAll('input')].map(i=>i.value);})()`);
  console.log("   campos precargados:", JSON.stringify(inputs));
  check(inputs[0] === "luis", "precarga el nombre actual");

  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const i=d.querySelectorAll('input')[1];
    const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    f.call(i,'70998877'); i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await dormir(400);
  await evaluar(`__t('Guardar cambios').click(),true`);
  await dormir(2500);
  check(await evaluar(`__modal()`) === null, "el diálogo se cierra al guardar");
  const doc = await evaluar(`fetch('/api/personas').then(r=>r.json()).then(d=>(d.personas.find(p=>p.nombre==='luis')||{}).documento)`);
  console.log("   documento guardado:", JSON.stringify(doc));
  check(doc === "70998877", "el documento se guardó");

  console.log("\n4. Borrar de verdad, confirmando");
  await evaluar(`__accion('borrame','borrar')`); await dormir(700);
  const s1=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"modal-borrar.png"),Buffer.from(s1.data,"base64"));
  await evaluar(`__t('Sí, borrar del terminal y de yunatt').click(),true`);
  for (let i=0;i<25;i++){ await dormir(1000); if (await evaluar(`__modal()`) === null) break; }
  check(await evaluar(`__modal()`) === null, "el diálogo se cierra tras confirmar");
  const finales = await evaluar(`fetch('/api/personas').then(r=>r.json()).then(d=>d.personas.map(p=>p.nombre))`);
  console.log("   personas tras borrar:", JSON.stringify(finales));
  check(!finales.some(n=>/borrame/i.test(n)), "la persona desapareció de la base local");
  const aviso = await evaluar(`__texto()`);
  check(/se borró del sistema, del terminal y de yunatt/i.test(aviso), "informa de que se borró en las tres capas");

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  EDITAR Y BORRAR OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
