// Alta, edición y borrado de documentos desde la ficha, con el estado
// calculándose solo a partir de la fecha de vencimiento.
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
  "--remote-debugging-port=9353","--user-data-dir="+path.join(SP,"edge-doc"),
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

const modal = () => evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  return d? d.innerText.replace(/\\s+/g,' ').trim() : null;})()`);
const ponerEnModal = (tipo, valor) => evaluar(`(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  const i=[...d.querySelectorAll('input')].filter(x=>x.type===${JSON.stringify(tipo)});
  if(!i.length) return 'no hay';
  const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  f.call(i[i.length-1], ${JSON.stringify(valor)});
  i[i.length-1].dispatchEvent(new Event('input',{bubbles:true}));
  i[i.length-1].dispatchEvent(new Event('change',{bubbles:true}));
  return 'ok';})()`);
/* Las filas son los bloques con borde izquierdo de color; buscarlas por el
   encabezado fallaba porque ahora comparte contenedor con el botón. */
const filasDoc = () => evaluar(`[...document.querySelectorAll('div[style*="border-left"]')]
  .filter(d=>d.querySelector('i.ph-trash'))
  .map(d=>d.innerText.replace(/\\s+/g,' ').trim())`);

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9353/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await entrar();

  /* Los ayudantes van DESPUÉS de entrar(): entrar() recarga la
     página, y una recarga vacía `window`. Inyectarlos antes era
     escribirlos en una pantalla que ya no existe. */
  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
    window.__texto=()=>document.body.innerText.toLowerCase(); true;`);

  /* Aquí había una SEGUNDA inyección de los mismos ayudantes, sin
     recarga en medio que la justificara. Copiar y pegar de otra
     suite: no añadía nada y podía pisar una versión mejor de
     __esc, que es como el organigrama acabó acusando al sistema de
     algo que hacía bien. Retirada el 31/08/2026. */
  console.log("\n1. Desde el Directorio se abre el expediente");
  await evaluar(`__t('Personal').click(),true`); await dormir(1500);
  const abrio = await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Elvis Quispe/.test(x.innerText.trim()));
    if(!b) return 'no está'; b.click(); return 'ok';})()`);
  check(abrio === "ok", "el nombre del directorio es clicable");
  await dormir(1500);
  check(await evaluar(`__texto().includes('elvis quispe arone')`), "abre su ficha");

  console.log("\n2. Registrar un documento");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split('\\n')[0]==='Documentos'); if(b)b.click();})()`);
  await dormir(800);
  check(await evaluar(`!!__t('Agregar documento')`), "hay botón para agregar");
  await evaluar(`__t('Agregar documento').click(),true`); await dormir(900);
  {
    const cap = await enviar("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SP, "doc-form.png"), Buffer.from(cap.data, "base64"));
  }
  const m1 = await modal();
  console.log("   " + (m1||"").slice(0,300));
  check(/nuevo documento/i.test(m1||""), "abre el formulario");
  check(/antecedentes penales/i.test(m1||""), "ofrece los tipos habituales");
  check(/otro/i.test(m1||""), "incluye la opción Otro");
  check(/no se elige/i.test(m1||""), "explica que el estado no se elige");
  check(!/adjuntar|subir archivo/i.test((m1||"").replace(/todav[íi]a no se pueden adjuntar[^.]*\./i,"")),
        "no promete adjuntar archivos");

  await evaluar(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>x.innerText.trim()==='Certificado de salud ocupacional'); if(b)b.click();})()`);
  await dormir(400);
  const hoy = new Date();
  const en10 = new Date(hoy.getTime() + 10*86400000).toISOString().slice(0,10);
  await ponerEnModal("date", en10);
  await dormir(600);
  const conPrevio = await modal();
  check(/quedaría: por vencer/i.test(conPrevio||""), "adelanta el estado que quedará (Por vencer)");

  await evaluar(`__t('Registrar').click(),true`); await dormir(2200);
  check(await modal() === null, "el diálogo se cierra");
  {
    const cap = await enviar("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SP, "doc-lista.png"), Buffer.from(cap.data, "base64"));
  }
  const f1 = await filasDoc();
  console.log("   " + JSON.stringify(f1));
  check(f1.some(x=>/certificado de salud/i.test(x) && /POR VENCER/i.test(x)),
        "aparece con el estado calculado");

  console.log("\n3. Corregir la fecha recalcula el estado");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.querySelector('i.ph-pencil-simple'))
    .find(x=>{const f=x.closest('div[style*="border-left"]'); return f && /certificado de salud/i.test(f.innerText);});
    if(b)b.click();})()`);
  await dormir(900);
  check(/corregir documento/i.test((await modal())||""), "abre en modo corrección");
  const en200 = new Date(hoy.getTime() + 200*86400000).toISOString().slice(0,10);
  await ponerEnModal("date", en200);
  await dormir(500);
  await evaluar(`__t('Guardar cambios').click(),true`); await dormir(2200);
  const f2 = await filasDoc();
  console.log("   " + JSON.stringify(f2));
  check(f2.some(x=>/certificado de salud/i.test(x) && /VIGENTE/i.test(x)),
        "al alargar la fecha pasa a Vigente sin tocar el estado a mano");

  console.log("\n4. Eliminar pide confirmación");
  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.querySelector('i.ph-trash'))
    .find(x=>{const f=x.closest('div[style*="border-left"]'); return f && /certificado de salud/i.test(f.innerText);});
    if(b)b.click();})()`);
  await dormir(900);
  const m2 = await modal();
  check(/eliminar este documento/i.test(m2||""), "pide confirmación antes de borrar");
  const antes = (await filasDoc()).length;
  await evaluar(`__t('Sí, eliminar').click(),true`); await dormir(2200);
  const f3 = await filasDoc();
  check(f3.length === antes - 1, "se elimina de la lista");

  await evaluar(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split('\\n')[0]==='Documentos'); if(b)b.click();})()`);
  await dormir(600);
  const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"form-documentos.png"),Buffer.from(s.data,"base64"));

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  DOCUMENTOS OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
