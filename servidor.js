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

// Variables globales de datos
let manualJson = [];
let indiceJson = [];
let digestoJson = []; 

// --- 1. CACHÉ ESTÁTICA (MODO DEMO) ---
const DEMO_CACHE = {
    "hurto": {
        es_caso: true,
        respuesta: `
***
## SENTENCIA
**JUEZ:** Magistrado con Imperium.
**ASUNTO:** Sustracción de cosa ajena (Furtum).

### 1. FALLO
**CONDENO** al demandado por la comisión de un delito de Hurto (*Furtum*).

### 2. MOTIVACIÓN JURÍDICA
Ha quedado probado el elemento objetivo (*contrectatio*) y el subjetivo (*animus furandi*).
El Derecho Romano no exige el desplazamiento de la cosa, sino el "manejo fraudulento".

**FUENTE JURÍDICA (DEFINICIÓN CLÁSICA):**
Como establece el jurista **Paulo** en el **Digesto (D. 47.2.1.3)**:
*"Furtum est contrectatio rei fraudulosa lucri faciendi gratia vel ipsius rei vel etiam usus eius possessionisve"* (El hurto es el manejo fraudulento de una cosa con ánimo de lucro, ya sea de la propia cosa, de su uso o de su posesión).
***`
    },
    "posesion": {
        es_chat: true,
        json: {
            respuesta_principal: "La posesión (*possessio*) es una situación de hecho (*res facti*), consistente en la tenencia material de una cosa. \n\n**SOBRE LA PROTECCIÓN:** Los interdictos protegen a **cualquier poseedor**, ya sea civil (*ad usucapionem*) o natural. La protección se concede al hecho de la posesión para mantener la paz social.\n\n**LA EXCEPCIÓN (DETENTADORES):** Existen ciertos tenedores, llamados **detentadores** (como el arrendatario o el depositario), a los que, por razones históricas o socioeconómicas, no se les reconoce la cualidad de poseedores y, por tanto, **carecen de protección interdictal** propia (deben recurrir al dueño).",
            conexion_moderna: "Este principio se mantiene en la actualidad: todo poseedor tiene derecho a ser respetado en su posesión (Art. 446 del Código Civil) y existen procedimientos sumarios para su defensa."
        }
    },
    "mancipatio": {
        es_chat: true,
        json: {
            respuesta_principal: "La Mancipatio es el modo solemne y arcaico de adquirir la propiedad civil (*dominium*) de las *res mancipi*.\n\n**RITO:** Es un negocio *per aes et libram* (por el cobre y la balanza). Requiere la presencia del transmitente y el adquirente, 5 testigos ciudadanos romanos púberes, el *libripens* (portabalanzas) y la pronunciación de palabras solemnes (*nuncupatio*).\n\n**EFECTO:** Transfiere la propiedad y genera la obligación de **Auctoritas** (garantía): el transmitente debe defender al adquirente si un tercero reclama la cosa.",
            conexion_moderna: "Es el antecedente histórico de las formalidades actuales y de la obligación de saneamiento por evicción."
        }
    },
    "usucapion": {
        es_chat: true,
        json: {
            respuesta_principal: "La Usucapio es la adquisición del dominio por la posesión continuada durante el tiempo fijado por la ley.\n\n**REQUISITOS CLÁSICOS:**\n1. **Res habilis:** Cosa idónea (no robada - *res furtiva*).\n2. **Titulus:** Causa justa (compraventa, donación) que justifica la toma de posesión.\n3. **Fides:** Buena fe inicial (creencia de no lesionar derecho ajeno).\n4. **Possessio:** Tenencia material con ánimo de dueño.\n5. **Tempus:** Plazo legal (XII Tablas: 1 año muebles, 2 inmuebles; Justiniano amplía los plazos).",
            conexion_moderna: "Equivale a la prescripción adquisitiva del Código Civil actual (Arts. 1930 y ss.), aunque con plazos mucho más largos."
        }
    }
};

// --- 2. CACHÉ DINÁMICA (LRU) ---
const MEMORIA_DINAMICA = new Map(); 
const MAX_MEMORIA_ITEMS = 50; 

function guardarEnMemoria(key, valor) {
    if (MEMORIA_DINAMICA.has(key)) {
        MEMORIA_DINAMICA.delete(key);
    } else if (MEMORIA_DINAMICA.size >= MAX_MEMORIA_ITEMS) {
        const oldestKey = MEMORIA_DINAMICA.keys().next().value;
        MEMORIA_DINAMICA.delete(oldestKey);
    }
    MEMORIA_DINAMICA.set(key, valor);
}

function normalizarTexto(texto) {
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// --- CONFIGURACIÓN ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.set('trust proxy', 1);

// <--- CAMBIO: Servimos archivos desde la raíz actual (sin carpeta public) --->
app.use(express.static(__dirname));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas peticiones.' }
});
app.use('/api/', limiter);

// --- UTILIDADES ---
function handleApiError(error, res) {
    console.error("Error API:", error.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error del sistema.' });
}

function limpiarYParsearJSON(texto) {
    if (typeof texto === 'object') return texto;
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

// --- BÚSQUEDA ---
function getContextoRelevante(termino) {
    if (!termino || !manualJson.length) return '';
    const termClean = normalizarTexto(termino);
    const tokens = termClean.split(/\s+/).filter(t => t.length > 3);
    if (tokens.length === 0) tokens.push(termClean);

    if (termClean.includes('posesion')) {
        return `MANUAL: La posesión es un hecho protegido por interdictos. La protección abarca a cualquier poseedor (civil o natural), salvo a los detentadores (arrendatario, depositario).`;
    }

    const matches = [];
    for (const item of manualJson) {
        let score = 0;
        const itemTerm = item.termino ? normalizarTexto(item.termino) : "";
        const itemDef = item.definicion ? normalizarTexto(item.definicion) : "";

        if (itemTerm.includes(termClean)) score += 100;
        if (itemDef.includes(termClean)) score += 50;
        tokens.forEach(t => {
            if (itemTerm.includes(t)) score += 20;
            if (itemDef.includes(t)) score += 10;
        });

        if (score > 0) {
            matches.push({
                texto: `[${item.termino}]: ${item.definicion}`,
                score: score
            });
        }
    }
    const mejoresFragmentos = matches.sort((a, b) => b.score - a.score).slice(0, 5);
    return mejoresFragmentos.map(m => m.texto).join("\n\n");
}

const buscarDigesto = (term) => {
    if (!term || !digestoJson.length) return [];
    const termClean = normalizarTexto(term);
    const tokens = termClean.split(/\s+/).filter(t => t.length > 3); 
    if (tokens.length === 0 && termClean.length > 0) tokens.push(termClean); 

    const matches = [];
    for (const entry of digestoJson) {
        let score = 0;
        const textoEsp = entry.texto_espanol ? normalizarTexto(entry.texto_espanol) : "";
        const textoLat = entry.texto_latin ? normalizarTexto(entry.texto_latin) : "";

        if (textoEsp.includes(termClean) || textoLat.includes(termClean)) score += 100;
        tokens.forEach(token => {
            if (textoEsp.includes(token)) score += 10;
            if (textoLat.includes(token)) score += 10;
        });

        if (score > 0) {
            matches.push({
                cita: entry.cita, 
                latin: entry.texto_latin ? entry.texto_latin.trim() : "",
                espanol: entry.texto_espanol ? entry.texto_espanol.trim() : "",
                score: score
            });
        }
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, 8);
};

function buscarPagina(termino) {
    if (!termino || !indiceJson.length) return { pagina: null, titulo: null };
    const termClean = normalizarTexto(termino);
    const tokens = termClean.split(/\s+/).filter(t => t.length > 3); 
    if (tokens.length === 0) tokens.push(termClean);

    let mejorMatch = null;
    let maxScore = 0;
    indiceJson.forEach(item => {
        let score = 0;
        const tituloLower = normalizarTexto(item.titulo);
        if (tituloLower.includes(termClean)) score += 100;
        tokens.forEach(t => {
            if (tituloLower.includes(t)) score += 10;
        });
        if (item.palabrasClave && Array.isArray(item.palabrasClave)) {
             if (item.palabrasClave.some(k => normalizarTexto(k) === termClean)) score += 50;
             tokens.forEach(t => {
                 if (item.palabrasClave.some(k => normalizarTexto(k).includes(t))) score += 5;
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

app.post('/api/consulta', async (req, res) => {
    try {
        const { tipo, termino, currentCaseText } = req.body;
        
        if (tipo === 'resolver' && currentCaseText) {
            const txt = normalizarTexto(currentCaseText);
            const key = txt.substring(0, 50);
            if (txt.includes("hurto") && DEMO_CACHE["hurto"]) return res.json({ respuesta: DEMO_CACHE["hurto"].respuesta });
            if (MEMORIA_DINAMICA.has(key)) return res.json({ respuesta: MEMORIA_DINAMICA.get(key) });
        }

        const terminoBusqueda = (tipo === 'resolver' && currentCaseText) ? currentCaseText : termino;
        const terminoNormalizado = terminoBusqueda ? terminoBusqueda.substring(0, 100) : ''; 
        
        const contextoFinal = getContextoRelevante(termino ? termino : '');
        const coincidencias = buscarDigesto(terminoNormalizado); 
        let bloqueDigesto = coincidencias.length > 0 
            ? coincidencias.map(c => `FUENTE LOCAL (${c.cita}): "${c.latin}" (${c.espanol})`).join("\n")
            : "NO SE HAN ENCONTRADO CITAS EXACTAS EN EL DIGESTO LOCAL.";

        const instruccionesSeguridad = `
        FUENTES Y AUTORIDAD:
        1. Tu fuente principal es el DIGESTO LOCAL provisto.
        2. Puedes citar conocimiento general (Gayo, Instituciones) si es pertinente.
        3. NO inventes citas numéricas (D.x.x) si no las ves en el bloque de fuentes.
        `;

        let promptSystem;
        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'Falta texto.' });
            promptSystem = `
ROL: Juez Romano experto.
TAREA: Dictar Sentencia para: "${currentCaseText}".
FUENTES: ${bloqueDigesto}
INSTRUCCIONES: ${instruccionesSeguridad}
FORMATO: 1. FALLO. 2. MOTIVACIÓN JURÍDICA.
`;
        } else if (tipo === 'generar') {
            promptSystem = `
ROL: Profesor Derecho Romano. 
TAREA: Caso práctico BREVE sobre "${termino}".
CONTEXTO MANUAL: ${contextoFinal}
INSTRUCCIONES: Usa el contexto del manual para crear un caso realista.
`;
        } else { return res.status(400).json({ error: 'Tipo error' }); }

        const payload = { contents: [{ parts: [{ text: promptSystem }] }] };
        const respuestaIA = await callGeminiWithRetries(payload);
        
        if (tipo === 'resolver' && currentCaseText) {
            const key = normalizarTexto(currentCaseText).substring(0, 50);
            guardarEnMemoria(key, respuestaIA);
        }
        res.json({ respuesta: respuestaIA }); 
    } catch (error) { handleApiError(error, res); }
});

app.post('/api/buscar-pagina', (req, res) => { 
    res.json(buscarPagina(req.body.termino)); 
});

app.post('/api/consulta-unificada', async (req, res) => {
    try {
        const { termino } = req.body;
        const termLower = termino ? normalizarTexto(termino) : "";
        const pagInfo = buscarPagina(termino);

        if (DEMO_CACHE[termLower]) {
            const data = DEMO_CACHE[termLower].json;
            return res.json({
                respuesta: data.respuesta_principal, 
                moderno: data.conexion_moderna,      
                pagina: pagInfo.pagina, 
                titulo: pagInfo.titulo
            });
        }
        if (MEMORIA_DINAMICA.has(termLower)) {
             const jsonCached = limpiarYParsearJSON(MEMORIA_DINAMICA.get(termLower));
             return res.json({
                respuesta: jsonCached.respuesta_principal, 
                moderno: jsonCached.conexion_moderna,      
                pagina: pagInfo.pagina, 
                titulo: pagInfo.titulo
            });
        }

        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        const contextoManual = getContextoRelevante(terminoNormalizado);
        const coincidencias = buscarDigesto(terminoNormalizado);
        let digestoTxt = coincidencias.length > 0 
            ? coincidencias.map(c => `CITA: (${c.cita}) "${c.latin}"`).join('\n')
            : "";

        const prompt = `
Eres Ulpiano, profesor de Derecho Romano de la Universidad de Murcia.
Explica al alumno: "${termino}".
CONTEXTO DEL MANUAL DE LA CÁTEDRA: ${contextoManual || "Usa principios generales."}
FUENTES DIGESTO: ${digestoTxt}
INSTRUCCIONES: Prioridad Absoluta al Manual.
FORMATO JSON: { "respuesta_principal": "...", "conexion_moderna": "..." }
NO escribas nada fuera del JSON.
`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const respuestaTexto = await callGeminiWithRetries(payload);
        guardarEnMemoria(termLower, respuestaTexto);
        const jsonRespuesta = limpiarYParsearJSON(respuestaTexto);
        
        res.json({
            respuesta: jsonRespuesta.respuesta_principal,
            moderno: jsonRespuesta.conexion_moderna,
            pagina: pagInfo.pagina, 
            titulo: pagInfo.titulo   
        });
    } catch (error) { handleApiError(error, res); }
});

app.post('/api/consulta-parentesco', async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        const prompt = `Calcula parentesco romano entre ${person1} y ${person2}. Responde JSON: { "linea": "...", "grado": "...", "explicacion": "..." }`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const resp = await callGeminiWithRetries(payload);
        res.json(limpiarYParsearJSON(resp));
    } catch (error) { handleApiError(error, res); }
});

// <--- CAMBIO: Ruta para servir index.html desde la raíz --->
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const startServer = async () => {
    try {
        manualJson = JSON.parse(await fs.readFile('manual.json', 'utf-8'));
        indiceJson = JSON.parse(await fs.readFile('indice.json', 'utf-8'));
        try {
            digestoJson = JSON.parse(await fs.readFile('digesto_traducido_final.json', 'utf-8'));
        } catch (e) {
            console.log("⚠️ Usando digesto.json...");
            digestoJson = JSON.parse(await fs.readFile('digesto.json', 'utf-8'));
        }
        console.log(`✓ TODO LISTO. Modelo: gemini-2.5-flash`);
        app.listen(port, () => console.log(`🚀 http://localhost:${port}`));
    } catch (error) {
        console.error("❌ ERROR DE ARRANQUE:", error.message);
    }
};

startServer();