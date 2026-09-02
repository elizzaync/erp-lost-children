// Panel de Gestión de Personas: seis indicadores reales y tres accesos.
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
  "--remote-debugging-port=9421","--user-data-dir="+path.join(SP,"edge-gp"),
  "--window-size=1500,1250",BASE + "/"], { stdio:"ignore" });
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

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9421/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("el servidor de pruebas no responde en " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicRaiz=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  await entrar();

  console.log("1. Se llega al panel desde el menú raíz");
  check(await clicRaiz("Gestión de Personas"), "el menú lleva al panel");
  await dormir(2200);
  let c = await main();
  check(!/en construcci/i.test(c), "ya no es una pantalla en construcción");
  check(/Gestión de Personas/i.test(c), "tiene su título");

  console.log("\n2. Los seis indicadores");
  const esperados = ["Niñas, niños y adolescentes","Responsables y tutores","Personal",
                     "Nuevos registros","Registros activos","Registros incompletos"];
  const cl = c.toLowerCase();
  for (const e of esperados) check(cl.includes(e.toLowerCase()), `indicador "${e}"`);

  console.log("\n3. Los números son los de la base, no inventados");
  const api = await ev(`fetch('/api/personas/resumen').then(r=>r.json()).then(d=>d.resumen)`);
  console.log("   " + JSON.stringify(api));
  /* Se comprueba contra el servidor, no contra una constante escrita aquí:
     así la prueba sigue valiendo cuando el equipo cargue fichas de verdad. */
  const nums = c.match(/[0-9]+/g) || [];
  check(nums.includes(String(api.nna)), `el total de NNA (${api.nna}) aparece en pantalla`);
  check(nums.includes(String(api.personal)), `el de personal (${api.personal}) también`);
  check(nums.includes(String(api.activos)), `y el de activos (${api.activos})`);

  console.log("\n4. No hay ningún número de relleno");
  for (const falso of ["2.4 %","20 colaboradores","26 residentes"])
    check(!c.includes(falso), `no aparece "${falso}"`);

  console.log("\n5. El aviso de las fichas sin fecha de alta");
  if (api.sin_fecha_alta > 0) {
    check(/no (tiene|tienen) fecha de alta/i.test(c),
          "avisa de que hay fichas que no entran en la cuenta de nuevos");
  } else {
    check(true, "todas las fichas tienen fecha de alta, no hace falta aviso");
  }

  console.log("\n6. Los tres accesos rápidos");
  for (const a of ["Beneficiarios","Responsables / Tutores","Personal"])
    check(c.includes(a), `acceso a "${a}"`);
  await foto("panel-personas.png");

  console.log("\n7. Un acceso lleva de verdad");
  const fue = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Responsables \\/ Tutores/.test(x.innerText||''));
    if(!b) return false; b.click(); return true;})()`);
  check(fue, "se puede pulsar el acceso a Responsables");
  await dormir(2000);
  const c2 = await main();
  check(/Responsables/i.test(c2) && !/Registros incompletos/i.test(c2),
        "y cambia de pantalla, no se queda en el panel");

  console.log("\n8. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  PANEL DE GESTIÓN DE PERSONAS OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
