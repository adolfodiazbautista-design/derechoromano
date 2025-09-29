require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log("--- [OK] Ejecutando servidor.js v7.0 con lógica simplificada ---");

const app = express();
const port = 3000;

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

const manualCompleto = fs.readFileSync('manual.txt', 'utf-8');
const parrafosDelManual = manualCompleto.split(/\n/);
console.log(`Manual cargado. ${parrafosDelManual.length} párrafos encontrados.`);

const cache = new Map();
const TTL = 3600 * 1000;

function handleApiError(error, res) {
    console.error("Error definitivo desde la API de Gemini:", error.response ? error.response.data : error.message);
    let errorMessage = 'Ha ocurrido un error en el servidor.';
    if (error.response) {
        const errorData = error.response.data?.error;
        if (errorData) {
            if (errorData.code === 503) {
                errorMessage = 'Ulpiano parece estar desbordado por el trabajo en este momento (el modelo de IA está sobrecargado). Por favor, dale un minuto de descanso y vuelve a intentarlo.';
                return res.status(503).json({ error: 'MODEL_OVERLOADED', message: errorMessage });
            }
        }
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: errorMessage });
}

const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

async function callGeminiWithRetries(payload) {
    const MAX_RETRIES = 2; // Reducimos a 2 para una respuesta más rápida en caso de fallo
    const RETRY_DELAY = 1000;
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
            throw new Error('Respuesta de la IA inválida o vacía.');

        } catch (error) {
            if (error.response && error.response.status === 503 && attempt < MAX_RETRIES) {
                console.log(`Intento ${attempt} fallido (Modelo Sobrecargado). Reintentando en ${RETRY_DELAY / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            } else {
                throw error;
            }
        }
    }
}

function getContextoRelevante(termino) {
    if (!termino) return '';
    let contexto = '';
    const terminoLower = termino.toLowerCase();
    
    if (terminoLower.includes('posesión')) {
        contexto = `Hay dos clases de posesión, natural y civil. La natural es la mera tenencia (corpus) y en la civil se añade el animus domini. AMBAS FORMAS DE POSESIÓN, NATURAL Y CIVIL, ESTABAN PROTEGIDAS POR INTERDICTOS. En cambio los detentadores (una clase de poseedores naturales) carecían de la protección interdictal.`;
    } else {
        const parrafosEncontrados = parrafosDelManual.filter(p => p.toLowerCase().includes(terminoLower));
        if (parrafosEncontrados.length > 0) { 
            contexto = parrafosEncontrados.join('\n\n');
        }
    }
    return contexto;
}

app.post('/api/consulta', async (req, res) => {
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
            promptFinalParaIA = `Tu único rol es ser un juez romano resolviendo un caso.
**Tarea:** Resuelve el siguiente caso práctico aplicando los principios del derecho romano a los hechos presentados: "${currentCaseText}".
**Instrucciones:**
1.  Ve directamente al grano y responde a las preguntas del caso de forma clara y concisa.
2.  Basa tu solución en este contexto del manual si es relevante: "${contextoRelevante}".
3.  Tu respuesta debe ser una solución legal al caso, no una lección teórica.`;
        } else if (promptOriginal.includes("crear un breve supuesto de hecho")) {
            promptFinalParaIA = `Tu único rol es ser un profesor de derecho romano. Crea un breve supuesto de hecho (máximo 3 frases) sobre "${termino}", usando nombres como Ticio, Cayo, etc. Termina siempre con una pregunta legal. No incluyas la solución.`;
        } else {
            promptFinalParaIA = `Tu rol es ser Ulpiano. Responde a la pregunta sobre "${termino}" de forma breve (máximo dos párrafos), basándote en este contexto: "${contextoRelevante}". Si el contexto está vacío, usa tu conocimiento general. Nunca contradigas el contexto.`;
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

// Se elimina la ruta /api/buscar-fuente para evitar citas incorrectas.
// La ruta /api/derecho-moderno puede mantenerse o eliminarse si también da problemas.
app.post('/api/derecho-moderno', async (req, res) => {
    try {
        const { termino } = req.body;
        const cacheKey = `moderno-${termino}`;
        if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) { return res.json({ moderno: cache.get(cacheKey).data }); }
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaModerno = `Explica de forma muy concisa (máximo un párrafo) la herencia del concepto romano "${termino}" en el derecho español moderno.`;
        
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