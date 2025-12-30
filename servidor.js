require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Variables globales para datos
let manualJson = [];
let indiceJson = [];
let digestoJson = [];

// --- 1. CACHÉ SIMPLE EN MEMORIA (Optimización) ---
const memoryCache = new Map();
const CACHE_DURATION = 3600 * 1000; // 1 hora en milisegundos

function getFromCache(key) {
    const item = memoryCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
        memoryCache.delete(key);
        return null;
    }
    return item.value;
}

function setInCache(key, value) {
    memoryCache.set(key, {
        value,
        expiry: Date.now() + CACHE_DURATION
    });
    // Limpieza preventiva si crece mucho
    if (memoryCache.size > 1000) memoryCache.clear(); 
}

// --- 2. MIDDLEWARE Y SEGURIDAD ---

// CORS Restringido (Seguridad)
app.use(cors({
    origin: [
        'https://derechoromano.netlify.app', // Tu frontend en producción
        'http://localhost:3000',             // Pruebas locales
        'http://127.0.0.1:5500'              // Live Server local
    ],
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json({ limit: "1mb" }));
app.use(helmet());
app.set('trust proxy', 1);

// Rate Limit Ajustado (Seguridad)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 30, // 30 peticiones por IP (más estricto)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas consultas. Por favor, espera 15 minutos.' }
});
app.use('/api/', limiter);

// Middleware de Validación y Normalización (Mantenibilidad)
const validateInput = (req, res, next) => {
    let { termino, person1, person2, tipo, currentCaseText } = req.body;

    // Validación general de longitud para evitar ataques de memoria
    if (termino && termino.length > 200) {
        return res.status(400).json({ error: 'El término es demasiado largo (máx 200 caracteres).' });
    }
    
    // Normalización
    if (termino) {
        req.body.terminoNormalizado = termino.toLowerCase().trim();
    }
    
    next();
};

// --- FUNCIONES DE UTILIDAD ---

function handleApiError(error, res) {
    // Log seguro: No mostramos la data completa para proteger API Keys
    console.error("Error API Gemini:", {
        status: error.response?.status,
        message: error.message
    });

    if (error.response?.data?.error?.code === 503) {
        return res.status(503).json({ error: 'MODEL_OVERLOADED', message: 'Ulpiano está saturado. Inténtalo en un minuto.' });
    }
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return res.status(504).json({ error: 'REQUEST_TIMEOUT', message: 'La solicitud ha tardado demasiado. Inténtalo de nuevo.' });
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor.' });
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
    if (!GEMINI_API_KEY) throw new Error("API Key no encontrada.");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Timeout interno para axios
            const geminiResponse = await axios.post(url, payload, { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 290000 
            }); 

            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return geminiResponse.data.candidates[0].content.parts[0].text;
            }
            throw new Error('Respuesta vacía de la IA.');
        } catch (error) {
            if (error.response?.status === 503 && attempt < MAX_RETRIES) {
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
    
    if (termino.includes('posesion') || termino.includes('interdictos')) {
        return `En Roma había dos clases de posesión: natural y civil. AMBAS tenían protección interdictal.`;
    }

    const encontrado = manualJson.find(item => item.termino.toLowerCase() === termino) ||
                     manualJson.find(item => item.sinonimos?.some(s => s.toLowerCase() === termino)) ||
                     manualJson.find(item => item.termino.toLowerCase().includes(termino));
    return encontrado ? encontrado.definicion : '';
}

const buscarDigesto = (term) => {
    if (!term || !digestoJson.length) return [];
    const termLower = term.toLowerCase().trim();
    const matches = [];
    for (const entry of digestoJson) {
        if (entry.texto_espanol && entry.texto_espanol.toLowerCase().includes(termLower)) {
            matches.push({
                cita: entry.cita,
                latin: entry.texto_latin.trim(),
                espanol_original: entry.texto_espanol.trim()
            });
            if (matches.length >= 3) break;
        }
    }
    return matches;
};

function buscarPagina(termino) {
    if (!termino) return { pagina: null, titulo: null };
    const terminoLower = termino.toLowerCase().trim();
    let mejorCoincidencia = null;
    let maxPuntuacion = 0;

    indiceJson.forEach(tema => {
        let puntuacionActual = 0;
        if (tema.palabrasClave.some(p => p.toLowerCase() === terminoLower)) puntuacionActual += 10;
        if (tema.titulo.toLowerCase().includes(terminoLower)) puntuacionActual += 5;
        if (puntuacionActual > maxPuntuacion) {
            maxPuntuacion = puntuacionActual;
            mejorCoincidencia = tema;
        }
    });
    return { pagina: mejorCoincidencia?.pagina || null, titulo: mejorCoincidencia?.titulo || null };
}

// --- ENDPOINTS ---

// 1. Endpoint: Laboratorio de Casos
app.post('/api/consulta', validateInput, async (req, res) => {
    try {
        const { tipo, termino, terminoNormalizado, currentCaseText } = req.body;
        if (!tipo) return res.status(400).json({ error: 'Falta tipo de consulta.' });

        const contextoFinal = getContextoRelevante(terminoNormalizado);
        let promptFinal;

        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'Falta texto del caso.' });
            promptFinal = `Rol: Juez romano. Tarea: Resolver el caso "${currentCaseText}". Solución legal MUY BREVE (2-3 frases). Contexto: "${contextoFinal}".`;
        } else if (tipo === 'generar') {
            if (!termino) return res.status(400).json({ error: 'Falta término.' });
            promptFinal = `Rol: Profesor romano. Tarea: Crear caso práctico breve sobre "${termino}". Terminar con preguntas. Contexto: "${contextoFinal}".`;
        } else {
            return res.status(400).json({ error: 'Tipo inválido.' });
        }

        const respuestaIA = await callGeminiWithRetries({ contents: [{ parts: [{ text: promptFinal }] }], safetySettings });
        res.json({ respuesta: respuestaIA });
        
    } catch (error) {
        handleApiError(error, res);
    }
});

// 2. Endpoint: Búsqueda de Página (Local, sin IA)
app.post('/api/buscar-pagina', validateInput, (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'Falta término.' });
        res.json(buscarPagina(termino));
    } catch (error) {
        res.status(500).json({ error: 'Error interno.' });
    }
});

// 3. Endpoint: UlpianoIA (Consulta Unificada con Caché)
app.post('/api/consulta-unificada', validateInput, async (req, res) => {
    try {
        const { termino, terminoNormalizado } = req.body;
        if (!termino) return res.status(400).json({ error: 'Falta término.' });

        // A. Verificar Caché
        const cacheKey = `ulpiano_${terminoNormalizado}`;
        const cachedResponse = getFromCache(cacheKey);
        if (cachedResponse) {
            console.log(`⚡ Sirviendo desde caché: ${termino}`);
            return res.json(cachedResponse);
        }

        // B. Preparar Datos
        const contextoManual = getContextoRelevante(terminoNormalizado);
        const coincidenciasDigesto = buscarDigesto(termino);
        let digestoPrompt = "";
        
        if (coincidenciasDigesto.length > 0) {
            digestoPrompt = "\n\n--- DIGESTO DE JUSTINIANO ---\n" +
                            "Selecciona la cita MÁS relevante y tradúcela profesionalmente. Inclúyela con '# APUNTE DE ULPIANOIA: IUS ROMANUM #'.\n";
            coincidenciasDigesto.forEach((match, i) => {
                digestoPrompt += `Cita ${i+1}: "${match.latin}" (${match.cita})\n`;
            });
        }

        const infoPagina = buscarPagina(termino);

        // C. Llamar a IA
        const prompt = `Rol: Jurista Ulpiano. Término: "${termino}". Contexto: "${contextoManual}". ${digestoPrompt}
        FORMATO JSON: { "respuesta_principal": "Explicación breve", "conexion_moderna": "Herencia en derecho actual" }`;

        const respuestaTexto = await callGeminiWithRetries({ contents: [{ parts: [{ text: prompt }] }], safetySettings });
        
        // D. Parsear y Responder
        let jsonRespuesta;
        try {
            jsonRespuesta = JSON.parse(respuestaTexto.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (e) {
            throw new Error('Error parseando JSON IA');
        }

        const responseData = {
            respuesta: jsonRespuesta.respuesta_principal,
            moderno: jsonRespuesta.conexion_moderna,
            pagina: infoPagina.pagina,
            titulo: infoPagina.titulo
        };

        // E. Guardar en Caché
        setInCache(cacheKey, responseData);

        res.json(responseData);

    } catch (error) {
        handleApiError(error, res);
    }
});

// 4. Endpoint: Calculadora Parentesco (Con Caché)
app.post('/api/consulta-parentesco', validateInput, async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        if (!person2) return res.status(400).json({ message: "Falta 'person2'." });

        const cacheKey = `parentesco_${person1}_${person2}`;
        const cached = getFromCache(cacheKey);
        if (cached) return res.json(cached);

        const prompt = `Rol: Experto Derecho Romano. Calcular parentesco entre "${person1 || 'Yo'}" y "${person2}". FORMATO JSON: { "linea": "...", "grado": "...", "explicacion": "..." }`;
        
        const respuestaTexto = await callGeminiWithRetries({ contents: [{ parts: [{ text: prompt }] }], safetySettings });
        
        let jsonRespuesta;
        try {
            jsonRespuesta = JSON.parse(respuestaTexto.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (e) { throw new Error('Error JSON Parentesco'); }

        setInCache(cacheKey, jsonRespuesta);
        res.json(jsonRespuesta);

    } catch (error) {
        handleApiError(error, res);
    }
});

// --- ARRANQUE ---
const startServer = async () => {
    try {
        const [manualData, indiceData, digestoData] = await Promise.all([
            fs.readFile('manual.json', 'utf-8'),
            fs.readFile('indice.json', 'utf-8'),
            fs.readFile('digesto_traducido_final.json', 'utf-8')
        ]);

        manualJson = JSON.parse(manualData);
        indiceJson = JSON.parse(indiceData);
        digestoJson = JSON.parse(digestoData);

        console.log(`✓ Datos cargados: ${manualJson.length} conceptos, ${indiceJson.length} temas, ${digestoJson.length} citas.`);
        
        const server = app.listen(port, () => {
            console.log(`🚀 Servidor listo en http://localhost:${port}`);
        });
        
        // TIMEOUT CORREGIDO para Render (14 minutos)
        server.timeout = 840000; 

    } catch (error) {
        console.error("✗ Error arranque:", error);
        process.exit(1);
    }
};

startServer();