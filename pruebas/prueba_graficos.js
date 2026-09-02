// Los cuatro gráficos nuevos: que dibujen lo que dicen los datos.
//
// Lo que se comprueba no es que "se vea bonito", sino que las barras
// cuadren con la base: el número de áreas, el total por sede, y que los
// días sin marcas salgan a cero en vez de desaparecer.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9530","--user-data-dir="+path.join(SP,"edge-graf"),
  "--window-size=1500,1100", BASE + "/"], { stdio:"ignore" });
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
    try{const l=await fetch("http://127.0.0.1:9530/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(2500);
  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(4500);
  const menu = async (r) => { await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/${r}/.test(x.innerText||'')); if(b) b.click();})()`); await dormir(2800); };

  console.log("1. Gestión de Personas: por área y por sede");
  await menu("Gestión de Personas");
  const texto = await ev(`(document.querySelector('main')||{}).innerText||''`);
  check(/Personal por área/.test(texto), "está el gráfico de áreas");
  check(/Dónde está el equipo/.test(texto), "y el de sedes");

  // Las barras contra la base: mismo número de áreas distintas.
  const dela = await ev(`fetch('/api/personal').then(r=>r.json()).then(d=>{
    const gente = d.personal || [];
    const areas = {}; const sedes = {};
    gente.forEach(p=>{const a=(p.area||'').trim()||'Sin área asignada';
      areas[a]=(areas[a]||0)+1;
      const s=(p.sede||'').trim()||'Sin sede'; sedes[s]=(sedes[s]||0)+1;});
    return JSON.stringify({total: gente.length,
      areas: Object.keys(areas).length, sedes: Object.keys(sedes).length});})`);
  const d = JSON.parse(dela);
  console.log("   base: " + dela);
  const barras = await ev(`(()=>{const m=document.querySelector('main');
    const t=(m.innerText||'');
    const i=t.indexOf('Personal por área'), j=t.indexOf('Dónde está el equipo');
    return {areas: (t.slice(i,j).match(/\\n/g)||[]).length,
            sedes: (t.slice(j).match(/\\n/g)||[]).length};})()`);
  const anchos = await ev(`(()=>{const m=document.querySelector('main');
    return [...m.querySelectorAll('div')]
      .filter(x=>/^\\d+%$/.test(x.style.width||''))
      .map(x=>x.style.width);})()`);
  console.log("   barras con ancho en %: " + anchos.length + " → " + anchos.slice(0,6).join(" "));
  check(anchos.length >= Math.min(d.areas, 8) + d.sedes,
        "hay al menos una barra por área y por sede (" + anchos.length + ")");
  check(anchos.some(a => a === "100%"), "la mayor llega al 100 %");
  // El reparto por sede suma el total: si no, alguien se perdió.
  const suma = await ev(`(()=>{const m=document.querySelector('main');
    const t=(m.innerText||''); const j=t.indexOf('Dónde está el equipo');
    const nums=(t.slice(j).match(/^\\d+$/gm)||[]).map(Number);
    return nums.reduce((a,b)=>a+b,0);})()`);
  console.log("   suma de sedes: " + suma + " · personal: " + d.total);
  check(suma === d.total, "el reparto por sede suma el total (" + suma + " vs " + d.total + ")");
  await foto("graficos-personas.png");

  console.log("\n2. Asistencia: día a día y hora de entrada");
  // La fixtura no trae ni una marca: sin datos solo se probaría el hueco.
  console.log("   " + require("child_process")
    .execFileSync("py", [path.join(SP, "siembra_marcas_banco.py")],
                  { encoding: "utf8" }).trim());
  await menu("Asistencia");
  await dormir(2000);
  const ta = await ev(`(document.querySelector('main')||{}).innerText||''`);
  check(/Quién marcó, día a día/.test(ta), "está el gráfico de días");
  check(/A qué hora se entra/.test(ta), "y el de horas de entrada");
  check(/no dice quién llegó tarde/i.test(ta) || /Todavía no hay marcas/i.test(ta),
        "y avisa de que no habla de tardanzas");

  const dias = await ev(`(()=>{const m=document.querySelector('main');
    const t=(m.innerText||'');
    const i=t.indexOf('Quién marcó'), j=t.indexOf('A qué hora');
    return (t.slice(i,j).match(/\\b[LMJVSD]\\b/g)||[]).length;})()`);
  console.log("   días dibujados: " + dias);
  check(dias >= 10, "dibuja las dos semanas (" + dias + " días)");
  const ceros = await ev(`(()=>{const m=document.querySelector('main');
    return [...m.querySelectorAll('div')]
      .filter(x=>(x.style.height||'')==='3px').length;})()`);
  console.log("   barras a cero (3px): " + ceros);
  check(ceros > 0, "los días sin marcas se dibujan a cero, no desaparecen");
  // La página entera, para ver los gráficos aunque queden abajo.
  const alto = await ev(`document.documentElement.scrollHeight`);
  await enviar("Emulation.setDeviceMetricsOverride",
    {width:1500, height: Math.min(alto+40, 6000), deviceScaleFactor:1, mobile:false});
  await dormir(1000);
  await foto("graficos-asistencia.png");

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "GRÁFICOS OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
