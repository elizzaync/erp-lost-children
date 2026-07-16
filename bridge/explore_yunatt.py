import yunatt_sync, logging, sys, re, json
logging.disable(logging.CRITICAL)

yunatt_sync._login()
s = yunatt_sync._session
BASE = "https://global.yunatt.com"

def pr(x):
    sys.stdout.buffer.write((str(x)+"\n").encode("utf-8","replace"))

# Scrape completo del HTML de /staff/index buscando JS con endpoints
r = s.get(BASE+"/staff/index", timeout=15)
html = r.text

# Guardar HTML completo para análisis
with open("staff_index.html","wb") as f:
    f.write(r.content)
pr("HTML guardado en staff_index.html")

# Extraer TODAS las strings que contienen /staff/
staff_apis = re.findall(r'["\']((?:/[a-zA-Z]+)+)["\']', html)
staff_apis = sorted(set(a for a in staff_apis if "staff" in a.lower() or "dept" in a.lower()))
pr("\n=== TODAS LAS RUTAS EN EL HTML ===")
for a in staff_apis:
    pr(f"  {a}")

# También buscar archivos JS referenciados
js_files = re.findall(r'src=["\'](/[^"\']+\.js[^"\']*)["\']', html)
pr("\n=== ARCHIVOS JS REFERENCIADOS ===")
for j in js_files[:10]:
    pr(f"  {j}")

# Intentar /staff/upload para ver qué hace
pr("\n=== /staff/upload ===")
try:
    r2 = s.get(BASE+"/staff/upload", timeout=10, allow_redirects=False)
    pr(f"GET -> {r2.status_code}")
    pr(r2.text[:300])
except Exception as e:
    pr(f"ERR: {e}")

# Probar con JSON body (algunos APIs modernos esperan JSON)
pr("\n=== ALTA CON JSON ===")
import json as _json
dept_id = 38015
for path in ["/staff/save","/staff/add","/staff/create","/staff/insert","/staff/update"]:
    try:
        r3 = s.post(BASE+path,
            json={"staffNumber":"9999","name":"TEST","departmentId":dept_id},
            timeout=8)
        pr(f"POST JSON {path} -> {r3.status_code} | {r3.text[:150]}")
    except:
        pass
