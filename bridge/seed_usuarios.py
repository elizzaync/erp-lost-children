"""
Seed/migración de usuarios del sistema ERP Lost Children.
Ejecutar: python bridge/seed_usuarios.py
"""
import pymysql
import hashlib

DB = dict(host='localhost', user='root', password='', database='erp_lost_children', charset='utf8mb4')

conn = pymysql.connect(**DB)
cur  = conn.cursor()

print("── Migrando tabla usuarios_sistema ──")

# 1. Actualizar ENUM para incluir los 5 roles
try:
    cur.execute("""
        ALTER TABLE usuarios_sistema
        MODIFY rol ENUM('admin','coordinador','voluntario','kiosko','donador') DEFAULT 'voluntario'
    """)
    conn.commit()
    print("  ✓ Columna 'rol' actualizada con los 5 roles")
except Exception as e:
    print(f"  ! ENUM ya actualizado o error: {e}")
    conn.rollback()

# 2. Usuarios a sembrar
USUARIOS = [
    ('Administrador',       'admin',      'admin123',  'admin'),
    ('Coordinadora',        'coord',       'coord123',  'coordinador'),
    ('Voluntario Demo',     'voluntario',  'vol123',    'voluntario'),
    ('Kiosko Entrada',      'kiosko',      'kiosko123', 'kiosko'),
    ('Donador Demo',        'donador',     'dona123',   'donador'),
]

print("\n── Usuarios ──")
for nombre, username, password, rol in USUARIOS:
    ph = hashlib.sha256(password.encode()).hexdigest()
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

print(f"\n  Contraseñas:")
for _, username, password, _ in USUARIOS:
    print(f"  {username:<14} → {password}")

cur.close()
conn.close()
print("\n✓ Listo")
