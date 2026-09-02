# -*- coding: utf-8 -*-
"""La prueba, adaptada a que «Periodo» ahora se elige.

No se fija un valor a mano: se toma el primero que ofrezca la lista, que
sale de la fecha de ingreso de esa persona. Escribir «2025-2026» en la
prueba la ataría a una ficha concreta y fallaría el día que cambie.
"""
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path("prueba_previa_formato.js")
s = p.read_text(encoding="utf-8")

# ── Un ayudante para las listas, junto al de los campos de texto ─────────
viejo = '''(async()=>{
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);'''
nuevo = '''// Elige en la lista cuyo rótulo se pide. Devuelve el valor elegido.
const elegir = (rotulo, cual) => `(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>getComputedStyle(x).position==='fixed');
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
  let t=null; for(let i=0;i<40&&!t;i++){await dormir(500);'''
assert s.count(viejo) == 1
s = s.replace(viejo, nuevo, 1)

# ── El paso 2 usa la lista ───────────────────────────────────────────────
viejo2 = '''  check((await ev(escribir("Periodo", "2025-2026"))) === "ok", "está el campo Periodo");
  await dormir(900);'''
nuevo2 = '''  const periodo = await ev(elegir("Periodo", 0));
  console.log("   periodo elegido: " + periodo);
  check(/^\\d{4}/.test(periodo), "la lista de periodos trae opciones (" + periodo + ")");
  await dormir(900);'''
assert s.count(viejo2) == 1
s = s.replace(viejo2, nuevo2, 1)

viejo3 = '''  check(/2025-2026/.test(doc), "y el periodo también");'''
nuevo3 = '''  check(doc.indexOf(periodo) >= 0, "y el periodo elegido también");'''
assert s.count(viejo3) == 1
s = s.replace(viejo3, nuevo3, 1)

viejo4 = '''    check(guardado === "2025-2026", "el periodo se guardó (" + guardado + ")");'''
nuevo4 = '''    check(guardado === periodo, "el periodo se guardó (" + guardado + ")");'''
assert s.count(viejo4) == 1
s = s.replace(viejo4, nuevo4, 1)

p.write_text(s, encoding="utf-8")
print("ok · la prueba elige en vez de escribir")
