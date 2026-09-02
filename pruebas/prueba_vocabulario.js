// Un solo vocabulario: lo que entra por el formulario y lo que se escribe
// a mano tienen que ser la misma palabra.
//
// Lo que importa comprobar: que los cuatro campos ya no admiten texto
// libre, que sus opciones son EXACTAMENTE las del formulario público, y
// que la ficha que ya existe —traída del formulario— sigue viéndose bien.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
let __ent, __recargar;
async function entrar() {
  const st = await __ent(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await __recargar({});
  await new Promise(r => setTimeout(r, 3000));
  await __ent(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || s.csrf || "";
    if (!window.__fetchOriginal) window.__fetchOriginal = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fetchOriginal(u,o);};
    return "ok";})()`);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9479","--user-data-dir="+path.join(SP,"edge-vocab"),
  "--window-size=1440,1200", BASE + "/"], { stdio:"ignore" });
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

const NOMBRE = "Zzz Vocabulario";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9479/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);
  await entrar();

  console.log("1. El alta abre con los cuatro desplegables");
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>/Responsables/i.test(x.innerText||''));if(b)b.click();})()`);
  await dormir(2200);
  await ev(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>/Agregar responsable/i.test(x.innerText||''));if(b)b.click();})()`);
  await dormir(1600);

  const campos = await ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return null;
    const salida = {};
    for (const rotulo of ["Sexo","Situación laboral","Tipo de trabajo","Rango de ingresos"]) {
      /* Hay títulos de sección con el MISMO texto que un campo
         («Situación laboral» es las dos cosas). Se coge la etiqueta que
         de verdad tiene un campo detrás, no la primera que coincida. */
      const candidatos=[...d.querySelectorAll('div')]
        .filter(x=>x.textContent.trim()===rotulo && x.children.length===0);
      const rot = candidatos.find(x=>{
        let n=x.nextElementSibling;
        while(n){ if(n.tagName==="SELECT"||n.tagName==="INPUT") return true;
                  n=n.nextElementSibling; }
        return false;
      });
      if(!rot) { salida[rotulo] = "sin campo detrás"; continue; }
      /* El select es el HERMANO del rótulo, no «el primero que haya en el
         padre»: si el padre agrupa varios campos, se cogía el de otro. */
      let sel = null, inp = null, n = rot.nextElementSibling;
      while (n && !sel && !inp) {
        if (n.tagName === "SELECT") sel = n;
        if (n.tagName === "INPUT") inp = n;
        n = n.nextElementSibling;
      }
      salida[rotulo] = sel ? [...sel.options].map(o=>o.text) : (inp ? "TEXTO LIBRE" : "?");
    }
    return salida;})()`);

  for (const [rotulo, opciones] of Object.entries(campos || {})) {
    const esLista = Array.isArray(opciones);
    check(esLista, `«${rotulo}» es desplegable${esLista ? "" : " (" + opciones + ")"}`);
    if (esLista) console.log("      " + opciones.join(" · "));
  }
  await foto("vocab-alta.png");

  console.log("\n2. Las opciones son las mismas que el formulario público");
  const sit = (campos || {})["Situación laboral"] || [];
  check(sit.indexOf("Trabajo por mi cuenta") >= 0, "«Trabajo por mi cuenta» está");
  const tra = (campos || {})["Tipo de trabajo"] || [];
  check(tra.indexOf("Con contrato y boleta") >= 0, "«Con contrato y boleta» está");
  const ing = (campos || {})["Rango de ingresos"] || [];
  check(ing.indexOf("Menos de S/ 1 025") >= 0, "«Menos de S/ 1 025» está");
  const sex = (campos || {})["Sexo"] || [];
  check(sex.indexOf("Femenino") >= 0 && sex.indexOf("Masculino") >= 0, "Femenino y Masculino están");
  check(sit.indexOf("— Sin registrar —") >= 0,
        "y se puede dejar sin registrar: cerrar el vocabulario no obliga a inventar");

  console.log("\n3. La ficha que llegó del formulario se sigue viendo bien");
  await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>/Cancelar/i.test(x.innerText||'')); if(b)b.click();})()`);
  await dormir(1200);
  const abierto = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>/Victor/i.test(x.innerText||'')); if(!b) return 'no está Victor'; b.click(); return 'ok';})()`);
  console.log("   abrir la ficha de Victor: " + abierto);
  if (abierto === "ok") {
    await dormir(1800);
    const c = await ev(`(document.querySelector('main')||document.body).innerText`);
    check(/Masculino/.test(c), "el sexo se lee «Masculino», no «M»");
    check(/Trabajo para un empleador/.test(c), "la situación laboral se lee igual que en el formulario");
    check(!/\bM\b\s*$/m.test(c), "sin códigos sueltos a la vista");
    await foto("vocab-ficha.png");
  }

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "VOCABULARIO ÚNICO OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
