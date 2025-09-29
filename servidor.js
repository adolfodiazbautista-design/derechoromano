require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log("--- [OK] Ejecutando servidor.js v6.1 con reintentos automáticos ---");

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
const parrafosDelManual = manualCompleto.split(/\n/);
console.log(`Manual cargado. ${parrafosDelManual.length} párrafos encontrados.`);

const cache = new Map();
const TTL = 3600 * 1000;

function handleApiError(error, res) {
    console.error("Error definitivo desde la API de Gemini:", error.response ? error.response.data : error.message);
    if (error.response) {
        if (error.response.data?.promptFeedback?.blockReason) {
            return res.status(400).json({ error: 'CONTENIDO_INAPROPIADO', message: 'La consulta ha sido bloqueada por los filtros de seguridad de Google.' });
        }
        const errorData = error.response.data?.error;
        if (errorData) {
            if (errorData.code === 429) return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', message: 'Límite de cuota de la API excedido.' });
            if (errorData.code === 503) return res.status(503).json({ error: 'MODEL_OVERLOADED', message: 'Ulpiano parece estar desbordado por el trabajo en este momento (el modelo de IA está sobrecargado). Por favor, dale un minuto de descanso y vuelve a intentarlo.' });
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

async function callGeminiWithRetries(payload) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500; // 1.5 segundos
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
            
            if (geminiResponse.data && geminiResponse.data.candidates && geminiResponse.data.candidates.length > 0) {
                const candidate = geminiResponse.data.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    return candidate.content.parts[0].text;
                }
            }
            // Si la respuesta es válida pero no tiene candidatos (ej. por filtros de seguridad)
            throw new Error('Respuesta de la IA inválida o vacía.');

        } catch (error) {
            // Si el error es 503 (sobrecargado) Y no es el último intento, esperamos y reintentamos
            if (error.response && error.response.status === 503 && attempt < MAX_RETRIES) {
                console.log(`Intento ${attempt} fallido (Modelo Sobrecargado). Reintentando en ${RETRY_DELAY / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            } else {
                // Si es otro error o el último intento, lanzamos el error para que lo maneje handleApiError
                throw error;
            }
        }
    }
}


function getContextoRelevante(termino) {
    let contexto = '';
    if (termino && termino.toLowerCase().includes('posesión')) {
        console.log("Consulta específica sobre 'posesión' detectada. Usando contexto manual forzado.");
        contexto = `Hay dos clases de posesión, natural y civil. La natural es la mera tenencia (corpus) y en la civil se añade el animus domini. AMBAS FORMAS DE POSESIÓN, NATURAL Y CIVIL, ESTABAN PROTEGIDAS POR INTERDICTOS. En cambio los detentadores (ciertos poseedores naturales como por ejemplo los arrendatarios) carecían de la protección interdictal.`;
    } else if (termino) {
        const parrafosEncontrados = parrafosDelManual.filter(p => p.toLowerCase().includes(termino.toLowerCase()));
        if (parrafosEncontrados.length > 0) { 
            contexto = parrafosEncontrados.join('\n\n');
        }
    }
    return contexto;
}

app.post('/api/consulta', validarContenido, async (req, res) => {
    try {
        const { promptOriginal, termino, currentCaseText } = req.body;
        const cacheKey = `consulta-${promptOriginal}-${termino}-${currentCaseText}`;
        if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) {
            return res.json({ respuesta: cache.get(cacheKey).data });
        }
        
        if (!promptOriginal) return res.status(400).json({ error: 'No se ha proporcionado un prompt.' });
        
        const contextoRelevante = getContextoRelevante(termino);
        
        let promptFinalParaIA = '';

        if (currentCaseText) {
            promptFinalParaIA = `Tu único rol es ser un juez romano dictando una solución concisa para un caso.
**Instrucción Inviolable:** Tu tarea es resolver el siguiente caso práctico, aplicando los principios del derecho romano a los hechos presentados: "${currentCaseText}".
**Reglas Estrictas:**
1.  **NO** des una introducción teórica sobre los conceptos.
2.  Ve **directamente al grano**: analiza las acciones legales de cada personaje y responde a las preguntas del caso.
3.  Basa tu solución en el siguiente contexto del manual si es relevante: "${contextoRelevante}".
4.  Tu respuesta debe ser una solución legal al caso, no una lección de historia.`;
        } else if (promptOriginal.includes("crear un breve supuesto de hecho")) {
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
${contextoRelevante || "Sin contexto específico del manual para esta consulta."}
--- FIN DEL CONTEXTO ---
Basándote en tu conocimiento y respetando siempre la Regla de Oro sobre el Contexto Clave, responde de forma concisa a la siguiente pregunta: "${termino}".
Si encuentras un concepto relevante en el índice del manual, finaliza tu respuesta mencionando la página correspondiente, pero no comentes sobre si lo encuentras o no.`;
        }

        const payload = { 
            contents: [{ parts: [{ text: promptFinalParaIA }] }],
            safetySettings 
        };

        const respuestaIA = await callGeminiWithRetries(payload);
        
        cache.set(cacheKey, { data: respuestaIA, timestamp: Date.now() });
        res.json({ respuesta: respuestaIA });

    } catch (error) {
        handleApiError(error, res);
    }
});

// Las rutas /api/buscar-fuente y /api/derecho-moderno seguirán un patrón similar
// utilizando callGeminiWithRetries para ser más robustas.

app.post('/api/buscar-fuente', validarContenido, async (req, res) => {
    try {
        const { termino } = req.body;
        const cacheKey = `fuente-${termino}`;
        if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) { return res.json({ fuente: cache.get(cacheKey).data }); }
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        
        const promptParaFuente = `Tu única y OBLIGATORIA tarea es actuar como un historiador del derecho y devolver una fuente jurídica relevante para el término "${termino}". Sé conciso.
1.  Busca la fuente más directa y relevante del Corpus Iuris Civilis o Gayo.
2.  Utiliza siempre la nomenclatura académica moderna para las citas (ej: D. libro. título. fragmento; C. libro. título. ley; I. libro. título. párrafo).
3.  Tu respuesta final debe contener únicamente la cita en formato académico, el texto original en latín y su traducción al español. NO añadas explicaciones.`;

        const payload = { 
            contents: [{ parts: [{ text: promptParaFuente }] }],
            safetySettings 
        };
        const respuestaFuente = await callGeminiWithRetries(payload);
        cache.set(cacheKey, { data: respuestaFuente, timestamp: Date.now() });
        res.json({ fuente: respuestaFuente });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/derecho-moderno', validarContenido, async (req, res) => {
    try {
        const { termino } = req.body;
        const cacheKey = `moderno-${termino}`;
        if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) { return res.json({ moderno: cache.get(cacheKey).data }); }
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaModerno = `Tu rol es ser un jurista experto en Derecho Civil español. Explica de forma muy concisa (máximo dos párrafos) la equivalencia o herencia del concepto romano "${termino}" en el derecho español moderno. Si no encuentras una correspondencia, responde solo con "NULL".`;
        
        const payload = { 
            contents: [{ parts: [{ text: promptParaModerno }] }],
            safetySettings 
        };
        const respuestaModerno = await callGeminiWithRetries(payload);
        cache.set(cacheKey, { data: respuestaModerno, timestamp: Date.now() });
        res.json({ moderno: respuestaModerno });
    } catch (error) {
        handleApiError(error, res);
    }
});


app.listen(port, () => {
    console.log(`Servidor de Derecho Romano escuchando en http://localhost:${port}`);
});