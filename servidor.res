require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log("--- [OK] Ejecutando servidor.js v14.0 (Búsqueda Bilingüe en Digesto) ---");

const app = express();
const port = 3000;

// --- DICCIONARIO BILINGÜE PARA BÚSQUEDA ---
const diccionarioLatin = {
    'usufructo': 'usus fructus',
    'compraventa': 'emptio venditio',
    'arrendamiento': 'locatio conductio',
    'sociedad': 'societas',
    'mandato': 'mandatum',
    'mutuo': 'mutuum',
    'comodato': 'commodatum',
    'deposito': 'depositum',
    'prenda': 'pignus',
    'hurto': 'furtum',
    'daño': 'damnum',
    'herencia': 'hereditas',
    'testamento': 'testamentum',
    'legado': 'legatum',
    'dote': 'dos',
    'matrimonio': 'matrimonium',
    'tutela': 'tutela',
    'curatela': 'cura',
    'propiedad': 'proprietas',
    'posesion': 'possessio',
    'obligacion': 'obligatio'
};

// --- CONFIGURACIÓN DE SEGURIDAD ---
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

// --- CARGA DE DATOS ---
const manualJson = JSON.parse(fs.readFileSync('manual.json', 'utf-8'));
console.log(`Manual JSON cargado. ${manualJson.length} conceptos encontrados.`);

const indiceJson = JSON.parse(fs.readFileSync('indice.json', 'utf-8'));
console.log(`Índice JSON cargado. ${indiceJson.length} temas encontrados.`);

const digestoCompleto = fs.readFileSync('digest.txt', 'utf-8');
const parrafosDelDigesto = digestoCompleto.split(/\r?\n/).filter(linea => linea.trim() !== '');
console.log(`Digesto cargado (método por línea). ${parrafosDelDigesto.length} párrafos encontrados.`);

function handleApiError(error, res) {
    console.error("Error definitivo desde la API de Gemini:", error.response ? error.response.data : error.message);
    let errorMessage = 'Ha ocurrido un error en el servidor.';
    if (error.response?.data?.error?.code === 503) {
        errorMessage = 'Ulpiano parece estar desbordado por el trabajo en este momento (el modelo de IA está sobrecargado). Por favor, dale un minuto de descanso y vuelve a intentarlo.';
        return res.status(503).json({ error: 'MODEL_OVERLOADED', message: errorMessage });
    }
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: errorMessage });
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return geminiResponse.data.candidates[0].content.parts[0].text;
            }
            throw new Error('Respuesta de la IA inválida o vacía.');
        } catch (error) {
            if (error.response && error.response.status === 503 && attempt < MAX_RETRIES) {
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
    let encontrado = manualJson.find(item => item.termino.toLowerCase() === terminoBusqueda) ||
                     manualJson.find(item => item.sinonimos?.some(s => s.toLowerCase() === terminoBusqueda)) ||
                     manualJson.find(item => item.termino.toLowerCase().includes(terminoBusqueda));
    return encontrado ? encontrado.definicion : '';
}

app.post('/api/consulta', async (req, res) => {
    try {
        const { promptOriginal, termino, currentCaseText } = req.body;
        if (!promptOriginal) return res.status(400).json({ error: 'No se ha proporcionado un prompt.' });

        let contextoFinal;
        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';

        if (terminoNormalizado.includes('posesion')) {
            console.log("Detectado término 'posesión'. Usando contexto específico y prioritario.");
            contextoFinal = `En Roma había dos clases de posesión: natural (solo corpus) y civil (corpus y animus domini) AMBAS FORMAS DE POSESIÓN TENÍAN PROTECCIÓN INTERDICTAL. Había una serie de casos, llamados "detentadores" (por ejemplo los arrendatarios) que, por razones desconocidas, no tenían protección de los interdictos.`;
        } else {
            contextoFinal = getContextoRelevante(termino);
        }

        let promptFinalParaIA = '';
        if (currentCaseText) {
             promptFinalParaIA = `Rol: Juez romano. Tarea: Resolver el caso "${currentCaseText}" aplicando principios del derecho romano. Instrucciones: Solución legal, clara y concisa. Basa tu solución en este contexto si es relevante: "${contextoFinal}".`;
        } else if (promptOriginal.includes("crear un breve supuesto de hecho")) {
            promptFinalParaIA = `Rol: Profesor de derecho romano. Tarea: Crear un caso práctico (máx 3 frases) sobre "${termino}". Reglas: Nombres romanos. Terminar con preguntas legales. Sin explicaciones ni soluciones. Basar lógica en: "${contextoFinal}".`;
        } else {
            promptFinalParaIA = `Rol: Jurista Ulpiano. Tarea: Responder a la pregunta sobre "${termino}" (máx 2 párrafos). Contexto principal: "${contextoFinal}". No lo contradigas. Si está vacío, usa tu conocimiento general.`;
        }

        const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }], safetySettings };
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA });
    } catch (error) {
        handleApiError(error, res);
    }
});

// --- ENDPOINT DE BÚSQUEDA EN DIGESTO (ACTUALIZADO) ---
app.post('/api/buscar-fuente', async (req, res) => {
    try {
        const { termino } = req.body;
        if (!termino) return res.status(400).json({ error: 'No se ha proporcionado un término.' });
        if (parrafosDelDigesto.length === 0) {
            console.log("Advertencia: No hay párrafos en el Digesto para buscar.");
            return res.json({ fuente: "NULL" });
        }

        const terminoLower = termino.toLowerCase().trim();
        
        // --- LÓGICA DE BÚSQUEDA BILINGÜE ---
        const terminosDeBusqueda = [terminoLower];
        const traduccionLatin = diccionarioLatin[terminoLower];
        
        if (traduccionLatin) {
            terminosDeBusqueda.push(traduccionLatin);
        }
        console.log(`Buscando en Digesto con los términos: [${terminosDeBusqueda.join(', ')}]`);
        
        const resultadosBusqueda = parrafosDelDigesto.filter(p => {
            const parrafoLower = p.toLowerCase();
            return terminosDeBusqueda.some(t => parrafoLower.includes(t));
        });
        // --- FIN DE LA LÓGICA BILINGÜE ---
        
        if (resultadosBusqueda.length === 0) {
            console.log("No se encontraron coincidencias en el Digesto.");
            return res.json({ fuente: "NULL" });
        }

        const contextoDigesto = resultadosBusqueda.slice(0, 5).join('\n---\n');
        const promptParaFuente = `Tarea: Bibliotecario jurídico. Instrucción: Analiza este texto del Digesto y extrae la cita más relevante para "${termino}". Regla: Tu respuesta DEBE ser únicamente la cita (ej: D. libro. título. fragmento), el texto en latín y su traducción. Si no hay cita clara, responde "NULL". Sin explicaciones. Texto: --- ${contextoDigesto} ---`;

        const payload = { contents: [{ parts: [{ text: promptParaFuente }] }], safetySettings };
        const respuestaFuente = await callGeminiWithRetries(payload);
        res.json({ fuente: respuestaFuente });
    } catch (error) {
        handleApiError(error, res);
    }
});

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
            const tituloLower = tema.titulo.toLowerCase();
            
            if (tema.palabrasClave.some(p => p.toLowerCase() === terminoLower)) {
                puntuacionActual += 10;
            }
            if (tituloLower.includes(terminoLower)) {
                puntuacionActual += 5;
            }
            if (tema.palabrasClave.some(p => p.toLowerCase().includes(terminoLower))) {
                puntuacionActual += 3;
            }

            if (puntuacionActual > maxPuntuacion) {
                maxPuntuacion = puntuacionActual;
                mejorCoincidencia = tema;
            }
        });

        if (mejorCoincidencia) {
            res.json({ pagina: mejorCoincidencia.pagina, titulo: mejorCoincidencia.titulo });
        } else {
            res.json({ pagina: null });
        }
    } catch (error) {
        console.error("Error en /api/buscar-pagina:", error);
        res.status(500).json({ error: 'Error interno del servidor al buscar la página.' });
    }
});


app.listen(port, () => {
    console.log(`Servidor de Derecho Romano escuchando en http://localhost:${port}`);
});