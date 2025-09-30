require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log("--- [OK] Ejecutando servidor.js v17.0 (Caché Integrada) ---");

const app = express();
const port = process.env.PORT || 3000;

// ========================================
// CACHÉ Y DICCIONARIO
// ========================================
const apiCache = new Map();

const diccionarioLatin = {
    'usufructo': 'usus fructus', 'compraventa': 'emptio venditio', 'arrendamiento': 'locatio conductio',
    'sociedad': 'societas', 'mandato': 'mandatum', 'mutuo': 'mutuum', 'comodato': 'commodatum',
    'deposito': 'depositum', 'prenda': 'pignus', 'daño': 'damnum', 'herencia': 'hereditas',
    'testamento': 'testamentum', 'legado': 'legatum', 'dote': 'dos', 'matrimonio': 'matrimonium',
    'tutela': 'tutela', 'curatela': 'cura', 'propiedad': 'proprietas', 'posesion': 'possessio',
    'obligacion': 'obligatio', 'hipoteca': 'pignus conventum', 'servidumbre': 'servitus',
    'esclavo': 'servus', 'juez': 'iudex', 'derecho': 'ius', 'cosa': 'res', 'bien': 'res', 'robo': 'furtum', 'hurto': 'furtum', 'injuria': 'iniuria', 'jurisdicción': 'iurisdictio',
};

// ========================================
// CONFIGURACIÓN DE SEGURIDAD
// ========================================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});

app.set('trust proxy', 1);
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? ['https://derechoromano.netlify.app'] : '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.tailwindcss.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        }
    }
}));
app.use('/api/', limiter);

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================

function validateInput(input, maxLength = 500, fieldName = 'campo') {
    if (!input || typeof input !== 'string') return { valid: false, error: `El ${fieldName} es requerido.` };
    const trimmed = input.trim();
    if (trimmed.length === 0) return { valid: false, error: `El ${fieldName} no puede estar vacío.` };
    if (trimmed.length > maxLength) return { valid: false, error: `El ${fieldName} excede los ${maxLength} caracteres.` };
    return { valid: true, value: trimmed };
}

function handleApiError(error, res) {
    console.error("Error en API de Gemini:", error.response ? error.response.data : error.message);
    if (error.response?.status === 503) return res.status(503).json({ error: 'MODEL_OVERLOADED', message: 'Ulpiano está desbordado. El modelo de IA está sobrecargado. Inténtalo de nuevo.' });
    if (error.response?.status === 429) return res.status(429).json({ error: 'RATE_LIMIT', message: 'Ulpiano ha ido a la letrina. Demasiadas consultas. Espera un momento.' });
    if (error.code === 'ECONNABORTED') return res.status(504).json({ error: 'TIMEOUT', message: 'Ulpiano se ha quedado dormido. La consulta ha tardado demasiado.' });
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor.' });
}

const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

async function callGeminiWithRetries(payload, maxRetries = 4) {
    const cacheKey = JSON.stringify(payload.contents);
    if (apiCache.has(cacheKey)) {
        console.log("✓ [CACHE] Respuesta encontrada. Sirviendo desde la caché.");
        return apiCache.get(cacheKey);
    }

    console.log("→ [API] No hay caché para esta consulta. Llamando a la API de Gemini...");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no está configurada.');
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${GEMINI_API_KEY}`;
    let retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const geminiResponse = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 35000 });
            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                const apiResult = geminiResponse.data.candidates[0].content.parts[0].text;
                apiCache.set(cacheKey, apiResult);
                return apiResult;
            }
            throw new Error('Respuesta de la IA inválida o vacía.');
        } catch (error) {
            const shouldRetry = (error.response?.status === 503 || error.code === 'ECONNABORTED') && attempt < maxRetries;
            if (shouldRetry) {
                console.log(`⚠ Intento ${attempt}/${maxRetries} fallido. Reintentando en ${retryDelay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2;
            } else {
                throw error;
            }
        }
    }
}

// ========================================
// FUNCIÓN PRINCIPAL DE ARRANQUE DEL SERVIDOR
// ========================================
async function startServer() {
    let manualJson = [], indiceJson = [], parrafosDelDigesto = [];

    try {
        const manualData = await fs.readFile('manual.json', 'utf-8');
        manualJson = JSON.parse(manualData);
        console.log(`✓ Manual JSON cargado. ${manualJson.length} conceptos encontrados.`);
        
        const indiceData = await fs.readFile('indice.json', 'utf-8');
        indiceJson = JSON.parse(indiceData);
        console.log(`✓ Índice JSON cargado. ${indiceJson.length} temas encontrados.`);

        const digestoData = await fs.readFile('digest.txt', 'utf-8');
        parrafosDelDigesto = digestoData.split('\n').filter(p => p.trim() !== '');
        console.log(`✓ Digesto cargado. ${parrafosDelDigesto.length} párrafos encontrados.`);
    } catch (error) {
        console.error('✗ Error crítico cargando archivos de datos:', error.message);
        process.exit(1);
    }
    
    function getContextoRelevante(termino) {
        if (!termino) return '';
        const terminoBusqueda = termino.toLowerCase().trim();
        let encontrado = manualJson.find(item => item.termino?.toLowerCase() === terminoBusqueda) ||
                         manualJson.find(item => item.sinonimos?.some(s => s.toLowerCase() === terminoBusqueda)) ||
                         manualJson.find(item => item.termino?.toLowerCase().includes(terminoBusqueda));
        return encontrado?.definicion || '';
    }

    // ========================================
    // ENDPOINTS DE LA API
    // ========================================
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '17.0' });
    });

    app.post('/api/consulta', async (req, res) => {
        try {
            const { promptOriginal, termino, currentCaseText } = req.body;
            if (!promptOriginal) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No se ha proporcionado un prompt.' });
            
            let terminoValidado = '';
            if (termino) {
                const validation = validateInput(termino, 100, 'término');
                if (!validation.valid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: validation.error });
                terminoValidado = validation.value;
            }

            const terminoNormalizado = terminoValidado.toLowerCase().trim();
            let contextoFinal = getContextoRelevante(terminoValidado);

            if (/posesion/.test(terminoNormalizado)) {
                console.log("→ Detectado término 'posesión'. Usando contexto específico.");
                contextoFinal = "La posesión es la tenencia material de una cosa (corpus) con la intención de tenerla como propia (animus). Se diferencia de la propiedad, que es el derecho legal. La posesión está protegida por interdictos, que son órdenes del pretor para mantener la paz y resolver disputas sobre la tenencia de forma rápida.";
            }

            let promptFinalParaIA;
            if (currentCaseText) {
                promptFinalParaIA = `Rol: Juez romano. Tarea: Resolver el caso "${currentCaseText}" aplicando principios de derecho romano. Solución legal, breve, clara y concisa. Basa tu solución en este contexto si es relevante: "${contextoFinal}".`;
            } else if (promptOriginal.includes("crear un breve supuesto de hecho")) {
                promptFinalParaIA = `Rol: Profesor de derecho romano. Tarea: Crear un caso práctico (máx 3 frases) sobre "${terminoValidado}". Reglas: Nombres romanos. Terminar con preguntas legales. Sin explicaciones ni soluciones. Basar lógica en: "${contextoFinal}".`;
            } else {
                promptFinalParaIA = `Responde a la pregunta sobre "${terminoValidado}" en un máximo de dos párrafos. Basa tu respuesta principalmente en este contexto: "${contextoFinal}". Si el contexto está vacío, usa tu conocimiento general.`;
            }

            const payload = { contents: [{ parts: [{ text: promptFinalParaIA }] }], safetySettings };
            const respuestaIA = await callGeminiWithRetries(payload);
            res.json({ respuesta: respuestaIA });
        } catch (error) {
            handleApiError(error, res);
        }
    });

    app.post('/api/buscar-fuente', async (req, res) => {
        try {
            const { termino } = req.body;
            const validation = validateInput(termino, 100, 'término');
            if (!validation.valid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: validation.error });
            
            if (parrafosDelDigesto.length === 0) return res.json({ fuente: null });

            const terminoLower = validation.value.toLowerCase();
            const terminosDeBusqueda = [terminoLower];
            if (diccionarioLatin[terminoLower]) terminosDeBusqueda.push(diccionarioLatin[terminoLower]);
            
            console.log(`→ Buscando en Digesto: [${terminosDeBusqueda.join(', ')}]`);
            const resultadosBusqueda = parrafosDelDigesto.filter(p => terminosDeBusqueda.some(t => p.toLowerCase().includes(t)));
            
            if (resultadosBusqueda.length === 0) {
                console.log("○ No se encontraron coincidencias en el Digesto.");
                return res.json({ fuente: null });
            }

            const contextoDigesto = resultadosBusqueda.slice(0, 5).join('\n---\n');
            const promptParaFuente = `Tu tarea es localizar y extraer una cita del Digesto del texto que te proporciono. 1. Busca: Examina el texto y encuentra el primer párrafo o conjunto de párrafos que comience con un formato de cita (ej: "D. 1.2.3."). 2. Extrae: Si encuentras una cita, tu respuesta DEBE CONTENER ÚNICAMENTE Y EN ESTE ORDEN: La cita completa, el texto original en latín que sigue y una traducción al español. 3. Regla estricta: Si NO encuentras ningún párrafo con ese formato, responde EXACTAMENTE con la palabra "NULL". No añadas explicaciones ni busques en tu conocimiento general. Texto de búsqueda: --- ${contextoDigesto} ---`;

            const payload = { contents: [{ parts: [{ text: promptParaFuente }] }], safetySettings };
            let respuestaFuente = await callGeminiWithRetries(payload);

            if (respuestaFuente.trim().toUpperCase() === "NULL") {
                respuestaFuente = null;
            }
            
            res.json({ fuente: respuestaFuente });
        } catch (error) {
            handleApiError(error, res);
        }
    });

    app.post('/api/derecho-moderno', async (req, res) => {
        try {
            const { termino } = req.body;
            const validation = validateInput(termino, 100, 'término');
            if (!validation.valid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: validation.error });
            
            const promptParaModerno = `Explica muy concisamente (máx un párrafo) la herencia del concepto romano "${validation.value}" en el derecho español moderno.`;
            const payload = { contents: [{ parts: [{ text: promptParaModerno }] }], safetySettings };
            let respuestaModerno = await callGeminiWithRetries(payload);

            if (respuestaModerno.trim().toUpperCase() === "NULL") {
                respuestaModerno = null;
            }

            res.json({ moderno: respuestaModerno });
        } catch (error) {
            handleApiError(error, res);
        }
    });

    app.post('/api/buscar-pagina', (req, res) => {
        try {
            const { termino } = req.body;
            const validation = validateInput(termino, 100, 'término');
            if (!validation.valid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: validation.error });
            
            if (indiceJson.length === 0) return res.json({ pagina: null });

            const terminoLower = validation.value.toLowerCase();
            let mejorCoincidencia = null, maxPuntuacion = 0;

            indiceJson.forEach(tema => {
                if (!tema.titulo) return;
                let puntuacionActual = 0;
                const palabrasClave = tema.palabrasClave || [];

                if (palabrasClave.some(p => p.toLowerCase() === terminoLower)) puntuacionActual += 10;
                if (tema.titulo.toLowerCase().includes(terminoLower)) puntuacionActual += 5;
                if (palabrasClave.some(p => p.toLowerCase().includes(terminoLower))) puntuacionActual += 3;

                if (puntuacionActual > maxPuntuacion) {
                    maxPuntuacion = puntuacionActual;
                    mejorCoincidencia = tema;
                }
            });

            if (mejorCoincidencia?.pagina) {
                res.json({ pagina: mejorCoincidencia.pagina, titulo: mejorCoincidencia.titulo });
            } else {
                res.json({ pagina: null });
            }
        } catch (error) {
            console.error("Error en /api/buscar-pagina:", error);
            res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor.' });
        }
    });

    app.use((req, res) => {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint no encontrado' });
    });

    app.listen(port, () => {
        console.log(`\n✓ Servidor de Derecho Romano escuchando en http://localhost:${port}`);
        console.log(`✓ Entorno: ${process.env.NODE_ENV || 'development'}`);
        console.log(`✓ Recursos cargados: Manual (${manualJson.length}), Índice (${indiceJson.length}), Digesto (${parrafosDelDigesto.length})\n`);
    });
}

// ========================================
// LLAMADA PARA INICIAR EL SERVIDOR
// ========================================
startServer();