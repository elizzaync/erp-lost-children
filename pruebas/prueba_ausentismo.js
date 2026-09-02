// La tarjeta de ausentismo se explica sola y la aclaración de vacaciones
// se ve, no está escondida en letra chica.
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
  "--remote-debugging-port=9361","--user-data-dir="+path.join(SP,"edge-aus"),
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

(async()=>{
  let t=null;
  for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9361/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = evaluar; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);

  await evaluar(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__esc=(s,v)=>{const el=document.querySelector(s);const f=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;f.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};true;`);
  await entrar();

  console.log("\n1. La tarjeta del Dashboard");
  const tarjeta = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>/^AUSENTISMO DEL MES/i.test(x.innerText.trim()) && x.innerText.length<400);
    return d? d.innerText.replace(/\\s+/g,' ').trim() : null;})()`);
  console.log("   > " + tarjeta);
  check(tarjeta !== null, "existe la tarjeta");
  check(!/d[íi]as-persona/i.test(tarjeta||""), "ya no dice 'días-persona'");
  /* Antes se exigía "36 días de ausencia" y "420 días hábiles". Los dos eran
     inventados: no hay histórico de marcaciones del que salgan. Ahora se
     exige lo contrario — que no aparezca ninguna cifra— y que la tarjeta
     diga por qué está vacía en vez de enseñar un porcentaje que nadie midió. */
  check(!/[0-9]+([.,][0-9]+)? ?%/.test(tarjeta||""),
        "no muestra ningún porcentaje");
  check(!/36 d[íi]as|420 d[íi]as/i.test(tarjeta||""),
        "ni las cifras que se inventaban");
  check(/marcaciones/i.test(tarjeta||""),
        "explica de qué depende para poder calcularse");
  check(/nadie midi[óo]|no se muestra/i.test(tarjeta||""),
        "y por qué no se enseña un número mientras tanto");

  const icono = await evaluar(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>/^AUSENTISMO DEL MES/i.test(x.innerText.trim()) && x.innerText.length<400);
    const i=d? d.querySelector('i.ph-info') : null;
    if(!i) return null;
    const r=i.getBoundingClientRect(); const cs=getComputedStyle(i);
    return {ancho:Math.round(r.width), alto:Math.round(r.height), visible:cs.visibility, color:cs.color};})()`);
  console.log("   icono: " + JSON.stringify(icono));
  check(icono !== null, "la tarjeta lleva ícono de información");
  check(icono && icono.ancho > 8 && icono.alto > 8, "el ícono se ve de verdad (no es 0×0)");

  console.log("\n2. Las otras tarjetas no ganaron una aclaración vacía");
  /* Las tarjetas son las que llevan la franja de color arriba; filtrar solo
     por el texto agarraba también el contenedor de toda la fila. */
  const conIcono = await evaluar(`(()=>{const cards=[...document.querySelectorAll('div')]
    .filter(x=>getComputedStyle(x).borderTopWidth==='4px' && getComputedStyle(x).borderTopStyle==='solid');
    return cards.map(c=>({kpi:c.innerText.trim().split(String.fromCharCode(10))[0], icono:!!c.querySelector('i.ph-info')}));})()`);
  console.log("   " + JSON.stringify(conIcono));
  check(conIcono.filter(c=>c.icono).length === 1, "solo la de ausentismo tiene ícono");

  console.log("\n3. La sección con el gráfico");
  const sec = await evaluar(`(()=>{const h=[...document.querySelectorAll('h2')].find(x=>/Ausentismo del mes/i.test(x.innerText));
    return h? h.parentElement.parentElement.innerText.replace(/\\s+/g,' ').trim().slice(0,420):null;})()`);
  console.log("   > " + sec);
  check(!/d[íi]as-persona/i.test(sec||""), "tampoco dice 'días-persona'");
  check(!/36 d[íi]as|420 d[íi]as|[0-9]+([.,][0-9]+)? ?%/.test(sec||""),
        "el bloque del gráfico tampoco muestra cifras inventadas");
  check(/Todav[íi]a no hay con qu[ée] calcularlo/i.test(sec||""),
        "dice que todavía no hay con qué calcularlo");
  /* La aclaración de vacaciones sigue estando: es una regla acordada con la
     organización y hay que verla ANTES de que existan datos, no después. */
  check(/vacaciones programadas no contar[áa]n|vacaciones programadas no cuentan/i.test(sec||""),
        "conserva la aclaración de que las vacaciones no cuentan");

  /* El aviso ya no es un recuadro con ícono aparte: vive dentro del bloque
     que explica por qué no hay dato. Lo que se sigue comprobando es que se
     lea — que no acabe en letra chica al final, que era el vicio original. */
  const aviso = await evaluar(`(()=>{const h=[...document.querySelectorAll('h2')].find(x=>/Ausentismo del mes/i.test(x.innerText));
    const cont=h.parentElement.parentElement;
    const d=[...cont.querySelectorAll('p,div')].find(x=>/vacaciones programadas/i.test(x.innerText) && x.children.length===0);
    if(!d) return null; const cs=getComputedStyle(d);
    return {tam:cs.fontSize, color:cs.color, visible:cs.visibility};})()`);
  console.log("   aviso: " + JSON.stringify(aviso));
  check(aviso !== null, "la aclaración de vacaciones está presente");
  check(aviso && aviso.visible !== "hidden", "y visible");
  check(aviso && parseFloat(aviso.tam) >= 13, "no está en letra chica (>= 13px)");

  const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"ausentismo-tarjeta.png"),Buffer.from(s.data,"base64"));
  await evaluar(`[...document.querySelectorAll('h2')].find(x=>/Ausentismo del mes/i.test(x.innerText)).scrollIntoView({block:'center'});true`);
  await dormir(600);
  const s2=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,"ausentismo-grafico.png"),Buffer.from(s2.data,"base64"));

  console.log(fallos.length?`\n  ${fallos.length} FALLOS`:"\n  AUSENTISMO OK");
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.error("ERROR:",e.message);edge.kill();process.exit(1);});
