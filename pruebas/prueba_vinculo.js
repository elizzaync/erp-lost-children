// El vínculo responsable ↔ beneficiario, desde la ficha del niño.
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
  "--remote-debugging-port=9407","--user-data-dir="+path.join(SP,"edge-vin"),
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

const NINO = "Zzz Nino Vinculo";
const RESP = "Zzz Rosa Vinculo";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9407/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);
  const enModal=()=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0&&x.innerText.trim());return d?d.innerText:'';})()`);
  const clicModal=t=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return false;
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim().toLowerCase()===${JSON.stringify(t)}.toLowerCase());
    if(!b) return false; b.click(); return true;})()`);
  const escribirModal=(rotulo,valor)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return 'sin rotulo';
    const inp=rot.parentElement.querySelector('input');
    if(!inp) return 'sin input';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,${JSON.stringify(valor)});
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);

  await entrar();

  /* La prueba se abastece sola: crea el niño y la responsable por la API y se
     los lleva al terminar. */
  console.log("0. Fixtura propia");
  const creados = await ev(`(async()=>{
    const b = await fetch('/api/beneficiarios', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({nombre:${JSON.stringify(NINO)}, casa:'Casa Lima', sala:'Sala A'})}).then(r=>r.json());
    const r = await fetch('/api/responsables', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({nombre:${JSON.stringify(RESP)}, documento:'ZZV-1', telefono:'977000111'})}).then(r=>r.json());
    return {ben: (b.beneficiario||{}).id || b.id, resp: r.id};})()`);
  console.log("   beneficiario " + creados.ben + " · responsable " + creados.resp);
  check(!!creados.ben && !!creados.resp, "se crean los dos registros de prueba");
  await enviar("Page.reload", {}); await dormir(3200);
  /* La recarga de arriba se llevó el envoltorio que firma con CSRF: se
     repone, o todo lo que cambie datos a partir de aquí se rechaza. */
  await ev(`(async()=>{
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
  await entrar();

  console.log("\n1. Se abre el expediente del beneficiario");
  await clicNav("Beneficiarios"); await dormir(2000);
  const abrio = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(NINO)}));if(!b)return false;b.click();return true;})()`);
  check(abrio, "la ficha real es pulsable");
  await dormir(2000);
  let c = await main();
  check(/Expediente del beneficiario/i.test(c), "estamos en el expediente");
  check(/Responsables \/ tutores/i.test(c), "existe la sección de responsables");
  check(/Todavía no hay ningún responsable vinculado/.test(c), "y dice que está vacía");
  check(/Vincular responsable/.test(c), "ofrece vincular");
  await foto("vin-vacio.png");

  console.log("\n2. El buscador solo ofrece responsables ya registrados");
  await clic("Vincular responsable"); await dormir(1300);
  let m = await enModal();
  check(/Vincular un responsable/.test(m), "se abre el diálogo");
  check(/YA registrados/.test(m), "dice que se busca entre los que existen");
  console.log("   buscar 'noexiste':", await escribirModal("Buscar responsable ya registrado", "noexiste"));
  await dormir(1500);
  m = await enModal();
  check(/Ningún responsable registrado coincide/.test(m),
        "sin coincidencias explica que hay que darlo de alta primero");
  check(/desde aquí no se crean fichas/.test(m),
        "y por qué: para no acabar con la misma persona repetida");

  console.log("\n3. Se elige a la responsable y su papel");
  await escribirModal("Buscar responsable ya registrado", "Zzz Rosa");
  await dormir(1600);
  const elegido = await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(RESP)}));
    if(!b) return 'no aparece'; b.click(); return 'ok';})()`);
  check(elegido === "ok", `aparece en la búsqueda (${elegido})`);
  await dormir(900);
  m = await enModal();
  check(/parentesco/i.test(m), "se piden los datos del vínculo");
  check(/Responsable principal/.test(m) && /Autorizado a recogerlo/.test(m),
        "con los cuatro papeles");
  console.log("   parentesco:", await escribirModal("Parentesco", "Madre"));
  await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].filter(x=>/Responsable principal|Responsable legal/.test(x.innerText));
    b.forEach(x=>x.click());})()`);
  await dormir(600);
  await foto("vin-modal.png");
  check(await clicModal("Vincular"), "el botón del diálogo responde"); await dormir(2200);

  console.log("\n4. Queda vinculada y se ve en la ficha");
  c = await main();
  check(new RegExp(RESP).test(c), "aparece en la sección");
  check(/Madre/.test(c), "con su parentesco");
  check(/Principal/.test(c) && /Legal/.test(c), "y las etiquetas de su papel");
  check(/principal: Zzz Rosa/.test(c), "el resumen dice quién es la principal");
  await foto("vin-lista.png");

  console.log("\n5. Se guardó de verdad");
  const api = await ev(`fetch('/api/beneficiarios').then(r=>r.json()).then(d=>d.beneficiarios.find(b=>b.nombre===${JSON.stringify(NINO)}).id)
    .then(id=>fetch('/api/beneficiarios/'+id+'/responsables').then(r=>r.json()))`);
  console.log("   " + JSON.stringify((api.responsables||[]).map(r=>({n:r.nombre,p:r.parentesco,pr:r.es_principal,lg:r.es_legal}))));
  check((api.responsables||[]).length === 1, "un vínculo en la base");
  check(api.responsables[0].parentesco === "Madre" && api.responsables[0].es_principal === 1,
        "con parentesco y marca de principal");

  console.log("\n6. Y desde la ficha de la responsable se ve al niño");
  await clicNav("Responsables / Tutores"); await dormir(1800);
  await clic(RESP); await dormir(1600);
  c = await main();
  check(new RegExp(NINO).test(c), "el beneficiario aparece en su ficha");
  check(/1 beneficiario/.test(c) || /Principal/.test(c), "con el vínculo reflejado");

  console.log("\n7. Quitar el vínculo avisa de qué se lleva");
  await clicNav("Beneficiarios"); await dormir(1800);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(NINO)}));if(b)b.click();})()`);
  await dormir(2000);
  await clic("Quitar"); await dormir(1300);
  m = await enModal();
  check(new RegExp("¿Quitar a " + RESP).test(m), "pregunta antes");
  check(/La ficha del responsable NO se borra/.test(m), "y aclara que la ficha se queda");
  await clicModal("Sí, quitar"); await dormir(2200);
  c = await main();
  check(/Todavía no hay ningún responsable vinculado/.test(c), "queda sin vínculos");
  const quedan = await ev(`fetch('/api/responsables').then(r=>r.json())
    .then(d=>d.responsables.filter(r=>r.nombre===${JSON.stringify(RESP)}).length)`);
  check(quedan === 1, `y la ficha de la responsable sigue existiendo (${quedan})`);

  console.log("\n8. Limpieza: la prueba se lleva lo suyo");
  const limpio = await ev(`(async()=>{
    await fetch('/api/beneficiarios/' + ${creados.ben}, {method:'DELETE'});
    await fetch('/api/responsables/' + ${creados.resp}, {method:'DELETE'});
    const b = await fetch('/api/beneficiarios').then(r=>r.json());
    const r = await fetch('/api/responsables').then(r=>r.json());
    return {b: b.beneficiarios.filter(x=>/^Zzz /.test(x.nombre)).length,
            r: r.responsables.filter(x=>/^Zzz /.test(x.nombre)).length};})()`);
  check(limpio.b === 0 && limpio.r === 0,
        "no queda rastro (" + limpio.b + " beneficiarios, " + limpio.r + " responsables)");

  console.log("\n9. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  VÍNCULO RESPONSABLE–BENEFICIARIO OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
