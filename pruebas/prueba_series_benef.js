// Las tres series del expediente: programas, historial y seguimiento.
//
// Llevaban tablas y endpoints hechos y ninguna pantalla. Lo que se
// comprueba: que lo guardado se VE, que una serie vacía lo dice en vez de
// quedarse en blanco, y que borrar una fila la quita de verdad.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
let __ent, __recargar;
async function entrar() {
  const st = await __ent(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await __recargar({});
  await new Promise(r => setTimeout(r, 3000));
  await __ent(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || s.csrf || "";
    if (!window.__fetchOriginal) window.__fetchOriginal = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fetchOriginal(u,o);};
    return "ok";})()`);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9481","--user-data-dir="+path.join(SP,"edge-series"),
  "--window-size=1500,1400", BASE + "/"], { stdio:"ignore" });
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

const NINO = "Zzz Nino Con Series";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9481/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);
  await entrar();

  console.log("0. Un beneficiario con las tres series llenas");
  const bid = await ev(`(async()=>{
    const j=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(b)}).then(r=>r.json());
    const b = await j('/api/beneficiarios', {nombre:${JSON.stringify(NINO)}, casa:'Casa Lima', sala:'Sala A'});
    const id = (b.beneficiario||{}).id || b.id;
    await j('/api/beneficiarios/'+id+'/programas', {programa:'Refuerzo escolar',
      fecha_ingreso:'2026-03-01', estado:'activo', nota:'Dos tardes por semana'});
    await j('/api/beneficiarios/'+id+'/historial', {anio:'2026', institucion:'IE Las Lomas',
      nivel:'Primaria', grado:'5.º', seccion:'B', situacion:'Promovido', rendimiento:'Bueno'});
    await j('/api/beneficiarios/'+id+'/seguimiento', {fecha:'2026-08-20', tipo:'Psicológico',
      situacion:'Se adapta bien', accion:'Continuar sesiones quincenales',
      compromisos:'Asistir los martes', proxima_fecha:'2026-09-03'});
    return id;})()`);
  check(!!bid, "beneficiario y sus tres series creados · id " + bid);
  await enviar("Page.reload", {}); await dormir(3200); await entrar();
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

  console.log("\n1. El expediente enseña las tres");
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios');if(b)b.click();})()`);
  await dormir(2200);
  const abrio = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>x.innerText.includes(${JSON.stringify(NINO)})); if(!b) return false; b.click(); return true;})()`);
  check(abrio, "se abre su expediente");
  await dormir(2500);
  let c = await ev(`(document.querySelector('main')||document.body).innerText`);

  check(/Programas/.test(c), "está la sección Programas");
  check(/Historial educativo/.test(c), "está Historial educativo");
  check(/Seguimiento/.test(c), "está Seguimiento");
  await foto("series-expediente.png");

  console.log("\n2. Y enseña lo que se guardó, no un hueco");
  check(/Refuerzo escolar/.test(c), "el programa se ve");
  check(/sigue en curso/.test(c), "y dice que sigue en curso, al no tener fecha de salida");
  check(/IE Las Lomas/.test(c), "la institución del año escolar se ve");
  check(/5\.º|Primaria/.test(c), "con su nivel y grado");
  check(/Psicológico/.test(c), "el seguimiento se ve");
  check(/próxima: 2026-09-03/.test(c), "con su próxima fecha");

  console.log("\n3. Borrar una fila la quita de verdad");
  const antes = await ev(`fetch('/api/beneficiarios/' + ${bid} + '/acompanamiento')
    .then(r=>r.json()).then(d=>(d.programas||[]).length)`);
  const pulsado = await ev(`(()=>{
    const h=[...document.querySelectorAll('h3')].find(x=>x.innerText.trim()==='Programas');
    if(!h) return 'no está la sección';
    const caja=h.parentElement;
    const b=caja.querySelector('button[title="Eliminar"]');
    if(!b) return 'sin botón de borrar'; b.click(); return 'ok';})()`);
  console.log("   " + pulsado);
  await dormir(2500);
  const despues = await ev(`fetch('/api/beneficiarios/' + ${bid} + '/acompanamiento')
    .then(r=>r.json()).then(d=>(d.programas||[]).length)`);
  check(despues === antes - 1, `el programa se borró (${antes} → ${despues})`);
  c = await ev(`(document.querySelector('main')||document.body).innerText`);
  check(/Sin programas registrados todavía/.test(c),
        "y la sección lo dice, en vez de quedarse en blanco");
  await foto("series-tras-borrar.png");

  console.log("\n4. Las tres se pueden registrar desde la pantalla");
  const abrirYGuardar = async (boton, rotulo, valor, confirmar) => {
    const ok1 = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
      .find(x=>(x.innerText||'').trim()===${JSON.stringify(boton)});
      if(!b) return false; b.click(); return true;})()`);
    if (!ok1) return "no está el botón " + boton;
    await dormir(1500);
    /* El rótulo se busca entre los que TIENEN campo detrás: hay títulos de
       sección que se llaman igual que un campo. */
    const puesto = await ev(`(()=>{
      const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
      if(!d) return 'sin diálogo';
      const rots=[...d.querySelectorAll('div')].filter(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
      const rot=rots.find(x=>{let n=x.nextElementSibling; while(n){ if(n.tagName==='INPUT') return true; n=n.nextElementSibling;} return false;});
      if(!rot) return 'sin el campo ' + ${JSON.stringify(rotulo)};
      let inp=rot.nextElementSibling; while(inp && inp.tagName!=='INPUT') inp=inp.nextElementSibling;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp, ${JSON.stringify(valor)});
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      return 'ok';})()`);
    if (puesto !== "ok") return puesto;
    await dormir(500);
    await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
      const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim()===${JSON.stringify(confirmar)});
      if(b) b.click();})()`);
    await dormir(2500);
    return "guardado";
  };

  console.log("   programa:  ", await abrirYGuardar("Registrar programa", "Programa",
                                                    "Zzz Taller de arte", "Registrar programa"));
  console.log("   año escolar:", await abrirYGuardar("Registrar año escolar", "Año",
                                                     "2025", "Registrar año escolar"));
  // La situación es obligatoria: la exige el servidor y ahora también el
  // formulario, así que es el campo que hay que llenar para que guarde.
  console.log("   seguimiento:", await abrirYGuardar("Registrar seguimiento", "Situación · obligatoria",
                                                     "Zzz Se adapta bien", "Registrar seguimiento"));

  const guardado = await ev(`fetch('/api/beneficiarios/' + ${bid} + '/acompanamiento')
    .then(r=>r.json()).then(d=>({programas:(d.programas||[]).length,
      historial:(d.historial||[]).length, seguimiento:(d.seguimiento||[]).length}))`);
  console.log("   en la base: " + JSON.stringify(guardado));
  check(guardado.programas === 1, `el programa se guardó (${guardado.programas})`);
  check(guardado.historial === 2, `el año escolar se guardó (${guardado.historial})`);
  check(guardado.seguimiento === 2, `el seguimiento se guardó (${guardado.seguimiento})`);
  const enPantalla = await ev(`(document.querySelector('main')||document.body).innerText`);
  check(/Zzz Taller de arte/.test(enPantalla), "y aparece sin recargar la página");
  await foto("series-altas.png");

  console.log("\n5. Limpieza");
  const limpio = await ev(`(async()=>{
    await fetch('/api/beneficiarios/' + ${bid}, {method:'DELETE'});
    const d = await fetch('/api/beneficiarios').then(r=>r.json());
    return (d.beneficiarios||[]).filter(b=>b.nombre===${JSON.stringify(NINO)}).length;})()`);
  check(limpio === 0, `no queda rastro (${limpio})`);

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "SERIES DEL BENEFICIARIO OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
