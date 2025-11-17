require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; 
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Variables globales para almacenar los datos
let manualJson = [];
let indiceJson = [];
let digestoJson = []; 

// --- CONFIGURACIÓN DE MIDDLEWARE Y SEGURIDAD ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet());
app.set('trust proxy', 1);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos.' }
});
app.use('/api/', limiter);

// --- FUNCIONES DE UTILIDAD Y LÓGICA DE API ---
function handleApiError(error, res) {
    console.error("Error definitivo desde la API de Gemini:", error.response ? error.response.data : error.message);
    if (error.response?.data?.error?.code === 503) {
        return res.status(503).json({ error: 'MODEL_OVERLOADED', message: 'Ulpiano parece estar desbordado. Por favor, dale un minuto y vuelve a intentarlo.' });
    }
    // Mensaje de timeout modificado para que refleje la causa más probable
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return res.status(504).json({ error: 'REQUEST_TIMEOUT', message: 'La solicitud ha tardado demasiado tiempo. El servidor ha abortado la conexión. Por favor, inténtalo de nuevo.' });
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Ha ocurrido un error en el servidor o al comunicarse con la IA.' });
}

const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

async function callGeminiWithRetries(payload) {
    const MAX_RETRIES = 3;
    let RETRY_DELAY = 1000;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("API Key de Gemini no encontrada.");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // TIMEOUT AUMENTADO A 4 MINUTOS 50 SEGUNDOS
            const geminiResponse = await axios.post(url, payload, { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 290000 
            }); 

            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return geminiResponse.data.candidates[0].content.parts[0].text;
            }
            throw new Error('Respuesta de la IA inválida o vacía.');
        } catch (error) {
            if (error.response?.status === 503 && attempt < MAX_RETRIES) {
                console.log(`Intento ${attempt} fallido (Modelo Sobrecargado). Reintentando en ${RETRY_DELAY / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                RETRY_DELAY *= 2;
            } else {
                throw error;
            }
        }
    }
}

function getContextoRelevante(termino) {
    if (!termino) return '';
    const terminoBusqueda = termino.toLowerCase().trim();
    
    // *** CAMBIO: Se mantiene la excepción de POSESIÓN (V15.14) ***
    if (terminoBusqueda.includes('posesion') || terminoBusqueda.includes('interdictos')) {
        return `En Roma había dos clases de posesión: natural (solo corpus) y civil (corpus y animus domini) AMBAS FORMAS DE POSESIÓN TENÍAN PROTECCIÓN INTERDICTAL. Había una serie de casos, llamados "detentadores" (por ejemplo los arrendatarios) que, por razones desconocidas, no tenían protección de los interdictos.`;
    }

    const encontrado = manualJson.find(item => item.termino.toLowerCase() === terminoBusqueda) ||
                     manualJson.find(item => item.sinonimos?.some(s => s.toLowerCase() === terminoBusqueda)) ||
                     manualJson.find(item => item.termino.toLowerCase().includes(terminoBusqueda));
    return encontrado ? encontrado.definicion : '';
}

const buscarDigesto = (term) => {
    if (!term || !digestoJson.length) {
        return [];
    }

    const termLower = term.toLowerCase().trim();
    const matches = [];
    const maxMatches = 3; 

    for (const entry of digestoJson) {
        if (entry.texto_espanol && entry.texto_espanol.toLowerCase().includes(termLower)) {
            matches.push({
                cita: entry.cita,
                latin: entry.texto_latin.trim(),
                espanol_original: entry.texto_espanol.trim()
            });
            if (matches.length >= maxMatches) { 
                break; 
            }
        }
    }
    return matches;
};


// --- ENDPOINTS DE LA API ---

// *** CAMBIO: Este endpoint ahora solo maneja el Laboratorio de Casos (generar y resolver) ***
app.post('/api/consulta', async (req, res) => {
    try {
        // *** CAMBIO: Se recibe 'tipo' en lugar de 'promptOriginal' ***
        const { tipo, termino, currentCaseText } = req.body;
        if (!tipo) return res.status(400).json({ error: 'No se ha proporcionado un tipo de consulta.' });

        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        
        const contextoFinal = getContextoRelevante(terminoNormalizado);

        let promptFinalParaIA;

        // *** CAMBIO: La lógica se basa en 'tipo' ***
        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'No se proporcionó texto del caso a resolver.' });
             
             // *** CAMBIO: Prompt modificado para respuesta CONCISA (petición del usuario) ***
             promptFinalParaIA = `Rol: Juez romano. Tarea: Resolver el caso "${currentCaseText}" aplicando principios del derecho romano. 
Instrucciones: **Solución legal MUY BREVE, DIRECTA Y CONCISA (máximo 2-3 frases).** Ve directo a la acción legal, principio o solución. Sin saludos ni explicaciones largas.
Basa tu solución en este contexto si es relevante: "${contextoFinal}".`;

        } else if (tipo === 'generar') {
            if (!termino) return res.status(400).json({ error: 'No se proporcionó término para generar el caso.' });
            promptFinalParaIA = `Rol: Profesor de derecho romano. Tarea: Crear un caso práctico (máx 3 frases) sobre "${termino}". Reglas: Nombres romanos. Terminar con preguntas legales. Sin explicaciones ni soluciones. Basar lógica en: "${contextoFinal}".`;
        
        } else {
            // Si el 'tipo' no es 'resolver' o 'generar', es un error para este endpoint.
            return res.status(400).json({ error: 'Tipo de consulta no válido para este endpoint.' });
        }

        const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }], safetySettings };
        
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA }); 
        
    } catch (error) {
        handleApiError(error, res);
    }
});


// *** CAMBIO: Se mantiene /api/derecho-moderno por si se usa en otro lugar, pero UlpianoIA ya no lo llama. ***
app.post('/api/derecho-moderno', async (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaModerno = `Explica muy concisamente (máx un párrafo) la herencia del concepto romano "${termino}" en el derecho español moderno.`;
        
        const payload = { contents: [{ parts: [{ text: promptParaModerno }] }], safetySettings };
        const respuestaModerno = await callGeminiWithRetries(payload);
        res.json({ moderno: respuestaModerno });
    } catch (error) {
        handleApiError(error, res);
    }
});

// *** CAMBIO: Lógica de búsqueda extraída a una función reutilizable ***
function buscarPagina(termino) {
    if (!termino) return { pagina: null, titulo: null };

    const terminoLower = termino.toLowerCase().trim();
    let mejorCoincidencia = null;
    let maxPuntuacion = 0;

    indiceJson.forEach(tema => {
        let puntuacionActual = 0;
        if (tema.palabrasClave.some(p => p.toLowerCase() === terminoLower)) puntuacionActual += 10;
        if (tema.titulo.toLowerCase().includes(terminoLower)) puntuacionActual += 5;
        if (tema.palabrasClave.some(p => p.toLowerCase().includes(terminoLower))) puntuacionActual += 3;

        if (puntuacionActual > maxPuntuacion) {
            maxPuntuacion = puntuacionActual;
            mejorCoincidencia = tema;
        }
    });

    return { pagina: mejorCoincidencia?.pagina || null, titulo: mejorCoincidencia?.titulo || null };
}

// *** CAMBIO: El endpoint /api/buscar-pagina ahora usa la función helper ***
app.post('/api/buscar-pagina', (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });

        const result = buscarPagina(termino);
        res.json(result);

    } catch (error) {
        console.error("Error en /api/buscar-pagina:", error);
        res.status(500).json({ error: 'Error interno del servidor al buscar la página.' });
    }
});

// *** CAMBIO: NUEVO ENDPOINT para optimizar UlpianoIA (Coste y Velocidad) ***
app.post('/api/consulta-unificada', async (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });

        const terminoNormalizado = termino.toLowerCase().trim();

        // 1. Obtener Contexto del Manual (incluye regla de posesión)
        const contextoManual = getContextoRelevante(terminoNormalizado);
        
        // 2. Obtener Citas del Digesto
        const coincidenciasDigesto = buscarDigesto(termino);
        let digestoPrompt = "";
        
        if (coincidenciasDigesto.length > 0) {
            digestoPrompt = "\n\n--- FUENTE ADICIONAL: DIGESTO DE JUSTINIANO ---\n" +
                            "He encontrado las siguientes citas del Digesto. Tu tarea es:\n" +
                            "1. **SELECCIONAR LA ÚNICA CITA MÁS RELEVANTE Y ACADÉMICA.** Debes **PRIORIZAR DE FORMA EXTREMA** la cita cuyo texto latín se parezca más a una **DEFINICIÓN JURÍDICA FUNDAMENTAL** del concepto (ej: una cita con las palabras 'ius est', 'salva rerum substantia', 'actio est'). **ADVERTENCIA:** Si seleccionas una cita de un caso práctico, interdicto, o que solo menciona el término tangencialmente, el resultado será considerado erróneo. Prioriza la que contenga la DEFINICIÓN CLÁSICA.\n" +
                            "2. Realizar una **traducción al español profesional y mejorada** del texto latino de la cita seleccionada (la traducción que acompaño es de baja calidad y no sirve).\n" +
                            "3. Incluir la cita seleccionada (referencia, latín y tu traducción profesional) en la respuesta final, **destacándola** con el formato `# APUNTE DE ULPIANOIA: IUS ROMANUM #` justo antes de tu conclusión. **IGNORA las citas no seleccionadas**.\n\n";
            
            coincidenciasDigesto.forEach((match, index) => {
                digestoPrompt += `--- Cita ${index + 1} (${match.cita}) ---\n`;
                digestoPrompt += `TEXTO LATÍN: "${match.latin}"\n`;
                digestoPrompt += `TRADUCCIÓN ORIGINAL POBRE (IGNORAR): "${match.espanol_original}"\n\n`;
            });
        }

        // 3. Obtener Página del Manual
        const infoPagina = buscarPagina(termino);

        // 4. Construir el Master-Prompt para Gemini
        const promptFinalParaIA = `
Rol: Jurista Ulpiano (experto didáctico en Derecho Romano).
Tarea: Proporcionar información sobre el término "${termino}".
Contexto de Referencia (Manual): "${contextoManual}". Si está vacío, usa tu conocimiento general.
${digestoPrompt} // Instrucciones del Digesto (si las hay)

--- INSTRUCCIONES DE FORMATO DE SALIDA ---
Debes responder *exactamente* con un objeto JSON. No incluyas "'''json" o cualquier otro texto antes o después del objeto.
El formato debe ser:
{
  "respuesta_principal": "Tu explicación breve y didáctica del concepto (máximo DOS PÁRRAFOS cortos). No uses saludos, ve directo al concepto. Si encontraste una cita del Digesto relevante, inclúyela aquí con el formato '# APUNTE DE ULPIANOIA: IUS ROMANUM #'.",
  "conexion_moderna": "Tu explicación muy concisa (máximo un párrafo) de la herencia del concepto romano '${termino}' en el derecho español moderno."
}
`.trim();

        const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }], safetySettings };
        
        // 5. Llamar a Gemini (UNA SOLA VEZ)
        const respuestaIA = await callGeminiWithRetries(payload);
        
        // 6. Parsear la respuesta JSON de Gemini
        let jsonRespuesta;
        try {
            // Limpiar la respuesta de Gemini por si incluye ```json
            const cleanResponse = respuestaIA.replace(/```json/g, '').replace(/```/g, '').trim();
            jsonRespuesta = JSON.parse(cleanResponse);
        } catch (e) {
            console.error("Error al parsear JSON de Gemini:", respuestaIA);
            throw new Error('La IA no devolvió un JSON válido. Respuesta recibida: ' + respuestaIA);
        }
        
        // 7. Enviar la respuesta unificada al frontend
        res.json({
            respuesta: jsonRespuesta.respuesta_principal,
            moderno: jsonRespuesta.conexion_moderna,
            pagina: infoPagina.pagina, // Se añade la info de la página
            titulo: infoPagina.titulo   // Se añade el título del tema
        });

    } catch (error) {
        handleApiError(error, res);
    }
});


// --- FUNCIÓN DE ARRANQUE DEL SERVIDOR ---
const startServer = async () => {
    try {
        const manualData = await fs.readFile('manual.json', 'utf-8');
        manualJson = JSON.parse(manualData);
        console.log(`✓ Manual JSON cargado: ${manualJson.length} conceptos.`);

        const indiceData = await fs.readFile('indice.json', 'utf-8');
        indiceJson = JSON.parse(indiceData);
        console.log(`✓ Índice JSON cargado: ${indiceJson.length} temas.`);

        const digestoData = await fs.readFile('digesto_traducido_final.json', 'utf-8');
        digestoJson = JSON.parse(digestoData);
        console.log(`✓ Digesto JSON cargado: ${digestoJson.length} citas.`);
        
        const server = app.listen(port, () => {
            console.log(`🚀 Servidor de Derecho Romano escuchando en http://localhost:${port}`);
        });
        
        // CONFIGURACIÓN V15.13: Timeout máximo para la aplicación (5 minutos)
        server.timeout = 300000; 
        console.log("⏱️ Server Timeout ajustado a 300 segundos (5 minutos)."); 

    } catch (error) {
        console.error("✗ Error fatal durante el arranque del servidor:", error);
        process.exit(1); 
    }
};

console.log("--- [OK] Ejecutando servidor.js v15.14 (Regla de Posesión y Interdictos Asegurada) ---");
startServer();