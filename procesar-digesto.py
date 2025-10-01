import re
import json

def procesar_digesto(archivo_entrada, archivo_salida):
    """
    Lee un archivo de texto del Digesto, extrae los fragmentos con su
    numeración canónica y los guarda en un archivo JSON.

    Args:
        archivo_entrada (str): La ruta al archivo de texto del Digesto.
        archivo_salida (str): La ruta donde se guardará el archivo JSON resultante.
    """
    try:
        with open(archivo_entrada, 'r', encoding='utf-8') as f:
            contenido = f.read()
    except FileNotFoundError:
        print(f"Error: No se pudo encontrar el archivo '{archivo_entrada}'")
        print("Asegúrate de que el script y 'digesto.txt' estén en la misma carpeta.")
        return
    except Exception as e:
        print(f"Ocurrió un error al leer el archivo: {e}")
        return

    # Expresión regular para encontrar las citas del Digesto (ej. "Dig.1.1.0.")
    # y capturar todo el texto hasta la siguiente cita.
    # re.DOTALL (o re.S) hace que el '.' también coincida con saltos de línea.
    patron = re.compile(r'(Dig\.\d+\.\d+\.\d+\.?\d*)', re.DOTALL)
    
    # Dividimos el texto usando la expresión regular. El resultado es una lista
    # donde los elementos impares son las citas y los pares son los textos.
    partes = patron.split(contenido)
    
    fragmentos = []
    # Empezamos en el índice 1, ya que el primer elemento es el texto antes de la primera cita.
    for i in range(1, len(partes), 2):
        cita = partes[i].strip()
        # El texto correspondiente es el siguiente elemento en la lista.
        texto_fragmento = partes[i+1].strip()
        
        # Omitimos fragmentos vacíos que puedan resultar del parseo.
        if texto_fragmento:
            fragmentos.append({
                "cita": cita,
                "texto": texto_fragmento
            })

    # Guardar la lista de fragmentos en un archivo JSON
    try:
        with open(archivo_salida, 'w', encoding='utf-8') as f:
            # indent=4 formatea el JSON para que sea legible.
            # ensure_ascii=False permite que se guarden caracteres como tildes correctamente.
            json.dump(fragmentos, f, indent=4, ensure_ascii=False)
        print(f"¡Proceso completado! Se han guardado {len(fragmentos)} fragmentos.")
        print(f"El resultado está en el archivo: '{archivo_salida}'")
    except Exception as e:
        print(f"Ocurrió un error al escribir el archivo JSON: {e}")

# --- Ejecución del script ---
if __name__ == "__main__":
    nombre_archivo_texto = 'digesto.txt'
    nombre_archivo_json = 'digesto_completo.json'
    procesar_digesto(nombre_archivo_texto, nombre_archivo_json)