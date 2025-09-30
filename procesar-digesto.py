import re
import json

def procesar_digesto(input_file='digest.txt', output_file='digest.json'):
    """
    Lee un archivo de texto del Digesto codificado en UTF-16-LE (Little Endian),
    agrupa los fragmentos y lo guarda como un archivo JSON en UTF-8.
    """
    print(f"○ Iniciando el procesamiento de '{input_file}'...")
    MAX_LENGTH = 8000 # Límite de caracteres por fragmento.

    try:
        # ✅ LA CORRECCIÓN FINAL: Especificar 'utf-16-le' para leer sin necesitar el BOM.
        with open(input_file, 'r', encoding='utf-16-le') as f:
            lineas = f.readlines()
    except FileNotFoundError:
        print(f"✗ ERROR: No se encontró el archivo '{input_file}'.")
        return
    except Exception as e:
        print(f"✗ ERROR: No se pudo leer el archivo. Causa: {e}")
        return

    fragmentos = []
    fragmento_actual = []
    
    regex_cita = re.compile(r'^D\.\s*[\d\w]', re.IGNORECASE)

    for linea in lineas:
        linea_limpia = linea.strip()
        if not linea_limpia:
            continue

        if regex_cita.match(linea_limpia):
            if fragmento_actual:
                texto_completo = '\n'.join(fragmento_actual)
                if len(texto_completo) > MAX_LENGTH:
                    texto_completo = texto_completo[:MAX_LENGTH] + "\n\n[FRAGMENTO TRUNCADO]"
                fragmentos.append(texto_completo)
            fragmento_actual = [linea_limpia]
        elif fragmento_actual:
            fragmento_actual.append(linea_limpia)

    if fragmento_actual:
        texto_completo = '\n'.join(fragmento_actual)
        if len(texto_completo) > MAX_LENGTH:
            texto_completo = texto_completo[:MAX_LENGTH] + "\n\n[FRAGMENTO TRUNCADO]"
        fragmentos.append(texto_completo)

    print(f"✓ Se han procesado y agrupado {len(fragmentos)} fragmentos.")

    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(fragmentos, f, ensure_ascii=False, indent=2)
        print(f"✓ Archivo '{output_file}' creado con éxito.")
    except Exception as e:
        print(f"✗ ERROR: No se pudo escribir el archivo JSON. Causa: {e}")

if __name__ == "__main__":
    procesar_digesto()