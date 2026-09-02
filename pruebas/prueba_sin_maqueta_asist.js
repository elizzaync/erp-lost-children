// Registro de Asistencia no enseña ni una sola persona inventada.
//
// Esta suite existe para que la maqueta no pueda volver sin que se note.
// No comprueba que "se vea bien": comprueba que ninguno de los veinte
// nombres de relleno, ninguna de las horas falsas y ninguno de los
// porcentajes de la fórmula aparezcan en pantalla, en ninguna pestaña.
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
  if (st !== 200) throw new Error("no se pudo entrar con la cuenta del banco: " + st);
  await __recargar({});
  await new Promise(r => setTimeout(r, 3000));
  await __ent(`window.__texto=()=>document.body.innerText; true;`);
}
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9459","--user-data-dir="+path.join(SP,"edge-sinmaq"),
  "--window-size=1500,1200", BASE + "/"], { stdio:"ignore" });
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

// Los veinte nombres de la maqueta, tal cual estaban.
const INVENTADOS = ["Josué Ramírez","Mariela Quispe","Luis Ferreyra","Ruth Salas",
  "Ana Chávez","Pedro Cutipa","Karen Ttito","Diego Mamani","Camila Zegarra",
  "Elena Huamán","Marco Ancco","José Puma","Nayeli Condori","Rosa Huillca",
  "Silvia Paredes","Elvis Quispe","Milagros Apaza","Jhon Ccahuana",
  "Fiorella Núñez","Wilder Ccorimanya"];
// Cifras y textos que solo podían venir de la maqueta.
const CIFRAS = ["Enviar conteo a cocina","Justificar tardanzas","Almuerzos a preparar",
  "Personas en sede","Martes 11 de agosto","Semana del 10 al 16 de agosto",
  "Agosto 2026","Tard. 23 min","07:52","Constancia de atención médica",
  "de 43 ·","de 26 ·","Presencia por grupo"];

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9459/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const pestana=t=>ev(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>(x.innerText||'').trim().startsWith(${JSON.stringify(t)}));if(!b)return false;b.click();return true;})()`);
  const ambito=t=>ev(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>(x.innerText||'').trim()===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const main=()=>ev(`(document.querySelector('main')||document.body).innerText`);

  await entrar();
  await clicNav("Asistencia"); await dormir(2200);
  /* Asistencia tiene un panel delante; el registro es una entrada aparte. */
  const dentro = await ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>/Registro de Asistencia/i.test(x.innerText||''));if(!b)return false;b.click();return true;})()`);
  console.log("entrar al registro:", dentro);
  await dormir(2500);

  const visto = {};
  for (const p of ["Día","Vista semanal","Justificaciones","Calendario mensual"]) {
    const ok = await pestana(p);
    await dormir(2000);
    visto[p] = await main();
    check(ok, `se abre la pestaña "${p}"`);
    await foto("maq-" + p.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") + ".png");
  }
  /* Los tres ámbitos de arriba, por si alguno guarda su propia maqueta. */
  for (const a of ["General","Beneficiarios","Colaboradores"]) {
    if (await ambito(a)) { await dormir(1600); visto["ámbito " + a] = await main(); }
  }

  const todo = Object.values(visto).join(String.fromCharCode(10));

  console.log("\n1. Ni una persona inventada donde no pueda haberla");
  /* La pestaña Día lista a quien tiene ficha y no está enrolado, y la
     fixtura siembra a esas veinte personas como fichas reales: ahí sus
     nombres son datos, no relleno. En las otras tres solo sale gente
     enrolada, así que no pueden aparecer por ninguna vía legítima. */
  const sinDia = Object.entries(visto)
    .filter(([k]) => k !== "Día")
    .map(([, v]) => v).join(String.fromCharCode(10));
  const apareceN = INVENTADOS.filter(n => sinDia.includes(n));
  check(apareceN.length === 0, `los 20 nombres de relleno se fueron (${apareceN.join(", ") || "ninguno aparece"})`);

  console.log("\n2. Ni una cifra ni un botón de los inventados");
  const apareceC = CIFRAS.filter(n => todo.includes(n));
  check(apareceC.length === 0, `sin rastros de la maqueta (${apareceC.join(" | ") || "ninguno aparece"})`);

  console.log("\n3. Y en su lugar, o datos del terminal o una pantalla que lo dice");
  /* Las dos salidas son correctas según lo que haya en la base: con gente
     enrolada sale la tabla del terminal; sin nadie, el aviso. Lo que no
     puede salir nunca es un dato inventado, y de eso se ocupan los puntos
     1 y 2 de esta suite. */
  check(/Todavía no hay semana que mostrar|datos reales del terminal/.test(visto["Vista semanal"] || ""),
        "la semanal: o marcas reales, o dice por qué está vacía");
  check(/No hay ninguna justificación registrada/.test(visto["Justificaciones"] || ""),
        "Justificaciones dice que no hay ninguna");
  check(/El mes todavía no tiene marcas|Marcas reales del terminal/.test(visto["Calendario mensual"] || ""),
        "el calendario: o marcas reales, o dice que no hay");
  check(/Asistencia del día|Todavía no hay a quién mostrar/.test(visto["Día"] || ""),
        "la del día: o la tabla, o dice que no hay a quién mostrar");
  /* Lo que de verdad delataría a la maqueta en esa pestaña: horas y
     estados que nadie registró. */
  check(!/Tard\. \d+ min/.test(visto["Día"] || ""), "sin tardanzas inventadas");
  check(!/07:52|18:58|05:56/.test(visto["Día"] || ""), "sin las horas de la maqueta");

  console.log("\n4. La fecha ya no está clavada en agosto");
  check(!/Martes 11 de agosto/.test(todo), "no queda la fecha fija");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "ASISTENCIA SIN MAQUETA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
