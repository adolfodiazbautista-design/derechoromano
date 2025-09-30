require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log("--- [OK] Ejecutando servidor.js v15.0 (Versión Optimizada) ---");

const app = express();
const port = process.env.PORT || 3000;

// ========================================
// DICCIONARIO BILINGÜE PARA BÚSQUEDA
// ========================================
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
    'obligacion': 'obligatio', 
    'hipoteca': 'pignus conventum',
    'servidumbre': 'servitus',
    'esclavo': 'servus',
    'juez': 'iudex',
    'derecho': 'ius',
    'cosa': 'res',
    'bien': 'res'
};
// ========================================
// CONFIGURACIÓN DE SEGURIDAD
// ========================================
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://derechoromano.netlify.app'] 
        : '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json({ limit: "1mb" }));

app.use(helmet({
    contentSecurityPolicy: false // Desactivado para compatibilidad con CDNs
}));

app.set('trust proxy', 1);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 peticiones por ventana
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
        error: 'RATE_LIMIT_EXCEEDED', 
        message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos.' 
    },
    skip: (req) => {
        // No aplicar rate limit a peticiones de health check
        return req.path === '/health';
    }
});

app.use('/api/', limiter);

// ========================================
// CARGA Y VALIDACIÓN DE DATOS
// ========================================
let manualJson, indiceJson, parrafosDelDigesto;

try {
    manualJson = JSON.parse(fs.readFileSync('manual.json', 'utf-8'));
    console.log(`✓ Manual JSON cargado. ${manualJson.length} conceptos encontrados.`);
} catch (error) {
    console.error('✗ Error cargando manual.json:', error.message);
    manualJson = [];
}

try {
    indiceJson = JSON.parse(fs.readFileSync('indice.json', 'utf-8'));
    console.log(`✓ Índice JSON cargado. ${indiceJson.length} temas encontrados.`);
} catch (error) {
    console.error('✗ Error cargando indice.json:', error.message);
    indiceJson = [];
}

try {
    const digestoCompleto = fs.readFileSync('digest.txt', 'utf-8');
    parrafosDelDigesto = digestoCompleto.split(/\r?\n/).filter(linea => linea.trim() !== '');
    console.log(`✓ Digesto cargado. ${parrafosDelDigesto.length} párrafos encontrados.`);
} catch (error) {
    console.error('✗ Error cargando digest.txt:', error.message);
    parrafosDelDigesto = [];
}

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================

function validateInput(input, maxLength = 500, fieldName = 'campo') {
    if (!input || typeof input !== 'string') {
        return { valid: false, error: `El ${fieldName} es requerido y debe ser texto.` };
    }
    
    const trimmed = input.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: `El ${fieldName} no puede estar vacío.` };
    }
    
    if (trimmed.length > maxLength) {
        return { valid: false, error: `El ${fieldName} es demasiado largo (máximo ${maxLength} caracteres).` };
    }
    
    return { valid: true, value: trimmed };
}

function handleApiError(error, res) {
    console.error("Error en API de Gemini:", error.response ? error.response.data : error.message);
    
    if (error.response?.status === 503 || error.response?.data?.error?.code === 503) {
        return res.status(503).json({ 
            error: 'MODEL_OVERLOADED', 
            message: 'Ulpiano parece estar desbordado por el trabajo en este momento (el modelo de IA está sobrecargado). Por favor, dale un minuto de descanso y vuelve a intentarlo.' 
        });
    }
    
    if (error.response?.status === 429) {
        return res.status(429).json({ 
            error: 'RATE_LIMIT', 
            message: 'Has realizado demasiadas consultas. Por favor, espera un momento antes de intentarlo de nuevo.' 
        });
    }
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return res.status(504).json({ 
            error: 'TIMEOUT', 
            message: 'La consulta ha tardado demasiado tiempo. Por favor, inténtalo de nuevo.' 
        });
    }
    
    res.status(500).json({ 
        error: 'INTERNAL_SERVER_ERROR', 
        message: 'Ha ocurrido un error en el servidor. Por favor, inténtalo más tarde.' 
    });
}

const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

async function callGeminiWithRetries(payload, maxRetries = 4) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno');
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${GEMINI_API_KEY}`;
    let retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const geminiResponse = await axios.post(url, payload, { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 35000 // 35 segundos
            });
            
            if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return geminiResponse.data.candidates[0].content.parts[0].text;
            }
            
            throw new Error('Respuesta de la IA inválida o vacía.');
        } catch (error) {
            const shouldRetry = (error.response?.status === 503 || error.code === 'ECONNABORTED') 
                                && attempt < maxRetries;
            
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

function getContextoRelevante(termino) {
    if (!termino || !Array.isArray(manualJson) || manualJson.length === 0) {
        return '';
    }
    
    const terminoBusqueda = termino.toLowerCase().trim();
    
    // Búsqueda exacta por término
    let encontrado = manualJson.find(item => 
        item.termino && item.termino.toLowerCase() === terminoBusqueda
    );
    
    // Búsqueda por sinónimos
    if (!encontrado) {
        encontrado = manualJson.find(item => 
            item.sinonimos && Array.isArray(item.sinonimos) && 
            item.sinonimos.some(s => s.toLowerCase() === terminoBusqueda)
        );
    }
    
    // Búsqueda por inclusión parcial
    if (!encontrado) {
        encontrado = manualJson.find(item => 
            item.termino && item.termino.toLowerCase().includes(terminoBusqueda)
        );
    }
    
    return encontrado?.definicion || '';
}

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '15.0'
    });
});

// ========================================
// ENDPOINT: CONSULTA PRINCIPAL
// ========================================
app.post('/api/consulta', async (req, res) => {
    try {
        const { promptOriginal, termino, currentCaseText } = req.body;
        
        // Validación de entrada
        if (!promptOriginal) {
            return res.status(400).json({ 
                error: 'VALIDATION_ERROR',
                message: 'No se ha proporcionado un prompt.' 
            });
        }
        
        if (termino) {
            const validation = validateInput(termino, 100, 'término');
            if (!validation.valid) {
                return res.status(400).json({ 
                    error: 'VALIDATION_ERROR',
                    message: validation.error 
                });
            }
        }

        const terminoNormalizado = termino ? termino.toLowerCase().trim() : '';
        let contextoFinal;

        // Contexto especial para posesión
        if (terminoNormalizado.includes('posesion')) {
            console.log("→ Detectado término 'posesión'. Usando contexto específico.");
            contextoFinal = `En Roma había dos clases de posesión: natural (solo corpus) y civil (corpus y animus domini) AMBAS FORMAS DE POSESIÓN TENÍAN PROTECCIÓN INTERDICTAL. Había una serie de casos, llamados "detentadores" (por ejemplo los arrendatarios) que, por razones desconocidas, no tenían protección de los interdictos.`;
        } else {
            contextoFinal = getContextoRelevante(termino);
        }

        // Construcción del prompt según el tipo de consulta
        let promptFinalParaIA = '';
        
        if (currentCaseText) {
            promptFinalParaIA = `Rol: Juez romano. Tarea: Resolver el caso "${currentCaseText}" aplicando principios del derecho romano. Instrucciones: Solución legal, breve, clara y concisa. Basa tu solución en este contexto si es relevante: "${contextoFinal}".`;
        } else if (promptOriginal.includes("crear un breve supuesto de hecho")) {
            promptFinalParaIA = `Rol: Profesor de derecho romano. Tarea: Crear un caso práctico (máx 3 frases) sobre "${termino}". Reglas: Nombres romanos. Terminar con preguntas legales. Sin explicaciones ni soluciones. Basar lógica en: "${contextoFinal}".`;
        } else {
            promptFinalParaIA = `Rol: Jurista romano. Tarea: Dar una respuesta breve, concisa y precisa a la pregunta sobre "${termino}" (máx 2 párrafos). Contexto principal: "${contextoFinal}". No lo contradigas. Si está vacío, usa tu conocimiento general. Si encuentras referencias seguras a textos de fuentes clásicas indícalas en latín y español con notación académica (por ejemplo Dig. 4.5.6)`;
        }

        const payload = { 
            contents: [{ parts: [{ text: promptFinalParaIA }] }], 
            safetySettings 
        };
        
        const respuestaIA = await callGeminiWithRetries(payload);
        res.json({ respuesta: respuestaIA });
        
    } catch (error) {
        handleApiError(error, res);
    }
});

// ========================================
// ENDPOINT: BÚSQUEDA EN DIGESTO
// ========================================
app.post('/api/buscar-fuente', async (req, res) => {
    try {
        const { termino } = req.body;
        
        const validation = validateInput(termino, 100, 'término');
        if (!validation.valid) {
            return res.status(400).json({ 
                error: 'VALIDATION_ERROR',
                message: validation.error 
            });
        }
        
        if (!Array.isArray(parrafosDelDigesto) || parrafosDelDigesto.length === 0) {
            console.log("⚠ No hay párrafos en el Digesto para buscar.");
            return res.json({ fuente: "NULL" });
        }

        const terminoLower = validation.value.toLowerCase();
        
        // Búsqueda bilingüe
        const terminosDeBusqueda = [terminoLower];
        const traduccionLatin = diccionarioLatin[terminoLower];
        
        if (traduccionLatin) {
            terminosDeBusqueda.push(traduccionLatin);
        }
        
        console.log(`→ Buscando en Digesto: [${terminosDeBusqueda.join(', ')}]`);
        
        const resultadosBusqueda = parrafosDelDigesto.filter(parrafo => {
            const parrafoLower = parrafo.toLowerCase();
            return terminosDeBusqueda.some(t => parrafoLower.includes(t));
        });
        
        if (resultadosBusqueda.length === 0) {
            console.log("○ No se encontraron coincidencias en el Digesto.");
            return res.json({ fuente: "NULL" });
        }

const promptParaFuente = `Tu tarea es localizar y extraer una cita del Digesto del texto que te proporciono.

1.  **Busca**: Examina el texto y encuentra el primer párrafo que comience con un formato de cita (ej: "D. 1.2.3.").
2.  **Extrae**: Si encuentras una cita, tu respuesta DEBE CONTENER ÚNICAMENTE Y EN ESTE ORDEN:
    - La cita completa (ej: "D. 1.2.3.").
    - El texto original en latín que sigue a esa cita.
    - Una traducción al español de ese texto.
3.  **Regla estricta**: Si NO encuentras ningún párrafo que comience con ese formato de cita en el texto proporcionado, responde EXACTAMENTE con la palabra "NULL" y nada más.

No añadas explicaciones, resúmenes ni busques en tu conocimiento general. Limítate estrictamente al texto que te doy.

Texto de búsqueda:
---
${contextoDigesto}
---`;

        const payload = { 
            contents: [{ parts: [{ text: promptParaFuente }] }], 
            safetySettings 
        };
        
        const respuestaFuente = await callGeminiWithRetries(payload);
        res.json({ fuente: respuestaFuente });
        
    } catch (error) {
        handleApiError(error, res);
    }
});

// ========================================
// ENDPOINT: DERECHO MODERNO
// ========================================
app.post('/api/derecho-moderno', async (req, res) => {
    try {
        const { termino } = req.body;
        
        const validation = validateInput(termino, 100, 'término');
        if (!validation.valid) {
            return res.status(400).json({ 
                error: 'VALIDATION_ERROR',
                message: validation.error 
            });
        }
        
        const promptParaModerno = `Explica muy concisamente (máx un párrafo) la herencia del concepto romano "${validation.value}" en el derecho español moderno.`;
        
        const payload = { 
            contents: [{ parts: [{ text: promptParaModerno }] }], 
            safetySettings 
        };
        
        const respuestaModerno = await callGeminiWithRetries(payload);
        res.json({ moderno: respuestaModerno });
        
    } catch (error) {
        handleApiError(error, res);
    }
});

// ========================================
// ENDPOINT: BÚSQUEDA DE PÁGINA EN MANUAL
// ========================================
app.post('/api/buscar-pagina', (req, res) => {
    try {
        const { termino } = req.body;
        
        const validation = validateInput(termino, 100, 'término');
        if (!validation.valid) {
            return res.status(400).json({ 
                error: 'VALIDATION_ERROR',
                message: validation.error 
            });
        }

        if (!Array.isArray(indiceJson) || indiceJson.length === 0) {
            return res.json({ pagina: null });
        }

        const terminoLower = validation.value.toLowerCase();
        let mejorCoincidencia = null;
        let maxPuntuacion = 0;

        indiceJson.forEach(tema => {
            if (!tema.titulo || !Array.isArray(tema.palabrasClave)) return;
            
            let puntuacionActual = 0;
            const tituloLower = tema.titulo.toLowerCase();
            
            // Coincidencia exacta en palabras clave
            if (tema.palabrasClave.some(p => p.toLowerCase() === terminoLower)) {
                puntuacionActual += 10;
            }
            
            // Inclusión en título
            if (tituloLower.includes(terminoLower)) {
                puntuacionActual += 5;
            }
            
            // Inclusión parcial en palabras clave
            if (tema.palabrasClave.some(p => p.toLowerCase().includes(terminoLower))) {
                puntuacionActual += 3;
            }

            if (puntuacionActual > maxPuntuacion) {
                maxPuntuacion = puntuacionActual;
                mejorCoincidencia = tema;
            }
        });

        if (mejorCoincidencia && mejorCoincidencia.pagina) {
            res.json({ 
                pagina: mejorCoincidencia.pagina, 
                titulo: mejorCoincidencia.titulo 
            });
        } else {
            res.json({ pagina: null });
        }
        
    } catch (error) {
        console.error("Error en /api/buscar-pagina:", error);
        res.status(500).json({ 
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Error interno del servidor al buscar la página.' 
        });
    }
});

// ========================================
// MANEJO DE ERRORES 404
// ========================================
app.use((req, res) => {
    res.status(404).json({ 
        error: 'NOT_FOUND',
        message: 'Endpoint no encontrado' 
    });
});

// ========================================
// INICIO DEL SERVIDOR
// ========================================
app.listen(port, () => {
    console.log(`\n✓ Servidor de Derecho Romano escuchando en http://localhost:${port}`);
    console.log(`✓ Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ Recursos cargados: Manual (${manualJson.length}), Índice (${indiceJson.length}), Digesto (${parrafosDelDigesto.length})\n`);
});