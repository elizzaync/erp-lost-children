// La pantalla de marcar, con datos reales.
//
// Se marca dos veces para ejercitar todo: el reloj, las tres cifras del
// día, la lista de marcas y la insignia de jornada. Con cero marcas media
// pantalla no se prueba.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9519","--user-data-dir="+path.join(SP,"edge-mvista"),
  "--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",
  "--use-file-for-fake-video-capture=" + path.join(SP,"caras","rostroA.y4m"),
  "--window-size=1500,1100", BASE + "/"], { stdio:"ignore" });
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

/* El recorrido del diálogo vive en ayuda_marcar.js: desde que la marca
   compara el rostro son varios pasos y una espera larga. */
const { conCara, ayudas, limpiar } = require("./ayuda_marcar.js");
let marcarDeVerdad, enrolarRostro;
const texto = () => ev(`(document.querySelector('main')||{}).innerText||''`);

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9519/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable");
  await enviar("Browser.grantPermissions", {origin: BASE,
    permissions: ["geolocation", "videoCapture"]}).catch(()=>{});
  await enviar("Emulation.setGeolocationOverride",
    {latitude: -11.9391, longitude: -77.0619, accuracy: 9});
  await dormir(2500);
  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(4000);
  await ev(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};
    return "ok";})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Marcar asistencia/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2600);

  console.log("   " + await limpiar(ev, dormir));
  const A = ayudas(ev, dormir);
  marcarDeVerdad = A.marcar; enrolarRostro = A.enrolar;
  check(await enrolarRostro(), "se registra el rostro de referencia");

  console.log("1. El reloj corre y sale del servidor");
  const r1 = await ev(`(()=>{const m=document.querySelector('main');
    const x=(m.innerText||'').match(/\\d{1,2}:\\d{2}:\\d{2}/); return x?x[0]:'';})()`);
  await dormir(2400);
  const r2 = await ev(`(()=>{const m=document.querySelector('main');
    const x=(m.innerText||'').match(/\\d{1,2}:\\d{2}:\\d{2}/); return x?x[0]:'';})()`);
  console.log("   " + r1 + " → " + r2);
  check(!!r1 && r1 !== r2, "avanza solo (" + r1 + " → " + r2 + ")");
  const servidor = await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>d.ahora)`);
  const dif = Math.abs(
    (r2.split(":").reduce((a,b)=>a*60+ +b, 0)) -
    (String(servidor).split(":").reduce((a,b)=>a*60+ +b, 0)));
  console.log("   servidor: " + servidor + " · diferencia: " + dif + " s");
  check(dif < 120 || dif > 43000, "coincide con la hora del servidor");

  console.log("\\n2. Estado del GPS con permiso concedido");
  const t0 = await texto();
  check(/Ubicación activa/.test(t0), "dice que la ubicación está activa");
  check(/-11\.9391/.test(t0), "y enseña las coordenadas de verdad");
  check(/±\s*\d+\s*m/.test(t0), "con su precisión");

  console.log("\\n3. La semana se dibuja siempre");
  const barras = await ev(`(()=>{const m=document.querySelector('main');
    const t=(m.innerText||'');
    return ['Lun','Mar','Mié','Jue','Vie'].filter(d=>t.indexOf(d)>=0).length;})()`);
  console.log("   días dibujados: " + barras);
  check(barras === 5, "de lunes a viernes (" + barras + ")");
  check(/Meta semanal/i.test(t0) && /Acumulado/i.test(t0), "con acumulado y meta");

  console.log("\\n4. Primera marca: entrada y jornada en curso");
  const pagina0 = await ev(`document.body.innerText`);
  check(/SIN INICIAR/i.test(pagina0), "la insignia dice «sin iniciar»");
  await marcarDeVerdad();
  const t1 = await texto();
  const pagina1 = await ev(`document.body.innerText`);
  check(/1 marca/.test(t1), "cuenta 1 marca");
  check(/Entrada/.test(t1), "la etiqueta dice Entrada");
  check(/Desde el celular/i.test(t1), "y que vino del celular");
  check(/JORNADA EN CURSO/i.test(pagina1), "la insignia pasa a «jornada en curso»");
  check(/Marcar salida/.test(t1), "y el botón pasa a «Marcar salida»");
  await foto("marcar-vista.png");

  console.log("\\n5. Segunda marca: salida y horas trabajadas");
  // El servidor no admite dos marcas en menos de dos minutos, y hace bien.
  // Se atrasa la entrada en la base para poder marcar la salida ya.
  console.log("   " + require("child_process")
    .execFileSync("py", [path.join(SP, "retrasa_marca.py")],
                  { encoding: "utf8" }).trim());
  await marcarDeVerdad();
  const t2 = await texto();
  const pagina2 = await ev(`document.body.innerText`);
  check(/2 marcas/.test(t2), "cuenta 2 marcas");
  check(/Salida/.test(t2), "la segunda es Salida");
  check(/JORNADA FINALIZADA/i.test(pagina2), "la insignia dice «jornada finalizada»");
  check(/[0-9]+ h [0-9][0-9] m/.test(t2), "y aparece el tiempo trabajado");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\\n")[0]));

  console.log("\\n" + (fallos.length ? "FALLOS: " + fallos.length : "PANTALLA DE MARCAR OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
