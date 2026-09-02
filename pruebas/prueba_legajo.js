// Migración a dos entidades + Ficha de vida funcional.
// Verifica que las marcas de la fixtura se
// conservaron, y que "Agregar registro" ELIGE de una lista en vez de crear.
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
const { execSync } = require("child_process");
/* Esta suite necesita gente enrolada con marcas. Antes usaba a luis, hari
   y edward —fichas reales que se borraron por ser de prueba—, así que
   ahora se crea su propia fixtura y se la lleva al terminar. */
const fixtura = (accion) =>
  JSON.parse(execSync(`py "${path.join(__dirname, "fixtura.py")}" ${accion}`,
                      { encoding: "utf8" }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

fixtura('crear');

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9344","--user-data-dir="+path.join(SP,"edge-leg"),
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
    try{const l=await fetch("http://127.0.0.1:9344/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);


  await entrar();

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página, y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await __ent(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=typeof s==='string'?document.querySelector(s):s;
      const proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
      const f=Object.getOwnPropertyDescriptor(proto,'value').set; f.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    window.__texto=()=>document.body.innerText.toLowerCase();
    window.__sec=(x)=>{const h=[...document.querySelectorAll('h2')].find(y=>y.innerText.includes(x));
      return h? h.parentElement.parentElement.innerText.replace(/\\s+/g,' ').trim() : null;};
    window.__modal=()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
      return d? d.innerText.replace(/\\s+/g,' ').trim() : null;};
    true;`);

  console.log("\n1. Las marcas sobrevivieron a la migración");
  await evaluar(`__t('Registro de Asistencia').click(),true`); await dormir(1500);
  /* Las marcas reales son del 12; anclamos el día para no depender
     de la fecha del sistema. */
  await evaluar(`__esc('input[type=date]','2026-08-12')`); await dormir(1800);
  const sec = await evaluar(`__sec('Asistencia del d')`);
  console.log("   " + (sec||"").slice(0,260));
  check(sec && sec.includes("12:27"), "Zzz Marca Incompleta conserva su entrada de las 12:27");
  check(sec && sec.includes("12:33") && sec.includes("12:39"), "Zzz Marca Completa conserva entrada y salida");
  check(sec && sec.includes("0:06"), "Zzz Marca Completa conserva sus horas calculadas");
  check(sec && /Zzz Sin Marcas/i.test(sec), "Zzz Sin Marcas sigue enrolado (sin marcas ese día)");

  const api = await evaluar(`fetch('/api/asistencia?fecha=2026-08-12').then(r=>r.json())`);
  console.log("   API:", JSON.stringify(api.filas.map(f=>({n:f.nombre,e:f.entrada,s:f.salida,t:f.total,tipo:f.tipo}))));
  check(api.filas.length === 3, "las 3 identidades siguen ahí");
  check(api.filas.every(f=>f.tipo === "personal"), "todas resueltas como 'personal'");

  console.log("\n3. Ficha de vida con datos reales");
  await evaluar(`__t('Personal').click(),true`); await dormir(1800);
  const legajo = await evaluar(`__texto()`);
  check(/fichas activas/.test(legajo), "muestra el conteo de fichas");
  const filas = await evaluar(`[...document.querySelectorAll('button')]
    .filter(b=>b.querySelector('i.ph-pencil-simple'))
    .map(b=>{const f=b.closest('div[style*="grid-template-columns"]');
             return f? f.innerText.replace(/\s+/g,' ').trim() : '';})
    .filter(x=>x)`);
  console.log("   filas:", filas.length, "| primera:", (filas[0]||"").slice(0,90));
  check(filas.length >= 20, "lista todas las fichas");
  check(filas.some(f=>/ID 9\d{3}/.test(f)), "las personas enroladas muestran su ID del terminal");
  check(filas.some(f=>/sin enrolar/i.test(f)), "las no enroladas se marcan como 'Sin enrolar'");

  console.log("\n4. Editar una ficha guarda de verdad");
  /* Se edita una ficha CONCRETA de la fixtura, no "la primera del listado".
     Antes se cogía la primera y, en cuanto el equipo registró su propia
     ficha, la prueba le escribió encima un documento inventado. */
  const EDITABLE = "Ruth Salas Ortiz";
  const abrio = await evaluar(`(()=>{
    const EDITABLE_JS="Ruth Salas Ortiz";
    const filas=[...document.querySelectorAll('div')].filter(d=>(d.getAttribute('style')||'').includes('grid-template-columns'));
    /* Entre los divs que contienen ese nombre está también el contenedor
       de toda la tabla; el de texto MÁS CORTO es la fila de verdad. Sin
       esto se cogía el contenedor y el lápiz pulsado era el de la
       primera fila, no el de esta persona. */
    const cand=filas.filter(d=>d.innerText.includes(EDITABLE_JS));
    const fila=cand.sort((a,b)=>a.innerText.length-b.innerText.length)[0];
    if(!fila) return 'no está la ficha de la fixtura';
    const lapiz=fila.querySelector('button i.ph-pencil-simple');
    if(!lapiz) return 'sin lápiz en esa fila';
    lapiz.closest('button').click(); return 'ok';})()`);
  console.log("   editando: " + EDITABLE + " (" + abrio + ")");
  check(abrio === "ok", "encuentra la ficha de la fixtura que va a editar");
  await dormir(900);
  const modal = await evaluar(`__modal()`);
  check(/ficha de personal/i.test(modal||""), "abre el diálogo de ficha");
  check(/fuente única/i.test(modal||""), "explica que es la fuente única de datos");
  const antes = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    return [...d.querySelectorAll('input')].map(i=>i.value);})()`);
  console.log("   campos precargados:", JSON.stringify(antes.slice(0,3)));
  check(antes[0] === EDITABLE, "precarga el nombre de la ficha pedida: " + antes[0]);

  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    __esc(d.querySelectorAll('input')[1],'70123456');})()`);
  await dormir(400);
  await evaluar(`__t('Guardar cambios').click(),true`);
  await dormir(900);
  /* Si la ficha tiene huecos, el formulario los pide antes de guardar y
     ofrece marcarlos «sin dato por ahora». Se marcan y se guarda otra vez,
     que es lo que haría una persona; la suite es anterior a esa regla. */
  const faltaban = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 0;
    const cs=[...d.querySelectorAll('label')]
      .filter(l=>/sin dato por ahora/i.test(l.innerText||''))
      .map(l=>l.querySelector('input[type=checkbox]'))
      .filter(c=>c && !c.checked);
    cs.forEach(c=>c.click()); return cs.length;})()`);
  if (faltaban) {
    console.log("   campos declarados «sin dato»: " + faltaban);
    await dormir(500);
    await evaluar(`__t('Guardar cambios').click(),true`);
  }
  await dormir(2500);
  check(await evaluar(`__modal()`) === null, "el diálogo se cierra al guardar");
  const guardado = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>d.personal.filter(p=>p.documento==='70123456').map(p=>p.nombre))`);
  console.log("   fichas con el documento nuevo:", JSON.stringify(guardado));
  check(guardado.indexOf(EDITABLE) >= 0,
        "el documento quedó guardado en la ficha de " + EDITABLE);
  const s2=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"legajo.png"),Buffer.from(s2.data,"base64"));

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  MIGRACIÓN Y LEGAJO OK");
  fixtura('borrar');
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);
  try{fixtura("borrar");}catch(_){}
  edge.kill();process.exit(1);});
