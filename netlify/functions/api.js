// Versión simplificada del proxy que funciona con la regla de redirección de Netlify.

exports.handler = async function (event) {
  // La URL real de tu backend, que sigue protegida como variable de entorno.
  const REAL_BACKEND_URL = process.env.REAL_BACKEND_URL;
  
  // Extraemos la parte final de la ruta (ej: "consulta", "buscar-fuente").
  const endpoint = event.path.split('/').pop();

  if (!REAL_BACKEND_URL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'URL del backend no configurada.' }) };
  }

  try {
    // Usamos 'fetch' nativo para hacer la llamada al backend real.
    const response = await fetch(`${REAL_BACKEND_URL}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Pasamos el cuerpo de la petición original directamente.
      body: event.body 
    });

    // Leemos la respuesta del backend como texto para evitar errores si no es JSON.
    const data = await response.text();

    // Devolvemos la respuesta y el estado tal cual nos lo dio el backend.
    return {
      statusCode: response.status,
      // Nos aseguramos de que la cabecera indique que la respuesta es JSON.
      headers: { 'Content-Type': 'application/json' },
      body: data,
    };

  } catch (error) {
    console.error('Error en la función proxy de Netlify:', error);
    return {
      statusCode: 502, // 502 Bad Gateway es más apropiado aquí
      body: JSON.stringify({ error: 'El proxy no pudo conectar con el servidor backend.' }),
    };
  }
};