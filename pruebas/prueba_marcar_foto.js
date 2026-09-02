// Marcar con foto y ubicación.
//
// Edge se arranca con cámara falsa (--use-fake-device-for-media-stream) y
// la ubicación se simula por CDP. Así se puede comprobar lo que de verdad
// importa: que la foto QUEDE guardada, que las coordenadas queden, y que
// a quien está lejos se le rechace.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
/* Atrasa la última marca para que la siguiente no caiga en el mismo
   minuto: dos marcas del mismo minuto son la misma marca y el servidor
   las rechaza, con razón. Es el mismo ayudante que usa prueba_tope_marcas. */
const atrasar = () => require("child_process")
  .execFileSync("py", [path.join(__dirname, "retrasa_marca.py")], { encoding: "utf8" }).trim();
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9513","--user-data-dir="+path.join(SP,"edge-mfoto"),
  "--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",
  "--use-file-for-fake-video-capture=" + path.join(SP,"caras","rostroA.y4m"),
  "--window-size=430,900", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map(); const errs=[];
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

/* El recorrido del diálogo vive en ayuda_marcar.js: desde que la marca
   compara el rostro son varios pasos y una espera larga. */
const { conCara, ayudas } = require("./ayuda_marcar.js");
let marcarDeVerdad, enrolarRostro;

// La sede de prueba: la casa de Comas.
const SEDE = { lat: -11.9391, lon: -77.0619 };

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9513/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable");
  await enviar("Browser.grantPermissions", {origin: BASE,
    permissions: ["geolocation", "videoCapture"]}).catch(()=>{});
  await dormir(2500);

  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);

  // Se configura la sede, para que el radio entre en juego.
  const puesta = await ev(`(async()=>{
    const s = await fetch('/api/sesion').then(r=>r.json());
    const csrf = (s.sesion||{}).csrf || "";
    const r = await fetch('/api/parametros', {method:'PUT',
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
      body: JSON.stringify({lat:${SEDE.lat}, lon:${SEDE.lon}, radio_marca:150})});
    return r.status;})()`);
  console.log("   configurar sede: " + puesta);

  await enviar("Page.reload", {}); await dormir(3800);
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
  await ev(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};
    return "ok";})()`);

  const irAMarcar = async () => {
    await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
      .find(x=>/Marcar asistencia/.test(x.innerText||'')); if(b) b.click();})()`);
    await dormir(2200);
  };

  console.log("\n1. Estando en la sede, se marca");
  check(await ev(`[...document.querySelectorAll('nav button')].some(x=>/Marcar asistencia/.test(x.innerText||''))`),
    "«Marcar asistencia» está en el menú");
  await enviar("Emulation.setGeolocationOverride",
    {latitude: SEDE.lat, longitude: SEDE.lon, accuracy: 12});
  await irAMarcar();
  const A = ayudas(ev, dormir);
  marcarDeVerdad = A.marcar; enrolarRostro = A.enrolar;
  check(await enrolarRostro(), "se registra el rostro de referencia");
  const antes = await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>(d.marcas||[]).length)`);
  await marcarDeVerdad();
  const despues = await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>(d.marcas||[]).length)`);
  console.log("   marcas: " + antes + " → " + despues);
  check(despues > antes, "la marca queda (" + antes + " → " + despues + ")");

  const ultima = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>JSON.stringify((d.marcas||[]).slice(-1)[0]||{}))`);
  console.log("   " + ultima);
  const m = JSON.parse(ultima);
  check(!!m.foto, "guardó una foto (" + (m.foto || "ninguna") + ")");
  check(m.lat != null && m.lon != null, "guardó las coordenadas");
  /* Antes se comprobaba la distancia a la sede. Ese cerco se retiró el
     31/08/2026: lo que se guarda y se lee es el NOMBRE del sitio. */
  check(!!(m.lugar || "").trim(),
        "y el nombre del sitio (" + (m.lugar || "ninguno") + ")");

  console.log("\n2. Desde lejos SÍ se marca, y queda anotado");
  /* Esta parte comprobaba lo contrario: que estando fuera del radio no se
     abriera siquiera la cámara y el servidor devolviera 403 «lejos».

     Se cambió el 31/08/2026 por decisión de la ONG: marcar entra siempre,
     esté quien marca donde esté, y la distancia queda registrada para que
     la mire RRHH y decida. Un GPS urbano se equivoca por decenas de metros
     y dentro de un edificio por más; rechazar por esa cifra es castigar a
     alguien por su teléfono.

     Lo que hay que garantizar ahora es lo de siempre pero al revés: que la
     marca ENTRE, y que su distancia no se pierda por el camino. */
  console.log("   " + atrasar());
  await enviar("Emulation.setGeolocationOverride",
    {latitude: SEDE.lat + 0.02, longitude: SEDE.lon, accuracy: 12});
  const n1 = await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>(d.marcas||[]).length)`);
  const lejos = await marcarDeVerdad();
  check(!!lejos.dialogo, "la cámara se abre igual estando lejos");
  const n2 = await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>(d.marcas||[]).length)`);
  console.log("   marcas: " + n1 + " -> " + n2);
  check(n2 === n1 + 1, `la marca entra desde lejos (${n1} -> ${n2})`);
  const dLejos = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>JSON.stringify((d.marcas||[]).slice(-1)[0]||{}))`);
  console.log("   última: " + dLejos);
  check(!!(JSON.parse(dLejos).lugar || "").trim(),
        "y queda anotado desde dónde, que es el dato de RRHH");

  console.log("\n3. El servidor tampoco la rechaza");
  const directo = await ev(`fetch('/api/asistencia/marcar',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({lat:${SEDE.lat + 0.05}, lon:${SEDE.lon}, precision:5})})
    .then(async r=>({estado:r.status, cuerpo:(await r.json()).motivo}))`);
  console.log("   " + JSON.stringify(directo));
  check(directo.cuerpo !== "lejos",
        "el servidor no devuelve «lejos»: eso lo decide una persona");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "MARCA CON FOTO Y UBICACIÓN OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
