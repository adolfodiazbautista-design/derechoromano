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
    max: 100, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas peticiones. Calma.' }
});
app.use('/api/', limiter);

// --- UTILIDADES ---
function handleApiError(error, res) {
    console.error("Error API:", error.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error del sistema.' });
}

// FUNCIÓN DE SEGURIDAD PARA PARSEAR JSON (ESTO ARREGLA ULPIANO IA)
function limpiarYParsearJSON(texto) {
    try {
        // 1. Intenta parseo directo
        return JSON.parse(texto);
    } catch (e) {
        // 2. Si falla, busca el primer '{' y el último '}'
        try {
            const match = texto.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
        } catch (e2) {
            console.error("Fallo al limpiar JSON:", e2);
        }
        // 3. Si todo falla, devuelve un objeto de emergencia para que la web NO se rompa
        return {
            respuesta_principal: texto.replace(/["{}]/g, ""), 
            conexion_moderna: "Consulta el Código Civil vigente."
        };
    }
}

async function callGeminiWithRetries(payload) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    // Mantenemos 2.5-flash que es el rápido
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
        throw error;
    }
}

function getContextoRelevante(termino) {
    if (!termino) return '';
    const terminoBusqueda = termino.toLowerCase().trim();
    if (terminoBusqueda.includes('posesion')) {
        return `En Roma, la posesión se distingue de la propiedad. Tipos: Natural y Civil. Protección: Interdictos.`;
    }
    const encontrado = manualJson.find(item => item.termino.toLowerCase().includes(terminoBusqueda));
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
                espanol: entry.texto_espanol.trim()
            });
            if (matches.length >= 6) break; 
        }
    }
    return matches;
};

// --- ENDPOINTS ---

// 1. LABORATORIO DE CASOS (EL QUE YA FUNCIONABA BIEN)
app.post('/api/consulta', async (req, res) => {
    try {
        const { tipo, termino, currentCaseText } = req.body;
        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        const contextoFinal = getContextoRelevante(terminoNormalizado);
        const coincidencias = buscarDigesto(terminoNormalizado); 
        
        let bloqueDigesto = "";
        let instruccionFuentes = "";

        if (coincidencias.length > 0) {
            bloqueDigesto = coincidencias.map(c => `FUENTE LOCAL (${c.cita}): "${c.latin}" (${c.espanol})`).join("\n");
            instruccionFuentes = "Usa PRIORITARIAMENTE las fuentes locales proporcionadas.";
        } else {
            bloqueDigesto = "NO SE HAN ENCONTRADO CITAS LOCALES.";
            instruccionFuentes = "Busca en tu memoria: Digesto, Gayo, Partidas de Alfonso X.";
        }

        let promptSystem;

        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'Falta texto.' });
            
            promptSystem = `
CONFIGURACIÓN: Juez experto en Derecho Romano. IDIOMA: ESPAÑOL.
TAREA: Sentencia para: "${currentCaseText}".
FUENTES: ${bloqueDigesto}
INSTRUCCIONES: ${instruccionFuentes}
FORMATO:
1. FALLO: "Condeno/Absuelvo..."
2. MOTIVACIÓN: Explica y CITA LA FUENTE (ej. "Como dice Ulpiano en D.9.2...").
`;
        } else if (tipo === 'generar') {
            promptSystem = `
ROL: Profesor. TAREA: Caso práctico BREVE sobre "${termino}".
CONTEXTO: ${contextoFinal}
INSTRUCCIONES: Nombres romanos. Conflicto jurídico claro. Termina con "¿Quid Iuris?".
`;
        } else { return res.status(400).json({ error: 'Tipo error' }); }

        const payload = { contents: [{ parts: [{ text: promptSystem }] }] }; // Sin safetySettings para ir rápido
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA }); 
        
    } catch (error) { handleApiError(error, res); }
});

// 2. BUSCADOR PÁGINA
function buscarPagina(termino) {
    if (!termino) return { pagina: null, titulo: null };
    const t = termino.toLowerCase();
    const mejor = indiceJson.find(i => i.titulo.toLowerCase().includes(t)) || indiceJson[0];
    return { pagina: mejor?.pagina, titulo: mejor?.titulo };
}
app.post('/api/buscar-pagina', (req, res) => { res.json(buscarPagina(req.body.termino)); });

// 3. ULPIANO IA (REPARADO: MÁS ROBUSTO)
app.post('/api/consulta-unificada', async (req, res) => {
    try {
        const { termino } = req.body;
        const coincidencias = buscarDigesto(termino);
        const pagInfo = buscarPagina(termino);
        
        let digestoTxt = coincidencias.map(c => `(${c.cita}) ${c.latin}`).join('\n');

        // Eliminamos "response_mime_type: json" porque a veces falla con textos largos.
        // Hacemos el parseo manual con limpiarYParsearJSON.
        const prompt = `
Eres Ulpiano, profesor de Derecho Romano. 
Explica el término "${termino}" a un alumno en ESPAÑOL.

TUS FUENTES (Úsalas si sirven): 
${digestoTxt}

FORMATO DE RESPUESTA (IMPORTANTE):
Debes responder un objeto JSON con estas claves:
{
  "respuesta_principal": "Aquí tu explicación. Si tienes fuentes arriba, CITALAS (ej. D.41.1.1). Si no, usa tu conocimiento general.",
  "conexion_moderna": "Breve referencia al Código Civil actual."
}
NO escribas nada fuera del JSON.
`;

        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        
        const respuestaTexto = await callGeminiWithRetries(payload);
        
        // AQUÍ ESTÁ LA MAGIA QUE EVITA EL ERROR 500
        const jsonRespuesta = limpiarYParsearJSON(respuestaTexto);
        
        res.json({
            respuesta: jsonRespuesta.respuesta_principal,
            moderno: jsonRespuesta.conexion_moderna,
            pagina: pagInfo.pagina, 
            titulo: pagInfo.titulo   
        });

    } catch (error) {
        handleApiError(error, res);
    }
});

// 4. PARENTESCO
app.post('/api/consulta-parentesco', async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        const prompt = `Calcula parentesco romano entre ${person1} y ${person2}. Responde JSON: { "linea": "...", "grado": "...", "explicacion": "..." }`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const resp = await callGeminiWithRetries(payload);
        res.json(limpiarYParsearJSON(resp));
    } catch (error) { handleApiError(error, res); }
});

// --- ARRANQUE ---
const startServer = async () => {
    try {
        manualJson = JSON.parse(await fs.readFile('manual.json', 'utf-8'));
        indiceJson = JSON.parse(await fs.readFile('indice.json', 'utf-8'));
        
        try {
            digestoJson = JSON.parse(await fs.readFile('digesto_traducido_final.json', 'utf-8'));
        } catch (e) {
            console.log("⚠️ Usando digesto.json alternativo.");
            digestoJson = JSON.parse(await fs.readFile('digesto.json', 'utf-8'));
        }
        
        console.log(`✓ TODO LISTO. Modelo: gemini-2.5-flash`);
        app.listen(port, () => console.log(`🚀 http://localhost:${port}`));
    } catch (error) {
        console.error("❌ ERROR DE ARRANQUE:", error.message);
    }
};

startServer();