// «Sin dato por ahora»: el formulario no deja campos exigidos en blanco por
// descuido, pero tampoco obliga a inventarse lo que todavía no se sabe.
//
// Lo que de verdad importa comprobar aquí es que marcar NO escribe un guion
// ni un "sin dato" en el campo: el campo se queda vacío —que es la verdad— y
// la declaración va aparte. Si algún día alguien "arregla" esto rellenando
// el campo con un texto, esta prueba lo caza.
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
  await __ent(`window.__t=(x)=>[...document.querySelectorAll('button')].find(b=>(b.innerText||'').trim().toLowerCase().includes(x.toLowerCase()));
    window.__texto=()=>document.body.innerText; true;`);
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
  "--remote-debugging-port=9457","--user-data-dir="+path.join(SP,"edge-sindato"),
  "--window-size=1440,1100", BASE + "/"], { stdio:"ignore" });
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

const RESP = "Zzz Sin Dato Prueba";
const PERS = "Zzz Sin Dato Personal";
const BENEF = "Zzz Sin Dato Benef";

(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);
    try{const l=await fetch("http://127.0.0.1:9457/json/list").then(r=>r.json());
      t=l.find(x=>x.type==="page"&&x.url.startsWith(BASE));}catch(e){}}
  if(!t) throw new Error("no responde " + BASE);
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.method==="Runtime.exceptionThrown"){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description)||d.text);}
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  __ent = ev; __recargar = (p)=>enviar("Page.reload", p||{});
  await enviar("Runtime.enable"); await enviar("Page.enable"); await dormir(3500);

  const clic=t=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.innerText||'').replace(/\\s+/g,' ').trim().toLowerCase()).includes(${JSON.stringify(t)}.toLowerCase()));if(!b)return false;b.click();return true;})()`);
  const clicNav=t=>ev(`(()=>{const b=[...document.querySelectorAll('nav > div:first-child button')].find(x=>x.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(t)});if(!b)return false;b.click();return true;})()`);
  const enModal=()=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0&&x.innerText.trim());return d?d.innerText:'';})()`);
  const clicModal=t=>ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return false;
    const b=[...d.querySelectorAll('button')].find(x=>(x.innerText||'').trim().toLowerCase()===${JSON.stringify(t)}.toLowerCase());
    if(!b) return false; b.click(); return true;})()`);
  const escribirModal=(rotulo,valor)=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const rot=[...d.querySelectorAll('div')].find(x=>x.textContent.trim()===${JSON.stringify(rotulo)} && x.children.length===0);
    if(!rot) return 'sin rotulo';
    const inp=rot.parentElement.querySelector('input');
    if(!inp) return 'sin input';
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(inp,${JSON.stringify(valor)});
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    return 'ok';})()`);
  /* Las casillas del aviso no tienen rótulo propio: se buscan por el texto
     de la línea en la que están. */
  const marcar=campo=>ev(`(()=>{
    const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 'sin modal';
    const l=[...d.querySelectorAll('label')].find(x=>(x.textContent||'').includes(${JSON.stringify(campo)}));
    if(!l) return 'sin la línea de ' + ${JSON.stringify(campo)};
    const c=l.querySelector('input[type=checkbox]');
    if(!c) return 'sin casilla';
    c.click();
    return 'ok';})()`);

  await entrar();

  console.log("1. Guardar con campos exigidos vacíos no guarda");
  await clicNav("Responsables / Tutores"); await dormir(2000);
  check(await clic("Agregar responsable"), "se abre el alta"); await dormir(1400);
  console.log("   nombre:", await escribirModal("Nombres y apellidos", RESP));
  await dormir(500);
  check(await clicModal("Registrar responsable"), "se pulsa guardar"); await dormir(1800);
  let m = await enModal();
  check(/Faltan datos por completar/i.test(m), "el formulario se planta y lo dice");
  check(/documento/i.test(m) && /tel[ée]fono/i.test(m), "enumera los dos campos que faltan");
  check(/sin dato por ahora/i.test(m), "ofrece declararlos sin dato");
  check(/no inventa nada/i.test(m), "explica que marcar no rellena el campo");
  await foto("sindato-aviso.png");

  const seGuardo = await ev(`fetch('/api/responsables').then(r=>r.json())
    .then(d=>(d.responsables||[]).filter(r=>r.nombre===${JSON.stringify(RESP)}).length)`);
  check(seGuardo === 0, `y no se guardó nada (${seGuardo} en la base)`);

  console.log("\n2. Marcando los dos, sí guarda");
  console.log("   marcar documento:", await marcar("documento"));
  console.log("   marcar teléfono:", await marcar("teléfono"));
  await dormir(600);
  await foto("sindato-marcado.png");
  check(await clicModal("Registrar responsable"), "se pulsa guardar otra vez");
  await dormir(2500);
  const cerrado = await enModal();
  check(!/Faltan datos por completar/i.test(cerrado), "ya no protesta");

  console.log("\n3. Lo guardado dice la verdad");
  const fila = await ev(`fetch('/api/responsables').then(r=>r.json())
    .then(d=>(d.responsables||[]).find(r=>r.nombre===${JSON.stringify(RESP)}) || null)`);
  check(!!fila, "el responsable existe en la base");
  if (fila) {
    console.log("   documento=" + JSON.stringify(fila.documento)
                + " telefono=" + JSON.stringify(fila.telefono)
                + " sin_dato=" + JSON.stringify(fila.sin_dato));
    check(!String(fila.documento || "").trim(), "el documento quedó VACÍO, no con un guion");
    check(!String(fila.telefono || "").trim(), "el teléfono quedó VACÍO, no con un texto");
    const marcados = String(fila.sin_dato || "").split(",").map(x=>x.trim()).filter(Boolean).sort();
    check(marcados.join(",") === "documento,telefono",
          `consta que se declararon a conciencia (${JSON.stringify(fila.sin_dato)})`);
  }

  console.log("\n4. Las marcas no se pegan a la ficha siguiente");
  await clic("Agregar responsable"); await dormir(1400);
  console.log("   nombre:", await escribirModal("Nombres y apellidos", RESP + " Dos"));
  await dormir(400);
  await clicModal("Registrar responsable"); await dormir(1800);
  m = await enModal();
  check(/Faltan datos por completar/i.test(m),
        "vuelve a exigirlos: lo declarado antes era de la otra persona");
  const sinMarcar = await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    return [...d.querySelectorAll('input[type=checkbox]')].filter(c=>c.checked).length;})()`);
  check(sinMarcar === 0, `y las casillas salen limpias (${sinMarcar} marcadas)`);
  await clicModal("Cancelar"); await dormir(1000);

  console.log("\n5. La ficha de Personal exige sus cinco campos");
  await clicNav("Personal"); await dormir(2200);
  check(await clic("Agregar usuario"), "se abre el alta de personal"); await dormir(1500);
  console.log("   nombre:", await escribirModal("Nombre completo", PERS));
  await dormir(500);
  check(await clicModal("Crear ficha"), "se pulsa crear"); await dormir(1800);
  m = await enModal();
  check(/Faltan datos por completar/i.test(m), "también se planta");
  const pedidos = ["documento", "cargo", "área", "fecha de ingreso", "teléfono"]
        .filter(x => m.toLowerCase().includes(x));
  check(pedidos.length === 5, `pide los cinco (${pedidos.join(", ")})`);
  for (const c of ["documento", "cargo", "área", "fecha de ingreso", "teléfono"])
    await marcar(c);
  await dormir(600);
  check(await clicModal("Crear ficha"), "se pulsa crear otra vez"); await dormir(2500);
  const ficha = await ev(`fetch('/api/personal').then(r=>r.json())
    .then(d=>(d.personal||[]).find(x=>x.nombre===${JSON.stringify(PERS)}) || null)`);
  check(!!ficha, "la ficha se creó");
  if (ficha) {
    console.log("   documento=" + JSON.stringify(ficha.documento)
                + " cargo=" + JSON.stringify(ficha.cargo)
                + " sin_dato=" + JSON.stringify(ficha.sin_dato));
    check(!String(ficha.documento || "").trim() && !String(ficha.cargo || "").trim(),
          "los campos siguen vacíos, sin texto inventado");
    const mk = String(ficha.sin_dato || "").split(",").map(x=>x.trim()).filter(Boolean).sort();
    check(mk.join(",") === "area,cargo,documento,fecha_ingreso,telefono",
          `los cinco constan declarados (${JSON.stringify(ficha.sin_dato)})`);
  }

  console.log("\n6. Y la ficha de Beneficiario, los suyos");
  await clicNav("Beneficiarios"); await dormir(2200);
  check(await clic("Agregar beneficiario"), "se abre el alta de beneficiario"); await dormir(1500);
  console.log("   nombre:", await escribirModal("Nombre completo", BENEF));
  await dormir(500);
  check(await clicModal("Registrar beneficiario"), "se pulsa registrar"); await dormir(1800);
  m = await enModal();
  check(/Faltan datos por completar/i.test(m), "se planta igual");
  const cuantos = await ev(`(()=>{const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    return [...d.querySelectorAll('label')].filter(l=>/sin dato por ahora/.test(l.textContent||'')).length;})()`);
  /* Son trece exigidos, pero el formulario ya trae puestos «Casa Lima» y el
     año en curso, así que quedan once por resolver. Si algún día ese
     prellenado desaparece, este número lo dirá. */
  check(cuantos === 11, `enumera los que faltan de verdad (${cuantos} de 13)`);
  const nada = await ev(`fetch('/api/beneficiarios').then(r=>r.json())
    .then(d=>(d.beneficiarios||[]).filter(b=>b.nombre===${JSON.stringify(BENEF)}).length)`);
  check(nada === 0, `y no guardó al niño a medias (${nada} en la base)`);
  await clicModal("Cancelar"); await dormir(1200);

  console.log("\n7. Limpieza: la prueba se lleva lo suyo");
  const limpio = await ev(`(async()=>{
    const pe = await fetch('/api/personal').then(r=>r.json());
    for (const x of (pe.personal||[]).filter(x=>x.nombre===${JSON.stringify(PERS)}))
      await fetch('/api/personal/' + x.id, {method:'DELETE'});
    const d = await fetch('/api/responsables').then(r=>r.json());
    for (const r of (d.responsables||[]).filter(x=>x.nombre.startsWith(${JSON.stringify(RESP)})))
      await fetch('/api/responsables/' + r.id, {method:'DELETE'});
    const q = await fetch('/api/responsables').then(r=>r.json());
    const pq = await fetch('/api/personal').then(r=>r.json());
    return (q.responsables||[]).filter(x=>x.nombre.startsWith(${JSON.stringify(RESP)})).length
         + (pq.personal||[]).filter(x=>x.nombre===${JSON.stringify(PERS)}).length;})()`);
  check(limpio === 0, `no queda rastro (${limpio})`);

  const graves = errs.filter(e => !/favicon|ph-duotone/i.test(e));
  check(graves.length === 0, "sin errores de JavaScript");
  if (graves.length) graves.slice(0,3).forEach(e=>console.log("     " + e.split("\n")[0]));

  console.log("\n" + (fallos.length ? "FALLOS: " + fallos.length : "TODO OK"));
  fallos.forEach(f=>console.log("  - " + f));
  edge.kill(); process.exit(fallos.length ? 1 : 0);
})().catch(e=>{console.log("REVENTO: " + e.message); edge.kill(); process.exit(1)});
