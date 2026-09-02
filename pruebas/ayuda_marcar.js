// Los dos recorridos de la pantalla de marcar, en un solo sitio.
//
// Desde que la marca compara el rostro, cualquier suite que marque tiene
// que registrar antes su cara y esperar a que el modelo opine. Tenerlo
// copiado en cada suite acabaría con cuatro versiones distintas del mismo
// recorrido, y tres de ellas desactualizadas.
const path = require("path");

const CARA = path.join(__dirname, "caras", "rostroA.y4m");

/* Los argumentos de Edge para que la cámara falsa enseñe una cara de
   verdad en vez del comecocos verde. */
function conCara(args) {
  return args.concat(["--use-file-for-fake-video-capture=" + CARA]);
}

function ayudas(ev, dormir) {
  /* Espera a que el modelo diga qué vio. La primera vez son 7 MB y va por
     CPU, así que la espera es larga a propósito. */
  const esperarVeredicto = async () => {
    for (let i = 0; i < 40; i++) {
      await dormir(1000);
      const t = await ev(`document.body.innerText`);
      if (/Cara reconocida|no se ve una cara|No se ve ninguna cara/i.test(t)) return t;
    }
    return await ev(`document.body.innerText`);
  };

  /* El botón del PIE del diálogo. El mismo texto aparece en el botón
     grande de la pantalla de detrás, que va antes en el documento:
     pulsar aquel reabriría el diálogo en vez de confirmarlo. */
  const confirmarPie = async () => {
    await ev(`(()=>{const b=[...document.querySelectorAll('button')]
      .filter(x=>/Confirmar y marcar|Registrar mi rostro/.test((x.innerText||'').trim()));
      if(b.length) b[b.length-1].click();})()`);
    await dormir(4500);
  };

  const abrirDialogo = async () => {
    await ev(`(()=>{const b=[...document.querySelectorAll('main button')]
      .find(x=>/Marcar (entrada|salida)|Registrar mi rostro/.test(x.innerText||''));
      if(b) b.click();})()`);
    await dormir(3500);
    return await ev(`!!document.getElementById('videoMarca')
      || /Tomar foto|Repetir la foto/.test(document.body.innerText||'')`);
  };

  const tomarFoto = async () => {
    await ev(`(()=>{const b=[...document.querySelectorAll('button')]
      .find(x=>/Tomar foto/.test(x.innerText||'')); if(b) b.click();})()`);
    return await esperarVeredicto();
  };

  /* Registrar el rostro de referencia. Sin esto no se puede marcar. */
  const enrolar = async () => {
    const ya = await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>!!d.rostro)`);
    if (ya) return true;
    if (!(await abrirDialogo())) return false;
    await tomarFoto();
    await ev(`(()=>{const b=[...document.querySelectorAll('button')]
      .find(x=>/He leído el aviso/.test(x.innerText||'')); if(b) b.click();})()`);
    await dormir(500);
    await confirmarPie();
    return await ev(`fetch('/api/asistencia/mias').then(r=>r.json()).then(d=>!!d.rostro)`);
  };

  /* Marcar de verdad: botón → cámara → foto → confirmar. Devuelve si el
     diálogo llegó a abrirse (desde lejos no se abre) y lo que quedó
     escrito en la pantalla. */
  const marcar = async () => {
    if (!(await abrirDialogo()))
      return { dialogo: false, texto: await ev(`document.body.innerText`) };
    await tomarFoto();
    await confirmarPie();
    return { dialogo: true, texto: await ev(`document.body.innerText`) };
  };

  return { enrolar, marcar, abrirDialogo, tomarFoto, confirmarPie };
}

/* Deja la cuenta del banco sin rostro ni marcas Y con la pantalla al día.
 *
 * Lo segundo no es un adorno: la pantalla ya estaba pintada cuando se
 * limpia, así que su botón sigue diciendo «Marcar entrada» aunque el
 * rostro ya no exista. La suite lo pulsaba y entraba por el camino de
 * marcar en vez del de registrar; sola pasaba —nunca hubo rostro— y
 * encadenada fallaba, que es la peor forma de fallar.
 */
async function limpiar(ev, dormir, opciones) {
  const { execFileSync } = require("child_process");
  const salida = execFileSync("py",
    [path.join(__dirname, "limpia_mi_rastro.js".replace(".js", ".py"))]
      .concat((opciones || {}).soloMarcas ? ["--marcas"] : []),
    { encoding: "utf8" }).trim();
  await ev(`location.reload()`);
  await dormir(4500);
  /* La recarga se lleva por delante el parche de CSRF que puso la suite. */
  await ev(`(async()=>{
    const s = await fetch("/api/sesion").then(r=>r.json()).catch(()=>({}));
    const csrf = (s.sesion||{}).csrf || "";
    if (!window.__fo) window.__fo = window.fetch;
    window.fetch = (u,o)=>{o=o||{};const m=(o.method||"GET").toUpperCase();
      if(csrf&&["POST","PUT","PATCH","DELETE"].indexOf(m)>=0)
        o.headers=Object.assign({},o.headers,{"X-CSRF-Token":csrf});
      return window.__fo(u,o);};})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('nav button')]
    .find(x=>/Marcar asistencia/.test(x.innerText||'')); if(b) b.click();})()`);
  await dormir(2500);
  return salida;
}

module.exports = { conCara, ayudas, limpiar, CARA };
