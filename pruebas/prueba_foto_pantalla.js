// La foto del tutor, desde la pantalla y con un navegador de verdad.
//
// El backend ya está probado aparte; lo que se comprueba aquí es lo que
// solo se rompe en pantalla: que sin foto salgan las iniciales y no un
// hueco roto, que al subirla la ficha la muestre sin recargar, que el
// motivo de un rechazo se lea junto a la ficha, y que quitarla la quite.
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
  "--remote-debugging-port=9461","--user-data-dir="+path.join(SP,"edge-foto"),
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

const TUTOR = "Zzz Rosa Con Foto";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9461/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim()).includes(${JSON.stringify(t)}));if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  /* Una imagen de verdad, hecha en el navegador y puesta en el input como
     si alguien la hubiera elegido del disco. */
  const elegirArchivo = (nombre, tipo, hacer) => ev(`(async()=>{
    const inp = [...document.querySelectorAll('main input[type=file]')].pop();
    if (!inp) return 'sin input de archivo';
    const blob = await (${hacer});
    const f = new File([blob], ${JSON.stringify(nombre)}, {type: ${JSON.stringify(tipo)}});
    const dt = new DataTransfer(); dt.items.add(f);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', {bubbles:true}));
    return 'ok';})()`);

  const IMAGEN = `new Promise(res=>{const c=document.createElement('canvas');c.width=1400;c.height=900;
    const x=c.getContext('2d');x.fillStyle='#1462a5';x.fillRect(0,0,1400,900);
    x.fillStyle='#f4f3f1';x.fillRect(0,0,1400,120);c.toBlob(res,'image/png');})`;
  const NO_IMAGEN = `Promise.resolve(new Blob(['esto no es una foto'], {type:'image/jpeg'}))`;

  await entrar();

  console.log("0. Un tutor sobre el que probar");
  const rid = await ev(`fetch('/api/responsables',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:${JSON.stringify(TUTOR)}, documento:'ZZF-9', telefono:'977000444'})})
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

  console.log("\n1. Sin foto, la ficha enseña las iniciales");
  await clicNav("Responsables / Tutores"); await dormir(2200);
  check(await clic(TUTOR), "se abre su ficha"); await dormir(1800);
  let c = await main();
  /* El rótulo lleva text-transform:uppercase, así que innerText lo
     devuelve en mayúsculas: se compara sin distinguir. */
  check(/Ficha del responsable/i.test(c), "estamos en la ficha");
  // Las iniciales salen de las dos primeras palabras: "Zzz Rosa" -> ZR.
  /* El runtime envuelve los valores en <span class="sc-interp">, así que
     el recuadro no está vacío de hijos: se busca por su texto. */
  const recuadros = await ev(`(()=>[...document.querySelectorAll('main div')]
    .filter(x=>!x.querySelector('div') && /^[A-Za-z?]{1,2}$/.test((x.textContent||'').trim()))
    .map(x=>x.textContent.trim()))()`);
  console.log("   recuadros de iniciales:", JSON.stringify(recuadros));
  check(recuadros.indexOf("ZR") >= 0, "salen las iniciales en vez de un hueco");
  check(/Subir foto/.test(c), "ofrece subir una");
  const rota = await ev(`(()=>{const i=document.querySelector('main img');
    return i ? (i.complete && i.naturalWidth === 0) : 'no hay img';})()`);
  check(rota === "no hay img", `y no hay ninguna imagen rota (${rota})`);
  await foto("foto-sin.png");

  console.log("\n2. Se sube una foto y la ficha la muestra sin recargar");
  console.log("   elegir archivo:", await elegirArchivo("retrato.png", "image/png", IMAGEN));
  await dormir(3000);
  const img = await ev(`(()=>{const i=document.querySelector('main img');
    if(!i) return null;
    return {src: i.getAttribute('src'), ancho: i.naturalWidth, alto: i.naturalHeight};})()`);
  console.log("   " + JSON.stringify(img));
  check(!!img, "aparece la imagen en la ficha");
  check(img && img.ancho > 0, "y se cargó de verdad (no está rota)");
  check(img && /\/api\/responsables\/\d+\/foto/.test(img.src), "servida por el sistema, no incrustada");
  c = await main();
  check(/Cambiar/.test(c) && /Quitar foto/.test(c), "ahora ofrece cambiarla o quitarla");
  await foto("foto-con.png");

  console.log("\n3. Lo guardado es la foto tratada, no la original");
  const guardada = await ev(`fetch('/api/responsables').then(r=>r.json())
    .then(d=>(d.responsables||[]).find(r=>r.nombre===${JSON.stringify(TUTOR)}))
    .then(r=>({ancho:r.foto_ancho, alto:r.foto_alto, mime:r.foto_mime, kb: Math.round((r.foto_tam||0)/1024)}))`);
  console.log("   " + JSON.stringify(guardada));
  check(guardada.ancho === 1024, `reducida a 1024 px de lado mayor (${guardada.ancho}x${guardada.alto})`);
  check(guardada.mime === "image/jpeg", "convertida a JPG");

  console.log("\n4. Un archivo que no es foto se rechaza y se explica");
  console.log("   elegir archivo:", await elegirArchivo("virus.jpg", "image/jpeg", NO_IMAGEN));
  await dormir(2500);
  c = await main();
  check(/no se puede abrir como imagen/i.test(c), "el motivo se lee junto a la ficha");
  const sigue = await ev(`(()=>{const i=document.querySelector('main img'); return i ? i.naturalWidth : 0;})()`);
  check(sigue > 0, "y la foto buena sigue puesta");
  await foto("foto-error.png");

  console.log("\n5. Quitarla la quita de verdad");
  check(await clic("Quitar foto"), "se pulsa quitar"); await dormir(2500);
  c = await main();
  check(/Subir foto/.test(c) && !/Quitar foto/.test(c), "vuelve a ofrecer subir");
  const enBase = await ev(`fetch('/api/responsables').then(r=>r.json())
    .then(d=>((d.responsables||[]).find(r=>r.nombre===${JSON.stringify(TUTOR)})||{}).foto || null)`);
  check(enBase === null, `y la ficha queda sin foto en la base (${JSON.stringify(enBase)})`);

  console.log("\n6. Limpieza");
  const limpio = await ev(`(async()=>{
    await fetch('/api/responsables/' + ${rid}, {method:'DELETE'});
    const d = await fetch('/api/responsables').then(r=>r.json());
    return (d.responsables||[]).filter(r=>r.nombre===${JSON.stringify(TUTOR)}).length;})()`);
  check(limpio === 0, `no queda rastro (${limpio})`);

  const graves = errs.filter(e => !/favicon|ph-duotone|404/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "FOTO EN PANTALLA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
