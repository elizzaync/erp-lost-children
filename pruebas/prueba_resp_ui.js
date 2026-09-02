// Responsables / Tutores: alta, búsqueda, ficha y borrado, contra el backend real.
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
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9403","--user-data-dir="+path.join(SP,"edge-resp"),
  "--window-size=1440,1100",BASE + "/"], { stdio:"ignore" });
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
const NOMBRE = "Zzz Rosa Responsable";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9403/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  /* Pulsa un botón DENTRO de la fila de una persona. Sin esto se pulsa
     el primero de la tabla, que desde que la base tiene otras fichas ya
     no es el de la prueba. */
  const clicEnFilaDe=(nombre,texto)=>ev(`(()=>{
    const filas=[...document.querySelectorAll('tr')];
    const fila=filas.find(f=>(f.innerText||'').includes(${JSON.stringify("@NOMBRE@")}));
    if(!fila) return 'no está la fila de ' + ${JSON.stringify("@NOMBRE@")};
    const b=[...fila.querySelectorAll('button')].find(x=>((x.innerText||'').trim().toLowerCase())===${JSON.stringify("@TEXTO@")}.toLowerCase());
    if(!b) return 'la fila no tiene botón ' + ${JSON.stringify("@TEXTO@")};
    b.click(); return 'ok';})()`.replace(/@NOMBRE@/g, nombre).replace(/@TEXTO@/g, texto));

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);
  // Escribe en el campo cuyo rótulo (el div de encima) coincide
  const ponerCampo=(rotulo,valor)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return 'sin rotulo';
    const inp=rot.parentElement.querySelector('input,textarea');
    if(!inp) return 'sin input';
    const proto = inp.tagName==='INPUT'? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(inp,${JSON.stringify(valor)});
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);

  await entrar();

  console.log("1. El submódulo existe y está vacío");
  check(await clicNav("Responsables / Tutores"), "se llega desde el menú");
  await dormir(1800);
  let c = await main();
  /* Antes se exigía la lista vacía. Deja de valer en cuanto el equipo
     registre a su primer responsable: lo que se prueba es que la pantalla
     carga y ofrece el alta, no que no haya nadie dentro. */
  check(/Responsables/.test(c), "la pantalla de responsables carga");
  check(/Agregar responsable/.test(c), "ofrece el alta");
  check(!/por construir/i.test(c), "ya no es una pantalla en construcción");
  await foto("resp-vacio.png");

  console.log("\n2. Alta de un responsable");
  await clic("Agregar responsable"); await dormir(1300);
  console.log("   nombre:", await ponerCampo("Nombres y apellidos", NOMBRE));
  console.log("   documento:", await ponerCampo("Documento", "ZZ-77777"));
  console.log("   teléfono:", await ponerCampo("Teléfono", "988111222"));
  console.log("   ocupación:", await ponerCampo("Ocupación", "Comerciante"));
  console.log("   distrito:", await ponerCampo("Distrito", "Comas"));
  await clic("Registrar responsable"); await dormir(2200);
  c = await main();
  check(new RegExp(NOMBRE).test(c), "aparece en el listado");
  check(/ZZ-77777/.test(c), "con su documento");
  check(/Ninguno/.test(c), "y sin beneficiarios vinculados todavía");
  await foto("resp-listado.png");

  console.log("\n3. Se guardó de verdad en la base");
  const api = await ev(`fetch('/api/responsables').then(r=>r.json()).then(d=>d.responsables.map(r=>({n:r.nombre,d:r.documento,t:r.telefono,o:r.ocupacion,or:r.origen})))`);
  console.log("   " + JSON.stringify(api));
  const guardado = api.find(r => r.n === NOMBRE);
  check(!!guardado, "está en /api/responsables");
  check(guardado && guardado.t === "988111222" && guardado.o === "Comerciante",
        "con teléfono y ocupación");
  check(guardado && guardado.or === "manual",
        "marcado como alta manual, no migrada");

  console.log("\n4. El buscador");
  await ev(`(()=>{const i=document.querySelector('main input[type=text]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,'ZZ-77777');
    i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await dormir(1600);
  c = await main();
  check(new RegExp(NOMBRE).test(c), "encuentra por documento");
  await ev(`(()=>{const i=document.querySelector('main input[type=text]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,'noexisteesto');
    i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await dormir(1600);
  c = await main();
  check(/Ningún responsable coincide/.test(c), "y avisa cuando no hay coincidencias");
  await ev(`(()=>{const i=document.querySelector('main input[type=text]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,'');
    i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await dormir(1600);

  console.log("\n5. La ficha se abre con el nombre");
  await clic(NOMBRE); await dormir(1600);
  c = await main();
  check(/Ficha del responsable/i.test(c), "se despliega la ficha");
  check(/Comerciante/.test(c), "muestra los datos guardados");
  check(/Sin registrar/.test(c), "y dice qué falta, en vez de dejarlo en blanco");
  check(/Todavía no está vinculado a ningún beneficiario/.test(c),
        "explica que aún no tiene beneficiarios");
  await foto("resp-ficha.png");

  console.log("\n6. Editar conserva el resto");
  console.log("   editar la fila propia:", await clicEnFilaDe(NOMBRE, "Editar"));
  await dormir(1300);
  console.log("   correo:", await ponerCampo("Correo", "zzz@ejemplo.pe"));
  await clic("Guardar cambios"); await dormir(2200);
  const tras = await ev(`fetch('/api/responsables').then(r=>r.json()).then(d=>d.responsables.find(r=>r.nombre===${JSON.stringify(NOMBRE)}))`);
  check(tras && tras.correo === "zzz@ejemplo.pe", "guarda el campo nuevo");
  check(tras && tras.telefono === "988111222", "y no pierde los anteriores");

  console.log("\n7. Borrado con aviso");
  console.log("   eliminar la fila propia:", await clicEnFilaDe(NOMBRE, "Eliminar"));
  await dormir(1300);
  c = await ev(`document.body.innerText`);
  check(new RegExp("¿Eliminar a " + NOMBRE).test(c), "pregunta antes de borrar");
  check(/No está vinculado a ningún beneficiario/.test(c), "y dice qué se lleva por delante");
  await clic("Sí, eliminar"); await dormir(2200);
  const quedan = await ev(`fetch('/api/responsables').then(r=>r.json())
    .then(d=>d.responsables.filter(r=>/^Zzz /.test(r.nombre)).length)`);
  check(quedan === 0, `la prueba no deja nada suyo dentro (${quedan})`);

  console.log("\n8. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  RESPONSABLES OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
