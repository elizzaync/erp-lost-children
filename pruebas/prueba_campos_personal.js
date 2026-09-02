// Los 8 campos ampliados de la ficha de personal: se escriben, se guardan
// y se ven en el expediente. Antes existían en la base y en la API pero no
// había ninguna pantalla que los tocara.
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
  "--remote-debugging-port=9418","--user-data-dir="+path.join(SP,"edge-cp"),
  "--window-size=1500,1200",BASE + "/"], { stdio:"ignore" });
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

const PERSONA = "Zzz Campos Ampliados";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9418/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("el servidor de pruebas no responde en " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  /* Escribe en el campo cuyo rótulo coincide, dentro del diálogo abierto.
     Vale para input y para select: son controles de React, así que el valor
     se pone por el setter del prototipo y se avisa con un evento. */
  const poner=(rotulo,valor)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return 'sin rotulo';
    const c=rot.parentElement.querySelector('input,select');
    if(!c) return 'sin control';
    const proto = c.tagName==='SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(c,${JSON.stringify(valor)});
    c.dispatchEvent(new Event(c.tagName==='SELECT'?'change':'input',{bubbles:true}));
    return 'ok';})()`);

  await entrar();

  console.log("0. Ficha de prueba");
  const pid = await ev(`fetch('/api/personal',{method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:${JSON.stringify(PERSONA)}, cargo:'Educador', area:'Casa Hogar', sede:'Lima',
      /* Los cinco que el formulario exige. Sin ellos no dejaría
         guardar, y lo que aquí se prueba son otros ocho campos. */
      documento:'ZZC-1', fecha_ingreso:'2026-01-15', telefono:'977000222'})})
    .then(r=>r.json()).then(d=>(d.persona||{}).id||d.id)`);
  check(!!pid, "se crea la ficha de prueba · id " + pid);
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

  console.log("\n1. El formulario tiene los tres bloques nuevos");
  await clicNav("Personal"); await dormir(2000);
  const abrio = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(PERSONA)}));if(!b)return false;b.click();return true;})()`);
  check(abrio, "la ficha se abre");
  await dormir(1800);
  check(await clic("Editar"), "se entra a editar");
  await dormir(1600);
  const modal = await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);return d?d.innerText:'';})()`);
  /* Los rótulos llevan text-transform:uppercase, así que innerText los
     devuelve en mayúsculas: "SEXO", no "Sexo". Se compara sin distinguir. */
  const enModal = t => modal.toLowerCase().includes(t.toLowerCase());
  for (const b of ["Datos personales","Situación laboral","Ubicación"])
    check(enModal(b), `bloque "${b}"`);
  for (const r of ["Sexo","Nacionalidad","Lugar de nacimiento","Jornada",
                   "Estado laboral","Departamento","Provincia","Distrito"])
    check(enModal(r), `campo "${r}"`);
  await foto("cp-formulario.png");

  console.log("\n2. Se escriben los ocho");
  const puestos = {};
  puestos.sexo = await poner("Sexo","F");
  puestos.nac  = await poner("Nacionalidad","Peruana");
  puestos.lug  = await poner("Lugar de nacimiento","Arequipa");
  puestos.jor  = await poner("Jornada","parcial");
  puestos.est  = await poner("Estado laboral","licencia");
  puestos.dep  = await poner("Departamento","Cusco");
  puestos.pro  = await poner("Provincia","Calca");
  puestos.dis  = await poner("Distrito","Pisac");
  console.log("   " + JSON.stringify(puestos));
  check(Object.values(puestos).every(x=>x==="ok"), "los ocho controles aceptan valor");

  check(await clic("Guardar"), "se guarda");
  await dormir(2500);

  console.log("\n3. Llegaron a la base");
  /* No hay GET de una sola persona: la API expone el listado. Se busca la
     ficha dentro, que es además como la lee la pantalla. */
  const p = await ev(`fetch('/api/personal').then(r=>r.json())
    .then(d=>d.personal.find(x=>x.id===${pid}) || {})`);
  const esperado = {sexo:"F", nacionalidad:"Peruana", lugar_nacimiento:"Arequipa",
    jornada:"parcial", estado_laboral:"licencia",
    departamento:"Cusco", provincia:"Calca", distrito:"Pisac"};
  for (const [k,v] of Object.entries(esperado))
    check(p[k] === v, `${k} = "${v}" (llegó "${p[k]}")`);

  console.log("\n4. El expediente los muestra en claro, no en código");
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
  await clicNav("Personal"); await dormir(2000);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(PERSONA)}));if(b)b.click();})()`);
  await dormir(2000);
  const c = await main();
  check(/Femenino/.test(c), "el sexo se lee 'Femenino', no 'F'");
  check(/Medio tiempo/.test(c), "la jornada se lee 'Medio tiempo', no 'parcial'");
  check(/De licencia/.test(c), "el estado se lee 'De licencia'");
  check(/Peruana/.test(c) && /Arequipa/.test(c), "nacionalidad y lugar de nacimiento");
  check(/Pisac, Calca, Cusco/.test(c), "la ubicación va junta, del distrito al departamento");
  await foto("cp-expediente.png");

  console.log("\n5. Una ficha sin estos datos no miente");
  const vid = await ev(`fetch('/api/personal',{method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:'Zzz Campos Vacios', cargo:'Tutor'})}).then(r=>r.json()).then(d=>(d.persona||{}).id||d.id)`);
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
  await clicNav("Personal"); await dormir(2000);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Zzz Campos Vacios'));if(b)b.click();})()`);
  await dormir(2000);
  const c2 = await main();
  check(/Sin registrar/.test(c2), "los campos vacíos dicen 'Sin registrar'");
  /* El estado laboral es el único con valor por defecto: una ficha nueva
     nace activa. Lo demás queda en blanco hasta que alguien lo llene. */
  check(/estado laboral/i.test(c2) && /Activo/.test(c2),
        "salvo el estado laboral, que nace en Activo");

  console.log("\n6. Limpieza");
  const limpio = await ev(`(async()=>{
    await fetch('/api/personal/${pid}',{method:'DELETE'});
    await fetch('/api/personal/${vid}',{method:'DELETE'});
    const d = await fetch('/api/personal').then(r=>r.json());
    return d.personal.filter(x=>/^Zzz Campos/.test(x.nombre)).length;})()`);
  check(limpio === 0, `no queda nada de la prueba (${limpio})`);

  console.log("\n7. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  CAMPOS AMPLIADOS DE PERSONAL OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
