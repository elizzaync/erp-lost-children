// Guardar una ficha como lo haría una persona.
//
// Desde que existe la regla de campos requeridos, el formulario se niega a
// guardar si faltan datos y ofrece marcarlos como «sin dato por ahora».
// Varias suites son anteriores a esa regla: rellenan lo suyo, pulsan
// guardar, el formulario responde pidiendo lo que falta, y ellas lo leían
// como que guardar estaba roto.
//
// Esto reproduce lo que hace una persona: intenta guardar, y si le piden
// datos que no tiene, marca las casillas y vuelve a guardar.

/* Pulsa el botón del PIE del diálogo. El mismo texto puede estar en la
   pantalla de detrás, así que se toma el último. */
async function pulsarPie(ev, etiqueta) {
  return await ev(`(()=>{const b=[...document.querySelectorAll('button')]
    .filter(x=>new RegExp(${JSON.stringify(etiqueta)}, 'i').test((x.innerText||'').trim()));
    if(!b.length) return false; b[b.length-1].click(); return true;})()`);
}

/* Las casillas de «sin dato por ahora» que el diálogo esté mostrando. */
async function marcarLoQueFalta(ev) {
  return await ev(`(()=>{const d=[...document.querySelectorAll('div')]
    .find(x=>getComputedStyle(x).position==='fixed' && x.getBoundingClientRect().width>0);
    if(!d) return 0;
    const cs=[...d.querySelectorAll('label')]
      .filter(l=>/sin dato por ahora/i.test(l.innerText||''))
      .map(l=>l.querySelector('input[type=checkbox]'))
      .filter(c=>c && !c.checked);
    cs.forEach(c=>c.click()); return cs.length;})()`);
}

/* Guarda. Devuelve cuántos campos hubo que declarar «sin dato», o -1 si el
   botón ni siquiera estaba. */
async function guardarFicha(ev, dormir, etiqueta) {
  if (!(await pulsarPie(ev, etiqueta))) return -1;
  await dormir(900);
  const faltan = await marcarLoQueFalta(ev);
  if (faltan) {
    await dormir(500);
    await pulsarPie(ev, etiqueta);
    await dormir(1600);
  }
  return faltan;
}

module.exports = { pulsarPie, marcarLoQueFalta, guardarFicha };
