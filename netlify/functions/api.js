// Versión simplificada del proxy que usa el 'fetch' nativo.

exports.handler = async function (event) {
  // Solo permitimos peticiones POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { endpoint, payload } = JSON.parse(event.body);
    const REAL_BACKEND_URL = process.env.REAL_BACKEND_URL;

    if (!REAL_BACKEND_URL) {
      throw new Error("Variable de entorno REAL_BACKEND_URL no configurada en Netlify.");
    }
    
    const allowedEndpoints = ['consulta', 'buscar-fuente', 'derecho-moderno'];
    if (!allowedEndpoints.includes(endpoint)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Endpoint no válido' }) };
    }

    const response = await fetch(`${REAL_BACKEND_URL}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Error en la función proxy de Netlify:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno en la función proxy.' }),
    };
  }
};