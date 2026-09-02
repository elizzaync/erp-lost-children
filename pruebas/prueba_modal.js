// El modal cabe en pantalla normal y se cierra de tres formas.
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

// Pantalla de portátil corriente, no ultra ancha.
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9381","--user-data-dir="+path.join(SP,"edge-modal"),
  "--window-size=1366,768",BASE + "/"], { stdio:"ignore" });

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
const hayModal=()=>evaluar(`!![...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0 && x.innerText.trim())`);

/* Medidas del panel frente a la ventana: lo que importa es que no se salga
   y que el botón de cerrar quede dentro del área visible. */
const medir = () => evaluar(`(()=>{
  const fondo=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0 && x.innerText.trim());
  if(!fondo) return null;
  const panel=fondo.firstElementChild;
  const p=panel.getBoundingClientRect();
  const x=panel.querySelector('button i.ph-x');
  const xr=x? x.closest('button').getBoundingClientRect() : null;
  const scroller=[...panel.querySelectorAll('div')].find(d=>d.scrollHeight>d.clientHeight+4)||null;
  return {
    ventana:{w:innerWidth, h:innerHeight},
    panel:{top:Math.round(p.top), bottom:Math.round(p.bottom), alto:Math.round(p.height)},
    cabeEnAlto: p.top >= -1 && p.bottom <= innerHeight + 1,
    hayX: !!xr,
    xVisible: xr? (xr.top>=0 && xr.bottom<=innerHeight && xr.right<=innerWidth) : false,
    scrollInterno: !!scroller,
    botonesVisibles: (()=>{const b=[...panel.querySelectorAll('button')].filter(y=>/Crear ficha|Guardar cambios|Registrar/.test(y.innerText));
      if(!b.length) return null; const r=b[0].getBoundingClientRect();
      return r.top>=0 && r.bottom<=innerHeight;})()
  };})()`);

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9381/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails; errores.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};true;`);
  await entrar();
  await evaluar(`__t('Personal').click(),true`); await dormir(1800);

  console.log("\n1. Modal de personal en 1366×768");
  await evaluar(`__t('Agregar usuario').click(),true`); await dormir(1300);
  const m = await medir();
  console.log("   " + JSON.stringify(m));
  check(m !== null, "el modal se abre");
  check(m.cabeEnAlto, "el panel cabe entero en la ventana");
  check(m.hayX, "tiene botón de cerrar (X)");
  check(m.xVisible, "la X está visible sin hacer scroll");
  check(m.scrollInterno, "el contenido largo hace scroll dentro del panel");
  check(m.botonesVisibles !== false, "los botones de acción quedan dentro de la pantalla");
  await foto("modal-personal-1366.png");

  console.log("\n2. Cerrar con la X");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.querySelector('i.ph-x')); if(b)b.click();})()`);
  await dormir(900);
  check(await hayModal() === false, "la X cierra el modal");

  console.log("\n3. Cerrar con clic en el fondo");
  await evaluar(`__t('Agregar usuario').click(),true`); await dormir(1200);
  check(await hayModal() === true, "vuelve a abrirse");
  // Clic dentro del formulario: NO debe cerrar
  await evaluar(`(()=>{const fondo=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0 && x.innerText.trim());
    fondo.firstElementChild.click();})()`);
  await dormir(700);
  check(await hayModal() === true, "un clic DENTRO del formulario no lo cierra");
  // Clic en el fondo: sí debe cerrar
  await evaluar(`(()=>{const fondo=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0 && x.innerText.trim());
    fondo.click();})()`);
  await dormir(900);
  check(await hayModal() === false, "un clic en el fondo oscuro sí lo cierra");

  console.log("\n4. Cerrar con Escape");
  await evaluar(`__t('Agregar usuario').click(),true`); await dormir(1200);
  check(await hayModal() === true, "vuelve a abrirse");
  await enviar("Input.dispatchKeyEvent", {type:"keyDown", key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
  await enviar("Input.dispatchKeyEvent", {type:"keyUp", key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
  await dormir(900);
  check(await hayModal() === false, "Escape cierra el modal");

  console.log("\n5. Lo mismo con el modal de beneficiario");
  await evaluar(`(()=>{const m=document.querySelector('main');
    const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Beneficiarios'); if(b)b.click();})()`);
  await dormir(1600);
  await evaluar(`__t('Agregar beneficiario').click(),true`); await dormir(1300);
  const mb = await medir();
  console.log("   " + JSON.stringify(mb));
  check(mb !== null && mb.cabeEnAlto, "cabe en la ventana");
  check(mb && mb.xVisible, "la X está visible");
  await foto("modal-benef-1366.png");
  await enviar("Input.dispatchKeyEvent", {type:"keyDown", key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
  await enviar("Input.dispatchKeyEvent", {type:"keyUp", key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
  await dormir(900);
  check(await hayModal() === false, "Escape también lo cierra");

  console.log("\n6. En una pantalla aún más baja (1280×600)");
  await enviar("Emulation.setDeviceMetricsOverride", {width:1280, height:600, deviceScaleFactor:1, mobile:false});
  await dormir(700);
  /* Venimos del modal de beneficiario, así que la aplicación está en el
     submódulo Beneficiarios y la fila de pestañas no se pinta. Primero se
     vuelve a Personal por el menú lateral; antes bastaba con pulsar
     "Directorio" porque las cinco pestañas convivían en una sola fila. */
  await evaluar(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Personal'); if(b)b.click();})()`);
  await dormir(1400);
  await evaluar(`(()=>{const m=document.querySelector('main');
    const b=[...m.querySelectorAll('button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Directorio'); if(b)b.click();})()`);
  await dormir(1400);
  await evaluar(`__t('Agregar usuario').click(),true`); await dormir(1300);
  const m2 = await medir();
  console.log("   " + JSON.stringify(m2));
  check(m2 && m2.cabeEnAlto, "sigue cabiendo");
  check(m2 && m2.xVisible, "la X sigue visible");
  check(m2 && m2.scrollInterno, "y el contenido hace scroll por dentro");
  await foto("modal-personal-1280x600.png");
  await enviar("Emulation.clearDeviceMetricsOverride");

  console.log("\n7. El nombre del módulo");
  await enviar("Input.dispatchKeyEvent", {type:"keyDown", key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
  await enviar("Input.dispatchKeyEvent", {type:"keyUp", key:"Escape", code:"Escape", windowsVirtualKeyCode:27});
  await dormir(800);
  const h1 = await evaluar(`(document.querySelector('h1')||{}).innerText`);
  console.log("   título: " + h1);
  check(h1 === "Hoja de Vida", "el título del módulo es 'Hoja de Vida'");
  const cuerpo = await evaluar(`document.body.innerText`);
  check(!/[Ff]icha de [Vv]ida/.test(cuerpo), "no queda 'Ficha de vida' en pantalla");
  const nav = await evaluar(`(()=>{const a=document.querySelector('aside')||document.body;
    return [...a.querySelectorAll('button')].map(b=>b.innerText.trim().split(String.fromCharCode(10))[0]);})()`);
  check(nav.includes("Personal"), "el menú lateral lo llama 'Personal', bajo Gestión de Personas");

  check(errores.length === 0, "cero errores de JavaScript");
  if (errores.length) console.log("   " + errores[0].split("\n")[0]);

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  MODAL Y RENOMBRADO OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
