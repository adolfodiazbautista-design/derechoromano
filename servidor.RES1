require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; 
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Variables globales
let manualJson = [];
let indiceJson = [];
let digestoJson = []; 

// --- CONFIGURACIÓN ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet());
app.set('trust proxy', 1);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // Subido a 100 para evitar bloqueos en la demo
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas peticiones.' }
});
app.use('/api/', limiter);

// --- UTILIDADES ---
function handleApiError(error, res) {
    console.error("Error API Gemini:", error.response ? error.response.data : error.message);
    if (error.response?.data?.error?.code === 503) {
        return res.status(503).json({ error: 'MODEL_OVERLOADED', message: 'Servidor saturado, reintenta.' });
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Error del sistema.' });
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
    
    // MANTENEMOS TU MODELO PREFERIDO
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const geminiResponse = await axios.post(url, payload, { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000 
            }); 
            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return geminiResponse.data.candidates[0].content.parts[0].text;
            }
            throw new Error('Respuesta vacía.');
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
    const terminoBusqueda = termino.toLowerCase().trim();
    if (terminoBusqueda.includes('posesion') || terminoBusqueda.includes('interdictos')) {
        return `En Roma había dos clases de posesión: natural y civil (corpus y animus domini). AMBAS TIENEN PROTECCIÓN INTERDICTAL.`;
    }
    const encontrado = manualJson.find(item => item.termino.toLowerCase() === terminoBusqueda) ||
                     manualJson.find(item => item.sinonimos?.some(s => s.toLowerCase() === terminoBusqueda)) ||
                     manualJson.find(item => item.termino.toLowerCase().includes(terminoBusqueda));
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
                latin: entry.texto_latin ? entry.texto_latin.trim() : "",
                espanol_original: entry.texto_espanol.trim()
            });
            if (matches.length >= 5) break; 
        }
    }
    return matches;
};

// Función auxiliar para buscar página
function buscarPagina(termino) {
    if (!termino) return { pagina: null, titulo: null };
    const terminoLower = termino.toLowerCase().trim();
    let mejor = null, maxP = 0;
    indiceJson.forEach(tema => {
        let p = 0;
        if (tema.palabrasClave.some(k => k.toLowerCase() === terminoLower)) p += 10;
        if (tema.titulo.toLowerCase().includes(terminoLower)) p += 5;
        if (p > maxP) { maxP = p; mejor = tema; }
    });
    return { pagina: mejor?.pagina || null, titulo: mejor?.titulo || null };
}

// --- ENDPOINTS ---

// 1. LABORATORIO DE CASOS (Corregido y Mejorado)
app.post('/api/consulta', async (req, res) => {
    try {
        const { tipo, termino, currentCaseText } = req.body;
        if (!tipo) return res.status(400).json({ error: 'Falta tipo.' });

        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        const contextoFinal = getContextoRelevante(terminoNormalizado);
        
        // INYECCIÓN DE CITAS DEL DIGESTO (Crucial para tu demo)
        const coincidenciasDigesto = buscarDigesto(terminoNormalizado); 
        let textoCitasDigesto = "No se encontraron citas específicas. Usa principios generales del Ius Civile.";
        if (coincidenciasDigesto.length > 0) {
            textoCitasDigesto = coincidenciasDigesto.map(c => `CITA (${c.cita}): "${c.latin}" - Traducción: ${c.espanol_original}`).join("\n");
        }

        let promptFinalParaIA;

        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'Falta texto del caso.' });
            
            // PROMPT JUEZ (Con corrección de sintaxis y citas)
            promptFinalParaIA = `
Rol: Juez Romano (Iudex).
Tarea: Resolver el caso: "${currentCaseText}".

BIBLIOTECA DIGESTO DISPONIBLE:
${textoCitasDigesto}

INSTRUCCIONES:
1. Tu sentencia debe ser BREVE y solemne.
2. OBLIGATORIO: Fundamenta tu decisión citando expresamente los textos del Digesto proporcionados arriba (en latín si es posible).
3. Estructura: "FALLO: [Decisión]. MOTIVACIÓN: [Argumento con cita del Digesto]".
`;

        } else if (tipo === 'generar') {
            promptFinalParaIA = `
Rol: Profesor de Derecho Romano. 
Tarea: Crear un caso práctico CORTO (máx 4 líneas) sobre "${termino}". 
Contexto Manual: "${contextoFinal}".
Instrucciones:
1. Usa nombres romanos.
2. Plantea un conflicto jurídico claro cuya solución dependa de una distinción legal.
3. Termina con: "¿Quid Iuris?".
4. NO des la solución.
`;
        } else {
            return res.status(400).json({ error: 'Tipo inválido.' });
        }

        const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }], safetySettings };
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA }); 
        
    } catch (error) {
        handleApiError(error, res);
    }
});

// 2. BUSCADOR PÁGINA
app.post('/api/buscar-pagina', (req, res) => {
    try {
        const { termino } = req.body;
        res.json(buscarPagina(termino));
    } catch (error) {
        res.status(500).json({ error: 'Error buscador.' });
    }
});

// 3. ULPIANO IA (Chat)
app.post('/api/consulta-unificada', async (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'Falta término.' });

        const terminoNormalizado = termino.toLowerCase().trim();
        const contextoManual = getContextoRelevante(terminoNormalizado);
        const coincidenciasDigesto = buscarDigesto(terminoNormalizado);
        
        let digestoPrompt = "";
        if (coincidenciasDigesto.length > 0) {
            digestoPrompt = `
DIGESTO (CITAR OBLIGATORIAMENTE):
${coincidenciasDigesto.map(c => `- ${c.cita}: ${c.latin} (${c.espanol_original})`).join('\n')}
`;
        }
        const infoPagina = buscarPagina(termino);

        const promptFinalParaIA = `
Eres Ulpiano, profesor de Derecho Romano. Explica: "${termino}".
CONTEXTO: ${contextoManual}
${digestoPrompt}
Responde SOLO un JSON:
{
  "respuesta_principal": "Explicación académica citando el Digesto si hay datos.",
  "conexion_moderna": "Breve referencia al derecho actual."
}
`;
        const payload = { 
            contents: [{ parts: [{ text: promptFinalParaIA }] }], 
            safetySettings,
            generationConfig: { response_mime_type: "application/json" } 
        };
        
        const respuestaIA = await callGeminiWithRetries(payload);
        const cleanResponse = respuestaIA.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonRespuesta = JSON.parse(cleanResponse);
        
        res.json({
            respuesta: jsonRespuesta.respuesta_principal,
            moderno: jsonRespuesta.conexion_moderna,
            pagina: infoPagina.pagina, 
            titulo: infoPagina.titulo   
        });

    } catch (error) {
        handleApiError(error, res);
    }
});

// 4. PARENTESCO
app.post('/api/consulta-parentesco', async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        const prompt = `Calcula parentesco romano entre ${person1 || 'Ego'} y ${person2}. Responde JSON: { "linea": "...", "grado": "...", "explicacion": "..." }`;
        const payload = { 
            contents: [{ parts: [{ text: prompt }] }], 
            safetySettings, 
            generationConfig: { response_mime_type: "application/json" }
        };
        const resp = await callGeminiWithRetries(payload);
        res.json(JSON.parse(resp.replace(/```json/g, '').replace(/```/g, '').trim()));
    } catch (error) {
        handleApiError(error, res);
    }
});

// --- ARRANQUE ---
const startServer = async () => {
    try {
        manualJson = JSON.parse(await fs.readFile('manual.json', 'utf-8'));
        indiceJson = JSON.parse(await fs.readFile('indice.json', 'utf-8'));
        
        // MANTENEMOS TU ARCHIVO ORIGINAL
        digestoJson = JSON.parse(await fs.readFile('digesto_traducido_final.json', 'utf-8'));
        
        console.log(`✓ Datos cargados correctamente.`);
        app.listen(port, () => console.log(`🚀 SERVIDOR LISTO EN http://localhost:${port}`));
    } catch (error) {
        console.error("❌ ERROR FATAL:", error.message);
        process.exit(1);
    }
};

startServer();