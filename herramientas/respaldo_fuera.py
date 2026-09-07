# -*- coding: utf-8 -*-
"""
respaldo_fuera.py — hace la copia Y la saca de esta máquina, en un paso.

POR QUÉ EXISTE
──────────────
herramientas/respaldo.py hace una copia completa y comprobada... y la deja
en el mismo disco que la base. Eso no protege de lo único que no tiene
vuelta atrás: que el disco se rompa o el portátil se pierda.

Esto la lleva al servidor de Contabo —el mismo donde ya corre el sistema
desplegado— y comprueba que llegó entera comparando la huella SHA-256 del
archivo aquí y allí. Si no coinciden, avisa y no borra nada.

LO QUE ESTO NO ES
─────────────────
No es una copia en dos sitios distintos del mundo. El servidor es otra
máquina, que es lo que hace falta contra un disco roto, pero si se pierde
la cuenta de Contabo se pierden los dos a la vez. Para datos de niños y de
sus tutores, cuando el sistema esté en uso real, conviene además una copia
en un disco que no esté conectado a nada.

USO
───
    py herramientas/respaldo_fuera.py          copia y envía
    py herramientas/respaldo_fuera.py --ver    solo dice qué hay allí
"""
import hashlib
import pathlib
import subprocess
import sys

for _f in (sys.stdout, sys.stderr):
    try:
        _f.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "herramientas"))

SERVIDOR = "root@80.190.76.84"
CARPETA_REMOTA = "/var/respaldos-rrhh"

# Cuántas copias se guardan. Las más viejas se van borrando solas: sin esto,
# el disco del servidor acabaría lleno un día cualquiera sin avisar.
GUARDAR_FUERA = 10
GUARDAR_AQUI = 5


def _ssh(orden, segundos=60):
    r = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", SERVIDOR, orden],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=segundos)
    if r.returncode != 0:
        raise SystemExit(f"  no se pudo hablar con el servidor:\n  {r.stderr.strip()}")
    return r.stdout.strip()


def _huella(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as fh:
        for trozo in iter(lambda: fh.read(1 << 20), b""):
            h.update(trozo)
    return h.hexdigest()


def listar():
    salida = _ssh(f"ls -1t {CARPETA_REMOTA}/*.zip 2>/dev/null | head -20; "
                  f"echo '---'; du -sh {CARPETA_REMOTA} 2>/dev/null")
    print(f"  en {SERVIDOR}:{CARPETA_REMOTA}")
    print()
    for linea in salida.splitlines():
        print("   ", linea)


def enviar():
    import respaldo

    print()
    zip_local = respaldo.hacer()

    print()
    print("=" * 68)
    print("  SACÁNDOLO DE ESTA MÁQUINA")
    print("=" * 68)
    print(f"  destino {SERVIDOR}:{CARPETA_REMOTA}")
    print()

    aqui = _huella(zip_local)
    print(f"  huella aquí  {aqui[:32]}…")

    print("  enviando…")
    r = subprocess.run(
        ["scp", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
         str(zip_local), f"{SERVIDOR}:{CARPETA_REMOTA}/"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=300)
    if r.returncode != 0:
        raise SystemExit(f"  no se pudo enviar:\n  {r.stderr.strip()}")

    alli = _ssh(f"sha256sum {CARPETA_REMOTA}/{zip_local.name} | cut -d' ' -f1")
    print(f"  huella allí  {alli[:32]}…")

    if aqui != alli:
        raise SystemExit(
            "  LAS HUELLAS NO COINCIDEN. El archivo se corrompió por el "
            "camino y no sirve. No se borra nada; vuelve a intentarlo.")
    print("  IDÉNTICOS — llegó entero")

    # ── Aclarar sitio, solo después de confirmar que la nueva está bien ──
    print()
    print(f"  dejando las {GUARDAR_FUERA} más recientes allí")
    _ssh(f"cd {CARPETA_REMOTA} && ls -1t *.zip 2>/dev/null | "
         f"tail -n +{GUARDAR_FUERA + 1} | xargs -r rm -f")
    cuantas = _ssh(f"ls -1 {CARPETA_REMOTA}/*.zip 2>/dev/null | wc -l")
    sitio = _ssh("df -h / | tail -1 | awk '{print $4\" libres\"}'")
    print(f"  quedan {cuantas} copia(s) · {sitio} en el servidor")

    print(f"  dejando las {GUARDAR_AQUI} más recientes aquí")
    locales = sorted((RAIZ / "respaldos").glob("*.zip"),
                     key=lambda p: p.stat().st_mtime, reverse=True)
    for viejo in locales[GUARDAR_AQUI:]:
        viejo.unlink()
    print(f"  quedan {min(len(locales), GUARDAR_AQUI)} copia(s) aquí")

    print()
    print("=" * 68)
    print("  HECHO. La copia está en dos máquinas distintas.")
    print("=" * 68)


if __name__ == "__main__":
    if "--ver" in sys.argv:
        listar()
    else:
        enviar()
