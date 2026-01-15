require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; 
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Variables globales para almacenar los datos
let manualJson = [];
let indiceJson = [];
let digestoJson = []; 

// --- CONFIGURACIÓN DE MIDDLEWARE Y SEGURIDAD ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet());
app.set('trust proxy', 1);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30, // Límite ajustado para examen
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos.' }
});
app.use('/api/', limiter);

// --- FUNCIONES DE UTILIDAD Y LÓGICA DE API ---
function handleApiError(error, res) {
    console.error("Error definitivo desde la API de Gemini:", error.response ? error.response.data : error.message);
    if (error.response?.data?.error?.code === 503) {
        return res.status(503).json({ error: 'MODEL_OVERLOADED', message: 'Ulpiano parece estar desbordado. Por favor, dale un minuto y vuelve a intentarlo.' });
    }
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return res.status(504).json({ error: 'REQUEST_TIMEOUT', message: 'La solicitud ha tardado demasiado tiempo. El servidor ha abortado la conexión. Por favor, inténtalo de nuevo.' });
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Ha ocurrido un error en el servidor o al comunicarse con la IA.' });
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
    if (!GEMINI_API_KEY) throw new Error("API Key de Gemini no encontrada.");
    
    // *** CAMBIO CRÍTICO 2026: Usamos Gemini 2.5 Flash ***
    // Si este falla, mira la consola al arrancar para ver la lista real.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const geminiResponse = await axios.post(url, payload, { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 290000 
            }); 

            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return geminiResponse.data.candidates[0].content.parts[0].text;
            }
            throw new Error('Respuesta de la IA inválida o vacía.');
        } catch (error) {
            // Si el error es 404 (Modelo no encontrado), no tiene sentido reintentar. Lanzamos error directo.
            if (error.response?.status === 404) {
                console.error("❌ ERROR CRÍTICO: El nombre del modelo 'gemini-2.5-flash' es incorrecto o no tienes acceso.");
                throw error;
            }

            if (error.response?.status === 503 && attempt < MAX_RETRIES) {
                console.log(`Intento ${attempt} fallido (Modelo Sobrecargado). Reintentando en ${RETRY_DELAY / 1000}s...`);
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
        return `En Roma había dos clases de posesión: natural (solo corpus) y civil (corpus y animus domini) AMBAS FORMAS DE POSESIÓN TENÍAN PROTECCIÓN INTERDICTAL. Había una serie de casos, llamados "detentadores" (por ejemplo los arrendatarios) que, por razones desconocidas, no tenían protección de los interdictos.`;
    }

    const encontrado = manualJson.find(item => item.termino.toLowerCase() === terminoBusqueda) ||
                     manualJson.find(item => item.sinonimos?.some(s => s.toLowerCase() === terminoBusqueda)) ||
                     manualJson.find(item => item.termino.toLowerCase().includes(terminoBusqueda));
    return encontrado ? encontrado.definicion : '';
}

const buscarDigesto = (term) => {
    if (!term || !digestoJson.length) {
        return [];
    }

    const termLower = term.toLowerCase().trim();
    const matches = [];
    const maxMatches = 3; 

    for (const entry of digestoJson) {
        if (entry.texto_espanol && entry.texto_espanol.toLowerCase().includes(termLower)) {
            matches.push({
                cita: entry.cita,
                latin: entry.texto_latin.trim(),
                espanol_original: entry.texto_espanol.trim()
            });
            if (matches.length >= maxMatches) { 
                break; 
            }
        }
    }
    return matches;
};


// --- ENDPOINTS DE LA API ---

app.post('/api/consulta', async (req, res) => {
    try {
        const { tipo, termino, currentCaseText } = req.body;
        if (!tipo) return res.status(400).json({ error: 'No se ha proporcionado un tipo de consulta.' });

        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        const contextoFinal = getContextoRelevante(terminoNormalizado);
        
        // CORRECCIÓN: Buscamos citas del Digesto también para este endpoint
        const coincidenciasDigesto = buscarDigesto(terminoNormalizado); 
        let textoCitasDigesto = "";
        if (coincidenciasDigesto.length > 0) {
            textoCitasDigesto = coincidenciasDigesto.map(c => `"${c.latin}" (${c.cita})`).join("\n");
        }

        let promptFinalParaIA;

        if (tipo === 'resolver') {
            if (!currentCaseText) return res.status(400).json({ error: 'No se proporcionó texto del caso a resolver.' });
            
            // PROMPT DEL JUEZ MEJORADO
            promptFinalParaIA = `
Rol: Juez romano estricto. 
Tarea: Resolver el caso: "${currentCaseText}".
Contexto Manual: "${contextoFinal}".
CITAS DISPONIBLES DEL DIGESTO:
${textoCitasDigesto}

INSTRUCCIONES DE SENTENCIA:
1. Tu solución debe ser BREVE (máx 3 frases).
2. OBLIGATORIO: Debes fundamentar tu fallo citando explícitamente alguna de las "CITAS DISPONIBLES DEL DIGESTO" que te he proporcionado arriba. Si ninguna encaja perfectamente, usa tu conocimiento general del Corpus Iuris pero CITA la fuente (ej. Ulpiano, Gayo).
3. Formato: "FALLO: [Decisión]. MOTIVACIÓN: Según establece [Jurista] en [Cita]..."
`;

        } else if (tipo === 'generar') {
            if (!termino) return res.status(400).json({ error: 'No se proporcionó término para generar el caso.' });
            
            // PROMPT DEL PROFESOR (GENERADOR)
            promptFinalParaIA = `
Rol: Profesor de Derecho Romano. 
Tarea: Crear un caso práctico CORTO (máx 3 frases) sobre "${termino}". 
Contexto: "${contextoFinal}".
Instrucciones:
1. Usa nombres romanos (Ticio, Cayo, Mevio).
2. El caso debe plantear un conflicto jurídico claro cuya solución dependa de una distinción legal (ej. posesión vs propiedad, dolo vs culpa).
3. Termina con la pregunta: "¿Quid Iuris?" (¿Qué dice el derecho?).
4. NO des la solución todavía.
`;
        
        } else {
            return res.status(400).json({ error: 'Tipo de consulta no válido para este endpoint.' });
        }

        const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }], safetySettings };
        
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA }); 
        
    } catch (error) {
        handleApiError(error, res);
    }
});
function buscarPagina(termino) {
    if (!termino) return { pagina: null, titulo: null };

    const terminoLower = termino.toLowerCase().trim();
    let mejorCoincidencia = null;
    let maxPuntuacion = 0;

    indiceJson.forEach(tema => {
        let puntuacionActual = 0;
        if (tema.palabrasClave.some(p => p.toLowerCase() === terminoLower)) puntuacionActual += 10;
        if (tema.titulo.toLowerCase().includes(terminoLower)) puntuacionActual += 5;
        if (tema.palabrasClave.some(p => p.toLowerCase().includes(terminoLower))) puntuacionActual += 3;

        if (puntuacionActual > maxPuntuacion) {
            maxPuntuacion = puntuacionActual;
            mejorCoincidencia = tema;
        }
    });

    return { pagina: mejorCoincidencia?.pagina || null, titulo: mejorCoincidencia?.titulo || null };
}

app.post('/api/buscar-pagina', (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const result = buscarPagina(termino);
        res.json(result);
    } catch (error) {
        console.error("Error en /api/buscar-pagina:", error);
        res.status(500).json({ error: 'Error interno del servidor al buscar la página.' });
    }
});

// --- ENDPOINT UNIFICADO OPTIMIZADO ---
app.post('/api/consulta-unificada', async (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });

        const terminoNormalizado = termino.toLowerCase().trim();
        const contextoManual = getContextoRelevante(terminoNormalizado);
        const coincidenciasDigesto = buscarDigesto(termino);
        let digestoPrompt = "";
        
        if (coincidenciasDigesto.length > 0) {
            digestoPrompt = "\n\n--- FUENTE ADICIONAL: DIGESTO DE JUSTINIANO ---\n" +
                            "He encontrado las siguientes citas del Digesto. Tu tarea es:\n" +
                            "1. **SELECCIONAR LA ÚNICA CITA MÁS RELEVANTE.**\n" +
                            "2. Realizar una **traducción al español profesional** del latín.\n" +
                            "3. Incluir la cita seleccionada en la respuesta final con el formato '# APUNTE DE ULPIANOIA: IUS ROMANUM #'.\n\n";
            
            coincidenciasDigesto.forEach((match, index) => {
                digestoPrompt += `--- Cita ${index + 1} (${match.cita}) ---\nTEXTO LATÍN: "${match.latin}"\n\n`;
            });
        }

        const infoPagina = buscarPagina(termino);

        const promptFinalParaIA = `
Rol: Jurista Ulpiano (experto didáctico en Derecho Romano).
Tarea: Proporcionar información sobre el término "${termino}".
Contexto de Referencia (Manual): "${contextoManual}".
${digestoPrompt}

--- INSTRUCCIONES DE FORMATO DE SALIDA ---
Responde ÚNICAMENTE con un objeto JSON válido.
{
  "respuesta_principal": "Explicación breve y didáctica (máximo DOS PÁRRAFOS). Cada vez que expliques un concepto o resuelvas una duda, DEBES citar los textos del Digesto (D.) relevantes.
Si es posible, incluye la cita en latín y su traducción, o al menos la referencia exacta (Libro, Título, Fragmento).
No inventes citas. Usa el archivo 'digesto.json' cargado en el contexto o tu conocimiento general del Corpus Iuris Civilis.",
  "conexion_moderna": "Explicación concisa de la herencia en el derecho moderno (máximo un párrafo)."
}
`.trim();

        const payload = { 
            contents: [{ parts: [{ text: promptFinalParaIA }] }], 
            safetySettings,
            generationConfig: { response_mime_type: "application/json" } 
        };
        
        const respuestaIA = await callGeminiWithRetries(payload);
        
        let jsonRespuesta;
        try {
            const cleanResponse = respuestaIA.replace(/```json/g, '').replace(/```/g, '').trim();
            jsonRespuesta = JSON.parse(cleanResponse);
        } catch (e) {
            console.error("Error al parsear JSON de Gemini:", respuestaIA);
            throw new Error('La IA no devolvió un JSON válido.');
        }
        
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

// --- ENDPOINT PARENTESCO OPTIMIZADO ---
app.post('/api/consulta-parentesco', async (req, res) => {
    try {
        const { person1, person2 } = req.body;
        if (!person2) {
            return res.status(400).json({ message: "Falta el parámetro 'person2'." });
        }

        const promptFinalParaIA = `
Rol: Experto en Derecho Romano (Parentesco).
Tarea: Calcular el parentesco entre "${person1 || 'Yo'}" y "${person2}".
Usa el método romano (*tot gradus quot generationes*).
Responde ÚNICAMENTE con un objeto JSON:
{
  "linea": "Ej: Línea Colateral",
  "grado": "Ej: Tercer Grado",
  "explicacion": "Breve explicación del cálculo."
}
`.trim();

        const payload = { 
            contents: [{ parts: [{ text: promptFinalParaIA }] }], 
            safetySettings,
            generationConfig: { response_mime_type: "application/json" }
        };
        
        const respuestaIA_texto = await callGeminiWithRetries(payload);

        let jsonRespuesta;
        try {
            const cleanResponse = respuestaIA_texto.replace(/```json/g, '').replace(/```/g, '').trim();
            jsonRespuesta = JSON.parse(cleanResponse);
        } catch (e) {
            console.error("Error al parsear JSON de Gemini (Parentesco):", respuestaIA_texto);
            throw new Error('La IA no devolvió un JSON válido.');
        }
        
        res.json(jsonRespuesta);

    } catch (error) {
        handleApiError(error, res);
    }
});

// --- FUNCIÓN DE ARRANQUE DEL SERVIDOR ---
const startServer = async () => {
    try {
        // 1. CARGA DE DATOS
        const manualData = await fs.readFile('manual.json', 'utf-8');
        manualJson = JSON.parse(manualData);
        console.log(`✓ Manual JSON cargado: ${manualJson.length} conceptos.`);

        const indiceData = await fs.readFile('indice.json', 'utf-8');
        indiceJson = JSON.parse(indiceData);
        console.log(`✓ Índice JSON cargado: ${indiceJson.length} temas.`);

        const digestoData = await fs.readFile('digesto_traducido_final.json', 'utf-8');
        digestoJson = JSON.parse(digestoData);
        console.log(`✓ Digesto JSON cargado: ${digestoJson.length} citas.`);
        
        // 2. DIAGNÓSTICO DE MODELOS (IMPORTANTE)
        // Esto imprimirá en la consola los modelos que REALMENTE tienes disponibles
        if (process.env.GEMINI_API_KEY) {
            try {
                const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
                const listResponse = await axios.get(listUrl);
                console.log("\n📋 --- DIAGNÓSTICO DE MODELOS GEMINI ---");
                console.log("Estos son los modelos activos en tu cuenta. Si falla 'gemini-2.5-flash', copia uno de estos:");
                listResponse.data.models.forEach(m => {
                    if (m.name.includes('flash')) console.log(`   👉 ${m.name.replace('models/', '')}`);
                });
                console.log("------------------------------------------\n");
            } catch (e) {
                console.log("⚠️ No se pudo obtener la lista de modelos (¿API Key incorrecta?).", e.message);
            }
        }

        const server = app.listen(port, () => {
            console.log(`🚀 Servidor de Derecho Romano escuchando en http://localhost:${port}`);
        });
        
        server.timeout = 840000; 
        console.log("⏱️ Server Timeout ajustado a 84000 segundos (14 minutos)."); 

    } catch (error) {
        console.error("✗ Error fatal durante el arranque del servidor:", error);
        process.exit(1); 
    }
};

console.log("--- [OK] Ejecutando servidor.js v15.17 (Gemini 2.5 + Diagnóstico) ---");
startServer();