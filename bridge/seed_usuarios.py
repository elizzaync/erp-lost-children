"""
Seed/migración de usuarios del sistema ERP Lost Children.
Ejecutar: python bridge/seed_usuarios.py

Genera una contraseña aleatoria por usuario en cada ejecución (no hay
contraseñas fijas en el código) y la hashea con el mismo esquema que usa
server.py para verificar login (PBKDF2-HMAC-SHA256, formato
"pbkdf2$salt$hash"). Las contraseñas generadas se imprimen UNA sola vez al
final para que quien ejecute el script las anote — no quedan guardadas en
ningún archivo.
"""
import pymysql
import hashlib
import secrets

from config import db_config

DB = db_config()


def _hash_password(password):
    """Debe coincidir exactamente con _hash_password() de bridge/server.py."""
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"pbkdf2${salt}${h.hex()}"


def _generar_password():
    return secrets.token_urlsafe(9)  # ~12 caracteres, aleatorio por ejecución


conn = pymysql.connect(**DB)
cur  = conn.cursor()

print("── Migrando tabla usuarios_sistema ──")

# 1. Actualizar ENUM para incluir los 3 roles
try:
    cur.execute("""
        ALTER TABLE usuarios_sistema
        MODIFY rol ENUM('admin','coordinador','voluntario') DEFAULT 'voluntario'
    """)
    conn.commit()
    print("  ✓ Columna 'rol' actualizada con los 3 roles")
except Exception as e:
    print(f"  ! ENUM ya actualizado o error: {e}")
    conn.rollback()

# 2. Usuarios a sembrar (nombre, username, rol) — la contraseña se genera al vuelo
USUARIOS = [
    ('Administrador',    'admin',       'admin'),
    ('Coordinadora',     'coord',       'coordinador'),
    ('Voluntario Demo',  'voluntario',  'voluntario'),
]

print("\n── Usuarios ──")
passwords_generadas = []
for nombre, username, rol in USUARIOS:
    password = _generar_password()
    passwords_generadas.append((username, password))
    ph = _hash_password(password)
    # Actualizar si existe, insertar si no
    cur.execute("SELECT id FROM usuarios_sistema WHERE username=%s", (username,))
    existing = cur.fetchone()
    if existing:
        cur.execute(
            "UPDATE usuarios_sistema SET nombre=%s, password_hash=%s, rol=%s, activo=1 WHERE username=%s",
            (nombre, ph, rol, username)
        )
        print(f"  ~ actualizado: {username} ({rol})")
    else:
        cur.execute(
            "INSERT INTO usuarios_sistema (nombre, username, password_hash, rol, activo) VALUES (%s,%s,%s,%s,1)",
            (nombre, username, ph, rol)
        )
        print(f"  + creado:      {username} ({rol})")

conn.commit()

# 3. Verificar resultado
print("\n── Usuarios en el sistema ──")
cur.execute("SELECT id, nombre, username, rol, activo FROM usuarios_sistema ORDER BY id")
for row in cur.fetchall():
    estado = "activo" if row[4] else "inactivo"
    print(f"  [{row[0]}] {row[2]:<14} {row[3]:<14} {row[1]} ({estado})")

print(f"\n  Contraseñas generadas ahora (anótalas, no se guardan en ningún archivo):")
for username, password in passwords_generadas:
    print(f"  {username:<14} → {password}")
print("\n  Recomendado: pide a cada usuario que la cambie en su primer login.")

cur.close()
conn.close()
print("\n✓ Listo")
