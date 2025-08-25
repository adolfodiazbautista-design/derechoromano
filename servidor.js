require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

// --- LÓGICA DE GOOGLE SHEETS ---

// Función auxiliar para inicializar la conexión con el documento
async function getDoc() {
    try {
        const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
        // Parseamos las credenciales que están como texto en las variables de entorno
        const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

        await doc.useServiceAccountAuth({
            client_email: GOOGLE_CREDENTIALS.client_email,
            // Render escapa los saltos de línea, hay que reemplazarlos para que la clave sea válida
            private_key: GOOGLE_CREDENTIALS.private_key.replace(/\\n/g, '\n'),
        });

        await doc.loadInfo(); // Carga las propiedades del documento y las hojas
        return doc;
    } catch (error) {
        console.error('Error inicializando Google Sheets:', error);
        throw error;
    }
}

// Función para registrar una nueva fila en la hoja de cálculo
async function logQueryToSheet(consulta, respuesta) {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByIndex[0]; // Usamos la primera hoja del documento

        const now = new Date();
        const fecha = now.toLocaleDateString('es-ES');
        const hora = now.toLocaleTimeString('es-ES');

        await sheet.addRow({
            Fecha: fecha,
            Hora: hora,
            Consulta: consulta,
            Respuesta: respuesta // Añadimos la respuesta de la IA
        });
        console.log(`Consulta para "${consulta}" registrada en Google Sheets.`);
    } catch (error) {
        // Este error solo lo mostramos en el log del servidor para no afectar al usuario
        console.error('Error al registrar la consulta en Google Sheets:', error);
    }
}


// --- LÓGICA DEL SERVIDOR (EXISTENTE Y MODIFICADA) ---

const manualCompleto = fs.readFileSync('manual.txt', 'utf-8');
const parrafosDelManual = manualCompleto.split(/\n\s*\n/);
console.log(`Manual cargado. ${parrafosDelManual.length} párrafos encontrados.`);

// Cache (sin cambios)
const cache = new Map();
const TTL = 3600 * 1000;

// ENDPOINT 1: EXPERTO EN EL MANUAL (RAG)
app.post('/api/consulta', async (req, res) => {
    const { promptOriginal, termino } = req.body;
    const cacheKey = `consulta-${termino}`;

    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) {
        console.log(`(Consulta Principal) Devolviendo respuesta desde la CACHÉ para: "${termino}"`);
        return res.json({ respuesta: cache.get(cacheKey).data });
    }
    try {
        if (!promptOriginal) return res.status(400).json({ error: 'No se ha proporcionado un prompt.' });
        console.log(`(Consulta Principal) Recibida consulta con término: "${termino || 'N/A'}"`);
        let contextoRelevante = '';
        if (termino) {
            const parrafosEncontrados = parrafosDelManual.filter(p => p.toLowerCase().includes(termino.toLowerCase()));
            if (parrafosEncontrados.length > 0) {
                contextoRelevante = parrafosEncontrados.join('\n\n');
            }
        }
        const promptFinalParaIA = `${promptOriginal}\n\nSi la pregunta lo requiere... \nCONTEXTO:\n${contextoRelevante || "..."}\n---`;
        
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }] };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaIA = geminiResponse.data.candidates[0].content.parts[0].text;
        
        cache.set(cacheKey, { data: respuestaIA, timestamp: Date.now() });

        // AÑADIDO: Llamamos a la función de registro (sin await para no retrasar al usuario)
        logQueryToSheet(termino, respuestaIA);
        
        res.json({ respuesta: respuestaIA });
    } catch (error) {
        console.error("Error en /api/consulta:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Ha ocurrido un error en el servidor.' });
    }
});

// ENDPOINT 2: EXPERTO EN FUENTES CLÁSICAS
app.post('/api/buscar-fuente', async (req, res) => {
    const { termino } = req.body;
    const cacheKey = `fuente-${termino}`;

    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) {
        console.log(`(Fuente Clásica) Devolviendo respuesta desde la CACHÉ para: "${termino}"`);
        return res.json({ fuente: cache.get(cacheKey).data });
    }
    try {
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaFuente = `Actúa como un historiador... para el término "${termino}". ...responde solo con la palabra "NULL". No añadas explicaciones.`;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: promptParaFuente }] }] };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaFuente = geminiResponse.data.candidates[0].content.parts[0].text;
        
        cache.set(cacheKey, { data: respuestaFuente, timestamp: Date.now() });
        
        // AÑADIDO: Llamamos a la función de registro
        if (!respuestaFuente.includes("NULL")) {
            logQueryToSheet(termino, `[FUENTE CLÁSICA]: ${respuestaFuente}`);
        }

        res.json({ fuente: respuestaFuente });
    } catch (error) {
        console.error("Error en /api/buscar-fuente:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error al buscar la fuente.' });
    }
});

// ENDPOINT 3: EXPERTO EN DERECHO MODERNO
app.post('/api/derecho-moderno', async (req, res) => {
    const { termino } = req.body;
    const cacheKey = `moderno-${termino}`;
    
    if (cache.has(cacheKey) && (Date.now() - cache.get(cacheKey).timestamp < TTL)) {
        console.log(`(Derecho Moderno) Devolviendo respuesta desde la CACHÉ para: "${termino}"`);
        return res.json({ moderno: cache.get(cacheKey).data });
    }
    try {
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaModerno = `Actúa como un jurista experto... para el concepto "${termino}". ...responde con la palabra "NULL". No añadas introducciones ni despedidas.`;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: promptParaModerno }] }] };
        const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const respuestaModerno = geminiResponse.data.candidates[0].content.parts[0].text;

        cache.set(cacheKey, { data: respuestaModerno, timestamp: Date.now() });
        
        // AÑADIDO: Llamamos a la función de registro
        if (!respuestaModerno.includes("NULL")) {
            logQueryToSheet(termino, `[DERECHO MODERNO]: ${respuestaModerno}`);
        }

        res.json({ moderno: respuestaModerno });
    } catch (error) {
        console.error("Error en /api/derecho-moderno:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error al buscar en derecho moderno.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor de Derecho Romano escuchando en http://localhost:${port}`);
});