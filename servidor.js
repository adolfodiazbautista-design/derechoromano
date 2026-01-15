require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; 
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// --- VARIABLES GLOBALES DE DATOS ---
let manualJson = [];
let indiceJson = [];
let digestoJson = []; 

// --- 1. CACHÉ ESTÁTICA (MODO DEMO - RESPUESTAS INSTANTÁNEAS) ---
// Estas respuestas saltan en 0ms y aseguran el éxito en la presentación.
const DEMO_CACHE = {
    "hurto": {
        es_caso: true,
        respuesta: `
***
## SENTENCIA
**JUEZ:** Magistrado con Imperium.
**ASUNTO:** Sustracción de cosa ajena (Furtum).

### 1. FALLO
**CONDENO** al demandado por delito de Hurto (*Furtum*).

### 2. MOTIVACIÓN JURÍDICA
Queda probado el *contrectatio* (manejo fraudulento) de la cosa con ánimo de lucro.
Como establece el principio jurídico fundamental:
*"Furtum est contrectatio rei fraudulosa lucri faciendi gratia vel ipsius rei vel etiam usus eius possessionisve"* (El hurto es el manejo fraudulento de una cosa para obtener lucro, ya sea de la propia cosa, de su uso o de su posesión).

**FUENTE JURÍDICA APLICABLE:**
Según **Paulo** en el **Digesto (D. 47.2.1.3)**, no basta la intención, se requiere el contacto físico indebido contra la voluntad del dueño.
***`
    },
    "posesion": {
        es_chat: true,
        json: {
            respuesta_principal: "La posesión (*possessio*) es el poder de hecho sobre una cosa, distinto de la propiedad (*dominium*). Para que exista posesión jurídica protegida por interdictos, se requieren dos elementos: el cuerpo (*corpus*, tenencia material) y la intención de tenerla como propia (*animus possidendi*). Si falta el ánimo, es mera detentación. Fuente: Como distingue Ulpiano en D. 41.2.1.",
            conexion_moderna: "En el Código Civil español (Art. 430), se mantiene esta distinción entre posesión natural y posesión civil."
        }
    },
    "mancipatio": {
        es_chat: true,
        json: {
            respuesta_principal: "La Mancipatio es el modo solemne y arcaico de transmitir la propiedad de las 'res mancipi' (fundos itálicos, esclavos, animales de tiro). Es un negocio formal ('per aes et libram') que requiere la presencia de 5 testigos, el libripens (portabalanzas) y unas palabras rituales ('Hoc ego hominem meum esse aio...'). Fuente: Gayo, Instituciones 1.119.",
            conexion_moderna: "No existe hoy, pero es el antecedente de las formalidades notariales en la transmisión de inmuebles."
        }
    },
    "usucapion": {
        es_chat: true,
        json: {
            respuesta_principal: "La Usucapio es la adquisición de la propiedad civil por la posesión continuada en el tiempo (1 año muebles, 2 inmuebles). Requisitos clásicos: Res habilis (cosa apta), Titulus (causa justa), Fides (buena fe inicial), Possessio (tenencia) y Tempus (tiempo). Fuente: Ley de las XII Tablas (VI.3) y Ulpiano (Reglas 19.8).",
            conexion_moderna: "Equivale a la prescripción adquisitiva del Código Civil (Art. 1930 y ss.)."
        }
    }
};

// --- 2. CACHÉ DINÁMICA (APRENDIZAJE AUTOMÁTICO TEMPORAL) ---
// Recuerda las últimas 50 preguntas para no gastar IA si se repiten.
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

// --- CONFIGURACIÓN DEL SERVIDOR ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet());
app.set('trust proxy', 1);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // 100 peticiones por 15 min (suficiente para demo)
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

// Limpiador de JSON (Vital para que UlpianoIA no falle)
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
    // Usamos el modelo rápido para la conferencia
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const geminiResponse = await axios.post(url, payload, { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 
        }); 
        if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return geminiResponse.data.candidates[0].content.parts[0].text;
        }
        throw new Error('Respuesta vacía de la IA.');
    } catch (error) {
        throw error;
    }
}

// --- MOTORES DE BÚSQUEDA ---

function getContextoRelevante(termino) {
    if (!termino) return '';
    const terminoBusqueda = termino.toLowerCase().trim();
    // Contexto forzado para términos clave
    if (terminoBusqueda.includes('posesion')) {
        return `En Roma, la posesión se distingue de la propiedad. Tipos: Natural y Civil. Protección: Interdictos.`;
    }
    const encontrado = manualJson.find(item => item.termino.toLowerCase().includes(terminoBusqueda));
    return encontrado ? encontrado.definicion : '';
}

const buscarDigesto = (term) => {
    if (!term || !digestoJson.length) return [];
    
    const termClean = term.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
    const tokens = termClean.split(/\s+/).filter(t => t.length > 3); 
    if (tokens.length === 0 && termClean.length > 0) tokens.push(termClean); 

    const matches = [];

    for (const entry of digestoJson) {
        let score = 0;
        const textoEsp = entry.texto_espanol ? entry.texto_espanol.toLowerCase() : "";
        const textoLat = entry.texto_latin ? entry.texto_latin.toLowerCase() : "";

        // Puntos por coincidencia de frase
        if (textoEsp.includes(termClean) || textoLat.includes(termClean)) {
            score += 100;
        }
        // Puntos por palabras sueltas
        tokens.forEach(token => {
            if (textoEsp.includes(token)) score += 10;
            if (textoLat.includes(token)) score += 10;
        });

        if (score > 0) {
            matches.push({
                cita: entry.cita, 
                latin: entry.texto_latin ? entry.texto_latin.trim() : "(Latín no disponible)",
                espanol: entry.texto_espanol ? entry.texto_espanol.trim() : "",
                score: score
            });
        }
    }
    // Devolvemos los 8 mejores resultados
    return matches.sort((a, b) => b.score - a.score).slice(0, 8);
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

// --- ENDPOINTS (APIS) ---

// 1. LABORATORIO DE CASOS (Generador y Juez)
app.post('/api/consulta', async (req, res) => {
    try {
        const { tipo, termino, currentCaseText } = req.body;
        
        // --- CHEQUEO DE CACHÉ ---
        if (tipo === 'resolver' && currentCaseText) {
            const txt = currentCaseText.toLowerCase();
            const key = currentCaseText.toLowerCase().trim().substring(0, 50);

            // Estática
            if (txt.includes("hurto") && DEMO_CACHE["hurto"]) {
                console.log("⚡ [CACHE DEMO] Sirviendo respuesta de Hurto");
                return res.json({ respuesta: DEMO_CACHE["hurto"].respuesta });
            }
            // Dinámica
            if (MEMORIA_DINAMICA.has(key)) {
                console.log("🧠 [CACHE DINÁMICA] Recuperando respuesta aprendida");
                return res.json({ respuesta: MEMORIA_DINAMICA.get(key) });
            }
        }
        // ------------------------

        const terminoBusqueda = (tipo === 'resolver' && currentCaseText) ? currentCaseText : termino;
        const terminoNormalizado = terminoBusqueda ? terminoBusqueda.substring(0, 100) : ''; 
        
        const contextoFinal = getContextoRelevante(termino ? termino : '');
        const coincidencias = buscarDigesto(terminoNormalizado); 
        
        let bloqueDigesto = "";
        
        if (coincidencias.length > 0) {
            bloqueDigesto = coincidencias.map(c => `FUENTE LOCAL (${c.cita}): "${c.latin}" (${c.espanol})`).join("\n");
        } else {
            bloqueDigesto = "NO SE HAN ENCONTRADO CITAS EXACTAS EN EL DIGESTO LOCAL.";
        }

        const instruccionesSeguridad = `
        PROTOCOLOS DE CITACIÓN OBLIGATORIOS:
        1. FUENTES LOCALES (Provistas arriba): Son tu prioridad. Úsalas y cita su número (D.x.x).
        2. SI NO HAY FUENTES LOCALES: 
           - PUEDES citar principios generales ("Nemo dat quod non habet").
           - PUEDES citar a juristas por nombre (Ulpiano, Gayo).
           - PROHIBIDO inventar un número de Digesto (D.x.x) si no lo ves en la lista de arriba.
        `;

        let promptSystem;

        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'Falta texto.' });
            promptSystem = `
CONFIGURACIÓN: Juez experto en Derecho Romano. IDIOMA: ESPAÑOL.
TAREA: Dictar Sentencia para: "${currentCaseText}".
FUENTES DISPONIBLES: ${bloqueDigesto}
${instruccionesSeguridad}

FORMATO RESPUESTA:
1. FALLO.
2. MOTIVACIÓN (Cita obligatoria de fuente local o principio general, sin inventar números).
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
        
        // Guardar en memoria
        if (tipo === 'resolver' && currentCaseText) {
            const key = currentCaseText.toLowerCase().trim().substring(0, 50);
            guardarEnMemoria(key, respuestaIA);
        }

        res.json({ respuesta: respuestaIA }); 
        
    } catch (error) { handleApiError(error, res); }
});

// 2. BUSCADOR PÁGINA (Índice)
app.post('/api/buscar-pagina', (req, res) => { 
    res.json(buscarPagina(req.body.termino)); 
});

// 3. ULPIANO IA (Chat Tutor)
app.post('/api/consulta-unificada', async (req, res) => {
    try {
        const { termino } = req.body;
        const termLower = termino ? termino.toLowerCase().trim() : "";
        const pagInfo = buscarPagina(termino);

        // --- CACHÉ HÍBRIDA ---
        if (DEMO_CACHE[termLower]) {
            return res.json({ ...DEMO_CACHE[termLower].json, pagina: pagInfo.pagina, titulo: pagInfo.titulo });
        }
        if (MEMORIA_DINAMICA.has(termLower)) {
             const jsonCached = limpiarYParsearJSON(MEMORIA_DINAMICA.get(termLower));
             return res.json({ ...jsonCached, pagina: pagInfo.pagina, titulo: pagInfo.titulo });
        }
        // ---------------------

        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        const contextoManual = getContextoRelevante(terminoNormalizado);
        const coincidencias = buscarDigesto(terminoNormalizado);
        
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
1. Usa las FUENTES DIGESTO LOCAL si son relevantes.
2. Si no hay, usa Principios Generales o citas de autor (Gayo, Partidas). NO inventes números D.x.x.

FORMATO JSON:
{
  "respuesta_principal": "Explicación clara en español. Cita fuentes.",
  "conexion_moderna": "Referencia al Derecho Civil actual."
}
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

// --- ARRANQUE DEL SERVIDOR ---
const startServer = async () => {
    try {
        // Carga de datos esenciales
        manualJson = JSON.parse(await fs.readFile('manual.json', 'utf-8'));
        indiceJson = JSON.parse(await fs.readFile('indice.json', 'utf-8'));
        try {
            digestoJson = JSON.parse(await fs.readFile('digesto_traducido_final.json', 'utf-8'));
        } catch (e) {
            console.log("⚠️ No encontré digesto_traducido_final.json, buscando digesto.json...");
            digestoJson = JSON.parse(await fs.readFile('digesto.json', 'utf-8'));
        }
        console.log(`✓ Datos cargados. Modelo: gemini-2.5-flash`);
        console.log(`🧠 Memoria Híbrida (Estática + LRU 50 items) ACTIVADA.`);
        app.listen(port, () => console.log(`🚀 Servidor listo en http://localhost:${port}`));
    } catch (error) {
        console.error("❌ ERROR FATAL DE ARRANQUE:", error.message);
    }
};

startServer();