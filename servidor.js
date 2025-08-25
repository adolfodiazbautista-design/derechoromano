require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

// --- LÓGICA DE GOOGLE SHEETS ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const serviceAccountAuth = new JWT({
    email: GOOGLE_CREDENTIALS.client_email,
    key: GOOGLE_CREDENTIALS.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

async function logQueryToSheet(consulta, respuesta) {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        const now = new Date();
        const fecha = now.toLocaleDateString('es-ES');
        const hora = now.toLocaleTimeString('es-ES');
        await sheet.addRow({
            Fecha: fecha,
            Hora: hora,
            Consulta: consulta,
            Respuesta: respuesta
        });
        console.log(`Consulta para "${consulta}" registrada en Google Sheets.`);
    } catch (error) {
        console.error('Error al registrar la consulta en Google Sheets:', error);
    }
}

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

app.post('/api/consulta', async (req, res) => {
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
        
        // *** CAMBIO CLAVE AQUÍ ***
        await logQueryToSheet(termino, respuestaIA);
        
        res.json({ respuesta: respuestaIA });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/buscar-fuente', async (req, res) => {
    const { termino } = req.body;
    const cacheKey = `fuente-${termino}`;
    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) {
        return res.json({ fuente: cache.get(cacheKey).data });
    }
    try {
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaFuente = `Actúa como un historiador del derecho romano experto en fuentes...`;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: promptParaFuente }] }] };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaFuente = geminiResponse.data.candidates[0].content.parts[0].text;
        cache.set(cacheKey, { data: respuestaFuente, timestamp: Date.now() });
        
        // *** CAMBIO CLAVE AQUÍ ***
        if (!respuestaFuente.includes("NULL")) {
            await logQueryToSheet(termino, `[FUENTE CLÁSICA]: ${respuestaFuente}`);
        }
        res.json({ fuente: respuestaFuente });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/derecho-moderno', async (req, res) => {
    const { termino } = req.body;
    const cacheKey = `moderno-${termino}`;
    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) {
        return res.json({ moderno: cache.get(cacheKey).data });
    }
    try {
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaModerno = `Actúa como un jurista experto en Derecho Civil español...`;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: promptParaModerno }] }] };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaModerno = geminiResponse.data.candidates[0].content.parts[0].text;
        cache.set(cacheKey, { data: respuestaModerno, timestamp: Date.now() });
        
        // *** CAMBIO CLAVE AQUÍ ***
        if (!respuestaModerno.includes("NULL")) {
            await logQueryToSheet(termino, `[DERECHO MODERNO]: ${respuestaModerno}`);
        }
        res.json({ moderno: respuestaModerno });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.listen(port, () => {
    console.log(`Servidor de Derecho Romano escuchando en http://localhost:${port}`);
});