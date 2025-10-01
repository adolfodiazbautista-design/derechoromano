import re
import json
import time
from deep_translator import GoogleTranslator

def traducir_texto(texto):
    """
    Traduce un texto de latín a español usando deep-translator.
    """
    if not texto or not texto.strip():
        return ""
    try:
        # La llamada con esta librería es más directa
        return GoogleTranslator(source='la', target='es').translate(texto)
    except Exception as e:
        print(f"  -> Error al traducir: {e}")
        return "[TRADUCCIÓN FALLIDA]"

def procesar_y_traducir_digesto(archivo_entrada, archivo_salida):
    """
    Lee el Digesto en latín, lo procesa y lo traduce al español,
    guardando el resultado en un archivo JSON.
    """
    try:
        with open(archivo_entrada, 'r', encoding='utf-8') as f:
            contenido = f.read()
    except FileNotFoundError:
        print(f"Error: No se pudo encontrar el archivo '{archivo_entrada}'")
        return

    patron = re.compile(r'(Dig\.\d+\.\d+\.\d+\.?\d*)', re.DOTALL)
    partes = patron.split(contenido)
    
    fragmentos_traducidos = []
    
    total_fragmentos = (len(partes) - 1) // 2
    print(f"Se encontraron {total_fragmentos} fragmentos. Iniciando traducción...")
    print("-" * 30)

    for i in range(1, len(partes), 2):
        cita = partes[i].strip()
        texto_latin = partes[i+1].strip()
        
        num_actual = (i // 2) + 1
        print(f"Procesando fragmento {num_actual}/{total_fragmentos}: {cita}")

        if texto_latin:
            texto_espanol = traducir_texto(texto_latin)
            
            fragmentos_traducidos.append({
                "cita": cita,
                "texto_latin": texto_latin,
                "texto_espanol": texto_espanol
            })
            # Pequeña pausa para no saturar el servicio de traducción
            time.sleep(0.5) 

    try:
        with open(archivo_salida, 'w', encoding='utf-8') as f:
            json.dump(fragmentos_traducidos, f, indent=4, ensure_ascii=False)
        print("-" * 30)
        print(f"¡Proceso completado!")
        print(f"El resultado está en el archivo: '{archivo_salida}'")
    except Exception as e:
        print(f"Ocurrió un error al escribir el archivo JSON: {e}")

# --- Ejecución del script ---
if __name__ == "__main__":
    nombre_archivo_texto = 'digesto.txt'
    nombre_archivo_json = 'digesto_traducido_final.json'
    procesar_y_traducir_digesto(nombre_archivo_texto, nombre_archivo_json)