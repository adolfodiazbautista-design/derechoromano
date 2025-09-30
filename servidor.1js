require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log("--- [OK] Ejecutando servidor.js v21.0 (Sin Digesto) ---");

const app = express();
const port = process.env.PORT || 3000;
const apiCache = new Map();

// Middlewares y configuración de seguridad
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? ['https://derechoromano.netlify.app'] : '*', methods: ['GET', 'POST'], credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(helmet({ contentSecurityPolicy: false }));
app.options('*', cors()); // Habilita las peticiones preflight para todas las rutas

// Variables globales para los datos
let manualJson = [];
let indiceJson = [];

// Funciones de utilidad
function validateInput(input, maxLength = 500, fieldName = 'campo') { if (!input || typeof input !== 'string' || input.trim().length === 0 || input.trim().length > maxLength) { return { valid: false }; } return { valid: true, value: input.trim() }; }
function handleApiError(error, res) { console.error("Error en API:", error.message); res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Ulpiano no está disponible.' }); }
const safetySettings = [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }];
function getContextoRelevante(termino) { if (!termino) return ''; const t = termino.toLowerCase().trim(); let e = manualJson.find(i=>i.termino?.toLowerCase()===t) || manualJson.find(i=>i.sinonimos?.some(s=>s.toLowerCase()===t)); return e?.definicion||''; }

// Función para llamar a la API de Gemini
async function callGeminiWithRetries(payload, maxRetries = 4) {
    const cacheKey = JSON.stringify(payload.contents);
    if (apiCache.has(cacheKey)) { console.log("✓ [CACHE] Respuesta encontrada."); return apiCache.get(cacheKey); }
    console.log("→ [API] Llamando a la API de Gemini...");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada.');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${GEMINI_API_KEY}`;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 35000 });
            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                const apiResult = geminiResponse.data.candidates[0].content.parts[0].text;
                apiCache.set(cacheKey, apiResult);
                return apiResult;
            }
            throw new Error('Respuesta de la IA inválida.');
        } catch (error) {
            if ((error.response?.status === 503 || error.code === 'ECONNABORTED') && attempt < maxRetries) {
                console.log(`⚠ Intento ${attempt}/${maxRetries} fallido. Reintentando...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else { throw error; }
        }
    }
}

// ===============================================
// DEFINICIÓN DE RUTAS (ENDPOINTS) DE LA API
// ===============================================
app.use('/api/', limiter); // Aplicar rate limit solo a las rutas de la API

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/consulta', async (req, res) => {
    const validation = validateInput(req.body.termino || req.body.promptOriginal);
    if (!validation.valid) return res.status(400).json({ error: 'BAD_REQUEST', message: 'La entrada no es válida.' });

    const { promptOriginal, termino, currentCaseText } = req.body;
    const contexto = getContextoRelevante(termino);
    
    let userPrompt = promptOriginal;
    if (termino) userPrompt += ` sobre el término "${termino}"`;
    if (currentCaseText) userPrompt += ` en relación al siguiente caso: "${currentCaseText}"`;
    if (contexto) userPrompt += `. Utiliza el siguiente contexto para responder: "${contexto}"`;
    
    try {
        const result = await callGeminiWithRetries({ contents: [{ parts: [{ text: userPrompt }] }], safetySettings });
        res.json({ respuesta: result });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/derecho-moderno', async (req, res) => {
    const validation = validateInput(req.body.termino);
    if (!validation.valid) return res.status(400).json({ error: 'BAD_REQUEST', message: 'Término no válido.' });
    
    const { termino } = req.body;
    const contexto = getContextoRelevante(termino);
    const prompt = `Analiza la vigencia de la institución jurídica romana "${termino}" en el derecho español actual. Contexto: ${contexto}`;

    try {
        const result = await callGeminiWithRetries({ contents: [{ parts: [{ text: prompt }] }], safetySettings });
        res.json({ moderno: result });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/buscar-pagina', (req, res) => {
    const validation = validateInput(req.body.termino);
    if (!validation.valid) return res.status(400).json({ error: 'BAD_REQUEST', message: 'Término no válido.' });
    
    const { termino } = req.body;
    const t = termino.toLowerCase().trim();
    const temaEncontrado = indiceJson.find(tema => tema.palabras_clave.some(p => p.toLowerCase() === t));
    
    if (temaEncontrado) {
        res.json({ pagina: temaEncontrado.pagina, titulo: temaEncontrado.titulo });
    } else {
        res.status(404).json({ error: 'NOT_FOUND', message: 'No se encontró el término en el índice.' });
    }
});

// ===============================================
// INICIO DEL SERVIDOR
// ===============================================
async function startServer() {
    try {
        const manualData = await fs.readFile('manual.json', 'utf-8');
        manualJson = JSON.parse(manualData);
        console.log(`✓ Manual JSON cargado: ${manualJson.length} conceptos.`);
        
        const indiceData = await fs.readFile('indice.json', 'utf-8');
        indiceJson = JSON.parse(indiceData);
        console.log(`✓ Índice JSON cargado: ${indiceJson.length} temas.`);
    } catch (error) {
        console.error('✗ Error crítico cargando archivos de datos:', error.message);
        process.exit(1);
    }
    
    app.listen(port, () => console.log(`\n✓ Servidor escuchando en http://localhost:${port}\n`));
}

startServer();