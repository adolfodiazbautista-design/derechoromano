require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log("--- [OK] Ejecutando servidor.js v8.0 con búsqueda en Digesto ---");

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

// --- CARGA DE MANUALES ---
const manualJson = JSON.parse(fs.readFileSync('manual.json', 'utf-8'));
console.log(`Manual JSON cargado. ${manualJson.length} conceptos encontrados.`);

const digestoCompleto = fs.readFileSync('digest.txt', 'utf-8');
const parrafosDelDigesto = digestoCompleto.split(/\n\s*\n/).filter(p => p.trim() !== '');
console.log(`Digesto cargado. ${parrafosDelDigesto.length} párrafos encontrados.`);


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
    const MAX_RETRIES = 2;
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
    const terminoBusqueda = termino.toLowerCase().trim();
    let encontrado = manualJson.find(item => item.termino.toLowerCase() === terminoBusqueda) ||
                     manualJson.find(item => item.sinonimos && item.sinonimos.some(s => s.toLowerCase() === terminoBusqueda)) ||
                     manualJson.find(item => item.termino.toLowerCase().includes(terminoBusqueda));
    return encontrado ? encontrado.definicion : '';
}

app.post('/api/consulta', async (req, res) => {
    try {
        const { promptOriginal, termino, currentCaseText } = req.body;
        if (!promptOriginal) return res.status(400).json({ error: 'No se ha proporcionado un prompt.' });

        // --- INICIO DE LA MODIFICACIÓN ---
        let contextoFinal;
        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';

        // Comprobamos si el término es 'posesión' para inyectar el contexto obligatorio.
        if (terminoNormalizado === 'posesión' || terminoNormalizado === 'posesion') {
            console.log("Detectado término 'posesión'. Usando contexto específico y prioritario.");
            contextoFinal = `En Roma había dos clases de posesión: natural (solo corpus) y civil (corpus y animus domini) AMBAS FORMAS DE POSESIÓN TENÍAN PROTECCIÓN INTERDICTAL. Había una serie de casos, llamados "detentadores" (por ejemplo los arrendatarios) que, por razones desconocidas, no tenían protección de los interdictos.`;
        } else {
            // Si no es 'posesión', usamos la lógica original de buscar en el manual.
            contextoFinal = getContextoRelevante(termino);
        }
        // --- FIN DE LA MODIFICACIÓN ---

        let promptFinalParaIA = '';

        if (currentCaseText) {
            promptFinalParaIA = `Tu único rol es ser un juez romano resolviendo un caso.
**Tarea:** Resuelve el siguiente caso práctico aplicando los principios del derecho romano a los hechos presentados: "${currentCaseText}".
**Instrucciones:**
1.  Ve directamente al grano y responde a las preguntas del caso de forma clara y concisa.
2.  Basa tu solución en este contexto del manual si es relevante: "${contextoFinal}".
3.  Tu respuesta debe ser una solución legal al caso, no una lección teórica.`;
        } else if (promptOriginal.includes("crear un breve supuesto de hecho")) {
            promptFinalParaIA = `Tu único rol es ser un profesor de derecho romano creando un caso práctico.
**Instrucción Inviolable:** Crea un breve supuesto de hecho (máximo 3 frases) sobre el concepto de "${termino}".
**Reglas Estrictas:**
1.  Usa personajes con nombres clásicos romanos (ej. Ticio, Cayo, Sempronio, Mevio, Livia, el esclavo Estico).
2.  Basa la lógica del caso en el siguiente contexto si es relevante: "${contextoFinal}".
3.  Termina SIEMPRE con una o varias preguntas legales claras.
4.  NO incluyas NINGÚN tipo de explicación teórica.
5.  NO incluyas la solución.`;
        } else {
            promptFinalParaIA = `Tu rol es ser Ulpiano. Responde a la pregunta sobre "${termino}" de forma breve (máximo dos párrafos), basándote en este contexto: "${contextoFinal}". Si el contexto está vacío, usa tu conocimiento general. Nunca contradigas el contexto.`;
        }

        const payload = { 
            contents: [{ parts: [{ text: promptFinalParaIA }] }],
            safetySettings 
        };
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/buscar-fuente', async (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });

        // NUEVA LÓGICA DE BÚSQUEDA EN DIGESTO
        const terminoLower = termino.toLowerCase();
        const resultadosBusqueda = parrafosDelDigesto.filter(p => p.toLowerCase().includes(terminoLower));
        
        if (resultadosBusqueda.length === 0) {
            return res.json({ fuente: "NULL" });
        }

        // Limitamos a un máximo de 5 fragmentos para no sobrecargar a la IA
        const contextoDigesto = resultadosBusqueda.slice(0, 5).join('\n---\n');

        const promptParaFuente = `Tu única tarea es actuar como un bibliotecario jurídico. Te proporcionaré un fragmento del Digesto de Justiniano.
**Instrucción:** Analiza el siguiente texto y extrae la cita más relevante para el término "${termino}".
**Regla de Oro:** Tu respuesta DEBE contener únicamente la cita en formato académico (ej: D. libro. título. fragmento), el texto original en latín y su traducción. Si no encuentras una cita clara, responde "NULL". No añadas explicaciones.

--- TEXTO DEL DIGESTO ---
${contextoDigesto}
--- FIN DEL TEXTO ---`;

        const payload = { 
            contents: [{ parts: [{ text: promptParaFuente }] }],
            safetySettings 
        };
        const respuestaFuente = await callGeminiWithRetries(payload);
        res.json({ fuente: respuestaFuente });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/derecho-moderno', async (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaModerno = `Explica de forma muy concisa (máximo un párrafo) la herencia del concepto romano "${termino}" en el derecho español moderno.`;
        
        const payload = { 
            contents: [{ parts: [{ text: promptParaModerno }] }],
            safetySettings 
        };
        const respuestaModerno = await callGeminiWithRetries(payload);
        res.json({ moderno: respuestaModerno });
    } catch (error) {
        handleApiError(error, res);
    }
});


app.listen(port, () => {
    console.log(`Servidor de Derecho Romano escuchando en http://localhost:${port}`);
});