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


def enviar_zip(zip_local, hablar=print):
    """Manda un .zip ya hecho al servidor y comprueba que llegó entero.

    Separado de enviar() para que lo pueda usar también el botón de la
    pantalla de Configuración, que hace la copia por su cuenta. Devuelve
    la huella; levanta RuntimeError si algo va mal, en vez de SystemExit:
    esto corre dentro del servidor web y ahí un SystemExit mataría al
    proceso entero.
    """
    zip_local = pathlib.Path(zip_local)

    aqui = _huella(zip_local)
    hablar(f"  huella aquí  {aqui[:32]}…")

    hablar("  enviando…")
    r = subprocess.run(
        ["scp", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
         str(zip_local), f"{SERVIDOR}:{CARPETA_REMOTA}/"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=300)
    if r.returncode != 0:
        raise RuntimeError("no se pudo enviar al servidor: "
                           + (r.stderr.strip() or "scp falló"))

    alli = _ssh(f"sha256sum {CARPETA_REMOTA}/{zip_local.name} | cut -d' ' -f1")
    hablar(f"  huella allí  {alli[:32]}…")

    if aqui != alli:
        raise RuntimeError(
            "las huellas no coinciden: el archivo se corrompió por el camino. "
            "No se ha borrado ninguna copia anterior.")
    hablar("  IDÉNTICOS — llegó entero")

    # Aclarar sitio, SOLO después de confirmar que la nueva está bien.
    _ssh(f"cd {CARPETA_REMOTA} && ls -1t *.zip 2>/dev/null | "
         f"tail -n +{GUARDAR_FUERA + 1} | xargs -r rm -f")
    return aqui


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

    try:
        enviar_zip(zip_local)
    except RuntimeError as e:
        raise SystemExit("  " + str(e))

    # La poda de allí la hace enviar_zip, después de confirmar que la copia
    # nueva llegó bien. Aquí solo se cuenta cómo quedó.
    print()
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
