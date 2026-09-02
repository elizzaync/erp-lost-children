// Fecha de fundación: pantalla de parámetros, bloqueo tras fijarla, y los
// tres estados de la tarjeta del Dashboard.
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
  "--remote-debugging-port=9350","--user-data-dir="+path.join(SP,"edge-fund"),
  "--window-size=1440,1100",BASE + "/"], { stdio:"ignore" });

let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const evaluar=async(e)=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

const tarjeta = () => evaluar(`(()=>{
  const c=[...document.querySelectorAll('div')]
    .filter(d=>/border-top:\\s*4px solid/.test(d.getAttribute('style')||''))
    .map(d=>d.innerText.replace(/\\s+/g,' ').trim())
    .filter(t=>/años de labor/i.test(t));
  return c[0]||null;})()`);

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9350/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  /* Dejar los parámetros vacíos para probar siempre desde el estado
     inicial, aunque una corrida anterior haya guardado la fecha. */
  await fetch(BASE + "/api/parametros", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizacion: "", ciudad: "", fecha_fundacion: "" }) });
  await evaluar(`location.reload()`).catch(()=>{});
  await dormir(3000);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=typeof s==='string'?document.querySelector(s):s;
      const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; f.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    window.__texto=()=>document.body.innerText.toLowerCase(); true;`);
  await entrar();

  console.log("\n1. Sin fecha configurada (primera vez que se usa el sistema)");
  const sinFecha = await tarjeta();
  console.log("   " + sinFecha);
  check(sinFecha && /—/.test(sinFecha), "no inventa un número");
  check(sinFecha && /configura la fecha de fundación/i.test(sinFecha), "dice qué hay que hacer");
  check(sinFecha && /configuración/i.test(sinFecha), "dice dónde hacerlo");

  console.log("\n2. La pantalla de Configuración existe y es navegable");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Configuración'); if(b)b.click();})()`);
  await dormir(1400);
  check(await evaluar(`__texto().includes('parámetros del sistema')`), "abre Parámetros del sistema");
  const campos = await evaluar(`[...document.querySelectorAll('input')].map(i=>i.type+':'+(i.placeholder||''))`);
  console.log("   campos:", JSON.stringify(campos));
  check(campos.some(c=>c.startsWith("date")), "tiene el campo de fecha de fundación");

  console.log("\n3. Guardar la fecha");
  await evaluar(`__esc('input[type=text]','Lost Children of Peru')`);
  await evaluar(`__esc('input[type=date]','2014-03-02')`);
  await dormir(400);
  await evaluar(`__t('Guardar parámetros').click(),true`);
  await dormir(2200);
  const guardado = await evaluar(`fetch('/api/parametros').then(r=>r.json()).then(d=>d.parametros)`);
  console.log("   en la base:", JSON.stringify(guardado));
  check(guardado.fecha_fundacion === "2014-03-02", "la fecha quedó guardada");

  console.log("\n4. Queda bloqueada, no se cambia sin querer");
  const bloqueo = await evaluar(`(()=>{const t=document.body.innerText;
    const i=t.indexOf('Fecha de fundación');
    return i<0?null:t.slice(i,i+220).replace(/\\s+/g,' ');})()`);
  console.log("   " + bloqueo);
  check(!(await evaluar(`!!document.querySelector('input[type=date]')`)), "el campo de fecha ya no es editable");
  check(await evaluar(`!!__t('Corregir fecha')`), "hay un botón explícito para corregirla");
  await evaluar(`__t('Corregir fecha').click(),true`); await dormir(700);
  check(await evaluar(`!!document.querySelector('input[type=date]')`), "al pulsarlo vuelve a ser editable");

  console.log("\n5. La tarjeta del Dashboard ya calcula");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split('\\n')[0]==='Dashboard'); if(b)b.click();})()`);
  await dormir(1600);
  const conFecha = await tarjeta();
  console.log("   " + conFecha);
  const esperado = new Date().getFullYear() - 2014;
  check(conFecha && conFecha.includes(String(esperado)), `muestra ${esperado} años`);
  check(conFecha && /fundada en 2014/i.test(conFecha), "dice el año de fundación");
  check(conFecha && !/colaborador/i.test(conFecha), "ya no habla de ningún colaborador");

  await dormir(300);
  const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"dashboard-fundacion.png"),Buffer.from(s.data,"base64"));

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  FECHA DE FUNDACIÓN OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
