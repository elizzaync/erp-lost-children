// Vista semanal y calendario mensual con marcas reales del terminal.
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
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9343","--user-data-dir="+path.join(SP,"edge-sem"),
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
    try{const l=await fetch("http://127.0.0.1:9343/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      f.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    window.__texto=()=>document.body.innerText.toLowerCase();
    window.__sec=(titulo)=>{const h=[...document.querySelectorAll('h2')].find(x=>x.innerText.includes(titulo));
      return h? h.parentElement.parentElement.innerText.replace(/\\s+/g,' ').trim() : null;};
    true;`);

  await entrar();
  await evaluar(`__t('Registro de Asistencia').click(),true`); await dormir(1500);

  console.log("\n1. Vista semanal");
  await evaluar(`__t('Vista semanal').click(),true`); await dormir(2000);
  const sem = await evaluar(`__sec('Personas enroladas en este sistema')`);
  check(sem !== null, "aparece la sección de personas reales en la vista semanal");
  console.log("   " + (sem||"").slice(0,300));
  check(/datos reales del terminal/i.test(sem||""), "está rotulada como datos reales");
  check(/lun|mar|mié/i.test(sem||""), "muestra los días de la semana");
  check((sem||"").includes("12:27"), "hari muestra su marca del miércoles 12");
  check(/hari/i.test(sem||"") && /edward/i.test(sem||""), "lista a las personas enroladas");
  const s1=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"semanal.png"),Buffer.from(s1.data,"base64"));

  console.log("\n2. Calendario mensual");
  await evaluar(`__t('Calendario mensual').click(),true`); await dormir(2000);
  const mes = await evaluar(`__sec('Marcas reales del terminal')`);
  check(mes !== null, "aparece la sección de marcas reales en el calendario");
  console.log("   " + (mes||"").slice(0,240));
  check(/personas enroladas/i.test(mes||""), "indica cuántas personas hay enroladas");
  const celdas = await evaluar(`(()=>{
    const h=[...document.querySelectorAll('h2')].find(x=>x.innerText.includes('Marcas reales del terminal'));
    const cont=h.parentElement.parentElement;
    const rej=[...cont.querySelectorAll('div')].find(d=>(d.getAttribute('style')||'').includes('repeat(7'));
    return [...rej.children].map(c=>c.innerText.replace(/\\s+/g,' ').trim()).filter(x=>x);})()`);
  console.log("   celdas con contenido:", JSON.stringify(celdas.slice(0,20)));
  check(celdas.some(c=>/^12 2$/.test(c)), "el día 12 muestra 2 personas que marcaron");
  const s2=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"mensual.png"),Buffer.from(s2.data,"base64"));

  console.log("\n3. Cambiar de semana con el selector de día");
  await evaluar(`__t('Vista semanal').click(),true`); await dormir(1200);
  await evaluar(`__esc('input[type=date]','2026-08-05')`); await dormir(2200);
  const otra = await evaluar(`__sec('Personas enroladas en este sistema')`);
  console.log("   " + (otra||"").slice(0,150));
  check(otra && !otra.includes("12:27"), "otra semana ya no muestra la marca del 12");
  check(otra && /del 03\/08\/2026 al 09\/08\/2026/i.test(otra), "el rótulo indica la semana correcta");

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  SEMANAL Y MENSUAL OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
