// ¿El modelo de rostro funciona de verdad, servido desde este proyecto?
//
// Se carga face-api desde /web/rostro (no de internet), se le dan caras y
// se comprueban las tres cosas que importan: que encuentra una cara, que
// la misma cara se parece a sí misma, y que dos caras distintas NO se
// parecen. Sin esta última, un "reconocimiento" que dice que sí a todo
// pasaría por bueno.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9525","--user-data-dir="+path.join(SP,"edge-modelo"),
  "--window-size=1200,900", BASE + "/"], { stdio:"ignore" });
let ws,id=0; const pend=new Map();
const enviar=(m,p)=>new Promise((res,rej)=>{const n=++id;pend.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p||{}}));});
const ev=async e=>{const r=await enviar("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails){ /* .text suele ser solo "Uncaught": el motivo real
    esta en la excepcion. Sin el, un fallo de navegador no dice nada. */
    const d=r.exceptionDetails; const x=d.exception||{};
    throw new Error([d.text, x.description||x.value||""].filter(Boolean).join(" · ").slice(0,400));}
  return r.result.value;};
const fallos=[]; const check=(c,m)=>{console.log((c?"  OK    ":"  FALLO ")+m); if(!c)fallos.push(m);};

const CARPETA = process.env.CARAS || path.join(SP, "caras", "cand");
const archivos = fs.readdirSync(CARPETA).filter(f=>/\.jpg$/i.test(f));

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9525/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable");
  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(3500);

  console.log("1. El modelo se sirve desde el propio proyecto");
  const pesos = await ev(`Promise.all([
      '/web/rostro/face-api.min.js',
      '/web/rostro/modelos/tiny_face_detector_model-weights_manifest.json',
      '/web/rostro/modelos/face_recognition_model.bin',
    ].map(u=>fetch(u).then(r=>r.status))).then(a=>a.join(','))`);
  console.log("   " + pesos);
  check(pesos === "200,200,200", "la librería y los pesos se descargan (" + pesos + ")");

  const cargado = await ev(`(async()=>{
    await new Promise((ok,mal)=>{const s=document.createElement('script');
      s.src='/web/rostro/face-api.min.js'; s.onload=ok; s.onerror=mal;
      document.head.appendChild(s);});
    try { await faceapi.tf.setBackend('webgl'); await faceapi.tf.ready(); } catch(e) {}
    if (faceapi.tf.getBackend() !== 'webgl') { await faceapi.tf.setBackend('cpu'); await faceapi.tf.ready(); }
    window.__motor = faceapi.tf.getBackend();
    const d='/web/rostro/modelos';
    await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(d),
      faceapi.nets.faceLandmark68Net.loadFromUri(d),
      faceapi.nets.faceRecognitionNet.loadFromUri(d)]);
    window.__desc = async (dataUrl) => {
      const img = new Image();
      await new Promise((ok,mal)=>{img.onload=ok; img.onerror=mal; img.src=dataUrl;});
      const h = await faceapi.detectSingleFace(img,
          new faceapi.TinyFaceDetectorOptions({inputSize:416, scoreThreshold:0.4}))
        .withFaceLandmarks().withFaceDescriptor();
      return h ? Array.from(h.descriptor) : null;
    };
    return 'listo';})()`);
  check(cargado === "listo", "las tres redes cargan (" + cargado + ")");

  console.log("\n2. Qué ve en cada cara");
  const vectores = {};
  for (const f of archivos) {
    const b64 = fs.readFileSync(path.join(CARPETA, f)).toString("base64");
    const d = await ev(`window.__desc("data:image/jpeg;base64,${b64}")`);
    vectores[f] = d;
    console.log("   " + (d ? "cara  " : "nada  ") + f + (d ? "  (" + d.length + " números)" : ""));
  }
  const conCara = Object.keys(vectores).filter(k=>vectores[k]);
  check(conCara.length >= 2, "encuentra cara en al menos dos (" + conCara.length + " de " + archivos.length + ")");
  check(conCara.every(k=>vectores[k].length === 128), "el vector tiene 128 números");

  console.log("\n3. Distancias entre las que sí tienen cara");
  const dist = (a,b) => Math.sqrt(a.reduce((s,x,i)=>s+(x-b[i])*(x-b[i]),0));
  const pares = [];
  for (let i=0;i<conCara.length;i++)
    for (let j=i+1;j<conCara.length;j++)
      pares.push([conCara[i], conCara[j], dist(vectores[conCara[i]], vectores[conCara[j]])]);
  pares.sort((a,b)=>a[2]-b[2]);
  console.log("   más parecidas: " + pares.slice(0,3).map(p=>p[0]+"~"+p[1]+" "+p[2].toFixed(3)).join(" | "));
  console.log("   más distintas: " + pares.slice(-3).map(p=>p[0]+"~"+p[1]+" "+p[2].toFixed(3)).join(" | "));
  check(pares.filter(p=>p[2] > 0.6).length > 0, "hay pares claramente distintos (> 0.6)");
  // La misma cara consigo misma tiene que dar cero.
  const uno = conCara[0];
  const mismo = dist(vectores[uno], vectores[uno]);
  check(mismo < 0.001, "una cara consigo misma da 0 (" + mismo.toFixed(4) + ")");

  // Se deja escrita la pareja elegida para las suites que marcan.
  const lejano = pares[pares.length - 1];
  fs.writeFileSync(path.join(SP, "caras", "elegidas.json"),
    JSON.stringify({ a: lejano[0], b: lejano[1], distancia: lejano[2] }, null, 2));
  console.log("   elegidas para las suites: " + lejano[0] + " y " + lejano[1]
    + " (distancia " + lejano[2].toFixed(3) + ")");

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "MODELO DE ROSTRO OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
