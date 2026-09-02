// Panel de Asistencia: el resumen del día y los tres accesos.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
// El corredor levanta el banco en otro puerto para no pisar el 7801
// del equipo. Por defecto el 7801, para poder lanzarla suelta.
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
// Desde que LOGIN_ESTRICTO está activo no existe "entrar sin cuenta":
// hay que identificarse. El banco siembra esta cuenta en SU copia.
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9447","--user-data-dir="+path.join(SP,"edge-as"),
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
    try{const l=await fetch("http://127.0.0.1:9447/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("el servidor de pruebas no responde en " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicRaiz=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  const entro = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (entro !== 200) throw new Error("no se pudo entrar con la cuenta del banco: " + entro);
  await enviar("Page.reload", {}); await dormir(3000);

  console.log("1. Se llega al panel y ya no está en construcción");
  check(await clicRaiz("Asistencia"), "el menú raíz lleva al panel");
  await dormir(2200);
  let c = await main();
  check(!/por construir/i.test(c), "ya no es una pantalla en construcción");
  check(!/Paso 3 del plan/.test(c), "ni queda el cartel de la fase");

  console.log("\n2. Los cinco indicadores");
  for (const k of ["Esperados hoy", "Marcaron", "Jornada cerrada",
                   "Sin marcar", "Con permiso hoy"]) {
    check(c.toLowerCase().includes(k.toLowerCase()), `indicador "${k}"`);
  }

  console.log("\n3. Cuadran con lo que dice el servidor");
  const api = await ev(`fetch('/api/asistencia/resumen').then(r=>r.json())`);
  console.log("   " + JSON.stringify(api));
  const nums = c.match(/[0-9]+/g) || [];
  check(nums.includes(String(api.esperados)), `esperados (${api.esperados}) en pantalla`);
  check(nums.includes(String(api.presentes)), `marcaron (${api.presentes}) en pantalla`);

  console.log("\n4. Dice lo que NO mide, en vez de callarlo");
  check(/no se muestran tardanzas/i.test(c),
        "avisa de que no hay tardanzas y por qué");
  check(/horario de cada persona/i.test(c), "explica qué falta para calcularlas");
  if (api.sin_enrolar > 0) {
    check(/no cuenta[n]? como ausencia/i.test(c),
          "y que quien no está enrolado no cuenta como ausente");
  } else {
    check(true, "todo el mundo está enrolado, no hace falta la aclaración");
  }

  console.log("\n5. Los tres accesos");
  for (const a of ["Registro de Asistencia", "Gestión Biométrica", "Gestión de Permisos"])
    check(c.includes(a), `acceso a "${a}"`);
  await foto("panel-asistencia.png");

  console.log("\n6. Un acceso lleva de verdad");
  const fue = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Gestión Biométrica/.test(x.innerText||''));
    if(!b) return false; b.click(); return true;})()`);
  check(fue, "se puede pulsar el acceso a Biometría");
  await dormir(2200);
  const c2 = await main();
  check(/Enrolar en el terminal|Pendientes de enrolar/i.test(c2),
        "y aterriza en la pantalla de enrolamiento");

  console.log("\n7. Ninguna cifra inventada");
  for (const falso of ["2.4 %", "20 colaboradores", "26 residentes",
                       "9 personas tienen ambos"])
    check(!c.includes(falso), `no aparece "${falso}"`);

  console.log("\n8. Sin errores de JavaScript");
  const graves = errs.filter(e=>!/favicon|404/.test(e));
  check(graves.length===0, graves.length? "errores: "+graves.slice(0,2).join(" | ") : "ninguno");

  console.log("\n" + (fallos.length? `  ${fallos.length} FALLOS` : "  PANEL DE ASISTENCIA OK"));
  fallos.forEach(f=>console.log("   - "+f));
  edge.kill(); process.exit(fallos.length?1:0);
})().catch(e=>{console.log("REVENTO: "+e.message); edge.kill(); process.exit(1)});
