import sys

def diagnosticar_archivo(filename='digest.txt', num_bytes=300):
    """
    Lee los primeros bytes de un archivo y los imprime en varios formatos
    para un diagnóstico profundo de la codificación y el formato.
    """
    print(f"--- INICIANDO DIAGNÓSTICO PROFUNDO DE '{filename}' ---")

    try:
        with open(filename, 'rb') as f:
            bytes_iniciales = f.read(num_bytes)
    except FileNotFoundError:
        print(f"✗ ERROR: No se encontró el archivo '{filename}'.")
        return

    print(f"\n[1] Primeros {num_bytes} bytes en formato HEXADECIMAL:")
    for i in range(0, len(bytes_iniciales), 16):
        linea_bytes = bytes_iniciales[i:i+16]
        hex_repr = ' '.join(f'{b:02x}' for b in linea_bytes)
        ascii_repr = ''.join(chr(b) if 32 <= b <= 126 else '.' for b in linea_bytes)
        print(f'{i:08x}: {hex_repr:<48} |{ascii_repr}|')

    print("\n[2] Intentando decodificar los primeros bytes con diferentes codificaciones:")
    codificaciones_a_probar = ['utf-8', 'utf-8-sig', 'utf-16', 'utf-16-le', 'latin-1', 'cp1252']
    for enc in codificaciones_a_probar:
        try:
            texto_decodificado = bytes_iniciales.decode(enc)
            print(f"  ✓ Como '{enc}': {repr(texto_decodificado[:100])}...")
        except UnicodeDecodeError:
            print(f"  ✗ Fallo al decodificar como '{enc}'.")

    print(f"\n--- FIN DEL DIAGNÓSTICO ---")

if __name__ == "__main__":
    diagnosticar_archivo()