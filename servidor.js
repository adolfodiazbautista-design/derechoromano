require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // Usar la versión asíncrona de fs
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Variables globales para almacenar los datos
let manualJson = [];
let indiceJson = [];
let digestoJson = []; 
// Variable 'parrafosDelDigesto' eliminada.

// Objeto 'diccionarioLatin' eliminado.

// --- CONFIGURACIÓN DE MIDDLEWARE Y SEGURIDAD ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet());
app.set('trust proxy', 1);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
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
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Ha ocurrido un error en el servidor.' });
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return geminiResponse.data.candidates[0].content.parts[0].text;
            }
            throw new Error('Respuesta de la IA inválida o vacía.');
        } catch (error) {
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
    const encontrado = manualJson.find(item => item.termino.toLowerCase() === terminoBusqueda) ||
                     manualJson.find(item => item.sinonimos?.some(s => s.toLowerCase() === terminoBusqueda)) ||
                     manualJson.find(item => item.termino.toLowerCase().includes(terminoBusqueda));
    return encontrado ? encontrado.definicion : '';
}

// Función de búsqueda en el Digesto (SIN CAMBIOS)
const buscarDigesto = (term) => {
    if (!term || !digestoJson.length) {
        return [];
    }

    const termLower = term.toLowerCase().trim();
    const matches = [];
    const maxMatches = 3;

    for (const entry of digestoJson) {
        // Buscamos en el texto en español para encontrar coincidencias con el término del usuario
        if (entry.texto_espanol && entry.texto_espanol.toLowerCase().includes(termLower)) {
            matches.push({
                cita: entry.cita,
                latin: entry.texto_latin.trim(),
                espanol_original: entry.texto_espanol.trim()
            });
            if (matches.length >= maxMatches) {
                break; // Máximo 3 coincidencias
            }
        }
    }
    return matches;
};


// --- ENDPOINTS DE LA API ---

app.post('/api/consulta', async (req, res) => {
    try {
        const { promptOriginal, termino, currentCaseText } = req.body;
        if (!promptOriginal) return res.status(400).json({ error: 'No se ha proporcionado un prompt.' });

        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        const contextoFinal = terminoNormalizado.includes('posesion')
            ? `En Roma había dos clases de posesión: natural (solo corpus) y civil (corpus y animus domini) AMBAS FORMAS DE POSESIÓN TENÍAN PROTECCIÓN INTERDICTAL. Había una serie de casos, llamados "detentadores" (por ejemplo los arrendatarios) que, por razones desconocidas, no tenían protección de los interdictos.`
            : getContextoRelevante(termino);

        let promptFinalParaIA;
        
        let digestoPrompt = "";
        let coincidenciasDigesto = [];

        if (currentCaseText) {
             // Lógica para RESOLVER el caso (SIN CAMBIOS)
             promptFinalParaIA = `Rol: Juez romano. Tarea: Resolver el caso "${currentCaseText}" aplicando principios del derecho romano. Instrucciones: Solución legal, clara y concisa. Basa tu solución en este contexto si es relevante: "${contextoFinal}".`;
        } else if (promptOriginal.includes("generar caso")) {
            // Lógica para CREAR el caso (SIN CAMBIOS)
            promptFinalParaIA = `Rol: Profesor de derecho romano. Tarea: Crear un caso práctico (máx 3 frases) sobre "${termino}". Reglas: Nombres romanos. Terminar con preguntas legales. Sin explicaciones ni soluciones. Basar lógica en: "${contextoFinal}".`;
        } else {
            // Lógica para CONSULTA teórica (UlpianoIA) - MODIFICADA

            // *** MODIFICACIÓN PARA DIGESTO y BREVEDAD ***
            coincidenciasDigesto = buscarDigesto(termino);
            
            if (coincidenciasDigesto.length > 0) {
                digestoPrompt = "\n\n--- FUENTE ADICIONAL: DIGESTO DE JUSTINIANO ---\n" +
                                "He encontrado las siguientes citas del Digesto. Tu tarea es:\n" +
                                "1. **Seleccionar la cita más relevante** a la consulta sobre el concepto de **\"${termino}\"**. **PRIORIZA CITAS QUE CONTENGAN DEFINICIONES JURÍDICAS FUNDAMENTALES** (como las de Ulpiano o Paulo) y que encajen mejor con el término buscado.\n" +
                                "2. Realizar una **traducción al español profesional y mejorada** del texto latino (la traducción que acompaño es de baja calidad y no sirve).\n" +
                                "3. Incluir la cita completa (referencia, latín y tu traducción profesional) en la respuesta final, **destacándola** con el formato `# APUNTE DE ULPIANOIA: IUS ROMANUM #` justo antes de tu conclusión. **IGNORA la traducción original pobre**.\n\n";
                
                coincidenciasDigesto.forEach((match, index) => {
                    digestoPrompt += `--- Cita ${index + 1} (${match.cita}) ---\n`;
                    digestoPrompt += `TEXTO LATÍN: "${match.latin}"\n`;
                    digestoPrompt += `TRADUCCIÓN ORIGINAL POBRE (IGNORAR): "${match.espanol_original}"\n\n`;
                });
                
                // Instrucción combinada para la consulta teórica (incluye brevedad y didáctica)
                promptFinalParaIA = `Rol: Jurista Ulpiano (experto en Derecho Romano). Tarea: Explica el concepto de "${termino}" de forma **breve y concisa** (máx. 2 párrafos) y **didáctica**, ideal para un estudiante, y aplica la cita del Digesto (ver abajo). Contexto principal: "${contextoFinal}". No lo contradigas. Si está vacío, usa tu conocimiento general. **INSTRUCCIONES ADICIONALES DEL DIGESTO AL FINAL**: \n\n${digestoPrompt}`;

            } else {
                // Lógica original si no hay Digesto (incluye brevedad y didáctica)
                promptFinalParaIA = `Rol: Jurista Ulpiano (experto en Derecho Romano). Tarea: Explica el concepto de "${termino}" de forma **breve y concisa** (máx. 2 párrafos) y **didáctica**, ideal para un estudiante. Contexto principal: "${contextoFinal}". No lo contradigas. Si está vacío, usa tu conocimiento general.`;
            }
            // -------------------------------------------------------------------
        }

        const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }], safetySettings };
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA });
    } catch (error) {
        handleApiError(error, res);
    }
});

// El endpoint /api/buscar-fuente ha sido eliminado.

app.post('/api/derecho-moderno', async (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        const promptParaModerno = `Explica muy concisamente (máx un párrafo) la herencia del concepto romano "${termino}" en el derecho español moderno.`;
        
        const payload = { contents: [{ parts: [{ text: promptParaModerno }] }], safetySettings };
        const respuestaModerno = await callGeminiWithRetries(payload);
        res.json({ moderno: respuestaModerno });
    } catch (error) {
        handleApiError(error, res);
    }
});

app.post('/api/buscar-pagina', (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });

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

        res.json({ pagina: mejorCoincidencia?.pagina || null, titulo: mejorCoincidencia?.titulo || null });
    } catch (error) {
        console.error("Error en /api/buscar-pagina:", error);
        res.status(500).json({ error: 'Error interno del servidor al buscar la página.' });
    }
});

// --- FUNCIÓN DE ARRANQUE DEL SERVIDOR ---
const startServer = async () => {
    try {
        // Carga de datos de forma asíncrona
        const manualData = await fs.readFile('manual.json', 'utf-8');
        manualJson = JSON.parse(manualData);
        console.log(`✓ Manual JSON cargado: ${manualJson.length} conceptos.`);

        const indiceData = await fs.readFile('indice.json', 'utf-8');
        indiceJson = JSON.parse(indiceData);
        console.log(`✓ Índice JSON cargado: ${indiceJson.length} temas.`);

        // Carga del archivo de Digesto (SIN CAMBIOS)
        const digestoData = await fs.readFile('digesto_traducido_final.json', 'utf-8');
        digestoJson = JSON.parse(digestoData);
        console.log(`✓ Digesto JSON cargado: ${digestoJson.length} citas.`);
        
        app.listen(port, () => {
            console.log(`🚀 Servidor de Derecho Romano escuchando en http://localhost:${port}`);
        });

    } catch (error) {
        console.error("✗ Error fatal durante el arranque del servidor:", error);
        process.exit(1); // Si los archivos no cargan, el servidor no debe arrancar
    }
};

console.log("--- [OK] Ejecutando servidor.js v15.2 (Prompt Pulido y Digesto Reforzado) ---");
startServer();