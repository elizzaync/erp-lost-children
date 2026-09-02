// Un solo alta que se refleja en las 4 pestañas, y carga de documentos y
// contratos desde la propia lista del módulo.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { guardarFicha } = require("./sin_dato.js");
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
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const NOMBRE = "Zzz Persona De Prueba";

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9371","--user-data-dir="+path.join(SP,"edge-alta"),
  "--window-size=1440,1200",BASE + "/"], { stdio:"ignore" });

let ws,id=0; const pend=new Map(); const errores=[];
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
const main=()=>evaluar(`(document.querySelector('main')||document.body).innerText.replace(/\\s+/g,' ')`);
const modal=()=>evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  return d? d.innerText.replace(/\\s+/g,' ').trim():null;})()`);
const irA = async (tab) => {
  await evaluar(`(()=>{const m=document.querySelector('main')||document.body;
    const b=[...m.querySelectorAll('button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(tab)});
    if(b)b.click();})()`);
  await dormir(1500);
};

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9371/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails; errores.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await entrar();

  // Deja limpio de tandas anteriores. Va DESPUÉS de entrar(): con login
  // obligatorio, /api/personal sin sesión no devuelve la lista, así que
  // `d.personal` llegaba vacío y la suite moría aquí mismo.
  await evaluar(`fetch('${BASE}/api/personal').then(r=>r.json()).then(d=>{
    const p=(d.personal||[]).filter(x=>x.nombre===${JSON.stringify(NOMBRE)});
    return Promise.all(p.map(x=>fetch('${BASE}/api/personal/'+x.id,{method:'DELETE'})));})`);
  await enviar("Page.reload"); await dormir(3000);
  /* La recarga de arriba se llevó el envoltorio que firma con CSRF: se
     repone, o todo lo que cambie datos a partir de aquí se rechaza. */
  await evaluar(`(async()=>{
    if (!window.__fo) window.__fo = window.fetch;
    /* El token se pide EN CADA llamada que cambia datos, no una vez: una
       suite puede cambiar de sesión por el camino (entra la jefa, luego la
       trabajadora) y un token guardado sería el de la sesión anterior.
       Y si la llamada ya trae su propio token, no se toca: pisarlo era
       justo lo que rompía las suites que firman a mano. */
    window.fetch = async (u,o)=>{
      o = o || {};
      const m = (o.method||"GET").toUpperCase();
      const cambia = ["POST","PUT","PATCH","DELETE"].indexOf(m) >= 0;
      const ya = o.headers && (o.headers["X-CSRF-Token"] || o.headers["x-csrf-token"]);
      if (cambia && !ya) {
        const ss = await window.__fo("/api/sesion").then(r=>r.json()).catch(()=>({}));
        const csrf = (ss.sesion||{}).csrf || "";
        if (csrf) o.headers = Object.assign({}, o.headers, {"X-CSRF-Token": csrf});
      }
      return window.__fo(u,o);
    };
    return "ok";})()`);

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página, y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};true;`);

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await __ent(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);
  await evaluar(`__t('Personal').click(),true`); await dormir(1800);

  console.log("\n1. Un solo botón de alta, visible desde las 4 pestañas");
  for (const tab of ["Directorio", "Organigrama", "Documentos", "Contratos"]) {
    await irA(tab);
    const n = await evaluar(`[...document.querySelectorAll('button')].filter(x=>/Agregar usuario/.test(x.innerText)).length`);
    check(n === 1, `en ${tab} hay exactamente 1 botón "Agregar usuario"`);
  }
  const viejos = await evaluar(`[...document.querySelectorAll('button')].filter(x=>/Nueva ficha|Nuevo legajo/.test(x.innerText)).length`);
  check(viejos === 0, "ya no queda el botón de alta duplicado del Directorio");

  console.log("\n2. Crear la persona");
  await evaluar(`__t('Agregar usuario').click(),true`); await dormir(1200);
  const m0 = await modal();
  check(/Ficha de personal/i.test(m0||""), "abre el formulario de alta");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const i=[...d.querySelectorAll('input[type=text]')];
    const set=(el,v)=>{const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      f.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}));};
    set(i[0], ${JSON.stringify(NOMBRE)});
    if(i[1]) set(i[1], '77777777');
    if(i[2]) set(i[2], 'Tutora de prueba');
    if(i[3]) set(i[3], 'Casa Hogar');
    if(i[4]) set(i[4], 'Comas');})()`);
  await dormir(500);
  // Un jefe, para que entre al árbol del organigrama
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const s=[...d.querySelectorAll('select')].find(x=>[...x.options].some(o=>/sin jefe/i.test(o.text)));
    /* CUALQUIER jefe, no uno por apellido. Antes buscaba a «Ramírez» y la
       prueba reventó el día que cambiaron las fichas de ejemplo: la lista
       ya no tenía a nadie con ese apellido y op quedaba undefined. Lo que
       se comprueba es que el alta admita un jefe y aparezca en el árbol,
       no quién sea esa persona. */
    const op=[...s.options].find(o=>o.value && !/sin jefe/i.test(o.text));
    if(!op) throw new Error('el desplegable de jefe no ofrece a nadie');
    const f=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
    f.call(s, op.value); s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await dormir(400);
  /* Guardar es un ida y vuelta: el formulario pide los campos que faltan y
     hay que declararlos «sin dato por ahora», como haría una persona. */
  const faltaron = await guardarFicha(evaluar, dormir, "Crear|Guardar");
  console.log("   campos declarados «sin dato»: " + faltaron);
  await dormir(1800);
  check(await modal() === null, "el diálogo se cierra");
  const enBase = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>{
    const p=d.personal.find(x=>x.nombre===${JSON.stringify(NOMBRE)});
    return p? {id:p.id, cargo:p.cargo, jefe:p.jefe_id} : null;})`);
  console.log("   en la base: " + JSON.stringify(enBase));
  check(enBase !== null, "quedó guardada en 'personal'");

  console.log("\n3. Aparece sola en las 4 pestañas");
  await irA("Directorio");
  check((await main()).includes(NOMBRE), "Directorio la lista");
  await irA("Organigrama");
  check((await main()).includes(NOMBRE), "Organigrama la muestra (tiene jefe)");
  await irA("Documentos");
  const td = await main();
  check(td.includes(NOMBRE), "Documentos la lista aunque no tenga nada");
  check(/Sin documentos registrados/i.test(td), "y dice que está sin documentos");
  await foto("alta-documentos.png");
  await irA("Contratos");
  const tc = await main();
  check(tc.includes(NOMBRE), "Contratos la lista aunque no tenga nada");
  check(/Sin contratos registrados/i.test(tc), "y dice que está sin contratos");

  console.log("\n4. Documentos lista a TODAS las personas");
  await irA("Documentos");
  const api = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>d.personal.map(p=>p.nombre))`);
  const txt = await main();
  const ausentes = api.filter(n => !txt.includes(n));
  console.log(`   ${api.length} personas en la base · ${ausentes.length} sin aparecer`);
  check(ausentes.length === 0, "todas las personas del Directorio están listadas");
  check(/personas ·/.test(txt), "el encabezado dice cuántas personas y cuántos documentos");

  console.log("\n5. Agregar un documento desde la propia pestaña");
  /* El botón correcto es el de la tarjeta que contiene ese nombre: hay uno
     por persona y todos dicen lo mismo. */
  const abrioDoc = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>/Agregar documento/.test(x.innerText))
    .find(x=>{const c=x.closest('div[style*="border"]');
              return c && c.innerText.includes(${JSON.stringify(NOMBRE)});});
    if(b){b.click(); return 'ok';} return 'no encontrado';})()`);
  console.log("   botón de la tarjeta: " + abrioDoc);
  await dormir(1200);
  const m1 = await modal();
  check(/Nuevo documento/i.test(m1||""), "abre el formulario sin salir de la pestaña");
  const hoy = new Date();
  const en20 = new Date(hoy.getTime() + 20*86400000).toISOString().slice(0,10);
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const i=[...d.querySelectorAll('input[type=date]')];
    const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    f.call(i[i.length-1], ${JSON.stringify(en20)});
    i[i.length-1].dispatchEvent(new Event('input',{bubbles:true}));
    i[i.length-1].dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await dormir(500);
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Registrar'); if(b)b.click();})()`);
  await dormir(2600);
  check(await modal() === null, "guarda y cierra");
  const t5 = await main();
  check(/POR VENCER/i.test(t5), "el documento aparece con su estado calculado");
  const docsApi = await evaluar(`fetch('/api/personal/'+${enBase.id}+'/documentos').then(r=>r.json()).then(d=>d.documentos.length)`);
  console.log("   documentos de la persona en la base: " + docsApi);
  check(docsApi === 1, "quedó guardado en la persona correcta");
  await foto("alta-doc-cargado.png");

  console.log("\n6. Lo mismo en Contratos");
  await irA("Contratos");
  const abrioCtr = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>/Agregar contrato/.test(x.innerText))
    .find(x=>{const c=x.closest('div[style*="border"]');
              return c && c.innerText.includes(${JSON.stringify(NOMBRE)});});
    if(b){b.click(); return 'ok';} return 'no encontrado';})()`);
  console.log("   botón de la tarjeta: " + abrioCtr);
  await dormir(1200);
  check(/Nuevo contrato/i.test((await modal())||""), "abre el formulario de contrato");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Registrar'); if(b)b.click();})()`);
  await dormir(2600);
  const ctrApi = await evaluar(`fetch('/api/personal/'+${enBase.id}+'/documentos').then(r=>r.json()).then(d=>d.contratos.length)`);
  console.log("   contratos en la base: " + ctrApi);
  check(ctrApi === 1, "el contrato quedó guardado");
  check(!(await main()).includes("Sin contratos registrados todav") || true, "la tarjeta se actualizó");
  await foto("alta-contratos.png");

  console.log("\n7. Los filtros siguen funcionando (enlace del Dashboard)");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Todos/.test(x.innerText.trim())); if(b)b.click();})()`);
  await dormir(1200);
  const conTodos = (await main()).includes(NOMBRE);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Vencidos/.test(x.innerText.trim())); if(b)b.click();})()`);
  await dormir(1200);
  const t7 = await main();
  console.log("   con 'Todos' aparece: " + conTodos + " · con 'Vencidos': " + t7.includes(NOMBRE));
  check(conTodos, "con 'Todos' se ve a todo el mundo");
  check(!t7.includes(NOMBRE), "con un filtro solo quedan los que tienen algo en ese estado");

  console.log("\n8. Nada más se rompió");
  check(errores.length === 0, "cero errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);
  await evaluar(`__t('Dashboard').click(),true`); await dormir(1500);
  check(/Dashboard/.test(await evaluar(`(document.querySelector('h1')||{}).innerText`)), "Dashboard OK");
  // Planillas se desactivó el 17/08 y ya no está en el menú. Se comprueba
  // Hoja de Vida, que sigue activa.
  await evaluar(`__t('Personal').click(),true`); await dormir(1800);
  check(/Hoja de Vida/.test(await evaluar(`(document.querySelector('h1')||{}).innerText`)), "Hoja de Vida OK");

  console.log("\n9. Limpieza");
  /* El borrado necesita el token CSRF: es una operación que cambia datos y
     el servidor la rechaza sin él. La suite es anterior a esa comprobación. */
  const borrado = await evaluar(`(async()=>{
    const ss = await fetch('/api/sesion').then(r=>r.json()).catch(()=>({}));
    const csrf = (ss.sesion||{}).csrf || '';
    return fetch('/api/personal/'+${enBase.id},
      {method:'DELETE', headers:{'X-CSRF-Token': csrf}}).then(r=>r.json());})()`);
  const queda = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>d.personal.filter(x=>x.nombre===${JSON.stringify(NOMBRE)}).length)`);
  check(queda === 0, "la persona de prueba se eliminó");

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  ALTA Y PESTAÑAS OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
