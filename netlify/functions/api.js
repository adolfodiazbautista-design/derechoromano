// Este es el "intermediario" que se ejecuta en Netlify.
// Su trabajo es recibir peticiones del frontend y reenviarlas de forma segura al backend en Render.

// Requerimos 'node-fetch' para hacer llamadas HTTP desde esta función.
// Tendrás que añadirlo a tu package.json con: npm install node-fetch
const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  // Solo permitimos peticiones POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // El cuerpo de la petición que nos envía el frontend
    const { endpoint, payload } = JSON.parse(event.body);

    // La URL real de tu backend, que ahora está protegida como una variable de entorno
    const REAL_BACKEND_URL = process.env.REAL_BACKEND_URL;

    if (!REAL_BACKEND_URL) {
      throw new Error("La URL del backend no está configurada en las variables de entorno de Netlify.");
    }
    
    // Validamos que el endpoint sea uno de los permitidos
    const allowedEndpoints = ['consulta', 'buscar-fuente', 'derecho-moderno'];
    if (!allowedEndpoints.includes(endpoint)) {
      return { statusCode: 400, body: 'Endpoint no válido' };
    }

    // Hacemos la llamada al backend real (en Render)
    const response = await fetch(`${REAL_BACKEND_URL}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Recogemos la respuesta del backend
    const data = await response.json();

    // Devolvemos la respuesta del backend al frontend
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Error en la función proxy de Netlify:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno en el proxy.' }),
    };
  }
};