import sys
sys.path.insert(0, r"C:\Users\NIEVES\ERP_Lost_Children\bridge")
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
    for path in ["/staff/delete", "/staff/remove", "/staff/deleteById",
                 f"/staff/{staff_id}/delete", "/staff/batchDelete"]:
        r2 = s.post(BASE + path, data={"ids": str(staff_id)}, headers=hdrs, timeout=8)
        if r2.status_code == 200 and "<!doctype" not in r2.text.lower():
            print(f"{path} OK: {r2.text[:100]}")
            break
        print(f"{path} -> {r2.status_code}")
