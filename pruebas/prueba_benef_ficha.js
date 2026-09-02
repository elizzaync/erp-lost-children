// La ficha completa del beneficiario: se escribe, se guarda y vuelve al editar.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
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
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9409","--user-data-dir="+path.join(SP,"edge-bficha"),
  "--window-size=1440,1200",BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const foto=async n=>{const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,n),Buffer.from(s.data,"base64"));};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

const NINO = "Zzz Ficha Completa";

// Un valor distinto por campo, para detectar si alguno se cruza con otro.
const DATOS = {
  "Código":"BEN-ZZ9", "Sexo":"F", "Nacionalidad":"Peruana",
  "Lugar de nacimiento":"Cusco",
  "Departamento":"Lima", "Provincia":"Lima", "Distrito":"Comas",
  "Dirección":"Jr. Zzz 123", "Referencia":"Frente al parque",
  "Tipo de vivienda":"Alquilada", "Servicios básicos":"Agua y luz",
  "Nivel":"Primaria", "Sección":"B", "Turno":"Mañana",
  "Año académico":"2026", "Situación académica":"Regular",
  "Asistencia escolar":"95%", "Dificultades de aprendizaje":"Lectura",
  "Observaciones educativas":"Mejora sostenida",
  "Tipo de seguro":"SIS", "Centro de salud":"Posta Comas",
  "Discapacidad":"Ninguna", "Necesidades especiales":"Refuerzo",
  "Información médica relevante":"Asma leve",
  "Contacto de emergencia":"Zzz Tia", "Teléfono de emergencia":"988777666",
  "Observaciones de salud":"Control anual",
  "Integrantes del hogar":"5", "Hermanos":"2",
  "Con quién vive":"Abuela", "Responsable económico":"Abuela",
  "Tenencia de la vivienda":"Alquiler", "Rango de ingresos":"Menos de 1000",
  "Personas dependientes":"3", "Observaciones":"Situación estable",
};

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9409/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const clicModal=t=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return false;
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim().toLowerCase()===${JSON.stringify(t)}.toLowerCase());
    if(!b) return false; b.click(); return true;})()`);
  const escribir=(rotulo,valor)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return 'sin rotulo';
    const inp=rot.parentElement.querySelector('input');
    if(!inp) return 'sin input';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,${JSON.stringify(valor)});
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);
  const leer=(rotulo)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return null;
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return null;
    const inp=rot.parentElement.querySelector('input');
    return inp? inp.value : null;})()`);

  await entrar();

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await __ent(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);
  await clicNav("Beneficiarios"); await dormir(2000);

  console.log("1. El formulario trae las cinco secciones nuevas");
  await clic("Agregar beneficiario"); await dormir(1400);
  const m = await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);return d?d.innerText:'';})()`);
  for (const sec of ["IDENTIDAD","DOMICILIO","INFORMACIÓN EDUCATIVA",
                     "INFORMACIÓN DE SALUD","SITUACIÓN FAMILIAR Y SOCIOECONÓMICA"]) {
    check(m.toUpperCase().includes(sec), `sección ${sec}`);
  }
  check(/Datos de salud de un menor/i.test(m),
        "la sección de salud avisa de que el permiso por sección está pendiente");

  console.log("\n2. Se rellenan los 35 campos");
  console.log("   nombre:", await escribir("Nombre completo", NINO));
  let malos = [];
  for (const [rot, val] of Object.entries(DATOS)) {
    const r = await escribir(rot, val);
    if (r !== "ok") malos.push(rot + ":" + r);
  }
  check(malos.length === 0, malos.length ? "no se pudo escribir en: " + malos.join(", ")
                                         : `los ${Object.keys(DATOS).length} campos aceptan valor`);
  await foto("bficha-form.png");
  /* Los campos que la ficha exige y esta prueba no rellena se marcan como
     «sin dato por ahora», que es justo lo que haría una persona. Sin esto
     el formulario se niega —con razón— y la suite lo leía como que guardar
     estaba roto. */
  /* La lista de «sin dato» solo aparece DESPUÉS de intentar guardar: es
     la respuesta del formulario a lo que falta. Así que se intenta, se
     marca lo que pida y se vuelve a intentar. */
  await clicModal("Registrar beneficiario");
  await dormir(900);
  const sinDato = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 0;
    /* Son casillas dentro de una etiqueta, no botones. */
    const cs=[...d.querySelectorAll('label')]
      .filter(l=>/sin dato por ahora/i.test(l.innerText||''))
      .map(l=>l.querySelector('input[type=checkbox]'))
      .filter(Boolean);
    cs.forEach(c=>{ c.click(); }); return cs.length;})()`);
  console.log("   marcados «sin dato»: " + sinDato);
  await dormir(700);
  check(await clicModal("Registrar beneficiario"), "se guarda");
  await dormir(2400);

  console.log("\n3. Todo llegó a la base, sin cruzarse");
  const guardado = await ev(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>d.beneficiarios.find(b=>b.nombre===${JSON.stringify(NINO)}))`);
  check(!!guardado, "la ficha existe");
  const esperado = {
    codigo:"BEN-ZZ9", sexo:"F", distrito:"Comas", direccion:"Jr. Zzz 123",
    nivel_educativo:"Primaria", seccion:"B", turno:"Mañana",
    tipo_seguro:"SIS", centro_salud:"Posta Comas", info_medica:"Asma leve",
    emergencia_telefono:"988777666", con_quien_vive:"Abuela",
    tenencia_vivienda:"Alquiler", rango_ingresos:"Menos de 1000",
  };
  const mal = Object.entries(esperado).filter(([k,v]) => guardado[k] !== v)
                    .map(([k,v]) => `${k}=${JSON.stringify(guardado[k])} (esperaba ${JSON.stringify(v)})`);
  check(mal.length === 0, mal.length ? "no coinciden: " + mal.join(" · ")
                                     : "los campos de texto llegaron a su columna");
  check(guardado.integrantes_hogar === 5 && guardado.hermanos === 2
        && guardado.personas_dependientes === 3,
        `los numéricos llegaron como número (${guardado.integrantes_hogar}/${guardado.hermanos}/${guardado.personas_dependientes})`);

  console.log("\n3b. El expediente los MUESTRA, no solo los guarda");
  await clic(NINO); await dormir(2000);
  const exp = await ev(`(document.querySelector('main')||document.body).innerText`);
  for (const sec of ["Domicilio", "Educación (detalle)", "Salud (detalle)",
                     "Situación socioeconómica"]) {
    check(exp.includes(sec), `el expediente muestra el bloque "${sec}"`);
  }
  // Valores concretos, no solo los títulos: un bloque vacío también "aparece"
  for (const [q, donde] of [["Jr. Zzz 123", "la dirección"],
                            ["Posta Comas", "el centro de salud"],
                            ["Abuela", "con quién vive"],
                            ["Asma leve", "la información médica"]]) {
    check(exp.includes(q), `y ${donde} con su valor`);
  }
  // El rótulo lleva text-transform:uppercase: se compara ignorando el caso.
  check(/categoría/i.test(exp), "aparece la categoría derivada de la edad");
  check(exp.includes("BEN-ZZ9"),
        "la cabecera usa el código escrito, no uno generado del id");
  check(/niño|adolescente|joven|primera infancia|sin fecha/i.test(exp),
        "y con un valor, no solo el rótulo");
  await foto("bficha-expediente.png");

  console.log("\n4. Al reabrir para editar, vuelven precargados");
  await clic("Editar expediente"); await dormir(1600);
  const vacios = [];
  for (const [rot, val] of Object.entries(DATOS)) {
    const v = await leer(rot);
    if (v !== val) vacios.push(`${rot}: ${JSON.stringify(v)}`);
  }
  check(vacios.length === 0, vacios.length ? "no se precargaron: " + vacios.slice(0,5).join(" · ")
                                           : "los 35 vuelven con su valor");
  await foto("bficha-editar.png");

  console.log("\n5. Editar uno no borra los demás");
  await escribir("Distrito", "San Martín de Porres");
  /* Igual que al crear: si la ficha sigue teniendo huecos, el formulario
     los pide otra vez antes de guardar. Se marcan y se guarda. */
  await clicModal("Guardar cambios"); await dormir(900);
  const sinDato2 = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 0;
    const cs=[...d.querySelectorAll('label')]
      .filter(l=>/sin dato por ahora/i.test(l.innerText||''))
      .map(l=>l.querySelector('input[type=checkbox]')).filter(Boolean);
    cs.forEach(c=>c.click()); return cs.length;})()`);
  if (sinDato2) { await dormir(600); await clicModal("Guardar cambios"); }
  await dormir(2400);
  const tras = await ev(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>d.beneficiarios.find(b=>b.nombre===${JSON.stringify(NINO)}))`);
  check(tras.distrito === "San Martín de Porres", "el cambio se guarda");
  check(tras.tipo_seguro === "SIS" && tras.con_quien_vive === "Abuela"
        && tras.integrantes_hogar === 5,
        "y el resto de secciones siguen intactas");

  console.log("\n6. Limpieza");
  const limpio = await ev(`(async()=>{
    const d = await fetch('/api/beneficiarios').then(r=>r.json());
    const b = d.beneficiarios.find(x=>x.nombre===${JSON.stringify(NINO)});
    if (b) await fetch('/api/beneficiarios/'+b.id, {method:'DELETE'});
    const q = await fetch('/api/beneficiarios').then(r=>r.json());
    return q.beneficiarios.filter(x=>/^Zzz /.test(x.nombre)).length;})()`);
  check(limpio === 0, `no queda rastro (${limpio})`);

  console.log("\n7. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  FICHA COMPLETA DEL BENEFICIARIO OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
