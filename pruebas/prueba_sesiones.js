// Sesiones de acompañamiento e incidencias, de punta a punta.
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
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const NINO = "Beneficiario de prueba SES";

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9391","--user-data-dir="+path.join(SP,"edge-ses"),
  "--window-size=1440,1250",BASE + "/"], { stdio:"ignore" });

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
const ponerEnModal = (etiqueta, valor) => evaluar(`(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim().toLowerCase()===${JSON.stringify(etiqueta)}.toLowerCase() && x.children.length===0);
  if(!rot) return 'no está';
  const c=rot.parentElement.querySelector('input,select');
  const proto=c.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
  const f=Object.getOwnPropertyDescriptor(proto,'value').set;
  f.call(c, ${JSON.stringify(valor)});
  c.dispatchEvent(new Event('input',{bubbles:true}));
  c.dispatchEvent(new Event('change',{bubbles:true}));
  return 'ok';})()`);
const clic = (txt) => evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(txt)}); if(b){b.click(); return 'ok';} return 'no está';})()`);
const clicModal = (txt) => evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(txt)}); if(b){b.click(); return 'ok';} return 'no está';})()`);
const abrirFicha = async () => {
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(NINO)})); if(b)b.click();})()`);
  await dormir(1800);
};

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9391/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails; errores.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);
  /* Aquí había un `const BASE = BASE;` de una edición a medias:
     dejaba la constante de arriba sin existir y mataba el archivo. */

  await entrar();

  /* La preparación va DESPUÉS de entrar(): con login obligatorio,
     /api/beneficiarios no le contesta a un visitante, así que la
     lista llegaba indefinida y el archivo moría en el primer
     .filter() — antes de la primera comprobación. */
  await evaluar(`fetch('${BASE}/api/beneficiarios').then(r=>r.json()).then(d=>
    Promise.all(d.beneficiarios.filter(x=>x.nombre===${JSON.stringify(NINO)})
      .map(x=>fetch('${BASE}/api/beneficiarios/'+x.id,{method:'DELETE'}))))`);
  const bid = await evaluar(`fetch('${BASE}/api/beneficiarios',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({nombre:${JSON.stringify(NINO)}, casa:'Casa Lima', sala:'Sala A'})})
    .then(r=>r.json()).then(d=>d.id)`);
  console.log("ficha de prueba: id " + bid);
  await enviar("Page.reload"); await dormir(3200);
  /* La recarga de arriba se llevó el envoltorio que firma con CSRF: se
     repone, o todo lo que cambie datos a partir de aquí se rechaza. */
  await (typeof __ent === "function" ? __ent : evaluar)(`(async()=>{
    const ss = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (ss.sesion||{}).csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};
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
  await evaluar(`(()=>{const m=document.querySelector('main');
    const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios'); if(b)b.click();})()`);
  await dormir(1700);
  await abrirFicha();
  check((await main()).includes(NINO), "estamos en el expediente de la ficha real");

  console.log("\n1. Estado inicial: sin sesiones ni incidencias");
  const ini = await main();
  check(/Sin sesiones registradas todav/i.test(ini), "dice que no hay sesiones");
  check(/Sin incidencias registradas/i.test(ini), "ni incidencias");
  check(/SESIONES DEL A[ÑN]O 0/i.test(ini),
        "el contador del año arranca en 0");

  console.log("\n2. Registrar una sesión");
  check((await clic("Registrar sesión de acompañamiento")) === "ok", "el botón existe");
  await dormir(1400);
  const ms = (await modal()) || "";
  check(/Registrar sesión de acompañamiento/i.test(ms), "abre el formulario");
  check(ms.includes(NINO), "dice a quién pertenece");
  check(/Individual/.test(ms) && /Grupal/.test(ms) && /Familiar/.test(ms), "ofrece los tipos");
  check(/informaci[oó]n sensible/i.test(ms), "avisa de que es información sensible");
  await foto("ses-form.png");
  await ponerEnModal("Fecha", "2026-08-10");
  await ponerEnModal("Notas", "Sesión de prueba");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const s=[...d.querySelectorAll('select')].find(x=>x.options.length>5);
    const f=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
    f.call(s, s.options[1].value); s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await dormir(400);
  check((await clicModal("Registrar sesión")) === "ok", "hay botón de guardar");
  await dormir(2600);
  check(await modal() === null, "guarda y cierra");

  console.log("\n3. La sesión está en la base y en el expediente");
  const api1 = await evaluar(`fetch('/api/beneficiarios/'+${bid}+'/acompanamiento').then(r=>r.json())`);
  console.log(`   sesiones: ${api1.sesiones.length} · del año: ${api1.sesiones_anio}`);
  check(api1.sesiones.length === 1, "quedó guardada");
  check(api1.sesiones[0].notas === "Sesión de prueba", "con sus notas");
  check(!!api1.sesiones[0].responsable, "y con responsable");
  const t3 = await main();
  check(/2026-08-10/.test(t3), "se ve en el expediente sin recargar");
  check(/Sesión de prueba/.test(t3), "con las notas");
  check(!/Sin sesiones registradas/i.test(t3), "ya no dice que no hay ninguna");

  console.log("\n4. El contador 'Sesiones del año' refleja lo real");
  console.log("   " + (t3.match(/SESIONES DEL A[ÑN]O \S+/i) || ["(no encontrado)"])[0]);
  check(/SESIONES DEL A[ÑN]O 1/i.test(t3), "el contador pasó a 1");

  console.log("\n5. Registrar una incidencia");
  check((await clic("Reportar incidencia")) === "ok", "el botón existe");
  await dormir(1400);
  const mi = (await modal()) || "";
  check(/Reportar incidencia/i.test(mi), "abre el formulario");
  check(/Leve/.test(mi) && /Moderada/.test(mi) && /Grave/.test(mi), "ofrece las tres gravedades");
  check(/informe al juzgado/i.test(mi), "advierte de lo delicado del registro");
  await foto("inc-form.png");
  await ponerEnModal("Fecha", "2026-08-11");
  await ponerEnModal("Qué pasó", "Registro de prueba");
  await ponerEnModal("Seguimiento", "Sin seguimiento");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Moderada'); if(b)b.click();})()`);
  await dormir(400);
  check((await clicModal("Registrar incidencia")) === "ok", "hay botón de guardar");
  await dormir(2600);
  check(await modal() === null, "guarda y cierra");

  const api2 = await evaluar(`fetch('/api/beneficiarios/'+${bid}+'/acompanamiento').then(r=>r.json())`);
  console.log(`   incidencias: ${api2.incidencias.length} · gravedad: ${(api2.incidencias[0]||{}).gravedad}`);
  check(api2.incidencias.length === 1, "quedó guardada");
  check(api2.incidencias[0].gravedad === "moderada", "con la gravedad elegida");
  check(api2.incidencias[0].descripcion === "Registro de prueba", "y la descripción");
  const t5 = await main();
  check(/Registro de prueba/.test(t5), "se ve en el expediente");
  check(/Moderada/.test(t5), "con su gravedad");
  await foto("benef-acompanamiento.png");

  console.log("\n6. Validaciones");
  await clic("Reportar incidencia"); await dormir(1200);
  await ponerEnModal("Qué pasó", "");
  await clicModal("Registrar incidencia"); await dormir(1300);
  check(/Describe qué pasó/i.test((await modal())||""), "no deja guardar sin descripción");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Cancelar'); if(b)b.click();})()`);
  await dormir(900);
  const futuro = await evaluar(`fetch('/api/beneficiarios/'+${bid}+'/sesiones',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fecha:'2030-01-01'})}).then(r=>r.json()).then(d=>d.error||'aceptada')`);
  console.log("   fecha futura -> " + futuro);
  check(/futura/i.test(futuro), "el backend rechaza una fecha futura");

  console.log("\n7. Al reabrir el expediente sigue todo");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Volver a beneficiarios/.test(x.innerText)); if(b)b.click();})()`);
  await dormir(1400);
  await abrirFicha();
  const t7 = await main();
  check(/Sesión de prueba/.test(t7), "la sesión sigue");
  check(/Registro de prueba/.test(t7), "y la incidencia");
  check(/SESIONES DEL A[ÑN]O 1/i.test(t7), "y el contador");

  console.log("\n9. Borrar lo registrado");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Volver a beneficiarios/.test(x.innerText)); if(b)b.click();})()`);
  await dormir(1400);
  await abrirFicha();
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>x.querySelector('i.ph-trash'))
    .filter(x=>{let n=x; for(let i=0;i<6&&n;i++){n=n.parentElement;
      if(n&&/Sesión de prueba|Registro de prueba/.test(n.innerText)) return true;} return false;});
    b.forEach(x=>x.click());})()`);
  await dormir(2600);
  const api3 = await evaluar(`fetch('/api/beneficiarios/'+${bid}+'/acompanamiento').then(r=>r.json())`);
  console.log(`   quedan: ${api3.sesiones.length} sesiones, ${api3.incidencias.length} incidencias`);
  check(api3.sesiones.length === 0 && api3.incidencias.length === 0, "se borran desde el expediente");

  console.log("\n10. Limpieza");
  const quedan = await evaluar(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>
    Promise.all(d.beneficiarios.filter(x=>x.nombre===${JSON.stringify(NINO)})
      .map(x=>fetch('/api/beneficiarios/'+x.id,{method:'DELETE'})))
      .then(()=>fetch('/api/beneficiarios')).then(r=>r.json())
      .then(d2=>d2.beneficiarios.filter(x=>x.nombre===${JSON.stringify(NINO)}).length))`);
  check(quedan === 0, "ficha de prueba eliminada (sin tocar las demás)");

  check(errores.length === 0, "cero errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  SESIONES E INCIDENCIAS OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
