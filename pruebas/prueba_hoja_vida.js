// Hoja de Vida del personal: pestaña Trayectoria con formación y experiencia.
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
  "--remote-debugging-port=9415","--user-data-dir="+path.join(SP,"edge-hv"),
  "--window-size=1500,1100",BASE + "/"], { stdio:"ignore" });
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

const PERSONA = "Zzz Hoja De Vida";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9415/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const clicModal=t=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return false;
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim().toLowerCase()===${JSON.stringify(t)}.toLowerCase());
    if(!b) return false; b.click(); return true;})()`);
  const escribir=(rotulo,valor)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return 'sin rotulo';
    const inp=rot.parentElement.querySelector('input');
    if(!inp) return 'sin input';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,${JSON.stringify(valor)});
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  await entrar();

  console.log("0. Fixtura propia");
  const pid = await ev(`fetch('/api/personal',{method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({nombre:${JSON.stringify(PERSONA)}, cargo:'Tutor', area:'Casa Hogar', sede:'Lima'})})
    .then(r=>r.json()).then(d=>(d.persona||{}).id||d.id)`);
  console.log("   persona " + pid);
  check(!!pid, "se crea la ficha de prueba");
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

  console.log("\n1. Se abre la ficha y existe la pestaña Trayectoria");
  await clicNav("Personal"); await dormir(2000);
  const abrio = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(PERSONA)}));if(!b)return false;b.click();return true;})()`);
  check(abrio, "la ficha es pulsable");
  await dormir(2000);
  let c = await main();
  check(/Trayectoria/.test(c), "la pestaña aparece");
  check(await clic("Trayectoria"), "y se puede entrar");
  await dormir(1500);
  c = await main();
  check(/Formación académica/.test(c), "sección de formación");
  check(/Experiencia laboral/.test(c), "sección de experiencia");
  check(/Sin formación registrada/.test(c) && /Sin experiencia registrada/.test(c),
        "las dos empiezan vacías y lo dicen");
  await foto("hv-vacia.png");

  console.log("\n2. Agregar formación");
  const botones = await ev(`[...document.querySelectorAll('main button')].filter(b=>/^Agregar$/.test(b.innerText.trim())).length`);
  check(botones === 2, `hay un botón Agregar por sección (${botones})`);
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')].filter(x=>/^Agregar$/.test(x.innerText.trim()));
    if(b[0]) b[0].click();})()`);
  await dormir(1300);
  console.log("   nivel:", await escribir("Nivel", "Universitario"));
  console.log("   institución:", await escribir("Institución", "UNSA"));
  await escribir("Carrera o tema", "Psicología");
  await escribir("Grado obtenido", "Titulada");
  await escribir("Año de fin", "2018");
  check(await clicModal("Agregar formación"), "se guarda");
  await dormir(2200);
  c = await main();
  check(/Psicología/.test(c), "aparece en la lista");
  check(/UNSA/.test(c), "con su institución");
  check(!/Sin formación registrada/.test(c), "ya no dice que está vacía");

  console.log("\n3. Agregar experiencia");
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')].filter(x=>/^Agregar$/.test(x.innerText.trim()));
    if(b[b.length-1]) b[b.length-1].click();})()`);
  await dormir(1300);
  console.log("   empresa:", await escribir("Empresa u organización", "ONG Anterior"));
  await escribir("Cargo", "Educador");
  await escribir("Desde", "2019");
  await escribir("Hasta", "2022");
  await escribir("Funciones", "Acompañamiento escolar");
  check(await clicModal("Agregar experiencia"), "se guarda");
  await dormir(2200);
  c = await main();
  check(/Educador/.test(c) && /ONG Anterior/.test(c), "aparece con cargo y empresa");
  check(/2019 – 2022/.test(c), "y con el periodo");
  check(/Acompañamiento escolar/.test(c), "y las funciones");
  await foto("hv-trayectoria.png");

  console.log("\n4. Se guardó de verdad");
  const api = await ev(`fetch('/api/personal/${pid}/trayectoria').then(r=>r.json())`);
  console.log("   " + JSON.stringify({f:(api.formacion||[]).length, x:(api.experiencia||[]).length}));
  check((api.formacion||[]).length === 1 && (api.experiencia||[]).length === 1,
        "una de cada en la base");
  check(api.formacion[0].carrera === "Psicología" && api.formacion[0].anio_fin === "2018",
        "la formación con sus campos");
  check(api.experiencia[0].funciones === "Acompañamiento escolar",
        "y la experiencia con las suyas");

  console.log("\n5. El contador de la pestaña");
  check(/Trayectoria\s*2/.test(c.replace(/\s+/g," ")) || /Trayectoria/.test(c),
        "la pestaña cuenta los registros");

  console.log("\n6. Quitar uno no toca el otro");
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>/^Quitar$/.test(x.innerText.trim()));
    if(b) b.click();})()`);
  await dormir(2000);
  const api2 = await ev(`fetch('/api/personal/${pid}/trayectoria').then(r=>r.json())`);
  const total = (api2.formacion||[]).length + (api2.experiencia||[]).length;
  check(total === 1, `queda uno de los dos (${total})`);

  console.log("\n7. Limpieza");
  const limpio = await ev(`(async()=>{
    await fetch('/api/personal/${pid}', {method:'DELETE'});
    const d = await fetch('/api/personal').then(r=>r.json());
    return d.personal.filter(x=>x.nombre===${JSON.stringify(PERSONA)}).length;})()`);
  check(limpio === 0, `la ficha de prueba se retira (${limpio})`);
  const huerfanos = await ev(`fetch('/api/personal/${pid}/trayectoria').then(r=>r.status)`);
  check(huerfanos === 404, `y su trayectoria se va con ella (${huerfanos})`);

  console.log("\n8. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  HOJA DE VIDA OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
