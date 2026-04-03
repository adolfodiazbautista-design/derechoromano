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

// Archivo de caché física para no pagar por consultas repetidas
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

// Limitador estricto para proteger vuestra cuenta bancaria
const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 15, // Máximo 15 consultas por hora por cada IP
    message: { error: 'LÍMITE_ALCANZADO', message: 'Habéis excedido las consultas permitidas. Volved en una hora.' }
});

// --- 3. UTILIDADES ---
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

async function callGeminiWithRetries(payload) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    // Uso de Gemini 3 Flash (Alta eficiencia y bajo coste)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${GEMINI_API_KEY}`;

    payload.generationConfig = {
        maxOutputTokens: 450, // Límite físico de tokens para ahorrar dinero
        temperature: 0.1,     
        topP: 0.8
    };

    try {
        const resp = await axios.post(url, payload, { timeout: 35000 }); 
        if (resp.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return resp.data.candidates[0].content.parts[0].text;
        }
        throw new Error('Respuesta de API vacía.');
    } catch (error) { throw error; }
}

// --- 4. ENDPOINTS ---

app.post('/api/consulta-unificada', apiLimiter, async (req, res) => {
    try {
        const { termino } = req.body;
        const termKey = normalizarTexto(termino);

        // Si existe en caché, el coste para vos es 0 €
        if (MEMORIA_PERSISTENTE[termKey]) {
            console.log(`⚡ Sirviendo desde caché local: ${termKey}`);
            return res.json(MEMORIA_PERSISTENTE[termKey]);
        }

        const prompt = `Eres Ulpiano, profesor de Derecho Romano. Explica: "${termino}". Responde solo JSON: { "respuesta_principal": "...", "conexion_moderna": "..." }`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        
        const respuestaTexto = await callGeminiWithRetries(payload);
        const jsonRespuesta = limpiarYParsearJSON(respuestaTexto);
        
        const respuestaFinal = {
            respuesta: jsonRespuesta.respuesta_principal,
            moderno: jsonRespuesta.conexion_moderna
        };

        await guardarEnCache(termKey, respuestaFinal);
        res.json(respuestaFinal);
    } catch (error) {
        res.status(500).json({ error: 'Error procesando la consulta.' });
    }
});

app.post('/api/consulta-parentesco', apiLimiter, async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        const key = normalizarTexto(`fam-${person1}-${person2}`);
        if (MEMORIA_PERSISTENTE[key]) return res.json(MEMORIA_PERSISTENTE[key]);

        const prompt = `Calcula parentesco romano entre ${person1} y ${person2}. Responde JSON: { "linea": "...", "grado": "...", "explicacion": "..." }`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const resp = await callGeminiWithRetries(payload);
        const finalJson = limpiarYParsearJSON(resp);

        await guardarEnCache(key, finalJson);
        res.json(finalJson);
    } catch (error) { res.status(500).json({ error: 'Error en parentesco.' }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- 5. ARRANQUE DEL SISTEMA ---
const startServer = async () => {
    try {
        // Carga de archivos doctrina
        manualJson = JSON.parse(await fs.readFile('manual.json', 'utf-8'));
        indiceJson = JSON.parse(await fs.readFile('indice.json', 'utf-8'));
        
        // CORRECCIÓN QUIRÚRGICA: Nombre de vuestro archivo corregido
        digestoJson = JSON.parse(await fs.readFile('digesto_traducido_final.json', 'utf-8'));
        
        await cargarCache();

        app.listen(port, () => {
            console.log(`🚀 SERVIDOR ACTIVO EN PUERTO ${port}`);
            console.log(`✓ Modelo: Gemini 3 Flash. Archivo: digesto_traducido_final.json`);
        });
    } catch (error) {
        console.error("❌ ERROR CRÍTICO DE ARRANQUE:", error.message);
        process.exit(1); 
    }
};

startServer();