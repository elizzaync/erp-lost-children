"""
fix_timezone_yunatt.py
Cambia la zona horaria de la cuenta yunatt.com a America/Lima (Peru, UTC-5).

Uso: python fix_timezone_yunatt.py
"""
import sys, re
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, r"C:\Users\NIEVES\ERP_Lost_Children\bridge")
import yunatt_sync, logging
logging.basicConfig(level=logging.WARNING)

yunatt_sync._login()
s = yunatt_sync._session
BASE = "https://global.yunatt.com"

# 1. Leer valores actuales del formulario
r = s.get(BASE + "/customerInfo/index", timeout=15)
html = r.text

def get_val(name):
    m = re.search(rf'name="{re.escape(name)}"[^>]*value="([^"]*)"', html, re.I)
    return m.group(1) if m else ""

def get_checked(name):
    m = re.search(rf'name="{re.escape(name)}"[^>]*(?:checked)[^>]*value="([^"]*)"', html, re.I)
    if not m:
        m = re.search(rf'name="{re.escape(name)}"[^>]*checked', html, re.I)
    return "1" if m else "0"

tz_actual = re.findall(r'<option value="([^"]+)"[^>]*selected', html, re.I)
print(f"Timezone actual : {tz_actual}")
print(f"Timezone nuevo  : America/Lima  (Peru, UTC-5)")

campos = {
    "name":        get_val("name")        or "System",
    "code":        get_val("code"),
    "simpleName":  get_val("simpleName")  or "Elizabeth",
    "timeZone":    "America/Lima",
    "phone":       get_val("phone"),
    "email":       get_val("email")       or yunatt_sync.EMAIL,
    "address":     get_val("address"),
    "remark":      get_val("remark"),
    "attendance":  get_checked("attendance") or "1",
    "access":      get_checked("access")     or "1",
    "vi":          get_checked("vi")         or "0",
    "ec":          get_checked("ec")         or "0",
    "locker":      get_checked("locker")     or "0",
    "longId":      get_val("longId")         or "10",
}

print("\nCampos a enviar:")
for k, v in campos.items():
    print(f"  {k} = {v!r}")

confirmacion = input("\n¿Confirmar cambio de timezone a America/Lima? (s/n): ").strip().lower()
if confirmacion != "s":
    print("Cancelado.")
    sys.exit(0)

hdrs = {
    "X-Requested-With": "XMLHttpRequest",
    "Referer": BASE + "/customerInfo/index",
    "Content-Type": "application/x-www-form-urlencoded",
}

r2 = s.post(BASE + "/customerInfo/update", data=campos, headers=hdrs, timeout=15)
print(f"\nRespuesta: {r2.status_code}")
print(r2.text[:300])

if r2.status_code == 200 and "false" not in r2.text.lower():
    print("\n✓ Timezone actualizado a America/Lima correctamente.")
    print("  Apaga y enciende el dispositivo para que reciba la hora correcta.")
else:
    print("\n✗ No se pudo actualizar. Usa el portal web manualmente:")
    print("  https://global.yunatt.com/customerInfo/index")
    print("  → Time zone → America/Lima → Guardar")
