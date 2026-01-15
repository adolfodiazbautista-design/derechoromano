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
    console.error("Error API Gemini:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error del sistema jurídico.' });
}

const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

async function callGeminiWithRetries(payload) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    // Usamos el modelo estable 1.5-flash para la demo
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const geminiResponse = await axios.post(url, payload, { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 
        }); 
        if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return geminiResponse.data.candidates[0].content.parts[0].text;
        }
        throw new Error('La IA devolvió una respuesta vacía.');
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

// 1. LABORATORIO DE CASOS (VERSIÓN DEFINITIVA CON FUENTES AMPLIADAS)
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
            instruccionFuentes = "Usa PRIORITARIAMENTE las fuentes locales proporcionadas arriba.";
        } else {
            // AQUÍ ESTÁ EL CAMBIO QUE PEDISTE: AMPLIACIÓN DE FUENTES
            bloqueDigesto = "NO SE HAN ENCONTRADO CITAS EN EL ARCHIVO LOCAL.";
            instruccionFuentes = `
            ATENCIÓN: Al no haber citas locales, DEBES buscar en tu MEMORIA JURÍDICA.
            Fuentes Autorizadas para citar (en orden de preferencia):
            1. El Digesto (D.).
            2. El Código de Justiniano (C.).
            3. Las Instituciones de Justiniano (Inst.).
            4. Las Instituciones de Gayo.
            5. El Código Teodosiano.
            6. Las Partidas de Alfonso X el Sabio (como recepción del derecho romano).
            `;
        }

        let promptSystem;

        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'Falta texto del caso.' });
            
            promptSystem = `
CONFIGURACIÓN:
Eres un Juez experto en Derecho Romano y su recepción histórica.
IDIOMA: ESPAÑOL ACTUAL (Claro y docente).

TAREA:
Dicta sentencia para: "${currentCaseText}".

FUENTES DISPONIBLES:
${bloqueDigesto}

INSTRUCCIONES DE RESOLUCIÓN:
${instruccionFuentes}

ESTRUCTURA DE RESPUESTA REQUERIDA:
1. FALLO: "Condeno a..." / "Absuelvo a..."
2. FUNDAMENTACIÓN JURÍDICA:
   - Explica el principio jurídico aplicable.
   - OBLIGATORIO: Debes incluir una CITA EXPLÍCITA de alguna de las fuentes autorizadas.
   - Ejemplo de formato si usas memoria: "Como establece Gayo en sus Instituciones (3.14)..." o "Siguiendo la Partida III, ley X..."
   
NO INVENTES NADA. Si no estás seguro de la cita exacta, parafrasea el principio jurídico mencionando la fuente ("El principio romano 'Prior tempore...' recogido en el Código...").
`;

        } else if (tipo === 'generar') {
            promptSystem = `
ROL: Profesor de Derecho Romano.
TAREA: Generar caso práctico BREVE sobre: "${termino}".
CONTEXTO: ${contextoFinal}
INSTRUCCIONES:
1. Usa nombres romanos.
2. Plantea un conflicto jurídico claro.
3. Termina con "¿Quid Iuris?".
4. Solo planteamiento, NO solución.
`;
        } else {
            return res.status(400).json({ error: 'Tipo desconocido' });
        }

        const payload = { contents: [{ parts: [{ text: promptSystem }] }], safetySettings };
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA }); 
        
    } catch (error) {
        handleApiError(error, res);
    }
});

// 2. BUSCADOR PÁGINA
function buscarPagina(termino) {
    if (!termino) return { pagina: null, titulo: null };
    const t = termino.toLowerCase();
    const mejor = indiceJson.find(i => i.titulo.toLowerCase().includes(t)) || indiceJson[0];
    return { pagina: mejor?.pagina, titulo: mejor?.titulo };
}

app.post('/api/buscar-pagina', (req, res) => {
    res.json(buscarPagina(req.body.termino));
});

// 3. ULPIANO IA (Chat Unificado)
app.post('/api/consulta-unificada', async (req, res) => {
    try {
        const { termino } = req.body;
        const coincidencias = buscarDigesto(termino);
        const pagInfo = buscarPagina(termino);
        
        let digestoTxt = coincidencias.map(c => `(${c.cita}) ${c.latin}`).join('\n');

        const prompt = `
Eres Ulpiano. Explica "${termino}" en ESPAÑOL.
Fuentes locales: ${digestoTxt}
Si no hay fuentes locales, usa tu conocimiento de: Digesto, Gayo, Partidas de Alfonso X.
Responde SOLO JSON:
{
  "respuesta_principal": "Explicación clara citando fuente jurídica.",
  "conexion_moderna": "Conexión con derecho civil actual."
}`;

        const payload = { 
            contents: [{ parts: [{ text: prompt }] }], 
            safetySettings,
            generationConfig: { response_mime_type: "application/json" } 
        };
        const resp = await callGeminiWithRetries(payload);
        const json = JSON.parse(resp.replace(/```json/g, '').replace(/```/g, '').trim());
        
        res.json({ ...json, pagina: pagInfo.pagina, titulo: pagInfo.titulo });
    } catch (error) {
        handleApiError(error, res);
    }
});

// 4. PARENTESCO
app.post('/api/consulta-parentesco', async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        const prompt = `Calcula parentesco romano entre ${person1} y ${person2}. Responde JSON: { "linea": "...", "grado": "...", "explicacion": "..." }`;
        const payload = { 
            contents: [{ parts: [{ text: prompt }] }], 
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
        
        try {
            digestoJson = JSON.parse(await fs.readFile('digesto_traducido_final.json', 'utf-8'));
        } catch (e) {
            console.log("⚠️ Buscando 'digesto.json' alternativo...");
            digestoJson = JSON.parse(await fs.readFile('digesto.json', 'utf-8'));
        }
        
        console.log(`✓ Datos cargados correctamente.`);
        app.listen(port, () => console.log(`🚀 SERVIDOR LISTO EN http://localhost:${port}`));
    } catch (error) {
        console.error("❌ ERROR FATAL:", error.message);
        process.exit(1);
    }
};

startServer();