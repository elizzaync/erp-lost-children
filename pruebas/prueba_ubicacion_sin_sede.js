// Sin sede configurada, ¿se pide la ubicación y se guarda con la marca?
//
// Antes no: el código solo la pedía cuando había una sede puesta, así que
// sin sede el navegador no llegaba ni a preguntar y la marca se guardaba
// sin coordenadas — mientras la pantalla prometía que se guardaban «como
// constancia». Y era circular: sin marcas con ubicación no había forma de
// saber dónde está la sede.
//
// Se comprueban los dos casos, porque el arreglo tiene que servir para
// ambos: con permiso, la marca lleva coordenadas; sin permiso, la marca
// entra igual —no se le niega el fichaje a nadie por un permiso que el
// sistema todavía no necesita.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9547","--user-data-dir="+path.join(SP,"edge-ubi"),
  "--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",
  "--use-file-for-fake-video-capture=" + path.join(SP,"caras","rostroA.y4m"),
  "--window-size=1400,1000", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){const d=r.exceptionDetails;const x=d.exception||{};
    throw new Error([d.text,x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};
const { ayudas } = require("./ayuda_marcar.js");

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9547/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2000);

  const entrar = async () => {
    const st = await ev(`fetch('/api/login',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
      .then(r=>r.status)`);
    if (st !== 200) throw new Error("no se pudo entrar: " + st);
    await enviar("Page.reload", {}); await dormir(3500);
    await ev(`(async()=>{
      const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
      const csrf = (s.sesion||{}).csrf || "";
      if (!window.__fo) window.__fo = window.fetch;
      window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
        if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
          o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
        return window.__fo(u,o);};})()`);
  };

  console.log("0. Punto de partida: sin sede configurada");
  await entrar();
  const sede = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>JSON.stringify({exige:!!d.exigeUbicacion, radio:d.radio}))`);
  console.log("   " + sede);
  check(JSON.parse(sede).exige === false, "no hay sede: no se exige ubicación");

  // A la pantalla de marcar: los ayudantes actúan sobre la que esté abierta.
  const menu = async (r) => { await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>new RegExp(${JSON.stringify(r)}).test(x.innerText||'')); if(b) b.click();})()`); await dormir(2600); };
  await menu("Marcar asistencia");

  const A = ayudas(ev, dormir);
  await A.enrolar();

  console.log("\n1. CON permiso de ubicación, la marca la guarda");
  await enviar("Browser.grantPermissions", {origin: BASE,
    permissions: ["geolocation","videoCapture"]});
  await enviar("Emulation.setGeolocationOverride",
    {latitude:-11.9391, longitude:-77.0619, accuracy:9});
  await dormir(600);
  // Antes de confirmar: qué lee la persona en el recuadro de Ubicación
  // cuando el GPS SÍ contestó.
  await A.abrirDialogo();
  await dormir(2500);
  const diceCon = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin diálogo';
    const t=(d.innerText||'').split(String.fromCharCode(10));
    const i=t.findIndex(l=>/^UBICACI/i.test(l.trim()));
    return i<0 ? 'no aparece' : t.slice(i,i+2).join(' | ');})()`);
  console.log('   con permiso, el diálogo dice: ' + diceCon);
  check(/Registrada/.test(diceCon), 'dice que quedó registrada, con su precisión');
  check(!/-?[0-9]+\.[0-9]{4}/.test(diceCon), 'y no le enseña coordenadas crudas');
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Cancelar/.test(x.innerText||'')); if(b)b.click();})()`);
  await dormir(900);

  const r1 = await A.marcar();
  console.log("   " + JSON.stringify(r1).slice(0, 180));
  const m1 = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>JSON.stringify((d.marcas||[]).slice(-1)[0]||{}))`);
  console.log("   última marca: " + m1);
  check(/lat/.test(m1) ? JSON.parse(m1).lat != null : true,
        "la marca llegó al servidor");

  // Lo que de verdad importa: que el servidor RECIBIÓ coordenadas.
  const guardadas = await ev(`fetch('/api/asistencia/mias').then(r=>r.json())
    .then(d=>{const m=(d.marcas||[]);return JSON.stringify(m.map(x=>({h:x.hora,lat:x.lat})));})`);
  console.log("   coordenadas guardadas: " + guardadas);
  check(/[-0-9]/.test(guardadas) && guardadas.indexOf('"lat":null') < 0,
        "la marca quedó con coordenadas, sin sede configurada");

  console.log("\n2. SIN permiso de ubicación, no se le corta el paso");
  /* Sin sede, negar el permiso NO puede impedir fichar: el sistema no
     necesita la ubicación para nada todavía.

     No se comprueba marcando otra vez —dos marcas en el mismo minuto son
     la misma marca y el servidor las rechaza, con razón— sino mirando que
     el intento AVANCE hasta la cámara en vez de morir con el aviso de
     «no diste permiso», que es donde moriría si se exigiera. */
  await enviar("Browser.resetPermissions", {});
  await enviar("Browser.grantPermissions", {origin: BASE,
    permissions: ["videoCapture"]});          // cámara sí, ubicación no
  await enviar("Emulation.clearGeolocationOverride", {}).catch(()=>{});
  await dormir(600);
  await A.abrirDialogo();
  const pantalla = await ev(`document.body.innerText`);
  // Qué dice el recuadro de Ubicación del diálogo, que es lo que lee la
  // persona mientras se hace la foto.
  const dice = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin diálogo';
    const t=(d.innerText||'').split(String.fromCharCode(10));
    const i=t.findIndex(l=>/^UBICACI/i.test(l.trim()));
    return i<0 ? 'no aparece' : t.slice(i,i+3).join(' | ');})()`);
  console.log('   el diálogo dice: ' + dice);
  check(!/No se exige ubicaci/i.test(dice),
        'ya no dice «no se exige ubicación» mientras busca');
  check(!/No diste permiso de ubicación/i.test(pantalla),
        "no se le echa atrás por no dar la ubicación");
  check(/Confirmar y marcar|Repetir la foto|Tu cara/i.test(pantalla),
        "llega hasta la cámara igualmente");

  // Y el servidor tampoco la exige: una marca sin coordenadas se acepta.
  const sinCoords = await ev(`fetch('/api/asistencia/marcar',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({descriptor:[], modelo:'prueba'})})
    .then(async r=>{const j=await r.json(); return JSON.stringify({e:r.status,m:j.motivo});})`);
  console.log("   sin coordenadas el servidor responde: " + sinCoords);
  check(JSON.parse(sinCoords).m !== "sin_ubicacion",
        "el servidor no la rechaza por falta de ubicación");

  console.log("\n3. Registro de Asistencia dice de dónde vino");
  /* La ubicación solo sirve si RRHH la ve. Esta columna es donde la ve:
     «Celular · con ubicación» frente a «Terminal», que no tiene GPS y por
     tanto no tiene nada que enseñar. */
  /* El diálogo de la cámara sigue abierto del paso anterior: si no se
     cierra, el clic del menú va al velo y no al botón. */
  await ev(`(()=>{const b=[...document.querySelectorAll('button')]
    .find(x=>/Cancelar/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(900);
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Registro de Asistencia/.test(x.innerText||'')); if(b) b.click();})()`);

  /* La lista se pide al entrar y tarda; leerla a los tres segundos era
     leer lo de antes. Se espera a que la fila traiga algo, hasta 20 s. */
  const leerFila = () => ev(`(()=>{const m=document.querySelector('main');
    if(!m) return 'sin main';
    const t=(m.innerText||'').split(String.fromCharCode(10));
    const i=t.findIndex(l=>/Banco De Pruebas/.test(l));
    return i<0 ? 'no aparece la fila' : t.slice(i, i+4).join(' | ');})()`);
  let fila = "";
  for (let i = 0; i < 20; i++) {
    await dormir(1000);
    fila = await leerFila();
    if (/Celular|Terminal/i.test(fila)) break;
  }
  console.log("   la fila dice: " + fila);
  check(/Celular/i.test(fila), "la fila dice que marcó por el celular");
  check(!/Rostro|Huella/i.test(fila),
        "y ya no enseña el método biométrico, que no describe el fichaje");

  console.log(fallos.length ? `\n  ${fallos.length} FALLOS` : "\n  UBICACIÓN SIN SEDE OK");
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.error("ERROR:", e.message); edge.kill(); process.exit(1);});
