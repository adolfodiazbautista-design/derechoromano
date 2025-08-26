require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

// --- VERIFICADOR DE VERSIÓN ---
console.log("--- [OK] Ejecutando servidor.js v3.0 con FILTRO CORREGIDO (REGEX) ---");

const app = express();
const port = 3000;
app.use(cors());

// --- MEJORAS DE SEGURIDAD ---
app.use(express.json({ limit: "1mb" }));

const palabrasProhibidas = ['tonto', 'tonta', 'sexo', 'idiota', 'imbecil', 'puta', 'mierda', 'gilipollas', 'franco', 'hitler', 'mussolini', 'stalin', 'polla', 'picha', 'acho', 'puto', 'zorra', 'zorras', 'tetas', 'pollas', 'cabron', 'cabrón', 'teta', 'coño', 'examen', 'test'];


// --- LÓGICA DEL SERVIDOR ---
const manualCompleto = fs.readFileSync('manual.txt', 'utf-8');
const parrafosDelManual = manualCompleto.split(/\n\s*\n/);
console.log(`Manual cargado. ${parrafosDelManual.length} párrafos encontrados.`);

const cache = new Map();
const TTL = 3600 * 1000;

function handleApiError(error, res) {
    console.error("Error desde la API de Gemini:", error.response ? error.response.data : error.message);
    if (error.response && error.response.data && error.response.data.error) {
        const errorCode = error.response.data.error.code;
        if (errorCode === 429) {
            return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', message: 'Límite de cuota de la API excedido.' });
        }
        if (errorCode === 503) {
            return res.status(503).json({ error: 'MODEL_OVERLOADED', message: 'El modelo de IA está sobrecargado.' });
        }
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Ha ocurrido un error en el servidor.' });
}

// --- FUNCIÓN DE VALIDACIÓN CORREGIDA ---
// Usa una expresión regular con \b (word boundary) para que solo detecte palabras completas.
function validarContenido(req, res, next) {
    const { promptOriginal, termino } = req.body;
    const textoCompleto = `${promptOriginal || ''} ${termino || ''}`.toLowerCase();
    
    const esInapropiado = palabrasProhibidas.some(palabra => {
        const regex = new RegExp(`\\b${palabra}\\b`, 'i');
        return regex.test(textoCompleto);
    });

    if (esInapropiado) {
        console.warn(`Intento de consulta bloqueada por contenido inapropiado.`);
        return res.status(400).json({ error: 'CONTENIDO_INAPROPIADO', message: 'La consulta contiene términos no permitidos.' });
    }
    next();
}


app.post('/api/consulta', validarContenido, async (req, res) => {
    const { promptOriginal, termino } = req.body;
    const cacheKey = `consulta-${termino}`;
    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) {
        console.log(`(Consulta Principal) Devolviendo respuesta desde la CACHÉ para: "${termino}"`);
        return res.json({ respuesta: cache.get(cacheKey).data });
    }
    try {
        if (!promptOriginal) return res.status(400).json({ error: 'No se ha proporcionado un prompt.' });
        let contextoRelevante = '';
        if (termino) {
            const parrafosEncontrados = parrafosDelManual.filter(p => p.toLowerCase().includes(termino.toLowerCase()));
            if (parrafosEncontrados.length > 0) { contextoRelevante = parrafosEncontrados.join('\n\n'); }
        }
        const promptFinalParaIA = `${promptOriginal}\n\nSi la pregunta lo requiere, basa tu respuesta PRIORITARIAMENTE en el siguiente contexto extraído del manual de referencia:\n---\nCONTEXTO:\n${contextoRelevante || "No se ha encontrado información relevante en el manual de referencia para esta consulta. Por favor, responde a la pregunta basándote en tu conocimiento general como experto en Derecho Romano."}\n---`;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }] };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaIA = geminiResponse.data.candidates[0].content.parts[0].text;
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
        const promptParaFuente = `Actúa como un historiador del derecho romano experto en fuentes. Tu única tarea es encontrar un pasaje breve pero significativo del Corpus Iuris Civilis (Digesto, Instituciones, Código) o de las Instituciones de Gayo que sea relevante para el término "${termino}". Responde únicamente con la cita en formato académico (ej. D. 1.1.1), el texto en latín y su traducción al español. Si no encuentras una cita clara y directa, responde solo con la palabra "NULL". NO DES NINGUNA EXPLICACIÓN NI JUSTIFICACIÓN.`;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: promptParaFuente }] }] };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaFuente = geminiResponse.data.candidates[0].content.parts[0].text;
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
        const promptParaModerno = `Actúa como un jurista experto en Derecho Civil español. Tu única tarea es explicar de forma breve y concisa la regulación o equivalencia del concepto "${termino}" en el Derecho español moderno, principalmente en el Código Civil. Si no existe una correspondencia clara, indícalo brevemente. Responde únicamente con la explicación. Si no encuentras nada, responde con la palabra "NULL". NO DES NINGUNA EXPLICACIÓN NI JUSTIFICACIÓN.`;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: promptParaModerno }] }] };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaModerno = geminiResponse.data.candidates[0].content.parts[0].text;
        cache.set(cacheKey, { data: respuestaModerno, timestamp: Date.now() });
        res.json({ moderno: respuestaModerno });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.listen(port, () => {
    console.log(`Servidor de Derecho Romano escuchando en http://localhost:${port}`);
});