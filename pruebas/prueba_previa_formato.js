// La vista previa tiene que ser el documento, no parecerse a él.
//
// Lo que se comprueba: que el diálogo enseñe el formato de la casa con sus
// diez casillas, que al elegir tipo se mueva el aspa, que lo escrito en
// Nota y Periodo aparezca en el papel, y —lo que importa de verdad— que el
// PDF que se descarga después diga lo mismo que la vista previa prometía.
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const SP = __dirname;
const BASE = process.env.URL_PRUEBAS || "http://127.0.0.1:7801";
const USUARIO = process.env.USUARIO_PRUEBAS || "banco.pruebas";
const CLAVE = process.env.CLAVE_PRUEBAS || "banco-de-pruebas-2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--no-sandbox",
  "--remote-debugging-port=9491","--user-data-dir="+path.join(SP,"edge-previa"),
  "--window-size=1600,1400", BASE + "/"], { stdio:"ignore" });
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

// Escribe en el campo cuyo rótulo se pide, dentro del diálogo.
const escribir = (rotulo, valor) => `(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  if(!d) return 'sin diálogo';
  const rots=[...d.querySelectorAll('div')].filter(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
  const rot=rots.find(x=>{let n=x.nextElementSibling; while(n){ if(n.tagName==='INPUT') return true; n=n.nextElementSibling;} return false;});
  if(!rot) return 'sin el campo ' + ${JSON.stringify(rotulo)};
  let i=rot.nextElementSibling; while(i && i.tagName!=='INPUT') i=i.nextElementSibling;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(valor)});
  i.dispatchEvent(new Event('input',{bubbles:true}));
  return 'ok';})()`;

// Elige en la lista cuyo rótulo se pide. Devuelve el valor elegido.
const elegir = (rotulo, cual) => `(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
  if(!d) return 'sin diálogo';
  const rots=[...d.querySelectorAll('div')].filter(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
  const rot=rots.find(x=>{let n=x.nextElementSibling; while(n){ if(n.tagName==='SELECT') return true; n=n.nextElementSibling;} return false;});
  if(!rot) return 'sin la lista ' + ${JSON.stringify(rotulo)};
  let sel=rot.nextElementSibling; while(sel && sel.tagName!=='SELECT') sel=sel.nextElementSibling;
  const ops=[...sel.options].filter(o=>o.value);
  if(!ops.length) return 'la lista está vacía';
  const op = ops[${cual}] || ops[0];
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(sel, op.value);
  sel.dispatchEvent(new Event('change',{bubbles:true}));
  return op.value;})()`;

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9491/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const st = await ev(`fetch('/api/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({usuario:${JSON.stringify(USUARIO)}, clave:${JSON.stringify(CLAVE)}})})
    .then(r=>r.status)`);
  if (st !== 200) throw new Error("no se pudo entrar: " + st);
  await enviar("Page.reload", {}); await dormir(3500);
  await ev(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || s.csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};
    return "ok";})()`);

  console.log("0. Se abre «Pedir permiso»");
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]==='Mis Permisos');
    if(!b) throw new Error('no está Mis Permisos'); b.click();})()`);
  await dormir(2500);
  const abrio = await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
    .find(x=>(x.innerText||'').includes('Pedir permiso')); if(!b) return false; b.click(); return true;})()`);
  check(abrio, "se abre el diálogo");
  await dormir(1800);

  console.log("\n1. La vista previa es el formato de la casa");
  let doc = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0); return d ? d.innerText : '';})()`);
  check(/AUTORIZACIÓN AL PERSONAL/.test(doc), "se titula AUTORIZACIÓN AL PERSONAL");
  check(/FORMATO/.test(doc), "con la cabecera del formato");
  check(/\(1\) Permiso personal/.test(doc) && /\(10\) Otros/.test(doc),
        "y están las diez casillas");
  check(/Nombre del Colaborador/.test(doc), "el rótulo del nombre");
  check(/SUSTENTO/.test(doc), "el recuadro de sustento");
  check(/Firmas del personal/.test(doc), "las firmas");
  check(/Vista previa\. El permiso queda registrado/.test(doc),
        "y la frase de la vista previa");

  const logo = await ev(`(()=>{const i=document.querySelector('img[src="/api/marca/logo.jpg"]');
    return i ? (i.complete && i.naturalWidth > 0 ? 'sí' : 'no cargó') : 'no está';})()`);
  check(logo === "sí", "el logo se ve (" + logo + ")");

  console.log("\n2. Los campos que faltaban están en el formulario");
  check((await ev(escribir("Nota", "Zzz cita de control"))) === "ok", "está el campo Nota");
  const periodo = await ev(elegir("Periodo", 0));
  console.log("   periodo elegido: " + periodo);
  check(/^\d{4}/.test(periodo), "la lista de periodos trae opciones (" + periodo + ")");
  await dormir(900);
  doc = await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0); return d ? d.innerText : '';})()`);
  check(/Zzz cita de control/.test(doc), "la nota aparece en el documento");
  check(doc.indexOf(periodo) >= 0, "y el periodo elegido también");

  console.log("\n3. El aspa se mueve con el tipo");
  const conTipo = async (valor) => {
    await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
      const s=d.querySelector('select');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(s, ${JSON.stringify(valor)});
      s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await dormir(900);
    return await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
      /* La interpolación envuelve el valor en su propio span: el recuadro
         y su contenido dicen los dos 'X'. Vale el de dentro. */
      const marcada=[...d.querySelectorAll('span')]
        .filter(x=>x.textContent.trim()==='X' && x.children.length===0);
      if(marcada.length!==1) return 'aspas: ' + marcada.length;
      const fila=marcada[0].closest('div');
      return (fila ? fila.innerText : '').replace(/\\s+/g,' ').trim();})()`);
  };
  const aVac = await conTipo("vacaciones");
  console.log("   vacaciones →", aVac);
  check(/\(7\) Vacaciones/.test(aVac), "vacaciones marca la (7)");
  const aMed = await conTipo("medico");
  console.log("   médico     →", aMed);
  check(/\(3\) Cita Essalud/.test(aMed), "médico marca la (3)");
  /* Desde el 27/08 cada tipo tiene SU casilla: se comprueban dos de los
     nuevos y «otros», que es la única que sigue siendo un cajón. */
  const aCom = await conTipo("comision");
  console.log("   comisión   →", aCom);
  check(/\(2\) Comisi/.test(aCom), "comisión de trabajo marca la (2)");
  const aLib = await conTipo("libres");
  console.log("   días libres→", aLib);
  check(/\(8\) D[ií]a/.test(aLib), "día(s) libre(s) marca la (8)");
  const aOtro = await conTipo("otro");
  console.log("   otros      →", aOtro);
  check(/\(10\) Otros/.test(aOtro), "«otros» marca la (10)");
  await foto("previa-formato.png");

  console.log("\n4. Lo que promete la vista previa es lo que sale impreso");
  await ev(escribir("Desde", "2026-11-09"));
  await ev(escribir("Hasta", "2026-11-10"));
  await dormir(600);
  await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    const b=[...d.querySelectorAll('button')].find(x=>/Enviar|Pedir/.test((x.innerText||'').trim()));
    if(b) b.click();})()`);
  await dormir(3000);
  const sid = await ev(`fetch('/api/permisos/mios').then(r=>r.json())
    .then(d=>{const s=(d.solicitudes||[]).find(x=>/Zzz cita de control/.test(x.motivo||''));
              return s ? s.id : 0;})`);
  check(sid > 0, "la solicitud se creó (" + sid + ")");
  if (sid) {
    const guardado = await ev(`fetch('/api/permisos/mios').then(r=>r.json())
      .then(d=>{const s=(d.solicitudes||[]).find(x=>x.id===${sid});
                return s ? (s.periodo||'(sin periodo)') : '(no está)';})`);
    check(guardado === periodo, "el periodo se guardó (" + guardado + ")");
    const pdf = await ev(`fetch('/api/permisos/' + ${sid} + '/documento.pdf')
      .then(async r=>({estado:r.status, tam:(await r.arrayBuffer()).byteLength}))`);
    check(pdf.estado === 200, "y el PDF se descarga (" + pdf.estado + ")");
    await ev(`fetch('/api/permisos/' + ${sid} + '/cancelar', {method:'POST',
      headers:{'Content-Type':'application/json'}, body:'{}'}).then(r=>r.status)`);
  }

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "VISTA PREVIA OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
