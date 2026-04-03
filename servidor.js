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

// Archivo de caché física para persistencia entre reinicios de Render
const CACHE_FILE = path.join(__dirname, 'cache_respuestas.json');

// Variables globales de datos
let manualJson = [];
let indiceJson = [];
let digestoJson = []; 
let MEMORIA_PERSISTENTE = {}; // Caché en memoria sincronizada con el archivo

// --- 1. GESTIÓN DE CACHÉ PERSISTENTE ---
async function cargarCachePersistente() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf-8');
        MEMORIA_PERSISTENTE = JSON.parse(data);
        console.log("✓ Caché persistente cargada.");
    } catch (e) {
        console.log("⚠️ No se encontró caché previa. Se creará al recibir consultas.");
        MEMORIA_PERSISTENTE = {};
    }
}

async function guardarEnCache(key, valor) {
    MEMORIA_PERSISTENTE[key] = valor;
    try {
        // Guardamos en el disco de forma asíncrona
        await fs.writeFile(CACHE_FILE, JSON.stringify(MEMORIA_PERSISTENTE, null, 2));
    } catch (e) {
        console.error("Error al escribir en el archivo de caché:", e);
    }
}

// --- 2. CONFIGURACIÓN DEL SERVIDOR Y SEGURIDAD ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);
app.use(express.static(__dirname));

// Limitador de tasa estricto para proteger la factura de Google Cloud
const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // Ventana de 1 hora
    max: 15, // Máximo 15 consultas de IA por hora por cada IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'LÍMITE_ALCANZADO', message: 'Habéis excedido el límite de consultas al oráculo. Por favor, esperad una hora.' }
});

// --- 3. FUNCIONES TÉCNICAS Y UTILIDADES ---

function normalizarTexto(texto) {
    return texto ? texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
}

function limpiarYParsearJSON(texto) {
    if (typeof texto === 'object') return texto;
    try {
        const match = texto.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : { respuesta_principal: texto, conexion_moderna: "" };
    } catch (e) {
        return { respuesta_principal: texto, conexion_moderna: "" };
    }
}

async function callGeminiWithRetries(payload) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    // URL actualizada al modelo Gemini 3 Flash (2026)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${GEMINI_API_KEY}`;

    // Configuración para limitar el gasto (tokens de salida)
    payload.generationConfig = {
        maxOutputTokens: 450, // Limita la longitud de la respuesta para ahorrar
        temperature: 0.1,     // Mayor precisión académica, menos divagación
        topP: 0.8
    };

    try {
        const geminiResponse = await axios.post(url, payload, { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 
        }); 
        if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return geminiResponse.data.candidates[0].content.parts[0].text;
        }
        throw new Error('Respuesta de la API vacía.');
    } catch (error) {
        throw error;
    }
}

// Lógica de búsqueda en archivos locales (Manual y Digesto)
function getContextoRelevante(termino) {
    if (!termino || !manualJson.length) return '';
    const termClean = normalizarTexto(termino);
    const matches = manualJson.filter(item => 
        normalizarTexto(item.termino).includes(termClean) || 
        normalizarTexto(item.definicion).includes(termClean)
    ).slice(0, 3);
    return matches.map(m => `[${m.termino}]: ${m.definicion}`).join("\n\n");
}

const buscarDigesto = (term) => {
    if (!term || !digestoJson.length) return [];
    const termClean = normalizarTexto(term);
    return digestoJson.filter(e => 
        normalizarTexto(e.texto_espanol).includes(termClean) || 
        normalizarTexto(e.texto_latin).includes(termClean)
    ).slice(0, 5);
};

// --- 4. ENDPOINTS DE LA API ---

app.post('/api/consulta-unificada', apiLimiter, async (req, res) => {
    try {
        const { termino } = req.body;
        const termKey = normalizarTexto(termino);

        // Comprobación en caché persistente (Ahorro total de coste si existe)
        if (MEMORIA_PERSISTENTE[termKey]) {
            console.log(`⚡ Sirviendo desde caché: ${termKey}`);
            return res.json(MEMORIA_PERSISTENTE[termKey]);
        }

        const contextoManual = getContextoRelevante(termino);
        const coincidencias = buscarDigesto(termino);
        let digestoTxt = coincidencias.map(c => `CITA: (${c.cita}) "${c.latin}"`).join('\n');

        const prompt = `
Eres Ulpiano, profesor de Derecho Romano. Explica: "${termino}".
CONTEXTO MANUAL: ${contextoManual || "Usa principios generales."}
FUENTES DIGESTO: ${digestoTxt}
FORMATO JSON: { "respuesta_principal": "...", "conexion_moderna": "..." }
Responde exclusivamente en JSON.`;

        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const respuestaTexto = await callGeminiWithRetries(payload);
        const jsonRespuesta = limpiarYParsearJSON(respuestaTexto);
        
        // Guardar en la caché física antes de responder
        await guardarEnCache(termKey, jsonRespuesta);
        
        res.json(jsonRespuesta);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error en la consulta.' });
    }
});

app.post('/api/consulta-parentesco', apiLimiter, async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        const key = normalizarTexto(`${person1}-${person2}`);

        if (MEMORIA_PERSISTENTE[key]) return res.json(MEMORIA_PERSISTENTE[key]);

        const prompt = `Calcula parentesco romano entre ${person1} y ${person2}. Responde JSON: { "linea": "...", "grado": "...", "explicacion": "..." }`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const resp = await callGeminiWithRetries(payload);
        const finalJson = limpiarYParsearJSON(resp);

        await guardarEnCache(key, finalJson);
        res.json(finalJson);
    } catch (error) {
        res.status(500).json({ error: 'Error en parentesco.' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- CORRECCIÓN EN EL ARRANQUE DEL SISTEMA ---
const startServer = async () => {
    try {
        manualJson = JSON.parse(await fs.readFile('manual.json', 'utf-8'));
        indiceJson = JSON.parse(await fs.readFile('indice.json', 'utf-8'));
        
        // Ajustamos la búsqueda al nombre exacto de vuestro archivo
        try {
            digestoJson = JSON.parse(await fs.readFile('digest.json', 'utf-8'));
            console.log("✓ Archivo digest.json cargado correctamente.");
        } catch (e) {
            console.log("⚠️ No se encontró digest.json, intentando digesto.json...");
            digestoJson = JSON.parse(await fs.readFile('digesto.json', 'utf-8'));
        }
        
        await cargarCachePersistente();

        console.log(`✓ TODO LISTO. Modelo: Gemini 3 Flash`);
        app.listen(port, () => console.log(`🚀 Servidor activo en puerto ${port}`));
    } catch (error) {
        console.error("❌ ERROR DE ARRANQUE:", error.message);
    }
};

startServer();