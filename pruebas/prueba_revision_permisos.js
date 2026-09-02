// Gestión de Permisos: la jefatura resuelve lo que el equipo pide.
//
// El circuito completo y de verdad: una trabajadora pide desde su
// autoservicio, y una cuenta con permiso de edición aprueba y rechaza.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
// El corredor levanta el banco en otro puerto para no pisar el 7801
// del equipo. Por defecto el 7801, para poder lanzarla suelta.
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9443","--user-data-dir="+path.join(SP,"edge-gp"),
  "--window-size=1500,1300",BASE + "/"], { stdio:"ignore" });
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

// La cuenta del banco es la única que puede crear fichas y roles.
const BANCO_U = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const BANCO_C = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const CLAVE  = "clave-de-prueba-1";
const CLAVE2 = "clave-de-prueba-2";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9443/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("el servidor de pruebas no responde en " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);
  const enModal=()=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);return d?d.innerText.replace(/\\s+/g,' ').trim():'';})()`);
  const clicModal=t=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return false;
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim().toLowerCase()===${JSON.stringify(t)}.toLowerCase());
    if(!b) return false; b.click(); return true;})()`);
  const ponerModal=(rotulo,valor)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return 'sin rotulo';
    const c=rot.parentElement.querySelector('input');
    if(!c) return 'sin control';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(c,${JSON.stringify(valor)});
    c.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);
  const entrar = (u, k) => ev(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify("")}||'${u}', clave:'${k}'})}).then(r=>r.status)`);

  /* Identificarse ANTES de crear: con login obligatorio la API no acepta
     escrituras de un visitante, y esta suite es de cuando sí las aceptaba.
     Se entra con la cuenta del banco, que es Director. */
  const alBanco = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(BANCO_U)},
                          clave:${JSON.stringify(BANCO_C)}})}).then(r=>r.status)`);
  if (alBanco !== 200) throw new Error("no se pudo entrar al banco: " + alBanco);
  await enviar("Page.reload", {}); await dormir(3000);
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

  console.log("0. Una jefa y dos trabajadoras, con sus cuentas");
  const d0 = await ev(`(async()=>{
    const j=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
    const jefa = await j('/api/personal', {nombre:'Zzz GP Jefa', cargo:'Coordinadora'});
    const jid = (jefa.persona||jefa).id || jefa.id;
    const a = await j('/api/personal', {nombre:'Zzz GP Ana', cargo:'Educadora', jefe_id:jid});
    const b = await j('/api/personal', {nombre:'Zzz GP Berta', cargo:'Cocinera', jefe_id:jid});
    const aid=(a.persona||a).id||a.id, bid=(b.persona||b).id||b.id;

    const rolT = await j('/api/roles', {nombre:'Zzz GP Trab', clave:'zzz_gp_trab',
                                        permisos:{asistencia:'vista'}});
    const rolJ = await j('/api/roles', {nombre:'Zzz GP Jefatura', clave:'zzz_gp_jefa',
                                        permisos:{permisos:'edicion', asistencia:'vista'}});
    const rt=(rolT.rol||rolT).id||rolT.id, rj=(rolJ.rol||rolJ).id||rolJ.id;

    await j('/api/usuarios', {personal_id:aid, rol_id:rt, usuario:'zzz.gp.ana',   clave:'${CLAVE}'});
    await j('/api/usuarios', {personal_id:bid, rol_id:rt, usuario:'zzz.gp.berta', clave:'${CLAVE}'});
    await j('/api/usuarios', {personal_id:jid, rol_id:rj, usuario:'zzz.gp.jefa',  clave:'${CLAVE}'});
    return {jefa:jid, ana:aid, berta:bid};})()`);
  console.log("   " + JSON.stringify(d0));
  check(!!(d0.jefa && d0.ana && d0.berta), "se crean las tres fichas y sus cuentas");

  /* Las cuentas nuevas exigen cambiar la contraseña la PRIMERA vez que
     entran. Después ya vale la nueva, así que se recuerda a quién se le
     cambió: intentar cambiarla otra vez con la vieja falla, y la sesión
     quedaba a medias. */
  const yaCambiada = new Set();
  const preparar = async (usuario) => {
    const clave = yaCambiada.has(usuario) ? CLAVE2 : CLAVE;
    const entro = await ev(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({usuario:'${usuario}', clave:'${clave}'})}).then(r=>r.status)`);
    if (yaCambiada.has(usuario)) return entro;
    const cambio = await ev(`(async()=>{
      const ses = await fetch('/api/sesion').then(r=>r.json()).catch(()=>({}));
      const csrf = (ses.sesion||{}).csrf || ses.csrf || '';
      const r = await fetch('/api/cambiar-clave',{method:'POST',
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body: JSON.stringify({actual:'${CLAVE}', nueva:'${CLAVE2}'})});
      return r.status;})()`);
    if (cambio === 200) yaCambiada.add(usuario);
    return cambio;
  };

  console.log("\n1. Ana y Berta piden sus permisos");
  const pedir = async (usuario, tipo, desde, hasta, motivo) => {
    await preparar(usuario);
    return await ev(`(async()=>{
      const ses = await fetch('/api/sesion').then(r=>r.json()).catch(()=>({}));
      const csrf = (ses.sesion||{}).csrf || ses.csrf || '';
      const r = await fetch('/api/permisos',{method:'POST',
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body: JSON.stringify({tipo:'${tipo}', desde:'${desde}', hasta:'${hasta}', motivo:'${motivo}'})});
      const d = await r.json();
      return {estado:r.status, id:d.id, error:d.error||''};})()`);
  };
  const p1 = await pedir("zzz.gp.ana",   "medico",   "2026-09-21", "2026-09-22", "Control");
  const p2 = await pedir("zzz.gp.berta", "personal", "2026-10-01", "2026-10-20", "Viaje familiar");
  console.log("   " + JSON.stringify([p1, p2]));
  check(p1.estado === 200 && p2.estado === 200, "las dos solicitudes quedan registradas");

  console.log("\n2. La jefatura entra y ve la bandeja");
  await preparar("zzz.gp.jefa");
  await enviar("Page.reload", {}); await dormir(3500);
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
  check(await clicNav("Gestión de Permisos"), "llega desde el menú");
  await dormir(2200);
  let c = await main();
  check(!/por construir/i.test(c), "ya no es una pantalla en construcción");
  check(/Zzz GP Ana/.test(c) && /Zzz GP Berta/.test(c),
        "ve las solicitudes de las dos");
  check(/Por resolver/.test(c), "con el filtro de lo pendiente");
  /* La etiqueta se le pregunta al sistema en vez de escribirla: el 27/08
     los tipos pasaron a ser los diez del formato en papel y «Permiso
     médico» se llama ahora «Cita Essalud / Clínica». */
  const etiMed = await ev(`fetch('/api/permisos/tipos').then(r=>r.json())
    .then(d=>((d.tipos||[]).find(t=>t.valor==='medico')||{}).etiqueta||'')`);
  console.log("   etiqueta de 'medico': " + etiMed);
  check(!!etiMed && c.includes(etiMed),
        `el tipo en claro, no en código («${etiMed}»)`);
  await foto("gp-bandeja.png");
  const _t = c.replace(/\s+/g," ");
  const _i = _t.indexOf("Berta");
  console.log("   BERTA: " + _t.slice(Math.max(0,_i-90), _i+260));


  /* La pantalla es una tabla: las acciones están DENTRO de la fila, tras
     pulsar «Revisar». Esta suite es de cuando eran tarjetas con todo a la
     vista, y por eso no encontraba los botones. */
  const abrirFila = async (quien) => {
    const ok = await ev(`(()=>{
      const cajas=[...document.querySelectorAll('main tr, main div')]
        .filter(d=>d.textContent.includes(${JSON.stringify(quien)}));
      for (const f of cajas.reverse()) {
        const b=[...f.querySelectorAll('button')]
          .find(x=>/^Revisar$/.test((x.innerText||'').trim()));
        if (b) { b.click(); return true; }
      }
      return false;})()`);
    await dormir(1300);
    return ok;
  };

  /* Aprobar pasa por la pizarrita. Si quien aprueba todavía no tiene firma
     guardada, el diálogo la pide: se dibuja un trazo con eventos de
     puntero, que es lo que hace un dedo o un ratón. */
  const dibujarFirma = async () => ev(`(()=>{
    const c = document.getElementById('lienzoFirma');
    if (!c) return 'sin lienzo';
    const r = c.getBoundingClientRect();
    const punto = (t, x, y) => c.dispatchEvent(new PointerEvent(t, {
      bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1}));
    punto('pointerdown', 20, r.height - 20);
    for (let i = 1; i <= 12; i++)
      punto('pointermove', 20 + i * (r.width - 60) / 12,
            r.height - 20 - (i % 3) * 18);
    punto('pointerup', r.width - 40, r.height - 30);
    return 'dibujada';})()`);
  const pulsarEnFila = async (quien, rotulo) => ev(`(()=>{
    const cajas=[...document.querySelectorAll('main tr, main div')]
      .filter(d=>d.textContent.includes(${JSON.stringify(quien)}));
    for (const f of cajas.reverse()) {
      const b=[...f.querySelectorAll('button')]
        .find(x=>new RegExp(${JSON.stringify(rotulo)}).test((x.innerText||'').trim()));
      if (b) { b.click(); return true; }
    }
    return false;})()`);
  console.log("\n3. La larga avisa de que necesita las dos firmas");
  check(/dos firmas|Administración/i.test(c),
        "se avisa de que la de 20 días pasa del umbral");
  await abrirFila("Zzz GP Berta");
  const dentroBerta = await main();
  check(/visto bueno/i.test(dentroBerta),
        "y su botón no dice 'Aprobar', porque aprobarla no la cierra");

  console.log("\n4. Aprobar la corta la cierra");
  await abrirFila("Zzz GP Ana");
  /* Aprobar pasa por la firma: el documento archivado tiene que enseñar
     quién autorizó, así que el botón abre el diálogo y se confirma ahí. */
  await pulsarEnFila("Zzz GP Ana", "Firmar y aprobar|^Aprobar$");
  await dormir(1600);
  console.log("   firma: " + await dibujarFirma());
  await dormir(500);
  await clicModal("Firmar y aprobar");
  await dormir(3000);
  const tras = await ev(`fetch('/api/permisos?estado=todas').then(r=>r.json()).then(d=>
    d.solicitudes.map(s=>({p:s.persona, e:s.estado})))`);
  console.log("   " + JSON.stringify(tras));
  check(tras.some(x => /Ana/.test(x.p) && x.e === "aprobada"),
        "la de Ana queda aprobada");

  console.log("\n5. Rechazar exige motivo, y el motivo se guarda");
  await abrirFila("Zzz GP Berta");
  await pulsarEnFila("Zzz GP Berta", "Rechazar");
  await dormir(1400);
  let m = await enModal();
  check(/Rechazar la solicitud/.test(m), "se abre el diálogo de rechazo");
  check(/Zzz GP Berta/.test(m), "dice de quién es la solicitud");
  check(await clicModal("Sí, rechazar"), "se intenta rechazar sin motivo");
  await dormir(1200);
  m = await enModal();
  check(/motivo/i.test(m), "y se exige el motivo antes de dejar seguir");
  console.log("   motivo:", await ponerModal("Motivo", "Esa semana no hay cobertura de turno"));
  await clicModal("Sí, rechazar"); await dormir(2500);
  const berta = await ev(`fetch('/api/permisos?estado=todas').then(r=>r.json()).then(d=>
    d.solicitudes.find(s=>/Berta/.test(s.persona)))`);
  console.log("   " + JSON.stringify({e: berta.estado, n: berta.nota}));
  check(berta.estado === "rechazada", "queda rechazada");
  check(/cobertura de turno/.test(berta.nota || ""), "con el motivo guardado");

  console.log("\n6. Los filtros");
  await clic("Aprobadas"); await dormir(1800);
  c = await main();
  check(/Zzz GP Ana/.test(c) && !/Zzz GP Berta/.test(c),
        "'Aprobadas' muestra solo la aprobada");
  await clic("Rechazadas"); await dormir(1800);
  c = await main();
  check(/Zzz GP Berta/.test(c) && !/Zzz GP Ana/.test(c),
        "'Rechazadas' solo la rechazada");
  await clic("Por resolver"); await dormir(1800);
  c = await main();
  check(/No hay nada esperando tu respuesta/.test(c),
        "y 'Por resolver' queda vacía, diciéndolo");
  await foto("gp-vacia.png");

  console.log("\n7. Ana ve el resultado en su pantalla");
  await preparar("zzz.gp.ana");
  await enviar("Page.reload", {}); await dormir(3500);
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
  await clicNav("Mis Permisos"); await dormir(2000);
  c = await main();
  check(/Aprobada/.test(c), "ve que la suya fue aprobada");

  console.log("\n8. Limpieza");
  const queda = await ev(`(async()=>{
    await fetch('/api/logout', {method:'POST'}).catch(()=>{});
    for (const id of [${d0.ana}, ${d0.berta}, ${d0.jefa}])
      await fetch('/api/personal/' + id, {method:'DELETE'});
    const d = await fetch('/api/personal').then(r=>r.json());
    return (d.personal || []).filter(x=>/^Zzz GP /.test(x.nombre)).length;})()`);
  check(queda === 0, `las fichas de prueba se retiran (${queda})`);

  console.log("\n9. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404|403|400/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  REVISIÓN DE PERMISOS OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
