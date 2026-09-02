// El módulo se llama "Hoja de Vida" en toda la interfaz.
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
  "--remote-debugging-port=9357","--user-data-dir="+path.join(SP,"edge-ren"),
  "--window-size=1440,1000",BASE + "/"], { stdio:"ignore" });

let ws,id=0; const pend=new Map();
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

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9357/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText; true;`);
  await entrar();

  console.log("\n1. Sidebar");
  const nav = await evaluar(`(()=>{const a=document.querySelector('aside')||document.body;
    return [...a.querySelectorAll('button')].map(b=>b.innerText.trim().split(String.fromCharCode(10))[0]).filter(Boolean);})()`);
  console.log("   " + JSON.stringify(nav.slice(0,10)));
  check(nav.includes("Personal"), "el menú lo llama 'Personal', bajo Gestión de Personas");
  check(!nav.some(x=>/Legajo/i.test(x)), "ya no dice 'Legajo Digital'");

  console.log("\n2. Dashboard: el módulo se nombra bien en las tarjetas");
  const dash = await evaluar(`__texto()`);
  check(!/Legajo/i.test(dash), "no queda ningún 'Legajo' en el Dashboard");
  check(/Fichas activas en Hoja de Vida/.test(dash), "la tarjeta de Colaboradores lo nombra");
  await foto("rename-dashboard.png");

  console.log("\n3. Pantalla principal del módulo");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Personal')); b.click();})()`);
  await dormir(1800);
  const h1 = await evaluar(`document.querySelector('h1').innerText.trim()`);
  console.log("   título: " + h1);
  check(h1 === "Hoja de Vida", "el título de la pantalla es 'Hoja de Vida'");
  const crumb = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>/^M.dulo RRHH$/.test(x.innerText.trim())); return d? d.innerText.trim():null;})()`);
  console.log("   antetítulo: " + crumb);
  const cuerpo = await evaluar(`__texto()`);
  check(!/[Ll]egajo/.test(cuerpo), "ni el título ni los botones dicen 'legajo'");
  const botones = await evaluar(`[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(x=>/ficha|Exportar/i.test(x)&&x.length<30)`);
  console.log("   botones: " + JSON.stringify(botones));
  /* El alta se renombró a "Agregar usuario" y subió junto a las pestañas,
     para que sea el único punto de creación del módulo. */
  const alta = await evaluar(`[...document.querySelectorAll('button')].filter(x=>/Agregar usuario/.test(x.innerText)).length`);
  check(alta === 1, "hay un único botón 'Agregar usuario'");
  check(!botones.some(x=>/Nueva ficha|Nuevo legajo/.test(x)), "ya no existe el botón antiguo");
  const nota = await evaluar(`(()=>{const h=[...document.querySelectorAll('h2')].find(x=>/Personal registrado/.test(x.innerText));
    return h? h.parentElement.innerText.replace(/\\s+/g,' ').trim():null;})()`);
  console.log("   contador: " + nota);
  check(/fichas activas/.test(nota||""), "el contador dice 'fichas activas'");
  await foto("rename-modulo.png");

  console.log("\n4. Las demás pantallas que lo mencionan");
  for (const [tab, quien] of [["Organigrama","Organigrama"],["Documentos","Documentos"],["Contratos","Contratos"]]) {
    await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(tab)}); if(b)b.click();})()`);
    await dormir(1100);
    const tx = await evaluar(`__texto()`);
    check(!/[Ll]egajo/.test(tx), quien + ": sin rastros de 'legajo'");
    check(/Hoja de Vida/.test(tx), quien + ": el título sigue siendo 'Hoja de Vida'");
  }

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  RENOMBRADO OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
