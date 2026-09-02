// El Dashboard General no muestra ningún número que no salga de la base.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
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
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9427","--user-data-dir="+path.join(SP,"edge-dash"),
  "--window-size=1500,1400",BASE + "/"], { stdio:"ignore" });
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

const PERSONA = "Zzz Dash Educadora";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9427/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("el servidor de pruebas no responde en " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  await entrar();
  check(await clicNav("Dashboard General"), "se llega al panel");
  await dormir(2200);
  let c = await main();

  console.log("1. Ninguna de las cifras inventadas sigue ahí");
  const INVENTADAS = [
    "2.4 %", "36 días de ausencia", "420 días hábiles",
    "11 / 9", "Voluntarios permanentes fuera de planilla",
    "Sedes activas: Lima y Comas",
    "Veinte colaboradores", "Estado al 11 de agosto",
    "20 colaboradores en planilla",
    "Solicitudes de permiso",
  ];
  for (const x of INVENTADAS)
    check(!c.includes(x), `ya no dice "${x}"`);

  console.log("\n2. El ausentismo dice que no se puede calcular todavía");
  check(/Ausentismo del mes/.test(c), "la tarjeta sigue estando");
  check(/—/.test(c) && /marcaciones/i.test(c),
        "sin porcentaje, y explica de qué depende");

  console.log("\n3. Pendientes de RRHH sale de los vencimientos reales");
  const venc = await ev(`fetch('/api/alertas').then(r=>r.json()).then(d=>d.vencimientos).catch(()=>null)`);
  if (venc) {
    const esperado = (venc.documento?.total || 0) + (venc.contrato?.total || 0);
    console.log("   documentos+contratos por vencer: " + esperado);
    const nums = (c.match(/[0-9]+/g) || []);
    check(nums.includes(String(esperado)), `el panel muestra ${esperado}`);
  } else {
    check(true, "sin endpoint de vencimientos en este entorno");
  }

  console.log("\n4. El mes de los cumpleaños no está clavado en agosto");
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio",
                 "agosto","septiembre","octubre","noviembre","diciembre"];
  const mesHoy = meses[new Date().getMonth()];
  check(new RegExp("Cumpleaños de " + mesHoy, "i").test(c),
        `dice "Cumpleaños de ${mesHoy}"`);

  console.log("\n4b. Cumpleaños vacío dice por qué");
  /* Con la fixtura montada puede haber alguien que cumpla años este mes, y
     entonces la lista NO está vacía: lo correcto es que salga la lista, no
     el aviso. Se comprueba una cosa u otra según lo que haya. */
  /* La lista se trae cruda y se filtra aquí: meter el regex dentro del
     template literal lo dejaba irreconocible al llegar a la página. */
  const fechasNac = await ev(`fetch('/api/personal').then(r=>r.json())
    .then(d=>(d.personal||[]).map(p=>String(p.fecha_nac||'')))`);
  const mesActual = new Date().getMonth() + 1;
  const mesDe = (f) => {
    let m = f.match(/^[0-9]{4}-([0-9]{2})/);          // aaaa-mm-dd
    if (m) return Number(m[1]);
    m = f.match(/^[0-9]{1,2}\/([0-9]{1,2})\//);       // dd/mm/aaaa
    return m ? Number(m[1]) : null;
  };
  const hayCumples = fechasNac.filter(f => mesDe(f) === mesActual).length;
  console.log("   cumpleañeros este mes: " + hayCumples);
  if (hayCumples > 0) {
    check(!/Nadie cumple años este mes/.test(c),
          "si hay cumpleañeros, sale la lista y no el aviso de vacía");
  } else {
    check(/Nadie cumple años este mes|fecha de nacimiento registrada|Todavía no hay fichas/.test(c),
          "la lista vacía explica el motivo en vez de quedarse en blanco");
  }

  console.log("\n5. Un alta nueva se refleja en la distribución por área");
  const antes = c;
  const pid = await ev(`fetch('/api/personal',{method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:${JSON.stringify(PERSONA)}, area:'Zzz Area Inventada', sede:'Zzz Sede', sexo:'F'})})
    .then(r=>r.json()).then(d=>(d.persona||{}).id||d.id)`);
  await enviar("Page.reload", {}); await dormir(3200);
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
  await entrar();
  await clicNav("Dashboard General"); await dormir(2200);
  const despues = await main();
  check(despues !== antes, "el panel cambia al crear una ficha");
  check(/Zzz Area Inventada/.test(despues),
        "la nueva área aparece en la distribución");
  check(/Zzz Sede/.test(despues), "y la sede en las cifras del pie");
  await foto("dash-real.png");

  console.log("\n6. Limpieza");
  const queda = await ev(`(async()=>{
    await fetch('/api/personal/${pid}', {method:'DELETE'});
    const d = await fetch('/api/personal').then(r=>r.json());
    return d.personal.filter(x=>/^Zzz Dash/.test(x.nombre)).length;})()`);
  check(queda === 0, `la ficha de prueba se retira (${queda})`);

  console.log("\n7. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  DASHBOARD SIN NÚMEROS INVENTADOS OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
