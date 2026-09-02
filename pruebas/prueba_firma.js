// La firma dibujada: de la pizarrita al papel.
//
// Se dibuja de verdad, moviendo el puntero sobre el lienzo, porque lo que
// puede fallar aquí es justo eso: que el <canvas> se monte, que reciba los
// eventos, y que el trazo sobreviva a que el runtime vuelva a pintar.
//
// Lo que importa al final: que la firma acabe DENTRO del PDF, y que no
// aparezca en un permiso que nadie aprobó.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9493","--user-data-dir="+path.join(SP,"edge-firma"),
  "--window-size=1500,1300", BASE + "/"], { stdio:"ignore" });
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

// Dibuja un garabato sobre el lienzo con eventos de puntero reales.
async function garabatear() {
  const caja = await ev(`(()=>{const c=document.getElementById('lienzoFirma');
    if(!c) return null; const b=c.getBoundingClientRect();
    return {x:b.left, y:b.top, an:b.width, al:b.height};})()`);
  if (!caja) return "no hay lienzo";
  const puntos = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    puntos.push([caja.x + caja.an * (0.15 + 0.7 * t),
                 caja.y + caja.al * (0.5 + 0.28 * Math.sin(t * 9))]);
  }
  const raton = (tipo, x, y) => enviar("Input.dispatchMouseEvent", {
    type: tipo, x: Math.round(x), y: Math.round(y), button: "left",
    buttons: tipo === "mouseReleased" ? 0 : 1, clickCount: 1,
    pointerType: "mouse" });
  await raton("mousePressed", puntos[0][0], puntos[0][1]);
  for (const [x, y] of puntos.slice(1)) { await raton("mouseMoved", x, y); }
  await raton("mouseReleased", puntos[puntos.length-1][0], puntos[puntos.length-1][1]);
  return "ok";
}

const pulsar = (texto) => `(()=>{const d=[...document.querySelectorAll('div')]
  .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  const donde = d || document;
  const b=[...donde.querySelectorAll('button')].find(x=>(x.innerText||'').trim()===${JSON.stringify(texto)});
  if(!b) return 'no está el botón ' + ${JSON.stringify(texto)}; b.click(); return 'ok';})()`;

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9493/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(3500);
  await ev(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || s.csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};
    return "ok";})()`);

  // Se parte de cero: si una corrida anterior dejó firma, no se probaría
  // el camino que importa, que es el de quien no tiene ninguna.
  await ev(`fetch('/api/mi-firma',{method:'DELETE'}).then(r=>r.status)`);

  console.log("0. Sin firma, el botón lo dice");
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Mis Permisos');
    if(!b) throw new Error('no está Mis Permisos'); b.click();})()`);
  await dormir(2600);
  const rotulo = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/firma/i.test(x.innerText||'')); return b ? (b.innerText||'').trim() : 'no está';})()`);
  check(rotulo === "Registrar mi firma", "el botón dice «Registrar mi firma» (" + rotulo + ")");

  console.log("\n1. La pizarrita recibe el trazo");
  check((await ev(pulsar("Registrar mi firma"))) === "ok", "se abre el diálogo");
  await dormir(1600);
  const hayLienzo = await ev(`(()=>{const c=document.getElementById('lienzoFirma');
    return c ? (c.width > 100 ? 'montado ' + c.width + 'x' + c.height : 'sin tamaño') : 'no está';})()`);
  check(/montado/.test(hayLienzo), "el lienzo se monta (" + hayLienzo + ")");
  console.log("   " + (await garabatear()));
  await dormir(500);
  const pintado = await ev(`(()=>{const c=document.getElementById('lienzoFirma');
    if(!c) return -1; const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;
    return n;})()`);
  console.log("   píxeles pintados: " + pintado);
  check(pintado > 200, "el trazo queda en el lienzo");
  await foto("firma-lienzo.png");

  console.log("\n2. Se guarda y se ve");
  check((await ev(pulsar("Guardar mi firma"))) === "ok", "se pulsa guardar");
  await dormir(2600);
  const guardada = await ev(`fetch('/api/mi-firma').then(r=>r.json())
    .then(d=>d.tiene ? 'sí' : 'no')`);
  check(guardada === "sí", "el servidor la guardó (" + guardada + ")");
  const enPantalla = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/firma/i.test(x.innerText||'')); return b ? (b.innerText||'').trim() : 'no está';})()`);
  check(enPantalla === "Mi firma", "y el botón ya dice «Mi firma» (" + enPantalla + ")");

  console.log("\n3. La firma sale en la vista previa del permiso");
  check((await ev(pulsar("Pedir permiso"))) === "ok", "se abre «Pedir permiso»");
  await dormir(1800);
  const enPrevia = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0); if(!d) return 'sin diálogo';
    const i=[...d.querySelectorAll('img')].find(x=>/\\/firma$/.test(x.getAttribute('src')||''));
    return i ? (i.complete && i.naturalWidth>0 ? 'sí' : 'no cargó') : 'no está';})()`);
  check(enPrevia === "sí", "se ve sobre la línea del colaborador (" + enPrevia + ")");

  console.log("\n4. Un permiso, y el PDF antes de aprobarlo");
  const sid = await ev(`(async()=>{
    const r = await fetch('/api/permisos', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({tipo:'personal', desde:'2026-12-01', hasta:'2026-12-01',
                            motivo:'Zzz prueba de firma'})});
    const d = await r.json();
    return r.status===200 ? ((d.solicitud||{}).id || d.id) : ('error ' + r.status);})()`);
  check(typeof sid === "number", "se crea la solicitud (" + sid + ")");
  const tam1 = await ev(`fetch('/api/permisos/' + ${sid} + '/documento.pdf')
    .then(async r=>(await r.arrayBuffer()).byteLength)`);
  console.log("   PDF pendiente: " + tam1 + " bytes");

  console.log("\n5. Firmar y aprobar");
  await ev(`(()=>{const b=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const c=[...b.querySelectorAll('button')].find(x=>/Cancelar/.test(x.innerText||'')); if(c) c.click();})()`);
  await dormir(1200);
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Gestión de Permisos');
    if(!b) throw new Error('no está la bandeja'); b.click();})()`);
  await dormir(2600);
  const revisa = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>(x.innerText||'').trim()==='Revisar'); if(!b) return 'sin filas'; b.click(); return 'ok';})()`);
  console.log("   " + revisa);
  await dormir(1600);
  const etiqueta = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Firmar y/.test(x.innerText||'')); return b ? (b.innerText||'').trim() : 'no está';})()`);
  check(/Firmar y/.test(etiqueta), "el botón dice que se firma (" + etiqueta + ")");
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Firmar y/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2000);
  const dialogo = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0); return d ? d.innerText.slice(0,60) : 'sin diálogo';})()`);
  check(/Firmar y aprobar/.test(dialogo), "se abre el diálogo de firmar (" + dialogo.split("\n")[0] + ")");
  await foto("firma-aprobar.png");
  check((await ev(pulsar("Firmar y aprobar"))) === "ok", "se confirma");
  await dormir(3000);

  console.log("\n6. El resultado");
  const estado = await ev(`fetch('/api/permisos/mios').then(r=>r.json())
    .then(d=>{const x=(d.solicitudes||[]).find(s=>s.id===${sid}); return x ? x.estado : 'no está';})`);
  check(estado === "aprobada", "la solicitud quedó aprobada (" + estado + ")");
  const tam2 = await ev(`fetch('/api/permisos/' + ${sid} + '/documento.pdf')
    .then(async r=>(await r.arrayBuffer()).byteLength)`);
  console.log("   PDF aprobado: " + tam2 + " bytes");
  /* Que la firma esté DENTRO del PDF se comprueba en prueba_firma_pdf.py,
     contando las imágenes del archivo: desde el navegador no se puede sin
     arrastrar una librería. Aquí solo se afirma lo que aquí se sabe. */
  check(tam2 > 20000, "el documento del permiso aprobado sigue descargándose");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "FIRMA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
