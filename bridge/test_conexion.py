"""
Diagnóstico de conexión ZKTeco SF420
Corre con:  python bridge/test_conexion.py --ip 192.168.1.200
"""
import argparse, socket, sys, time

def test_ping_tcp(ip, port=4370, timeout=5):
    print(f"\n[1] Probando TCP {ip}:{port} …", end=" ", flush=True)
    try:
        s = socket.create_connection((ip, port), timeout=timeout)
        s.close()
        print("✓ Puerto accesible")
        return True
    except ConnectionRefusedError:
        print("✗ Conexión rechazada (dispositivo rechaza el puerto)")
        return False
    except socket.timeout:
        print("✗ Timeout (dispositivo no responde o IP incorrecta)")
        return False
    except OSError as e:
        print(f"✗ Error de red: {e}")
        return False

def test_pyzk(ip, port=4370, password=0, timeout=5):
    print(f"\n[2] Probando pyzk ZK({ip}, {port}) …")
    try:
        from zk import ZK
    except ImportError:
        print("   ✗ pyzk no instalado → pip install pyzk")
        return

    zk = ZK(ip, port=port, timeout=timeout, password=password, force_udp=False, ommit_ping=True)
    conn = None
    try:
        print("   Conectando…", end=" ", flush=True)
        conn = zk.connect()
        print("✓ Conectado")

        info = conn.get_firmware_version()
        print(f"   Firmware: {info}")

        usuarios = conn.get_users()
        print(f"   Usuarios enrollados: {len(usuarios)}")

        conn.enable_device()
        conn.disconnect()
        print("\n✓ Todo OK — el bridge debería funcionar correctamente.")

    except Exception as e:
        print(f"\n✗ Error pyzk: {type(e).__name__}: {e}")
        print("\n── Posibles causas ────────────────────────────────────")
        msg = str(e).lower()
        if "timeout" in msg or "timed out" in msg:
            print("  • IP incorrecta o dispositivo apagado")
            print("  • Firewall bloqueando puerto 4370")
            print("  • El SF420 tiene TCP/IP deshabilitado (Menú → Comm → Ethernet → ON)")
        elif "password" in msg or "contraseña" in msg:
            print("  • Contraseña del dispositivo incorrecta")
            print("  • Prueba con --password 0  (sin contraseña)")
        elif "refused" in msg:
            print("  • El puerto 4370 está cerrado en el dispositivo")
            print("  • Verifica en Menú → Comm → puerto = 4370")
        else:
            print(f"  • Error desconocido: {e}")
        print("────────────────────────────────────────────────────────")
    finally:
        try:
            if conn: conn.disconnect()
        except Exception:
            pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ip",       required=True,      help="IP del SF420")
    parser.add_argument("--port",     default=4370, type=int)
    parser.add_argument("--password", default=0,    type=int)
    args = parser.parse_args()

    print(f"=== Diagnóstico ZKTeco SF420 → {args.ip}:{args.port} ===")
    tcp_ok = test_ping_tcp(args.ip, args.port)
    if tcp_ok:
        test_pyzk(args.ip, args.port, args.password)
    else:
        print("\n── Qué revisar en el SF420 ────────────────────────────")
        print("  1. Menú → Comm → Ethernet → asegúrate que esté ON")
        print("  2. Menú → Comm → IP Address → anota la IP exacta")
        print("  3. Menú → Comm → Puerto → debe ser 4370")
        print("  4. Desde esta PC: ping " + args.ip)
        print("────────────────────────────────────────────────────────")
