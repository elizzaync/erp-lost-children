// 1) subir archivo real  2) ficha completa desde el alta  3) beneficiarios
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
const NOMBRE = "Zzz Ficha Completa";
const NINO = "Zzz Nino Interfaz";

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9375","--user-data-dir="+path.join(SP,"edge-tres"),
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
/* Empleados y Beneficiarios pasaron a ser submódulos del menú lateral; el
   resto siguen siendo pestañas dentro de la página. Se busca primero en el
   menú y, si no está ahí, en el contenido. */
const irA = async (tab) => {
  await evaluar(`(()=>{const busca=(raiz)=>raiz ? [...raiz.querySelectorAll('button')]
      .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(tab)}) : null;
    const b = busca(document.querySelector('nav > div:first-child'))
           || busca(document.querySelector('main'))
           || busca(document.body);
    if(b)b.click();})()`);
  await dormir(1600);
};
const ponerEnModal = (etiqueta, valor) => evaluar(`(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(etiqueta)}
    && x.children.length===0);
  if(!rot) return 'no está el rótulo';
  const campo=rot.parentElement.querySelector('input,select');
  if(!campo) return 'sin campo';
  const proto=campo.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
  const f=Object.getOwnPropertyDescriptor(proto,'value').set;
  f.call(campo, ${JSON.stringify(valor)});
  campo.dispatchEvent(new Event('input',{bubbles:true}));
  campo.dispatchEvent(new Event('change',{bubbles:true}));
  return 'ok';})()`);

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9375/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t){ console.log("DIAGNOSTICO: BASE=" + BASE);
    try{ const l=await fetch("http://127.0.0.1:9375/json/list").then(r=>r.json());
      console.log("   pestañas: " + l.map(x=>x.type+":"+(x.url||"").slice(0,44)).join(" | ")); }
    catch(e){ console.log("   no responde el navegador: " + e.message); }
    process.exit(1); }
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails; errores.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  /* Aquí había un `const BASE = BASE;` —resto de una edición a medias— que
     hacía que la constante de arriba no existiera para nadie: el archivo
     entero moría antes de la primera comprobación, y el mensaje que salía
     («webSocketDebuggerUrl de null») señalaba a otro sitio.

     La limpieza va DESPUÉS de entrar(): sin sesión, /api/personal no
     devuelve lista, y el borrado sin token CSRF se rechaza. */
  await entrar();
  /* El token CSRF, a mano para los borrados de limpieza: el
     servidor rechaza sin él cualquier operación que cambie datos. */
  await (__ent || evaluar)(`fetch('/api/sesion').then(r=>r.json())
    .then(d=>{window.__csrf=(d.sesion||{}).csrf||'';return true;})`);
  await evaluar(`(async()=>{
    const ss = await fetch('/api/sesion').then(r=>r.json()).catch(()=>({}));
    const csrf = (ss.sesion||{}).csrf || '';
    const quita = async (ruta, clave, nombre) => {
      const d = await fetch(ruta).then(r=>r.json());
      const míos = (d[clave]||[]).filter(x=>x.nombre===nombre);
      for (const x of míos)
        await fetch(ruta + '/' + x.id,
                    {method:'DELETE', headers:{'X-CSRF-Token': csrf}});
    };
    await quita('/api/personal', 'personal', ${JSON.stringify(NOMBRE)});
    await quita('/api/beneficiarios', 'beneficiarios', ${JSON.stringify(NINO)});
  })()`);
  await enviar("Page.reload"); await dormir(3200);
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

  // ─── PUNTO 2: formulario de alta completo ───────────────────────────
  console.log("\n=== 2. El alta pide una ficha completa ===");
  await irA("Directorio");
  await evaluar(`__t('Agregar usuario').click(),true`); await dormir(1300);
  const m0 = await modal();
  for (const campo of ["Correo electrónico", "Teléfono / celular", "Dirección",
                       "Contacto de emergencia", "Fecha de ingreso", "Fecha de nacimiento"]) {
    check((m0||"").toLowerCase().includes(campo.toLowerCase()), `pide "${campo}"`);
  }
  await foto("alta-form-completo.png");

  for (const [rot, val] of [["Nombre completo", NOMBRE], ["Documento", "88888888"],
                            ["Cargo", "Tutora"], ["Área", "Casa Hogar"], ["Sede", "Comas"],
                            ["Fecha de ingreso", "2026-08-01"], ["Fecha de nacimiento", "1995-04-20"],
                            ["Correo electrónico", "prueba@lostchildren.pe"],
                            ["Teléfono / celular", "987654321"],
                            ["Dirección", "Av. Siempre Viva 742, Comas"]]) {
    const r = await ponerEnModal(rot, val);
    if (r !== "ok") console.log(`   (${rot}: ${r})`);
  }
  // Los de emergencia comparten rótulos "Nombre" y "Teléfono"
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const sec=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()==='Contacto de emergencia' && x.children.length===0);
    const cont=sec.parentElement;
    const ins=[...cont.querySelectorAll('input')];
    const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    f.call(ins[0],'María Pérez (madre)'); ins[0].dispatchEvent(new Event('input',{bubbles:true}));
    f.call(ins[1],'912345678'); ins[1].dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await dormir(500);
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>/Crear ficha/.test(x.innerText)); if(b)b.click();})()`);
  await dormir(2800);
  check(await modal() === null, "guarda la ficha");

  const ficha = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>
    d.personal.find(x=>x.nombre===${JSON.stringify(NOMBRE)}) || null)`);
  console.log("   guardado: " + JSON.stringify({email:ficha.email, tel:ficha.telefono,
    dir:ficha.direccion, emer:ficha.emergencia_nombre, emerTel:ficha.emergencia_telefono,
    ingreso:ficha.fecha_ingreso, nac:ficha.fecha_nac}));
  check(ficha.email === "prueba@lostchildren.pe", "el correo llegó a la base");
  check(ficha.telefono === "987654321", "el teléfono también");
  check(ficha.direccion.includes("Siempre Viva"), "la dirección también");
  check(ficha.emergencia_nombre === "María Pérez (madre)", "el contacto de emergencia");
  check(ficha.emergencia_telefono === "912345678", "y su teléfono");
  check(ficha.fecha_ingreso === "2026-08-01", "la fecha de ingreso");
  const PID = ficha.id;

  // ─── PUNTO 1: subir archivo real ────────────────────────────────────
  console.log("\n=== 1. Subir el archivo real de un documento ===");
  await irA("Documentos");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>/Agregar documento/.test(x.innerText))
    .find(x=>{const c=x.closest('div[style*="border"]'); return c && c.innerText.includes(${JSON.stringify(NOMBRE)});});
    if(b)b.click();})()`);
  await dormir(1300);
  const m1 = await modal();
  check(/Archivo/i.test(m1||""), "el formulario tiene campo de archivo");
  check(!/Todavía no se pueden adjuntar/i.test(m1||""), "ya no dice que no se puede adjuntar");
  check(/no genera documentos/i.test(m1||""), "explica que guarda el archivo que subas");
  const hayInput = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const i=d.querySelector('input[type=file]'); return i? i.accept : null;})()`);
  console.log("   accept: " + hayInput);
  check(!!hayInput && hayInput.includes(".pdf"), "acepta PDF y compañía");
  await foto("doc-form-archivo.png");

  // Se inyecta un PDF de verdad en el input
  const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const inp=d.querySelector('input[type=file]');
    const blob=new Blob([${JSON.stringify(PDF)}], {type:'application/pdf'});
    const file=new File([blob], 'contrato firmado.pdf', {type:'application/pdf'});
    const dt=new DataTransfer(); dt.items.add(file); inp.files=dt.files;
    inp.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await dormir(900);
  const m2 = await modal();
  console.log("   " + (m2||"").match(/contrato firmado\.pdf[^·]*/i));
  check(/contrato firmado\.pdf/i.test(m2||""), "muestra el archivo elegido");
  await ponerEnModal("Vence el", "2027-05-30");
  await dormir(400);
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Registrar'); if(b)b.click();})()`);
  await dormir(3000);
  check(await modal() === null, "guarda y cierra");

  const docs = await evaluar(`fetch('/api/personal/'+${PID}+'/documentos').then(r=>r.json()).then(d=>d.documentos)`);
  console.log("   en la base: " + JSON.stringify(docs.map(d=>({n:d.nombre, arch:d.archivo_nombre, tam:d.archivo_tam}))));
  check(docs.length === 1 && docs[0].archivo_nombre === "contrato firmado.pdf",
        "el archivo real quedó asociado a la persona");
  check(docs[0].archivo_tam > 0, "con su tamaño");

  console.log("\n   Y se puede volver a abrir:");
  const desc = await evaluar(`fetch('/api/documentos/'+${docs[0].id}+'/archivo')
    .then(r=>r.text().then(t=>({estado:r.status, tipo:r.headers.get('Content-Type'), inicio:t.slice(0,8)})))`);
  console.log("   " + JSON.stringify(desc));
  check(desc.estado === 200, "la descarga responde 200");
  check(desc.inicio.startsWith("%PDF"), "devuelve el PDF que se subió");

  await dormir(500);
  const t3 = await main();
  check(/contrato firmado\.pdf|POR VENCER|VIGENTE/i.test(t3), "la fila aparece en la lista");
  /* La tarjeta de cada persona es el ANCESTRO MÁS CERCANO que contiene su
     botón "Agregar documento" — hay exactamente uno por tarjeta. Subir un
     número fijo de niveles alcanzaba un contenedor con varias tarjetas y
     devolvía el adjunto de otra persona. */
  const clip = await evaluar(`(()=>{const tarjetaDe=(el)=>{let n=el;
      while(n && n.parentElement){ n=n.parentElement;
        const b=[...n.querySelectorAll('button')].filter(x=>/Agregar documento/.test(x.innerText));
        if(b.length===1) return n;
        if(b.length>1) return null; }
      return null;};
    const b=[...document.querySelectorAll('button')]
      .filter(x=>x.querySelector('i.ph-paperclip'))
      .find(x=>{const c=tarjetaDe(x); return c && c.innerText.includes(${JSON.stringify(NOMBRE)});});
    if(!b) return null;
    let url=null; const orig=window.open; window.open=(u)=>{url=u; return null;};
    b.click(); window.open=orig;
    return {title:b.title, abre:url};})()`);
  console.log("   botón de adjunto: " + JSON.stringify(clip));
  check(!!clip && /contrato firmado\.pdf/.test(clip.title), "hay botón para abrir el adjunto");
  check(!!clip && /\/api\/documentos\/\d+\/archivo/.test(clip.abre || ""), "y al pulsarlo abre el archivo");
  await foto("doc-con-archivo.png");

  console.log("\n   Rechazo de un tipo no admitido:");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>/Agregar documento/.test(x.innerText))
    .find(x=>{const c=x.closest('div[style*="border"]'); return c && c.innerText.includes(${JSON.stringify(NOMBRE)});});
    if(b)b.click();})()`);
  await dormir(1200);
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const inp=d.querySelector('input[type=file]');
    const file=new File([new Blob(['MZ'])], 'virus.exe', {type:'application/octet-stream'});
    const dt=new DataTransfer(); dt.items.add(file); inp.files=dt.files;
    inp.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await dormir(900);
  check(/no admitido/i.test((await modal())||""), "avisa antes de subir un .exe");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Cancelar'); if(b)b.click();})()`);
  await dormir(800);

  // ─── PUNTO 3: beneficiarios ─────────────────────────────────────────
  console.log("\n=== 3. Beneficiarios tiene su propio alta ===");
  for (const tab of ["Directorio", "Organigrama", "Documentos", "Contratos"]) {
    await irA(tab);
    const l = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Agregar (usuario|beneficiario)/.test(x.innerText));
      return b? b.innerText.trim() : null;})()`);
    check(l === "Agregar usuario", `en ${tab} sigue diciendo "Agregar usuario"`);
  }
  await irA("Beneficiarios");
  const lb = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Agregar (usuario|beneficiario)/.test(x.innerText));
    return b? b.innerText.trim() : null;})()`);
  console.log("   botón en Beneficiarios: " + JSON.stringify(lb));
  check(lb === "Agregar beneficiario", "en Beneficiarios dice 'Agregar beneficiario'");

  await evaluar(`__t('Agregar beneficiario').click(),true`); await dormir(1300);
  const mb = await modal();
  console.log("   " + (mb||"").slice(0,220));
  check(/Nuevo beneficiario/i.test(mb||""), "abre el formulario de un niño");
  for (const c of ["Casa", "Sala", "Grado", "Año de ingreso", "Fecha de nacimiento"]) {
    check((mb||"").toLowerCase().includes(c.toLowerCase()), `pide "${c}"`);
  }
  for (const noDebe of ["Cargo", "Área", "Reporta a", "Vínculo", "Sueldo"]) {
    check(!(mb||"").toLowerCase().includes(noDebe.toLowerCase()), `NO pide "${noDebe}" (es de un colaborador)`);
  }
  check(/datos de un menor/i.test(mb||""), "avisa que son datos de un menor");
  await foto("benef-form.png");

  for (const [rot, val] of [["Nombre completo", NINO], ["Documento", "70000001"],
                            ["Fecha de nacimiento", "2016-05-10"],
                            ["Sala", "Sala B"], ["Grado", "4.º primaria"],
                            ["Año de ingreso", "2023"]]) {
    const r = await ponerEnModal(rot, val);
    if (r !== "ok") console.log(`   (${rot}: ${r})`);
  }
  await dormir(600);
  check(/Edad:/.test((await modal())||""), "calcula la edad a partir del nacimiento");
  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Casa Comas'); if(b)b.click();})()`);
  await dormir(400);
  /* Guardar pide antes los campos que faltan: se declaran «sin dato por
     ahora», que es lo que haría una persona con la ficha a medias. */
  console.log("   campos «sin dato»: "
    + await guardarFicha(evaluar, dormir, "Registrar beneficiario"));
  await dormir(1800);
  check(await modal() === null, "guarda y cierra");

  const bene = await evaluar(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>
    d.beneficiarios.find(x=>x.nombre===${JSON.stringify(NINO)}) || null)`);
  console.log("   en la base: " + JSON.stringify(bene));
  check(bene !== null, "quedó en la tabla 'beneficiarios'");
  check(bene && bene.casa === "Casa Comas" && bene.sala === "Sala B", "con su casa y sala");
  check(bene && bene.grado === "4.º primaria", "y su grado");
  const enPersonal = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>
    d.personal.some(x=>x.nombre===${JSON.stringify(NINO)}))`);
  check(enPersonal === false, "NO se coló en 'personal'");

  await dormir(600);
  const tb = await main();
  check(tb.includes(NINO), "aparece en la pestaña Beneficiarios");
  check(/Registrados en el sistema/i.test(tb), "en la sección de reales");
  /* Antes se exigía que la maqueta de doce apareciera aparte y etiquetada.
     Se borró, así que ahora se exige lo contrario: que no haya ninguna
     sección de relleno de la que separarse. */
  check(!/Maqueta de dise/i.test(tb), "ya no hay ninguna sección de maqueta");
  await foto("benef-lista-real.png");

  console.log("\n=== Nada más se rompió ===");
  check(errores.length === 0, "cero errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);
  // Planillas salió del menú al desactivarse; se recorre lo que queda activo.
  for (const [v, esperado] of [["Dashboard","Dashboard"],["Registro de Asistencia","Asistencia"],["Personal","Hoja de Vida"]]) {
    await evaluar(`__t(${JSON.stringify(v)}).click(),true`); await dormir(1600);
    const h = await evaluar(`(document.querySelector('h1')||{}).innerText`);
    check(new RegExp(esperado).test(h), `${v} sigue bien`);
  }

  console.log("\n=== Limpieza ===");
  /* El token se pide EN EL MOMENTO: guardarlo en window no sirve, porque
     cualquier recarga por el camino se lo lleva. */
  await evaluar(`(async()=>{
    const ss = await fetch('/api/sesion').then(r=>r.json()).catch(()=>({}));
    const csrf = (ss.sesion||{}).csrf || '';
    return fetch('/api/personal/'+${PID},
      {method:'DELETE', headers:{'X-CSRF-Token': csrf}});})()`);
  await dormir(900);
  const quedan = await evaluar(`fetch('/api/personal').then(r=>r.json()).then(d=>
    d.personal.filter(x=>x.nombre===${JSON.stringify(NOMBRE)}).length)`);
  check(quedan === 0, "persona de prueba eliminada");
  /* El beneficiario también: si no, cada tanda deja uno y acaban
     contaminando el conteo de candidatos a enrolar. */
  const borradoNino = await evaluar(`(async()=>{
    const d = await fetch('/api/beneficiarios').then(r=>r.json());
    const b = (d.beneficiarios||[]).filter(x=>x.nombre===${JSON.stringify(NINO)});
    const ss = await fetch('/api/sesion').then(r=>r.json()).catch(()=>({}));
    const csrf = (ss.sesion||{}).csrf || '';
    for (const x of b)
      await fetch('/api/beneficiarios/'+x.id,
                  {method:'DELETE', headers:{'X-CSRF-Token': csrf}});
    /* Devolvía b.length: los que había ANTES de borrar. Cuando de verdad
       había uno que limpiar —o sea, siempre— la comprobación fallaba por
       haber hecho su trabajo. Se vuelve a contar después. */
    const d2 = await fetch('/api/beneficiarios').then(r=>r.json());
    return (d2.beneficiarios||[]).filter(x=>x.nombre===${JSON.stringify(NINO)}).length;})()`);
  check(borradoNino === 0, "beneficiario de prueba eliminado");

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  LOS TRES PUNTOS OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
