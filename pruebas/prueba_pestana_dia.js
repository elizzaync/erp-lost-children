// La pestaña del día: una sola tabla, y el recado de cocina.
//
// Comprueba lo acordado: que no hay tarjetas de resumen, que quien no está
// enrolado sale marcado en vez de desaparecer, que nunca se habla de
// tardanzas —el sistema no conoce los horarios— y que el conteo de
// almuerzos avisa de que se queda corto mientras quede gente sin enrolar.
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
  if (st !== 200) throw new Error("no se pudo entrar con la cuenta del banco: " + st);
  await __recargar({});
  await new Promise(r => setTimeout(r, 3000));
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
  "--remote-debugging-port=9467","--user-data-dir="+path.join(SP,"edge-dia"),
  "--window-size=1500,1200", BASE + "/"], { stdio:"ignore" });
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

const NUEVO = "Zzz Sin Enrolar Aun";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9467/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>new RegExp(${JSON.stringify(t)},'i').test(x.innerText||''));if(!b)return false;b.click();return true;})()`);
  const pestana=t=>ev(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>(x.innerText||'').trim()===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  await entrar();

  console.log("0. Alguien con ficha y todavía sin enrolar");
  const rid = await ev(`fetch('/api/responsables',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:${JSON.stringify(NUEVO)}, documento:'ZD-1', telefono:'977000888'})})
    .then(r=>r.json()).then(d=>d.id || (d.responsable||{}).id)`);
  check(!!rid, "creado · id " + rid);
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

  console.log("\n1. La pestaña se llama Día");
  await clicNav("Asistencia"); await dormir(2000);
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>/Registro de Asistencia/i.test(x.innerText||''));if(b)b.click();})()`);
  await dormir(2600);
  let c = await main();
  check(/\bDía\b/.test(c), "aparece la pestaña Día");
  check(!/Vista diaria/.test(c), "y ya no se llama «Vista diaria»");

  console.log("\n2. Sin tarjetas de resumen: una sola tabla");
  check(!/Personas en sede/.test(c) && !/Almuerzos a preparar\s*\n?\s*\d/.test(c),
        "no están las tarjetas del panel");
  check(/Asistencia del día/.test(c), "hay un solo encabezado de tabla");
  check(/PERSONA/i.test(c) && /REGISTRO/i.test(c) && /ESTADO/i.test(c),
        "con sus columnas persona por persona");
  check(/Ver el resumen del día en el panel/.test(c),
        "y el enlace al panel, en vez de repetir sus números");
  await foto("dia-tabla.png");

  console.log("\n3. Quien no está enrolado sale marcado, no desaparece");
  check(new RegExp(NUEVO).test(c), "aparece en la tabla");
  check(/Sin enrolar/i.test(c), "con el estado «Sin enrolar»");
  const botones = await ev(`(()=>[...document.querySelectorAll('main button')]
    .filter(x=>(x.innerText||'').trim()==='Enrolar').length)()`);
  check(botones > 0, `y con un botón para ir a enrolarlo (${botones})`);

  console.log("\n4. El recado de cocina, calculado de presentes reales");
  const almuerzo = await ev(`(()=>{const m=(document.querySelector('main')||document.body).innerText;
    const l=m.split(String.fromCharCode(10)).find(x=>/almuerzo|ha marcado|han marcado/i.test(x));
    return l ? l.trim() : '';})()`);
  console.log("   " + almuerzo);
  check(!!almuerzo, "la línea está");
  check(!/tarjeta|43|41|40/.test(almuerzo), "sin cifras heredadas de la maqueta");
  check(/Ojo:/.test(c), "y avisa de que el conteo se queda corto si falta gente por enrolar");

  console.log("\n5. Nunca se habla de tardanzas");
  check(!/Tard\./.test(c) && !/tardanza/i.test(c.replace(/No se señalan tardanzas[^\n]*/g, "")),
        "no se juzga la puntualidad sin conocer los horarios");
  check(/No se señalan tardanzas/.test(c), "y se explica por qué");

  console.log("\n6. Limpieza");
  await ev(`fetch('/api/responsables/' + ${rid}, {method:'DELETE'})`);

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "PESTAÑA DEL DÍA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
