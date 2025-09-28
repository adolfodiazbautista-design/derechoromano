require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log("--- [OK] Ejecutando servidor.js v5.1 con corrección de Trust Proxy ---");

const app = express();
const port = 3000;

// --- CONFIGURACIÓN DE SEGURIDAD ---
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

const palabrasProhibidas = ['tonto', 'tonta', 'sexo', 'idiota', 'imbecil', 'puta', 'mierda', 'gilipollas', 'franco', 'hitler', 'mussolini', 'stalin', 'polla', 'picha', 'acho', 'puto', 'zorra', 'zorras', 'tetas', 'pollas', 'cabron', 'cabrón', 'teta', 'coño', 'examen', 'test'];

function validarContenido(req, res, next) {
    const { promptOriginal, termino } = req.body;
    const textoCompleto = `${promptOriginal || ''} ${termino || ''}`.toLowerCase();
    
    const esInapropiado = palabrasProhibidas.some(palabra => {
        const regex = new RegExp(`\\b${palabra}\\b`, 'i');
        return regex.test(textoCompleto);
    });

    if (esInapropiado) {
        console.warn(`Intento de consulta bloqueada por filtro manual: "${termino}"`);
        return res.status(400).json({ error: 'CONTENIDO_INAPROPIADO', message: 'La consulta contiene términos no permitidos por el filtro manual.' });
    }
    next();
}

const manualCompleto = fs.readFileSync('manual.txt', 'utf-8');
// --- LÍNEA CORREGIDA ---
// Ahora divide por cualquier salto de línea, que es como está formateado tu manual.txt
const parrafosDelManual = manualCompleto.split(/\n/); 
console.log(`Manual cargado. ${parrafosDelManual.length} párrafos encontrados.`);

const cache = new Map();
const TTL = 3600 * 1000;

function handleApiError(error, res) {
    console.error("Error desde la API de Gemini:", error.response ? error.response.data : error.message);
    if (error.response) {
        if (error.response.data?.promptFeedback?.blockReason) {
            return res.status(400).json({ error: 'CONTENIDO_INAPROPIADO', message: 'La consulta ha sido bloqueada por los filtros de seguridad de Google.' });
        }
        const errorData = error.response.data?.error;
        if (errorData) {
            if (errorData.code === 429) return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', message: 'Límite de cuota de la API excedido.' });
            if (errorData.code === 503) return res.status(503).json({ error: 'MODEL_OVERLOADED', message: 'El modelo de IA está sobrecargado.' });
        }
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Ha ocurrido un error en el servidor.' });
}

const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

function extractTextFromResponse(geminiResponse) {
    if (geminiResponse.data && geminiResponse.data.candidates && geminiResponse.data.candidates.length > 0) {
        const candidate = geminiResponse.data.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            return candidate.content.parts[0].text;
        }
    }
    return "La IA no ha podido generar una respuesta para esta consulta. Puede deberse a los filtros de seguridad. Intenta reformular la pregunta.";
}

function getContextoRelevante(termino) {
    let contexto = '';
    // La intervención específica para 'posesión' ya no es necesaria si el manual se lee correctamente.
    // El sistema ahora encontrará el párrafo correcto de forma dinámica.
    if (termino) {
        const parrafosEncontrados = parrafosDelManual.filter(p => p.toLowerCase().includes(termino.toLowerCase()));
        if (parrafosEncontrados.length > 0) { 
            contexto = parrafosEncontrados.join('\n\n');
        }
    }
    return contexto || "No se ha encontrado información relevante en el manual de referencia para esta consulta.";
}

app.post('/api/consulta', validarContenido, async (req, res) => {
    const { promptOriginal, termino } = req.body;
    const cacheKey = `consulta-${promptOriginal}-${termino}`;
    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) {
        return res.json({ respuesta: cache.get(cacheKey).data });
    }
    try {
        if (!promptOriginal) return res.status(400).json({ error: 'No se ha proporcionado un prompt.' });
        
        const contextoRelevante = getContextoRelevante(termino);
        
        let promptFinalParaIA = '';

        if (promptOriginal.includes("crear un breve supuesto de hecho")) {
            promptFinalParaIA = `Tu único rol es ser un profesor de derecho romano creando un caso práctico.
**Instrucción Inviolable:** Crea un breve supuesto de hecho (máximo 3 frases) sobre el concepto de "${termino}".
**Reglas Estrictas:**
1.  Usa personajes con nombres clásicos romanos (ej. Ticio, Cayo, Sempronio, Mevio, Livia, el esclavo Estico).
2.  Basa la lógica del caso en el siguiente contexto si es relevante: "${contextoRelevante}".
3.  Termina SIEMPRE con una o varias preguntas legales claras.
4.  NO incluyas NINGÚN tipo de explicación teórica.
5.  NO incluyas la solución.
6.  NO uses palabras como "solución", "resolvió", o "sentencia".
Crea SOLO el problema.`;
        } else {
            promptFinalParaIA = `Tu rol es ser Ulpiano, un jurista romano experto y didáctico. Para responder a la pregunta del usuario, te proporciono un 'Contexto Clave' extraído de su manual de estudio. Este texto es tu fuente de verdad principal y tiene la máxima autoridad.

**Regla de Oro (inviolable):** Tu respuesta final NUNCA debe contradecir la información o la interpretación presentada en el 'Contexto Clave'. Sé breve y didáctico. Limita tu explicación a no más de dos párrafos cortos.

Puedes usar tu conocimiento general para ampliar la información, ofrecer ejemplos o dar más detalles, siempre que enriquezcan, no contradigan la explicación del manual y mantengan la brevedad.

--- CONTEXTO CLAVE ---
${contextoRelevante}
--- FIN DEL CONTEXTO ---

Basándote en tu conocimiento y respetando siempre la Regla de Oro sobre el Contexto Clave, responde de forma concisa a la siguiente pregunta: "${termino}".

Además, tu respuesta DEBE incluir la referencia al índice del manual que te he proporcionado.`;
        }
        
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { 
            contents: [{ parts: [{ text: promptFinalParaIA }] }],
            safetySettings 
        };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaIA = extractTextFromResponse(geminiResponse);
        cache.set(cacheKey, { data: respuestaIA, timestamp: Date.now() });
        res.json({ respuesta: respuestaIA });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/buscar-fuente', validarContenido, async (req, res) => {
    const { termino } = req.body;
    const cacheKey = `fuente-${termino}`;
    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) { return res.json({ fuente: cache.get(cacheKey).data }); }
    try {
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        
        const promptParaFuente = `Tu única y OBLIGATORIA tarea es actuar como un historiador del derecho y devolver una fuente jurídica relevante para el término "${termino}". Sé conciso.
1.  Busca la fuente más directa y relevante del Corpus Iuris Civilis o Gayo.
2.  Utiliza siempre la nomenclatura académica moderna para las citas (ej: D. libro. título. fragmento; C. libro. título. ley; I. libro. título. párrafo).
3.  Tu respuesta final debe contener únicamente la cita en formato académico, el texto original en latín y su traducción al español. NO añadas explicaciones.`;

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { 
            contents: [{ parts: [{ text: promptParaFuente }] }],
            safetySettings 
        };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaFuente = extractTextFromResponse(geminiResponse);
        cache.set(cacheKey, { data: respuestaFuente, timestamp: Date.now() });
        res.json({ fuente: respuestaFuente });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/derecho-moderno', validarContenido, async (req, res) => {
    const { termino } = req.body;
    const cacheKey = `moderno-${termino}`;
    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) { return res.json({ moderno: cache.get(cacheKey).data }); }
    try {
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaModerno = `Tu rol es ser un jurista experto en Derecho Civil español. Explica de forma muy concisa (máximo dos párrafos) la equivalencia o herencia del concepto romano "${termino}" en el derecho español moderno. Si no encuentras una correspondencia, responde solo con "NULL".`;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { 
            contents: [{ parts: [{ text: promptParaModerno }] }],
            safetySettings 
        };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaModerno = extractTextFromResponse(geminiResponse);
        cache.set(cacheKey, { data: respuestaModerno, timestamp: Date.now() });
        res.json({ moderno: respuestaModerno });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.listen(port, () => {
    console.log(`Servidor de Derecho Romano escuchando en http://localhost:${port}`);
});