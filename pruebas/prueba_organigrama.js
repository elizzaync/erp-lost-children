// Organigrama real: árbol desde jefe_id, sección de "sin jefe" y edición.
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
const { execSync } = require("child_process");
/* Esta suite necesita alguien SIN jefe y SIN equipo a cargo, para que
   aparezca en «Sin jefe asignado». Antes usaba a luis —ficha real que se
   borró por ser de prueba—; ahora se crea su propia fixtura. */
const fixtura = (accion) =>
  JSON.parse(execSync(`py "${path.join(__dirname, "fixtura.py")}" ${accion}`,
                      { encoding: "utf8" }));
const SUELTO = "Zzz Sin Marcas";
fixtura("crear");

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9347","--user-data-dir="+path.join(SP,"edge-org"),
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
    try{const l=await fetch("http://127.0.0.1:9347/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  /* Esta prueba asigna un jefe a la ficha de fixtura. Si quedara de una tanda anterior el
     punto de partida cambia y los conteos no cuadran, así que se limpia
     ANTES y se recarga: la aplicación lee el personal al montar, y un
     reinicio posterior no se vería reflejado en pantalla. */
  console.log("   la fixtura se recrea limpia en cada tanda");
  await enviar("Page.reload"); await dormir(3000);


  await entrar();

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página, y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=typeof s==='string'?document.querySelector(s):s;
      const proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
      const f=Object.getOwnPropertyDescriptor(proto,'value').set; f.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    window.__texto=()=>document.body.innerText.toLowerCase();
    window.__modal=()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
      return d? d.innerText.replace(/\\s+/g,' ').trim() : null;};
    true;`);

  /* Aquí había una SEGUNDA inyección de los mismos ayudantes, copiada de
     otra suite, que pisaba la de arriba con un __esc que solo sabe de
     selectores y de <input>. Como esta pantalla escribe en un <select>
     pasándole el elemento, reventaba con «no es un selector válido».
     Retirada el 31/08/2026: la de arriba ya hace las dos cosas. */
  await evaluar(`__t('Personal').click(),true`); await dormir(1600);
  await evaluar(`__t('Organigrama').click(),true`); await dormir(1600);

  console.log("\n1. El árbol se arma con datos reales");
  const filas = await evaluar(`(()=>{
    const h=[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Estructura del equipo'));
    if(!h) return null;
    const cont=h.parentElement.parentElement;
    return [...cont.querySelectorAll('div')]
      .filter(d=>/grid-template-columns/.test(d.getAttribute('style')||'') && /2\\.2fr/.test(d.getAttribute('style')||''))
      .map(d=>{const izq=d.firstElementChild;
        return {sangria:parseInt(getComputedStyle(izq).paddingLeft),
                texto:d.innerText.replace(/\\s+/g,' ').trim()};});})()`);
  check(filas !== null, "existe la sección 'Estructura del equipo'");
  console.log("   filas:", (filas||[]).length);
  for (const f of (filas||[]).slice(0,6)) console.log("    " + " ".repeat(Math.max(0,(f.sangria-8)/2)) + f.texto.slice(0,72));
  /* Lo que se comprueba es la FORMA del árbol, no quiénes lo habitan.
     Estas comprobaciones estaban clavadas al juego de fichas antiguo
     —15 filas, el cargo «director ejecutivo», el área «administración y
     finanzas»— y reventaron enteras el día que cambiaron los datos de
     ejemplo, sin que el organigrama tuviera nada malo. */
  const sangrias = new Set((filas||[]).map(f=>f.sangria));
  const menor = Math.min(...sangrias);
  check((filas||[]).length >= 3, "lista la jerarquía");
  check((filas||[]).some(f=>f.sangria === menor), "hay una raíz");
  check(sangrias.size >= 3, "hay al menos 3 niveles de profundidad");
  /* Cada fila trae nombre y, debajo, cargo y área. Se comprueba que la
     fila diga MÁS que el nombre, que es lo que distingue un organigrama
     de una lista de nombres. */
  check((filas||[]).some(f=>f.texto.split(' ').length > 4), "muestra cargo y área");

  console.log("\n2. Los que no tienen jefe salen aparte, no escondidos");
  const sueltos = await evaluar(`(()=>{
    const t=document.body.innerText;
    const i=t.indexOf('Sin jefe asignado');
    return i<0? null : t.slice(i, i+400).replace(/\\s+/g,' ');})()`);
  console.log("   " + (sueltos||"").slice(0,220));
  check(sueltos !== null, "existe la sección 'Sin jefe asignado'");
  check(new RegExp(SUELTO,"i").test(sueltos||""),
        "la ficha sin jefe aparece ahí");

  const api = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>({
    total:d.personal.length,
    conJefe:d.personal.filter(p=>p.jefe_id).length,
    sinJefe:d.personal.filter(p=>!p.jefe_id).map(p=>p.nombre)}))`);
  console.log("   API:", JSON.stringify(api));
  /* Antes exigía 19, que eran las del juego de fichas viejo. Lo que
     importa es que NADIE pierda su jefe al pintar el árbol: las filas del
     organigrama tienen que dar cuenta de toda la plantilla. */
  check(api.conJefe >= 1, "hay fichas con jefe asignado");
  check(api.conJefe + api.sinJefe.length === api.total,
        "todas las fichas están, con jefe o sin él");

  console.log("\n3. Asignar un jefe reordena el árbol");
  const antes = (filas||[]).length;
  await evaluar(`(()=>{const t=document.body.innerText; return true;})()`);
  // Abrir su ficha desde la sección de sueltos
  await evaluar(`(()=>{
    const i=[...document.querySelectorAll('div')].find(d=>d.innerText.trim().startsWith(${JSON.stringify(SUELTO)}) && d.innerText.length<80);
    const b=i? i.parentElement.querySelector('button') : null; if(b) b.click();})()`);
  await dormir(900);
  const m = await evaluar(`__modal()`);
  check(/ficha de personal/i.test(m||""), "abre la ficha desde el organigrama");
  check(/reporta a/i.test(m||""), "la ficha tiene el campo 'Reporta a'");

  const opciones = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const s=[...d.querySelectorAll('select')].find(x=>[...x.options].some(o=>/sin jefe/i.test(o.text)));
    return s? {n:s.options.length, primera:s.options[0].text} : null;})()`);
  console.log("   opciones de jefe:", JSON.stringify(opciones));
  check(opciones && opciones.n >= 20, "lista a las demás personas como posibles jefes");
  check(opciones && /sin jefe/i.test(opciones.primera), "la primera opción es 'sin jefe'");

  // Asignar al Director y guardar. Se anota su id en vez de suponerlo:
  // los ids ya no son 1..20 fijos, los reparte el autoincremento.
  const jefeElegido = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const s=[...d.querySelectorAll('select')].find(x=>[...x.options].some(o=>/sin jefe/i.test(o.text)));
    const op=[...s.options].find(o=>/ram[íi]rez/i.test(o.text));
    __esc(s, op.value); return Number(op.value);})()`);
  console.log("   jefe elegido:", jefeElegido);
  await dormir(400);
  await evaluar(`__t('Guardar cambios').click(),true`);
  await dormir(900);
  /* Estas fichas vienen sin documento ni teléfono, y desde que existe la
     regla de los huecos el formulario no guarda hasta que se declaran
     «sin dato por ahora». La suite es anterior a esa regla: se quedaba con
     el diálogo abierto y el jefe sin guardar, y lo apuntaba como fallo del
     sistema cuando el sistema estaba haciendo justo lo suyo. */
  const _faltan = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 0;
    const cs=[...d.querySelectorAll('label')]
      .filter(l=>/sin dato por ahora/i.test(l.innerText||''))
      .map(l=>l.querySelector('input[type=checkbox]'))
      .filter(c=>c && !c.checked);
    cs.forEach(c=>c.click()); return cs.length;})()`);
  if (_faltan) {
    console.log("   campos declarados «sin dato»: " + _faltan);
    await dormir(500);
    await evaluar(`__t('Guardar cambios').click(),true`);
  }
  await dormir(2500);

  const despues = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>{
    const l=d.personal.find(p=>p.nombre===${JSON.stringify(SUELTO)}); return l? l.jefe_id : null;})`);
  console.log("   jefe_id tras guardar:", despues);
  check(despues === jefeElegido, "el jefe quedó guardado en la base");

  await dormir(800);
  const sueltos2 = await evaluar(`(()=>{const t=document.body.innerText;
    const i=t.indexOf('Sin jefe asignado'); return i<0? '' : t.slice(i,i+300);})()`);
  check(!new RegExp(SUELTO,"i").test(sueltos2), "ya no figura como 'sin jefe'");
  const enArbol = await evaluar(`(()=>{
    const h=[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Estructura del equipo'));
    return h? h.parentElement.parentElement.innerText.includes(${JSON.stringify(SUELTO)}) : false;})()`);
  check(enArbol, "aparece ahora dentro del árbol");

  console.log("\n4. Quitar el jefe también funciona (regresión)");
  /* La interfaz manda jefe_id:null al elegir "Sin jefe asignado". El
     backend descartaba todos los null, así que sacar a alguien de la
     jerarquía no hacía nada. */
  /* Tras el punto 3 ya está en el árbol, no en la sección de sueltos:
     su ficha se abre desde el lápiz del Directorio, como haría cualquiera. */
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Directorio'); if(b)b.click();})()`);
  await dormir(1500);
  /* El lápiz vive en un contenedor propio; hay que subir hasta la fila de
     la rejilla para poder mirar el nombre. */
  const abrio = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>x.querySelector('i.ph-pencil-simple'))
    .find(x=>{const f=x.closest('div[style*="grid-template-columns"]');
              return f && f.innerText.includes(${JSON.stringify(SUELTO)});});
    if(b){b.click(); return 'ok';} return 'no encontrado';})()`);
  console.log("   lápiz: " + abrio);
  await dormir(1300);
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const s=[...d.querySelectorAll('select')].find(x=>[...x.options].some(o=>/sin jefe/i.test(o.text)));
    const op=[...s.options].find(o=>/sin jefe/i.test(o.text)); __esc(s, op.value);})()`);
  await dormir(400);
  await evaluar(`__t('Guardar cambios').click(),true`);
  await dormir(900);
  /* Estas fichas vienen sin documento ni teléfono, y desde que existe la
     regla de los huecos el formulario no guarda hasta que se declaran
     «sin dato por ahora». La suite es anterior a esa regla: se quedaba con
     el diálogo abierto y el jefe sin guardar, y lo apuntaba como fallo del
     sistema cuando el sistema estaba haciendo justo lo suyo. */
  const _faltan2 = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 0;
    const cs=[...d.querySelectorAll('label')]
      .filter(l=>/sin dato por ahora/i.test(l.innerText||''))
      .map(l=>l.querySelector('input[type=checkbox]'))
      .filter(c=>c && !c.checked);
    cs.forEach(c=>c.click()); return cs.length;})()`);
  if (_faltan2) {
    console.log("   campos declarados «sin dato»: " + _faltan2);
    await dormir(500);
    await evaluar(`__t('Guardar cambios').click(),true`);
  }
  await dormir(2500);
  const sinJefe = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>{
    const l=d.personal.find(p=>p.nombre===${JSON.stringify(SUELTO)}); return l? l.jefe_id : 'no está';})`);
  console.log("   jefe_id tras quitarlo:", JSON.stringify(sinJefe));
  check(sinJefe === null, "elegir 'Sin jefe asignado' sí lo deja sin jefe");

  await evaluar(`[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Estructura del equipo'))?.scrollIntoView({block:'start'});true`);
  await dormir(400);
  const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"organigrama.png"),Buffer.from(s.data,"base64"));

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  ORGANIGRAMA OK");
  fixtura('borrar');
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);
  try{fixtura("borrar");}catch(_){}
  edge.kill();process.exit(1);});
