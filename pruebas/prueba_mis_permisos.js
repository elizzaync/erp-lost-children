// Mis Permisos: un trabajador pide el suyo, lo ve y lo cancela.
//
// Entra de verdad con la cuenta de trabajador, porque la pantalla depende
// de la sesión: es de donde el backend saca a nombre de quién va todo.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
// El corredor levanta el banco en otro puerto para no pisar el 7801
// del equipo. Por defecto el 7801, para poder lanzarla suelta.
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9431","--user-data-dir="+path.join(SP,"edge-mp"),
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

// La cuenta del banco (Director) es la que puede CREAR fichas y roles.
// La de la trabajadora se crea después y sirve para probar la pantalla
// de autoservicio sin el permiso de revisión.
const BANCO_U = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const BANCO_C = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const USUARIO = "zzz.mp.trab";
const CLAVE   = "clave-de-prueba-1";
const CLAVE2  = "clave-de-prueba-2";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9431/json/list").then(r=>r.json());
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
  const poner=(rotulo,valor)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return 'sin rotulo';
    const c=rot.parentElement.querySelector('input,select');
    if(!c) return 'sin control';
    const proto = c.tagName==='SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(c,${JSON.stringify(valor)});
    c.dispatchEvent(new Event(c.tagName==='SELECT'?'change':'input',{bubbles:true}));
    return 'ok';})()`);
  const clicModal=t=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return false;
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim().toLowerCase()===${JSON.stringify(t)}.toLowerCase());
    if(!b) return false; b.click(); return true;})()`);

  /* Con login obligatorio, la API no acepta que un visitante cree fichas
     ni roles. Esta suite es de cuando sí se podía: se identifica primero
     con la cuenta del banco y firma sus escrituras con el token. */
  const dentro = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(BANCO_U)},
                          clave:${JSON.stringify(BANCO_C)}})})
    .then(r=>r.status)`);
  if (dentro !== 200) throw new Error("no se pudo entrar al banco: " + dentro);
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

  console.log("0. Una cuenta de trabajador con jefe y planilla");
  const datos = await ev(`(async()=>{
    const j=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
    const jefa = await j('/api/personal', {nombre:'Zzz MP Jefa', cargo:'Coordinadora'});
    const jid = (jefa.persona||jefa).id || jefa.id;
    const yo = await j('/api/personal', {nombre:'Zzz MP Trabajadora', cargo:'Educadora',
                                         fecha_ingreso:'2023-02-01', jefe_id:jid});
    const mid = (yo.persona||yo).id || yo.id;
    await j('/api/personal/'+mid+'/condiciones', {regimen:'planilla', sueldo_base:2400,
                                                  jornada_horas:8, vigente_desde:'2023-02-01'});
    return {jefa:jid, yo:mid};})()`);
  console.log("   " + JSON.stringify(datos));
  check(!!(datos.jefa && datos.yo), "se crean jefa y trabajadora");

  console.log("\n1. Se crea su cuenta y entra");
  /* El rol se crea aquí, sin 'permisos': es justo lo que tiene que probar
     esta pantalla —que el autoservicio funciona SIN el permiso que abre la
     bandeja de revisión—. La API pide rol_id, no la clave del rol. */
  const creada = await ev(`(async()=>{
    const rol = await fetch('/api/roles',{method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({nombre:'Zzz MP Trabajador', clave:'zzz_mp_trab',
                            permisos:{asistencia:'vista'}})}).then(r=>r.json());
    const rid = (rol.rol||{}).id || rol.id;
    const u = await fetch('/api/usuarios',{method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({personal_id:${datos.yo}, rol_id:rid,
                            usuario:${JSON.stringify(USUARIO)},
                            clave:${JSON.stringify(CLAVE)}})}).then(r=>r.json());
    return {rol:rid, ok:u.ok===true, error:u.error||''};})()`);
  console.log("   cuenta: " + JSON.stringify(creada));
  check(creada.ok === true, "se crea la cuenta con un rol SIN el módulo de permisos");

  await enviar("Page.reload", {}); await dormir(3200);
  const entro = await ev(`(async()=>{
    const r = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})});
    return r.status;})()`);
  console.log("   login: " + entro);
  check(entro === 200, "la trabajadora entra con su cuenta");

  /* Las cuentas creadas por la API nacen con cambio de contraseña
     obligatorio, así que tras entrar sale esa pantalla y no el menú. Se
     pasa por ella igual que haría una persona. */
  const cambio = await ev(`(async()=>{
    const ses = await fetch('/api/sesion').then(r=>r.json()).catch(()=>({}));
    const csrf = (ses.sesion||{}).csrf || ses.csrf || '';
    const r = await fetch('/api/cambiar-clave',{method:'POST',
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
      body: JSON.stringify({actual:${JSON.stringify(CLAVE)}, nueva:${JSON.stringify(CLAVE2)}})});
    return {estado:r.status, error:(await r.json()).error||''};})()`);
  console.log("   cambio de contraseña: " + JSON.stringify(cambio));
  check(cambio.estado === 200, "cambia la contraseña obligatoria de la primera entrada");

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

  console.log("\n2. 'Mis Permisos' está en el menú");
  const hay = await clicNav("Mis Permisos");
  check(hay, "la entrada aparece para quien tiene sesión");
  await dormir(2000);
  let c = await main();
  check(/Todavía no has pedido ningún permiso/.test(c),
        "arranca diciendo que no hay ninguno, en vez de en blanco");
  check(/d[íi]as de vacaciones/i.test(c) || /vacaciones se generan/i.test(c),
        "muestra su saldo de vacaciones o explica por qué no aplica");
  await foto("mp-vacia.png");

  console.log("\n3. Pide un permiso corto");
  check(await clic("Pedir permiso"), "el botón abre el formulario");
  await dormir(1400);
  console.log("   tipo:", await poner("Tipo", "medico"));
  await poner("Desde", "2026-09-21");
  await poner("Hasta", "2026-09-22");
  await poner("Motivo", "Control médico");
  await dormir(700);
  const previo = await enModal();
  check(/2 días corridos/.test(previo), "dice cuántos días son antes de enviar");
  check(/lo resuelve tu jefatura/i.test(previo),
        "y que lo resuelve la jefatura, sin Administración");
  await foto("mp-dialogo.png");
  check(await clicModal("Enviar solicitud"), "se envía");
  await dormir(2500);
  c = await main();
  /* La etiqueta NO se escribe aquí: se le pregunta al sistema. El 27/08 la
     ONG cambió a los diez tipos del formato en papel y «Permiso médico»
     pasó a llamarse «Cita Essalud / Clínica»; una suite con el texto a
     mano habría fallado por un cambio que era correcto. */
  /* Se saca de SUS propias solicitudes, no de /api/permisos/tipos: esa
     cuenta no alcanza el módulo de permisos —es lo que esta suite prueba—
     y el endpoint de tipos le responde que no. */
  const etiquetaMedico = await ev(`fetch('/api/permisos/mios').then(r=>r.json())
    .then(d=>{const s=(d.solicitudes||[]).find(x=>x.tipo==='medico');
              return s ? (s.tipo_etiqueta||'') : '';})`);
  console.log("   etiqueta de 'medico': " + etiquetaMedico);
  check(!!etiquetaMedico && c.includes(etiquetaMedico),
        `aparece en su lista con el tipo en claro («${etiquetaMedico}»)`);
  check(/Esperando a tu jefatura/.test(c), "y el estado en el que va");
  check(/2 días/.test(c), "con los días que abarca");

  console.log("\n4. Una larga avisa de que además irá a Administración");
  await clic("Pedir permiso"); await dormir(1400);
  await poner("Tipo", "personal");
  await poner("Desde", "2026-11-02");
  await poner("Hasta", "2026-11-30");
  await dormir(700);
  const largo = await enModal();
  check(/29 días corridos/.test(largo), "cuenta bien los días");
  check(/Administración/.test(largo), "avisa de la segunda firma");
  await clicModal("Enviar solicitud"); await dormir(2500);

  console.log("\n5. Las reglas se explican, no se tragan");
  await clic("Pedir permiso"); await dormir(1400);
  await poner("Tipo", "otro");
  await poner("Desde", "2026-09-21");   // se cruza con la primera
  await poner("Hasta", "2026-09-21");
  await clicModal("Enviar solicitud"); await dormir(2000);
  const err = await enModal();
  console.log("   " + err.slice(0, 130));
  check(/se cruza/i.test(err), "el cruce de fechas se explica en el formulario");
  await clicModal("Cancelar"); await dormir(900);

  console.log("\n6. Puede cancelar la suya");
  c = await main();
  check(/Cancelar esta solicitud/.test(c), "ofrece cancelar lo que sigue abierto");
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Cancelar esta solicitud/.test(x.innerText)); if(b) b.click();})()`);
  await dormir(2500);
  const api = await ev(`fetch('/api/permisos/mios').then(r=>r.json()).then(d=>
    d.solicitudes.map(s=>s.estado))`);
  console.log("   estados: " + JSON.stringify(api));
  check(api.indexOf("cancelada") >= 0, "queda cancelada de verdad, no solo en pantalla");

  console.log("\n7. No ve las de nadie más");
  const ajena = await ev(`fetch('/api/permisos').then(r=>r.status)`);
  check(ajena === 403, `la bandeja de revisión le responde 403 (${ajena})`);
  const mios = await ev(`fetch('/api/permisos/mios').then(r=>r.json()).then(d=>d.solicitudes.length)`);
  /* Dos, no tres: la tercera se rechazó por cruzarse de fechas, que es lo
     que comprueba el punto 5. Contar tres daría por bueno que se colara. */
  check(mios === 2, `solo salen las suyas, y la rechazada no se coló (${mios})`);
  await foto("mp-lista.png");

  console.log("\n8. Limpieza");
  /* Se sale de la sesión antes de limpiar: con el rol de trabajadora,
     /api/personal responde 403 —no tiene ese módulo—, que es exactamente
     lo que esta pantalla debía conseguir. */
  const queda = await ev(`(async()=>{
    await fetch('/api/logout', {method:'POST'}).catch(()=>{});
    await fetch('/api/personal/${datos.yo}',   {method:'DELETE'});
    await fetch('/api/personal/${datos.jefa}', {method:'DELETE'});
    const d = await fetch('/api/personal').then(r=>r.json());
    return (d.personal || []).filter(x=>/^Zzz MP /.test(x.nombre)).length;})()`);
  check(queda === 0, `las fichas de prueba se retiran (${queda})`);

  console.log("\n9. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404|403/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  MIS PERMISOS OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
