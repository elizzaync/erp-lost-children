// ¿Se puede ver un módulo sin entrar, poniendo su URL?
//
// Se abre el navegador SIN sesión y se va directo a la dirección de cada
// módulo. Se mira dos cosas distintas, que no hay que confundir:
//
//   · qué PINTA la pantalla (si se ve el módulo o la puerta de entrada),
//   · qué DATOS llegan (si el servidor entrega algo sin sesión).
//
// Lo segundo es lo que decide si esto es una fuga de datos o solo una
// pantalla mal puesta. Las dos hay que arreglarlas, pero no son lo mismo.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9497","--user-data-dir="+path.join(SP,"edge-bypass"),
  "--incognito", "--window-size=1500,1200", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const foto=async n=>{const s=await enviar("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(SP,n),Buffer.from(s.data,"base64"));};

const RUTAS = ["#/personal", "#/beneficiarios", "#/permisos", "#/asistencia",
               "#/usuarios", "#/config", "#/respuestas"];

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9497/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3000);

  // Sin sesión: se borra cualquier resto.
  await enviar("Network.enable");
  await enviar("Network.clearBrowserCookies");
  await enviar("Page.reload", {}); await dormir(3500);

  const quien = await ev(`fetch('/api/sesion').then(r=>r.json())
    .then(d=>JSON.stringify({autenticado:d.autenticado, estricto:d.estricto}))`);
  console.log("estado de sesión: " + quien);
  console.log("");

  for (const ruta of RUTAS) {
    await ev(`location.hash = ${JSON.stringify(ruta)}`);
    await dormir(2200);
    const visto = await ev(`(()=>{
      const m = document.querySelector('main');
      const txt = (m ? m.innerText : document.body.innerText) || "";
      const primera = txt.trim().split(String.fromCharCode(10)).filter(x=>x.trim())[0] || "(vacío)";
      /* Señales de que se está viendo el sistema y no la puerta. */
      const hayMenu = !!document.querySelector('nav button');
      /* La señal fiable es el formulario de entrada: contar caracteres
         daba falsos positivos, porque la propia puerta ocupa 500. */
      const hayClave = !!document.querySelector('input[type=password]');
      return JSON.stringify({titulo: primera.slice(0,44), menu: hayMenu,
                             puerta: hayClave, largo: txt.trim().length});})()`);
    const d = JSON.parse(visto);
    const señal = d.puerta && !d.menu ? "puerta de entrada" : "SE VE EL MÓDULO";
    console.log("  " + ruta.padEnd(18) + señal.padEnd(20)
      + " · «" + d.titulo + "» · menú:" + (d.menu ? "sí" : "no")
      + " · " + d.largo + " car.");
    await foto("bypass" + ruta.replace(/[^a-z]/gi, "-") + ".png");
  }

  console.log("\n¿y los datos?");
  for (const api of ["/api/personal", "/api/beneficiarios", "/api/permisos",
                     "/api/usuarios", "/api/parametros"]) {
    const r = await ev(`fetch(${JSON.stringify(api)})
      .then(async r=>{const t = await r.text();
        return JSON.stringify({e:r.status, n:t.length, m:t.slice(0,70)});})`);
    const d = JSON.parse(r);
    const fuga = d.e === 200 && d.n > 120;
    console.log("  " + (fuga ? "FUGA " : "     ") + api.padEnd(22)
      + " " + d.e + " · " + d.n + " bytes");
    if (fuga) console.log("        " + d.m);
  }

  edge.kill(); process.exit(0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
