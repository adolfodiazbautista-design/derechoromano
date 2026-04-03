require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; 
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Archivo de caché física para máxima protección de vuestro presupuesto
const CACHE_FILE = path.join(__dirname, 'cache_respuestas.json');

let manualJson = [];
let indiceJson = [];
let digestoJson = []; 
let MEMORIA_PERSISTENTE = {}; 

// --- 1. GESTIÓN DE CACHÉ PERSISTENTE ---
async function cargarCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf-8');
        MEMORIA_PERSISTENTE = JSON.parse(data);
        console.log("✓ Caché persistente cargada.");
    } catch (e) {
        console.log("⚠️ Iniciando nueva caché.");
        MEMORIA_PERSISTENTE = {};
    }
}

async function guardarEnCache(key, valor) {
    MEMORIA_PERSISTENTE[key] = valor;
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(MEMORIA_PERSISTENTE, null, 2));
    } catch (e) { console.error("Error escribiendo caché:", e); }
}

// --- 2. CONFIGURACIÓN Y SEGURIDAD ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);
app.use(express.static(__dirname));

const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 15, // Límite de 15 consultas/hora para evitar gastos imprevistos
    message: { error: 'LÍMITE_ALCANZADO', message: 'Límite horario excedido. Volved en una hora.' }
});

// --- 3. UTILIDADES DE BÚSQUEDA Y IA ---
function normalizarTexto(texto) {
    return texto ? texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
}

function limpiarYParsearJSON(texto) {
    if (typeof texto === 'object') return texto;
    try {
        const match = texto.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : { respuesta_principal: texto, conexion_moderna: "" };
    } catch (e) { return { respuesta_principal: texto, conexion_moderna: "" }; }
}

function buscarPagina(termino) {
    if (!termino || !indiceJson.length) return { pagina: null, titulo: null };
    const termClean = normalizarTexto(termino);
    const mejorMatch = indiceJson.find(item => normalizarTexto(item.titulo).includes(termClean));
    return mejorMatch ? { pagina: mejorMatch.pagina, titulo: mejorMatch.titulo } : { pagina: null, titulo: null };
}

async function callGeminiWithRetries(payload) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${GEMINI_API_KEY}`;

    payload.generationConfig = {
        maxOutputTokens: 450, // Ahorro: limitamos la longitud de la respuesta
        temperature: 0.1,     
        topP: 0.8
    };

    try {
        const resp = await axios.post(url, payload, { 
            headers: { 'Content-Type': 'application/json' }, // ¡RESTAURADO!
            timeout: 35000 
        }); 
        if (resp.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return resp.data.candidates[0].content.parts[0].text;
        }
        throw new Error('Respuesta de API vacía.');
    } catch (error) { throw error; }
}

// --- 4. ENDPOINTS (RESTAURADOS PARA AMBAS WEBS) ---

// Para la Guía Interactiva (Laboratorio de Casos)
app.post('/api/consulta', apiLimiter, async (req, res) => {
    try {
        const { tipo, termino, currentCaseText } = req.body;
        const prompt = tipo === 'generar' 
            ? `Crea un caso práctico de Derecho Romano breve sobre: ${termino}`
            : `Resuelve este caso como un juez romano experto: ${currentCaseText}`;
        
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const respuesta = await callGeminiWithRetries(payload);
        res.json({ respuesta });
    } catch (error) { res.status(500).json({ error: 'Error en el laboratorio.' }); }
});

// Para la Biblioteca de Ulpiano e index2.html
app.post('/api/consulta-unificada', apiLimiter, async (req, res) => {
    try {
        const { termino } = req.body;
        const termKey = normalizarTexto(termino);
        const pagInfo = buscarPagina(termino);

        if (MEMORIA_PERSISTENTE[termKey]) {
            console.log(`⚡ Sirviendo desde caché: ${termKey}`);
            return res.json({ ...MEMORIA_PERSISTENTE[termKey], ...pagInfo });
        }

        const prompt = `Eres Ulpiano. Explica brevemente: "${termino}". Responde solo JSON: { "respuesta_principal": "...", "conexion_moderna": "..." }`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const respuestaTexto = await callGeminiWithRetries(payload);
        const jsonRespuesta = limpiarYParsearJSON(respuestaTexto);
        
        const resultado = {
            respuesta: jsonRespuesta.respuesta_principal,
            moderno: jsonRespuesta.conexion_moderna
        };

        await guardarEnCache(termKey, resultado);
        res.json({ ...resultado, ...pagInfo });
    } catch (error) { res.status(500).json({ error: 'Error en la consulta unificada.' }); }
});

app.post('/api/consulta-parentesco', apiLimiter, async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        const prompt = `Calcula parentesco romano entre ${person1} y ${person2}. Responde JSON: { "linea": "...", "grado": "...", "explicacion": "..." }`;
        const resp = await callGeminiWithRetries({ contents: [{ parts: [{ text: prompt }] }] });
        res.json(limpiarYParsearJSON(resp));
    } catch (error) { res.status(500).json({ error: 'Error en parentesco.' }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- 5. ARRANQUE ROBUSTO ---
const startServer = async () => {
    try {
        manualJson = JSON.parse(await fs.readFile('manual.json', 'utf-8'));
        indiceJson = JSON.parse(await fs.readFile('indice.json', 'utf-8'));
        
        // Carga flexible del Digesto (intenta varios nombres)
        try {
            digestoJson = JSON.parse(await fs.readFile('digesto_traducido_final.json', 'utf-8'));
            console.log("✓ Archivo digesto_traducido_final.json cargado.");
        } catch (e) {
            console.log("⚠️ Intentando con digest.json...");
            digestoJson = JSON.parse(await fs.readFile('digest.json', 'utf-8'));
        }
        
        await cargarCache();
        app.listen(port, () => console.log(`🚀 Servidor activo en puerto ${port}. Modelo: Gemini 3 Flash`));
    } catch (error) {
        console.error("❌ ERROR CRÍTICO:", error.message);
        process.exit(1); 
    }
};

startServer();