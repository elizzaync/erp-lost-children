# -*- coding: utf-8 -*-
"""
Todas las suites, una detrás de otra, con el resumen al final.

Ninguna suite toca la base real. Las de Python trabajan sobre una copia desde
siempre; las de navegador lo hacen desde que este lanzador les levanta su
propio servidor en el 7801 apuntando a otra copia.

Desde que se retiró la semilla de 20 personas, la base del producto arranca
vacía. Varias suites comprueban cosas que solo se ven con datos —el organigrama
a tres niveles, el sueldo vigente, los totales de la planilla—, así que este
lanzador monta la fixtura antes y la desmonta después, incluso si algo revienta
por el camino.
"""
import os
import sys, os, shutil, sqlite3, subprocess, tempfile, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NAVEGADOR = [
    "prueba_legajo", "prueba_pdf_ui", "prueba_previa_formato", "prueba_firma", "prueba_bypass", "prueba_buscadores", "prueba_dialogo_reporte", "prueba_marcar_foto", "prueba_marcar_vista", "prueba_ubicacion_sin_sede", "prueba_se_actualiza_sola", "prueba_tope_marcas", "prueba_modelo_rostro", "prueba_rostro_marca", "prueba_rostro_retirar", "prueba_graficos", "prueba_url_directa", "mide_movil", "prueba_organigrama", "prueba_asistencia", "prueba_documentos",
    "prueba_rename", "prueba_benef_rename", "prueba_ausentismo", "prueba_condiciones",
    # "prueba_planillas" — el módulo se desactivó el 17/08 y la suite entra por
    # el menú, así que no tiene por dónde llegar. Vuelve cuando se reactive;
    # el cálculo lo cubre mientras tanto prueba_calculo, contra el backend.
    "prueba_alta", "prueba_tres", "prueba_modal",
    "prueba_sin_perfiles", "prueba_botones_benef", "prueba_benef_completo",
    "prueba_editar_benef", "prueba_sesiones", "prueba_resp_ui", "prueba_fecha", "prueba_vinculo", "prueba_benef_ficha", "prueba_hoja_vida", "prueba_campos_personal", "prueba_panel_personas", "prueba_biometria_lista", "prueba_biometria_vista", "prueba_dashboard_real", "prueba_mis_permisos", "prueba_revision_permisos", "prueba_panel_asistencia", "prueba_sin_dato", "prueba_sin_maqueta_asist", "prueba_foto_pantalla", "prueba_invit_pantalla", "prueba_biometria_estado", "prueba_bandeja", "prueba_rutas", "prueba_vocabulario", "prueba_series_benef", "prueba_pestana_dia", "prueba_corregir_ui",
]
PYTHON = [
    "verifica_ids", "prueba_columnas_declaradas", "prueba_fotos_separadas", "prueba_calculo", "prueba_archivos", "prueba_permisos", "prueba_pdf_permiso", "prueba_firma_pdf", "prueba_reportes",
    "migra_solicitudes", "migra_beneficiarios", "migra_sesiones", "migra_usuarios",
    "prueba_director", "prueba_login", "prueba_responsables", "prueba_foto_responsable", "prueba_invitaciones", "prueba_enrolado_real", "prueba_formulario_traida", "prueba_sondeo", "prueba_permisos_diseno",
    "prueba_migra_tutores", "prueba_vistas", "prueba_series_benef", "prueba_migra_identidades", # "prueba_migra_tipos" — comprobaba la migración a SEIS tipos, que el
    # 27/08/2026 quedó reemplazada por la de los diez del formato en
    # papel (backend/migrar_diez_tipos.py). Sus reglas ya no son las de
    # la casa: afirma que «licencia» se conserva, y hoy «licencia» no
    # existe. La cubre prueba_dos_firmas.
    "prueba_permisos_api", "prueba_permisos_rol", "verifica_aplicado",
    "prueba_canal_web", "prueba_marca_web", "prueba_marca_lejos", "prueba_marca_manual", "prueba_fichas",
    "prueba_tokens",
    "prueba_dos_firmas",
    "prueba_corregir",
    # Al final a propósito: levanta y tira SU propio banco para comprobar el
    # aislamiento, y en medio dejaría sin servidor a lo que viniera después.
    "prueba_aislamiento",
]

resultados = []


def correr(nombre, cmd, limite):
    # Encadenadas sin pausa, dos suites de Beneficiarios fallaban de forma
    # intermitente y pasaban al ejecutarlas solas: el Edge anterior todavía
    # estaba cerrando y el servidor atendiendo lo suyo. Dos segundos bastan.
    time.sleep(2)
    t0 = time.time()
    try:
        # env=ENTORNO no es opcional: ahí van la dirección del banco y las
        # credenciales de su cuenta. Sin él las suites iban al 7801 —el
        # servidor del equipo, con la base REAL— y morían en el login,
        # porque la cuenta del banco no existe ahí.
        r = subprocess.run(cmd, cwd=AQUI, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=limite,
                           env=ENTORNO)
        ok, salida = r.returncode == 0, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        ok, salida = False, "SE PASÓ DEL TIEMPO"
    seg = time.time() - t0
    resultados.append((nombre, ok, seg, salida))
    print(f"{'OK  ' if ok else 'FALLA'}  {nombre:26} {seg:5.1f}s")
    if not ok:
        # Las líneas que la suite marca como fallo. Si no marca ninguna
        # —reventó de otra forma, o abortó antes de empezar— se enseñan las
        # últimas de su salida: sin eso el fallo queda mudo en el registro y
        # hay que volver a correrla a mano para saber qué pasó.
        lineas = [x for x in salida.split("\n") if "FALLO" in x or "REVENT" in x][:6]
        if not lineas:
            lineas = [x for x in salida.split("\n") if x.strip()][-6:]
        for l in lineas:
            print("        " + l.strip()[:120])
        # Y la salida entera a un archivo. Una suite que pasa sola y falla
        # en la corrida solo se explica con lo que dijo DENTRO de la
        # corrida; sin guardarlo, la unica via era repetir las 89.
        try:
            d = os.path.join(AQUI, "fallos")
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, nombre + ".txt"), "w",
                      encoding="utf-8", errors="replace") as f:
                f.write(salida)
        except Exception:
            pass


BASE_REAL = os.path.join(RAIZ, "data", "rrhh.db")
SERVIDOR = os.path.join(RAIZ, "backend", "servidor.py")
# El banco vive en el 7802. El 7801 es del equipo y no se toca: mientras
# corren las pruebas, quien tenga la aplicación abierta sigue viendo SUS
# datos. Antes compartían puerto y durante cada corrida veían la fixtura.
PUERTO_BANCO = 7802
URL = f"http://127.0.0.1:{PUERTO_BANCO}/"

# Se rellena al levantar el servidor de pruebas. Todo lo que se lance después
# lo hereda, y así apunta a la copia y no a la base del equipo.
ENTORNO = dict(os.environ)


def fixtura(accion):
    r = subprocess.run([sys.executable, "fixtura_equipo.py", accion],
                       cwd=AQUI, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=ENTORNO)
    primera = (r.stdout or r.stderr or "").strip().split("\n")[0]
    print(f"fixtura {accion}: {primera}")



def fixtura_marcas(accion):
    """
    La segunda fixtura: tres personas enroladas con marcas del terminal.

    Nunca se montaba aqui. Las suites que la necesitan -legajo, organigrama,
    asistencia- funcionaban porque sus fichas habian quedado sueltas en la
    base real de alguna ejecucion a mano. Con el banco de pruebas la copia
    nace limpia, asi que hay que montarla: es lo que debio pasar siempre.
    """
    r = subprocess.run([sys.executable, "fixtura.py", accion],
                       cwd=AQUI, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=ENTORNO)
    primera = (r.stdout or r.stderr or "").strip().split(chr(10))[0]
    print(f"fixtura marcas {accion}: {primera[:90]}")

def _responde(intentos=60):
    for _ in range(intentos):
        try:
            with urllib.request.urlopen(URL, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


# Credenciales de la cuenta que vive SOLO en el banco. No son un secreto:
# la copia se borra al terminar y nunca sale de esta máquina.
USUARIO_PRUEBAS = "banco.pruebas"
CLAVE_PRUEBAS = "banco-de-pruebas-2026"


def sembrar_cuenta(copia):
    """
    Una cuenta de Director dentro del banco, para que las suites entren.

    Desde que LOGIN_ESTRICTO está activo ya no existe "entrar sin cuenta":
    las suites necesitan identificarse como cualquiera. Se siembra en la
    COPIA, nunca en la base real, y con rol Director para que puedan probar
    todas las pantallas.
    """
    entorno = dict(ENTORNO)
    guion = (
        "import sys, os;"
        "sys.path.insert(0, r'" + os.path.join(RAIZ, "backend") + "');"
        "import config, db, auth;"
        "db.iniciar();"
        "rol = db.rol_por_clave('director');"
        "pid = db.crear_personal({'nombre': 'Banco De Pruebas',"
        " 'cargo': 'Cuenta del banco de pruebas', 'estado': 'activo'});"
        "db.crear_usuario(pid, '" + USUARIO_PRUEBAS + "',"
        " auth.hashear('" + CLAVE_PRUEBAS + "'), rol['id'], debe_cambiar=0);"
        "print('cuenta del banco:', '" + USUARIO_PRUEBAS + "')"
    )
    r = subprocess.run([sys.executable, "-c", guion], capture_output=True,
                       text=True, encoding="utf-8", errors="replace",
                       env=entorno)
    salida = (r.stdout or r.stderr or "").strip().split(chr(10))[-1]
    print("  " + salida[:90])
    ENTORNO["USUARIO_PRUEBAS"] = USUARIO_PRUEBAS
    ENTORNO["CLAVE_PRUEBAS"] = CLAVE_PRUEBAS


# Las tablas de datos, tal y como las clasifica backend/borrado_total.py.
# Se nombran aquí y no se importan de allí para que una prueba no pueda
# llamar por accidente a un script que borra la base REAL.
TABLAS_A_VACIAR = (
    "marcas", "identidades", "rostros_web", "consentimientos",
    "formacion", "experiencia",
    "programas_beneficiario", "historial_educativo", "seguimiento",
    "sesiones_acompanamiento", "incidencias",
    "responsable_beneficiario", "responsables",
    "solicitudes", "boletas", "condiciones_laborales", "documentos",
    "beneficiarios", "personal",
    "invitaciones", "respuestas_formulario",
    "sesiones_usuario", "intentos_login", "accesos",
    # Las cuentas también son datos: apuntan a fichas que acaban de
    # desaparecer. El banco siembra la suya después, y las suites que
    # necesiten otras se las crean.
    "usuarios",
)


def vaciar(copia):
    """
    Deja la COPIA sin datos y con la configuración intacta.

    Los roles, sus permisos y los parámetros se conservan: son lo que hace
    que la aplicación funcione, no datos de nadie. Lo que se va son las
    personas, sus fichas y su rastro.
    """
    con = sqlite3.connect(copia)
    con.execute("PRAGMA foreign_keys = OFF")
    borradas = 0
    for tabla in TABLAS_A_VACIAR:
        try:
            borradas += con.execute(f"DELETE FROM {tabla}").rowcount
        except sqlite3.OperationalError:
            # Una tabla que aún no existe en esta base: no es un problema.
            pass
    con.commit()
    con.close()
    return borradas


def levantar_banco():
    """
    Copia la base y levanta el 7801 contra la copia.

    Se baja antes el servidor de desarrollo: comparten puerto, y si quedara
    vivo las suites seguirían hablando con la base real sin que se note.
    """
    # Ya no hace falta bajar el servidor del equipo: son puertos distintos.
    # Se para solo lo que hubiera quedado en el 7802 de una corrida anterior.
    subprocess.run([sys.executable, SERVIDOR, "--parar"],
                   capture_output=True, text=True, encoding="utf-8",
                   errors="replace",
                   env={**os.environ, "PUERTO_SERVIDOR": str(PUERTO_BANCO)})
    carpeta = tempfile.mkdtemp(prefix="rrhh-pruebas-")
    copia = os.path.join(carpeta, "banco.db")
    shutil.copy2(BASE_REAL, copia)
    vaciar(copia)
    ENTORNO["DB_PATH"] = copia
    ENTORNO["PUERTO_SERVIDOR"] = str(PUERTO_BANCO)
    ENTORNO["URL_PRUEBAS"] = f"http://127.0.0.1:{PUERTO_BANCO}"
    sembrar_cuenta(copia)
    # El marcador de la fixtura apunta a ids de OTRA base. Si sobrevivió a una
    # ejecución que murió a media, 'montar' se niega ("ya estaba montada") y
    # las suites corren contra una copia vacía: fallan todas por la razón
    # equivocada. Cada banco es nuevo, así que el marcador viejo no vale.
    marcador = os.path.join(AQUI, "fixtura_montada.json")
    if os.path.exists(marcador):
        os.remove(marcador)
        print("marcador de fixtura anterior descartado (era de otra base)")
    proc = subprocess.Popen([sys.executable, SERVIDOR], env=ENTORNO,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not _responde():
        proc.kill()
        raise RuntimeError("el servidor de pruebas no llegó a responder en el 7801")
    print(f"banco de pruebas: {copia}")
    return proc, carpeta


def bajar_banco(proc, carpeta):
    """Se lleva el servidor y la copia. Si algo queda, no es la base real."""
    subprocess.run([sys.executable, SERVIDOR, "--parar"],
                   capture_output=True, text=True, encoding="utf-8",
                   errors="replace", env=ENTORNO)
    try:
        proc.kill()
    except Exception:
        pass
    shutil.rmtree(carpeta, ignore_errors=True)
    print("banco de pruebas retirado")


# Se desmonta ANTES de montar: si la ejecución anterior murió de golpe
# —la mató el sistema, se cerró la consola, un timeout— el 'finally' no llegó
# a correr y sus 20 fichas de prueba se quedaron dentro de la base real. Esta
# línea las barre antes de empezar, en vez de esperar a que alguien las vea
# y crea que reaparecieron solas.
def barrer_zzz():
    """Basura de pruebas que quedó en la base real.

    Todas las suites nombran lo suyo con el prefijo 'Zzz ' y lo borran al
    terminar. Cuando una revienta a mitad —o la corta un timeout— su limpieza
    no llega a correr y la fila se queda dentro. Luego la siguiente ejecución
    la cuenta y falla por algo que no tiene que ver con el código.

    Se respetan las dos cuentas de prueba del equipo: 'Zzz Prueba RRHH' y
    'Zzz Prueba Trabajador' son de verdad y deben seguir ahí.
    """
    import sqlite3
    bd = os.path.join(RAIZ, "data", "rrhh.db")
    if not os.path.exists(bd):
        return
    con = sqlite3.connect(bd)
    total = 0
    con.execute("DELETE FROM responsable_beneficiario WHERE responsable_id IN "
                "(SELECT id FROM responsables WHERE nombre LIKE 'Zzz %')")
    for tabla in ("responsables", "beneficiarios", "personal"):
        try:
            total += con.execute(
                f"DELETE FROM {tabla} WHERE nombre LIKE 'Zzz %' "
                "AND nombre NOT LIKE 'Zzz Prueba %'").rowcount
        except sqlite3.OperationalError:
            pass
    con.commit(); con.close()
    print(f"barrido previo: {total} filas de prueba que habían quedado sueltas")


# El barrido se queda como red de seguridad para las bases que quedaron
# sucias antes de este cambio. Con el banco de pruebas ya no debería
# encontrar nada nunca; si algún día encuentra algo, es que alguien volvió a
# apuntar una suite a la base real.
def guardar_el_7801():
    """
    Ninguna suite puede apuntar al 7801. Es del equipo.

    Una regla escrita en un documento no impide nada; esto sí. Si alguien
    vuelve a dejar un 7801 en una suite, la corrida se niega a empezar en
    vez de escribir en la base real y descubrirlo semanas después.

    El reparto está en PUERTOS.md: 7801 el equipo, 7802-7899 las pruebas.
    """
    culpables = []
    for f in sorted(pathlib.Path(AQUI).glob("prueba_*.*")):
        texto = f.read_text(encoding="utf-8", errors="replace")
        for n_, linea in enumerate(texto.split(chr(10)), 1):
            if "7801" not in linea:
                continue
            # La declaración con URL_PRUEBAS delante es correcta: el 7801 es
            # solo el valor por defecto para lanzar una suite a mano.
            if "URL_PRUEBAS" in linea:
                continue
            # Los comentarios pueden nombrar el puerto: lo que no puede es
            # que el código lo use. Se miran solo las líneas ejecutables.
            limpia = linea.strip()
            if limpia.startswith(("#", "//", "*", "/*")):
                continue
            if "7801" not in linea.split("//")[0].split("#")[0]:
                continue
            culpables.append(f"{f.name}:{n_}: {linea.strip()[:70]}")
    if culpables:
        print("\nLA CORRIDA NO EMPIEZA: hay suites apuntando al 7801,")
        print("que es el servidor del equipo. Ver PUERTOS.md.\n")
        for c in culpables:
            print("   ·", c)
        sys.exit(2)


import pathlib
guardar_el_7801()
barrer_zzz()

banco, carpeta = levantar_banco()
try:
    # La fixtura se monta en la COPIA. Ya no hace falta desmontarla para
    # proteger nada: la copia se borra entera al terminar. Se sigue haciendo
    # porque alguna suite comprueba que la base queda como estaba.
    fixtura("montar")
    fixtura_marcas("crear")

    # ── Cada suite arranca con el banco recién puesto ────────────────────
    # Sin esto una suite hereda lo que dejó la anterior —un rostro
    # registrado, dos marcas, una ficha editada— y falla por algo que no es
    # suyo. Pasaba de verdad: suites que pasaban sueltas fallaban
    # encadenadas, y ese número no medía el sistema, medía el orden.
    #
    # Se restaura copiando el archivo, que tarda milisegundos. Es seguro
    # porque el servidor abre y cierra la conexión en cada consulta (ver
    # db._conectar) y entre suites no hay ninguna en vuelo.
    # OJO: 'banco' es el PROCESO del servidor, no un archivo. La ruta de la
    # copia está en el entorno que se les pasa a las suites.
    BANCO_BD = ENTORNO["DB_PATH"]
    PRISTINO = os.path.join(carpeta, "banco.pristino")
    shutil.copy2(BANCO_BD, PRISTINO)

    def banco_limpio():
        for sufijo in ("-wal", "-shm"):
            resto = BANCO_BD + sufijo
            if os.path.exists(resto):
                try:
                    os.remove(resto)
                except OSError:
                    pass
        shutil.copy2(PRISTINO, BANCO_BD)

    print("\n── suites de navegador ──")
    for n in NAVEGADOR:
        banco_limpio()
        # 600 y no 300: las suites que reconocen rostros cargan 7 MB de
        # modelo y lo ejecutan en la CPU. Con 300 se cortaban a medias y
        # el corte se leía como un fallo que no era.
        correr(n, ["node", n + ".js"], 600)
finally:
    fixtura_marcas("borrar")
    fixtura("desmontar")

# El banco sigue en pie: prueba_archivos también habla con el 7801, y
# devolverle el servidor de desarrollo le daría acceso a la base real.
try:
    print("\n── suites de Python ──")
    for n in PYTHON:
        correr(n, [sys.executable, n + ".py"], 400)
finally:
    bajar_banco(banco, carpeta)

# No hay nada que devolver: el 7801 nunca se tocó. Antes esta línea
# relevantaba el servidor del equipo porque la corrida se lo había quitado.

malas = [n for n, ok, _, _ in resultados if not ok]
print(f"\n{'='*52}\n{len(resultados) - len(malas)}/{len(resultados)} suites pasan")
if malas:
    print("fallan: " + ", ".join(malas))
sys.exit(1 if malas else 0)
