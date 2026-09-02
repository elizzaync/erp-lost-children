// "Editar expediente": mismo formulario precargado, actualiza y no duplica.
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
const NINO = "Beneficiario de prueba EDIT";

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9389","--user-data-dir="+path.join(SP,"edge-ed"),
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
const leerEnModal = (etiqueta) => evaluar(`(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim().toLowerCase()===${JSON.stringify(etiqueta)}.toLowerCase() && x.children.length===0);
  if(!rot) return null;
  const c=rot.parentElement.querySelector('input,select');
  if(!c) return null;
  return c.tagName==='SELECT' ? (c.options[c.selectedIndex]||{}).text : c.value;})()`);
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
const abrirFicha = async () => {
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(NINO)})); if(b)b.click();})()`);
  await dormir(1700);
};

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9389/json/list").then(r=>r.json());
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

  /* El punto de partida se prepara DESPUÉS de entrar. Iba antes, y sin
     sesión /api/beneficiarios responde 401: `d.beneficiarios` llegaba
     undefined y la suite moría en la primera línea, sin comprobar nada.
     El POST y el DELETE además necesitan el CSRF, que solo existe una vez
     identificado. */
  await evaluar(`fetch('${BASE}/api/beneficiarios').then(r=>r.json()).then(d=>
    Promise.all((d.beneficiarios||[]).filter(x=>x.nombre===${JSON.stringify(NINO)})
      .map(x=>fetch('${BASE}/api/beneficiarios/'+x.id,{method:'DELETE'}))))`);
  const creado = await evaluar(`fetch('${BASE}/api/beneficiarios',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({
      nombre:${JSON.stringify(NINO)}, casa:'Casa Lima', sala:'Sala A',
      grado:'Primaria', anio_ingreso:'2024',
      seguro:'SIS', alergias:'Ninguna', institucion_educativa:'Colegio A',
      rendimiento:'En proceso', plan_vida:'—'})}).then(r=>r.json()).then(d=>d.id)`);
  console.log("ficha de prueba creada: id " + creado);
  await entrar();

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

  console.log("\n1. Abrir la ficha real y pulsar Editar");
  await abrirFicha();
  check((await main()).includes(NINO), "el expediente muestra la ficha real");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Editar expediente'); b.click();})()`);
  await dormir(1400);
  const m0 = (await modal()) || "";
  check(m0.length > 0, "se abre el formulario");
  check(/Editar expediente/i.test(m0), "el título dice que es una edición");
  check(/No se crea una segunda/i.test(m0), "avisa que corrige la ficha existente");
  check(/Guardar cambios/.test(m0), "el botón dice «Guardar cambios», no «Registrar»");

  console.log("\n2. Viene precargado");
  const precarga = {};
  for (const c of ["Nombre completo","Sala","Grado","Año de ingreso","Seguro",
                   "Alergias","Institución educativa","Rendimiento"]) {
    precarga[c] = await leerEnModal(c);
  }
  console.log("   " + JSON.stringify(precarga));
  check(precarga["Nombre completo"] === NINO, "trae el nombre");
  check(precarga["Seguro"] === "SIS", "trae el seguro guardado");
  check(precarga["Alergias"] === "Ninguna", "trae las alergias");
  check(precarga["Institución educativa"] === "Colegio A", "trae la institución");
  check(precarga["Año de ingreso"] === "2024", "trae el año de ingreso");
  await foto("benef-editar-precargado.png");

  console.log("\n3. Cambiar un campo de Salud y otro de Educación");
  await ponerEnModal("Alergias", "Polen");
  await ponerEnModal("Tratamiento", "Control mensual");
  await ponerEnModal("Rendimiento", "Logro esperado");
  await dormir(500);
  const guardar = `(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>/Guardar cambios/.test(x.innerText)); b.click();})()`;
  await evaluar(guardar);
  await dormir(900);
  /* La ficha de prueba no trae documento ni fecha de nacimiento, y el
     formulario no guarda hasta que esos huecos se declaran «sin dato por
     ahora». La lista de huecos solo aparece al intentar guardar: se marca
     lo que pida y se vuelve a intentar, como haría una persona. La suite
     es anterior a esa regla y leía la negativa como que editar estaba
     roto. */
  const sinDato = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 0;
    const cs=[...d.querySelectorAll('label')]
      .filter(l=>/sin dato por ahora/i.test(l.innerText||''))
      .map(l=>l.querySelector('input[type=checkbox]'))
      .filter(c=>c && !c.checked);
    cs.forEach(c=>c.click()); return cs.length;})()`);
  if (sinDato) {
    console.log("   campos declarados «sin dato»: " + sinDato);
    await dormir(500);
    await evaluar(guardar);
  }
  await dormir(2800);
  check(await modal() === null, "guarda y cierra");

  console.log("\n4. El cambio quedó en la base");
  const api = await evaluar(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>{
    const x=d.beneficiarios.filter(y=>y.nombre===${JSON.stringify(NINO)});
    return {cuantos:x.length, ficha:x[0]||null};})`);
  console.log(`   fichas con ese nombre: ${api.cuantos}`);
  check(api.cuantos === 1, "NO se creó una segunda ficha");
  check(api.ficha.id === creado, "es la misma ficha (mismo id)");
  console.log(`   alergias: ${api.ficha.alergias} · tratamiento: ${api.ficha.tratamiento} · rendimiento: ${api.ficha.rendimiento}`);
  check(api.ficha.alergias === "Polen", "las alergias se actualizaron");
  check(api.ficha.tratamiento === "Control mensual", "el tratamiento también");
  check(api.ficha.rendimiento === "Logro esperado", "y el rendimiento");
  check(api.ficha.seguro === "SIS", "lo que no se tocó sigue igual");
  check(api.ficha.institucion_educativa === "Colegio A", "y la institución también");

  console.log("\n5. Se refleja sin recargar");
  const tras = await main();
  check(/Polen/.test(tras), "el expediente abierto ya muestra el cambio");
  check(!/Ninguna/.test(tras), "y no el valor viejo");

  console.log("\n6. Se refleja al volver a abrirlo");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Volver a beneficiarios/.test(x.innerText)); if(b)b.click();})()`);
  await dormir(1400);
  await abrirFicha();
  const rea = await main();
  check(/Polen/.test(rea), "tras cerrar y reabrir sigue el valor nuevo");
  check(/Control mensual/.test(rea), "y el tratamiento");
  check(/Logro esperado/.test(rea), "y el rendimiento");
  await foto("benef-editar-guardado.png");

  console.log("\n8. Limpieza");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Volver a beneficiarios/.test(x.innerText)); if(b)b.click();})()`);
  await dormir(1200);
  /* Solo la ficha de ESTA prueba. La versión anterior borraba todos los
     beneficiarios, incluidos los que hubiera creado el usuario. */
  const quedan = await evaluar(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>
    Promise.all(d.beneficiarios.filter(x=>x.nombre===${JSON.stringify(NINO)})
      .map(x=>fetch('/api/beneficiarios/'+x.id,{method:'DELETE'})))
      .then(()=>fetch('/api/beneficiarios')).then(r=>r.json())
      .then(d2=>d2.beneficiarios.filter(x=>x.nombre===${JSON.stringify(NINO)}).length))`);
  check(quedan === 0, "ficha de prueba eliminada (sin tocar las demás)");

  check(errores.length === 0, "cero errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  EDITAR EXPEDIENTE OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
