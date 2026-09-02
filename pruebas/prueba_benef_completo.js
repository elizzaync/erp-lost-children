// Alta completa de beneficiario + su expediente real leído de la base.
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
const NINO = "Beneficiario de prueba ZZ";

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9387","--user-data-dir="+path.join(SP,"edge-bc"),
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
const enModal = (etiqueta, valor) => evaluar(`(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim().toLowerCase()===${JSON.stringify(etiqueta)}.toLowerCase() && x.children.length===0);
  if(!rot) return 'no está el rótulo';
  const campo=rot.parentElement.querySelector('input,select');
  if(!campo) return 'sin campo';
  const proto=campo.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
  const f=Object.getOwnPropertyDescriptor(proto,'value').set;
  f.call(campo, ${JSON.stringify(valor)});
  campo.dispatchEvent(new Event('input',{bubbles:true}));
  campo.dispatchEvent(new Event('change',{bubbles:true}));
  return 'ok';})()`);

// Todo genérico: ni documento real ni narrativa de caso.
const CAMPOS = [
  ["Nombre completo", NINO], ["Sala", "Sala A"], ["Grado", "Primaria"],
  ["Año de ingreso", "2024"],
  ["Procedencia", "—"], ["Lengua materna", "—"], ["Vía de ingreso", "—"],
  ["Situación legal", "—"], ["Referente familiar", "—"], ["Régimen de visitas", "—"],
  ["Institución educativa", "—"], ["Rendimiento", "—"], ["Refuerzo escolar", "—"],
  ["Seguro", "—"], ["Alergias", "Ninguna"], ["Control médico", "—"],
  ["Tratamiento", "—"], ["Plan de vida", "—"],
];

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9387/json/list").then(r=>r.json());
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

  /* La limpieza de restos va DESPUÉS de entrar. Iba antes, y sin sesión
     /api/beneficiarios responde 401: `d.beneficiarios` llegaba undefined y
     la suite moría en la primera línea, antes de comprobar nada. El DELETE
     además necesita el CSRF, que solo existe una vez identificado. */
  await evaluar(`fetch('${BASE}/api/beneficiarios').then(r=>r.json()).then(d=>
    Promise.all((d.beneficiarios||[]).filter(x=>x.nombre===${JSON.stringify(NINO)})
      .map(x=>fetch('${BASE}/api/beneficiarios/'+x.id,{method:'DELETE'}))))`);
  await enviar("Page.reload"); await dormir(3200);
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

  console.log("\n1. El formulario pide todos los campos del Expediente");
  await evaluar(`__t('Agregar beneficiario').click(),true`); await dormir(1400);
  const m0 = (await modal()) || "";
  const esperados = ["Procedencia","Lengua materna","Vía de ingreso","Situación legal",
                     "Expediente judicial","Referente familiar","Régimen de visitas",
                     "Institución educativa","Rendimiento","Refuerzo escolar",
                     "Seguro","Alergias","Control médico","Tratamiento",
                     "Tutor asignado","Psicólogo/a","Plan de vida"];
  const faltan = esperados.filter(c => !m0.toLowerCase().includes(c.toLowerCase()));
  console.log("   faltan en el formulario: " + (faltan.length ? JSON.stringify(faltan) : "ninguno"));
  check(faltan.length === 0, "están las 17 secciones/campos nuevos");
  check(/tutor y la psicóloga se eligen del personal/i.test(m0), "explica que tutor y psicóloga se eligen, no se escriben");
  await foto("benef-form-completo.png");

  console.log("\n2. Tutor y psicóloga son listas del personal real");
  const sel = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const ss=[...d.querySelectorAll('select')];
    return ss.map(x=>({n:x.options.length, primera:x.options[0]? x.options[0].text : ''}));})()`);
  console.log("   " + JSON.stringify(sel));
  const listas = sel.filter(x => x.n > 5);
  check(listas.length >= 2, "hay dos desplegables con el personal");
  check(listas.every(x => /sin asignar/i.test(x.primera)), "ambos permiten dejarlo sin asignar");

  console.log("\n3. Llenar y guardar");
  for (const [rot, val] of CAMPOS) {
    const r = await enModal(rot, val);
    if (r !== "ok") console.log(`   (${rot}: ${r})`);
  }
  // Tutor: la primera persona real de la lista
  const tutor = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const s=[...d.querySelectorAll('select')].find(x=>x.options.length>5);
    const op=s.options[1];
    const f=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
    f.call(s, op.value); s.dispatchEvent(new Event('change',{bubbles:true}));
    return op.text;})()`);
  console.log("   tutor elegido: " + tutor);
  await dormir(500);
  const registrar = `(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>/Registrar beneficiario/.test(x.innerText)); if(b)b.click();})()`;
  await evaluar(registrar);
  await dormir(900);
  /* La lista de «sin dato por ahora» solo aparece DESPUÉS de intentar
     guardar: es la respuesta del formulario a lo que falta. Se marca lo
     que pida y se vuelve a intentar, como haría una persona. Sin esto la
     suite leía la negativa del formulario como que guardar estaba roto. */
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
    await evaluar(registrar);
  }
  await dormir(2800);
  check(await modal() === null, "guarda y cierra");

  const b = await evaluar(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>
    d.beneficiarios.find(x=>x.nombre===${JSON.stringify(NINO)}) || null)`);
  check(b !== null, "quedó en la base");
  const guardados = ["procedencia","lengua_materna","via_ingreso","situacion_legal",
                     "referente_familiar","regimen_visitas","institucion_educativa",
                     "rendimiento","refuerzo_escolar","seguro","alergias",
                     "control_medico","tratamiento","plan_vida"].filter(c => b && b[c]);
  console.log(`   campos de texto guardados: ${guardados.length}/14`);
  check(guardados.length === 14, "los 14 campos de texto se guardaron");
  console.log("   tutor_id: " + b.tutor_id + " -> " + b.tutor_nombre);
  check(!!b.tutor_id && !!b.tutor_nombre, "el tutor quedó guardado como FK y se resuelve el nombre");
  check(b.alergias === "Ninguna", "el valor concreto llegó tal cual");

  console.log("\n4. Ficha incompleta: dice qué falta, no bloquea");
  /* Esta ficha se guardó declarando sus huecos «sin dato por ahora», así
     que NO le falta nada: un hueco declarado deja de ser un olvido, y esa
     es justo la diferencia que el sistema tiene que saber hacer. */
  console.log("   faltantes de la ficha con huecos declarados: " + JSON.stringify(b.faltantes));
  check(Array.isArray(b.faltantes), "el API informa qué falta");
  check(b.faltantes.length === 0, "un hueco declarado deja de contar como falta");

  /* La ficha de verdad incompleta es la que nadie declaró: las que ya
     estaban en la base antes de esta regla. Se crea una por la API, que es
     como llegaron, y se comprueba que el sistema la señala. */
  const INCOMPLETO = "Beneficiario incompleto ZZ";
  const inc = await evaluar(`fetch('/api/beneficiarios',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({nombre:${JSON.stringify(INCOMPLETO)}})})
    .then(()=>fetch('/api/beneficiarios')).then(r=>r.json())
    .then(d=>(d.beneficiarios||[]).find(x=>x.nombre===${JSON.stringify(INCOMPLETO)})||null)`);
  console.log("   faltantes de la ficha sin declarar: " + JSON.stringify(inc && inc.faltantes));
  check(!!inc && inc.faltantes.includes("Documento"), "detecta el documento vacío");

  // Se recarga para que la pantalla lea lo recién creado: la lista se trae
  // una vez al entrar en ella, y volver por el menú no la vuelve a pedir.
  // entrar() recarga y vuelve a dejar puesta la envoltura del CSRF; una
  // recarga a secas se la lleva y los DELETE de después salen sin token.
  await entrar();
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase())); true;`);
  await evaluar(`__t('Personal').click(),true`); await dormir(1500);
  await evaluar(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios'); if(b)b.click();})()`);
  await dormir(1700);
  const lista = await main();
  check(/Ficha incompleta/.test(lista), "la tarjeta lo avisa");

  // Y se retira: no se deja rastro de prueba en la base.
  await evaluar(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>
    Promise.all((d.beneficiarios||[]).filter(x=>x.nombre===${JSON.stringify(INCOMPLETO)})
      .map(x=>fetch('/api/beneficiarios/'+x.id,{method:'DELETE'}))))`);

  console.log("\n5. La tarjeta REAL abre su expediente");
  const abrio = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .find(x=>x.innerText.includes(${JSON.stringify(NINO)}));
    if(b){b.click(); return 'ok';} return 'no clicable';})()`);
  console.log("   " + abrio);
  check(abrio === "ok", "la tarjeta del beneficiario real es clicable");
  await dormir(1800);
  const exp = await main();
  check(/Expediente del beneficiario/i.test(await evaluar(`(document.querySelector('h1')||{}).innerText`)),
        "abre el Expediente");
  check(exp.includes(NINO), "muestra a la persona correcta");
  check(!/Beneficiario de prueba 0/.test(exp), "NO muestra un marcador de la maqueta");

  console.log("\n6. El expediente lee de la base");
  check(/BEN-/.test(exp), "muestra su código");
  check(/Ninguna/.test(exp), "muestra las alergias que se guardaron");
  check(exp.includes(tutor.split(" — ")[0]), "muestra el tutor asignado");
  /* Antes esperaba «Ficha incompleta» aquí. Ya no toca: los huecos de esta
     ficha se declararon al guardarla, y el expediente tiene que respetar
     esa declaración en vez de seguir reclamando. Que el aviso SÍ aparece
     cuando falta de verdad se comprueba arriba, en la tarjeta. */
  check(!/Faltan por registrar/.test(exp),
        "no reclama los huecos que ya se declararon «sin dato»");
  await foto("benef-expediente-real.png");

  console.log("\n8. Limpieza");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Volver a beneficiarios/.test(x.innerText)); if(b)b.click();})()`);
  await dormir(1200);
  const quedan = await evaluar(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>{
    const x=d.beneficiarios.filter(y=>y.nombre===${JSON.stringify(NINO)});
    return Promise.all(x.map(y=>fetch('/api/beneficiarios/'+y.id,{method:'DELETE'})))
      .then(()=>fetch('/api/beneficiarios')).then(r=>r.json())
      .then(d2=>d2.beneficiarios.filter(y=>y.nombre===${JSON.stringify(NINO)}).length);})`);
  check(quedan === 0, "beneficiario de prueba eliminado (sin contar las fichas del usuario)");

  check(errores.length === 0, "cero errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  BENEFICIARIO COMPLETO OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
