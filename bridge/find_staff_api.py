import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import yunatt_sync, logging
logging.disable(logging.CRITICAL)
sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://global.yunatt.com"
yunatt_sync._login()
s = yunatt_sync._session
hdrs = {"X-Requested-With": "XMLHttpRequest", "Referer": BASE + "/staff/index"}

# El id interno de PRUEBA_DELETE es 779640 aprox — obtenerlo
r = s.post(BASE + "/staff/query", data={"limit": 20, "offset": 0}, timeout=10)
rows = r.json().get("rows", [])
test = next((x for x in rows if x.get("enrollid") == "50"), None)
print(f"Usuario prueba: {test}")

if test:
    staff_id = test["id"]

    # ── Guarda de seguridad ────────────────────────────────────────────────
    # Este script prueba varios endpoints de BORRADO contra la nube REAL de
    # yunatt.com, identificando el registro solo por enrollid=="50" (sin
    # confirmar que sea efectivamente un usuario de prueba). Si "50" llegara
    # a corresponder a una persona real, esto la borra de yunatt sin aviso.
    print(f"\nSe intentará BORRAR de yunatt.com al registro: {test}")
    if os.environ.get("ALLOW_DESTRUCTIVE") != "1":
        if not sys.stdin.isatty():
            print("No hay terminal interactiva y ALLOW_DESTRUCTIVE!=1 — abortando sin borrar nada.")
            sys.exit(1)
        respuesta = input('Verifica que sea un registro de PRUEBA. Escribe CONFIRMAR para borrarlo (cualquier otra cosa cancela): ').strip()
        if respuesta != "CONFIRMAR":
            print("Cancelado — no se borró nada.")
            sys.exit(1)

    for path in ["/staff/delete", "/staff/remove", "/staff/deleteById",
                 f"/staff/{staff_id}/delete", "/staff/batchDelete"]:
        r2 = s.post(BASE + path, data={"ids": str(staff_id)}, headers=hdrs, timeout=8)
        if r2.status_code == 200 and "<!doctype" not in r2.text.lower():
            print(f"{path} OK: {r2.text[:100]}")
            break
        print(f"{path} -> {r2.status_code}")
