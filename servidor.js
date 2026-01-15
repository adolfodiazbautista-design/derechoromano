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

function limpiarYParsearJSON(texto) {
    try {
        return JSON.parse(texto);
    } catch (e) {
        try {
            const match = texto.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e2) {}
        return {
            respuesta_principal: texto.replace(/["{}]/g, ""), 
            conexion_moderna: "Consulta el Código Civil vigente."
        };
    }
}

async function callGeminiWithRetries(payload) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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
            if (matches.length >= 8) break; 
        }
    }
    return matches;
};

function buscarPagina(termino) {
    if (!termino || !indiceJson.length) return { pagina: null, titulo: null };
    const terminoLimpio = termino.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
    const palabrasBusqueda = terminoLimpio.split(/\s+/).filter(p => p.length > 3); 
    if (palabrasBusqueda.length === 0) palabrasBusqueda.push(terminoLimpio);

    let mejorMatch = null;
    let maxScore = 0;

    indiceJson.forEach(item => {
        let score = 0;
        const tituloLower = item.titulo.toLowerCase();
        if (tituloLower.includes(terminoLimpio)) score += 100;
        palabrasBusqueda.forEach(palabra => {
            if (tituloLower.includes(palabra)) score += 10;
        });
        if (item.palabrasClave && Array.isArray(item.palabrasClave)) {
             if (item.palabrasClave.some(k => k.toLowerCase() === terminoLimpio)) score += 50;
             palabrasBusqueda.forEach(palabra => {
                 if (item.palabrasClave.some(k => k.toLowerCase().includes(palabra))) score += 5;
             });
        }
        if (score > maxScore) {
            maxScore = score;
            mejorMatch = item;
        }
    });
    if (mejorMatch && maxScore > 0) return { pagina: mejorMatch.pagina, titulo: mejorMatch.titulo };
    return { pagina: null, titulo: null }; 
}

// --- ENDPOINTS ---

// 1. LABORATORIO DE CASOS
app.post('/api/consulta', async (req, res) => {
    try {
        const { tipo, termino, currentCaseText } = req.body;
        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        const contextoFinal = getContextoRelevante(terminoNormalizado);
        const coincidencias = buscarDigesto(terminoNormalizado); 
        
        let bloqueDigesto = "";
        
        // Construimos el bloque de fuentes locales
        if (coincidencias.length > 0) {
            bloqueDigesto = coincidencias.map(c => `FUENTE DIGESTO LOCAL (${c.cita}): "${c.latin}" (${c.espanol})`).join("\n");
        } else {
            bloqueDigesto = "NO SE HAN ENCONTRADO CITAS EXACTAS EN EL DIGESTO LOCAL.";
        }

        // INSTRUCCIONES HÍBRIDAS (LO QUE PEDISTE)
        const instruccionesSeguridad = `
        PROTOCOLOS DE CITACIÓN (STRICT MODE):
        
        1. DIGESTO (CRÍTICO): 
           - Si la cita está en 'FUENTES DISPONIBLES' (arriba), ÚSALA y cíta el número exacto.
           - Si NO está arriba: TIENES PROHIBIDO INVENTAR UN NÚMERO (ej. D.20.3.1).
           - En su lugar, cita solo el nombre del jurista (ej. "Según Ulpiano...") o una Regla General.

        2. OTRAS FUENTES (PERMITIDO):
           - Puedes usar tu memoria interna para citar (sin inventar):
             * Instituciones de Gayo o Justiniano.
             * Código Teodosiano.
             * Las Siete Partidas de Alfonso X.
             * Artículos reales de Códigos Civiles Modernos (España, Francia, Italia, Chile...).
             * Reglas Jurídicas Latinas (Regulae Iuris).
        `;

        let promptSystem;

        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'Falta texto.' });
            promptSystem = `
CONFIGURACIÓN: Juez experto en Derecho Romano y Derecho Comparado.
IDIOMA: ESPAÑOL.

TAREA: Dictar Sentencia para: "${currentCaseText}".
FUENTES DISPONIBLES: ${bloqueDigesto}
${instruccionesSeguridad}

FORMATO DE RESPUESTA:
1. FALLO: "Condeno..." / "Absuelvo..."
2. MOTIVACIÓN:
   - Argumenta con rigor.
   - Cita obligatoriamente una fuente.
   - Si citas el Digesto sin tener la fuente local, di: "Como señala la jurisprudencia romana..." o "Ulpiano establece...". NUNCA pongas "D.X.X.X" si no es real.
   - Si citas Partidas o CC, hazlo con precisión.
`;
        } else if (tipo === 'generar') {
            promptSystem = `
ROL: Profesor. TAREA: Caso práctico BREVE sobre "${termino}".
CONTEXTO: ${contextoFinal}
INSTRUCCIONES: Nombres romanos. Conflicto jurídico claro. Termina con "¿Quid Iuris?".
`;
        } else { return res.status(400).json({ error: 'Tipo error' }); }

        const payload = { contents: [{ parts: [{ text: promptSystem }] }] };
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA }); 
        
    } catch (error) { handleApiError(error, res); }
});

// 2. BUSCADOR PÁGINA
app.post('/api/buscar-pagina', (req, res) => { 
    res.json(buscarPagina(req.body.termino)); 
});

// 3. ULPIANO IA (Mismas reglas híbridas)
app.post('/api/consulta-unificada', async (req, res) => {
    try {
        const { termino } = req.body;
        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        const contextoManual = getContextoRelevante(terminoNormalizado);
        const coincidencias = buscarDigesto(terminoNormalizado);
        const pagInfo = buscarPagina(termino); 
        
        let digestoTxt = "";
        if (coincidencias.length > 0) {
            digestoTxt = coincidencias.map(c => `CITA LOCAL: (${c.cita}) "${c.latin}"`).join('\n');
        } else {
            digestoTxt = "No hay citas locales exactas.";
        }

        const prompt = `
Eres Ulpiano, profesor de Derecho Romano.
Explica: "${termino}".
CONTEXTO MANUAL: "${contextoManual}"
FUENTES DIGESTO LOCAL: ${digestoTxt}

REGLAS DE CITACIÓN:
1. DIGESTO: Solo usa citas numéricas (D.x.x) si están en "FUENTES DIGESTO LOCAL". Si no, cita por nombre de jurista.
2. OTRAS FUENTES: Eres libre de citar Instituciones, Partidas, Código Teodosiano o Códigos Civiles modernos (artículos reales).

FORMATO JSON:
{
  "respuesta_principal": "Explicación clara en español. Cita fuentes según las reglas.",
  "conexion_moderna": "Referencia al Derecho Civil actual (artículos reales)."
}
`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const respuestaTexto = await callGeminiWithRetries(payload);
        const jsonRespuesta = limpiarYParsearJSON(respuestaTexto);
        
        res.json({
            respuesta: jsonRespuesta.respuesta_principal,
            moderno: jsonRespuesta.conexion_moderna,
            pagina: pagInfo.pagina, 
            titulo: pagInfo.titulo   
        });

    } catch (error) { handleApiError(error, res); }
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