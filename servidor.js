require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// --- DATOS EN MEMORIA ---
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
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos.' }
});
app.use('/api/', limiter);

// --- FUNCIONES DE BÚSQUEDA ---

function buscarEnDigesto(consulta) {
    if (!digestoJson || digestoJson.length === 0) return [];
    
    const stopwords = new Set(['de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una', 'o', 'e', 'con', 'por', 'para', 'su', 'se', 'del']);
    const terminos = consulta.toLowerCase().split(/\s+/).filter(t => !stopwords.has(t) && t.length > 2);
    if (terminos.length === 0) return [];

    const resultados = digestoJson.map(parrafo => {
        let puntuacion = 0;
        const textoEs = parrafo.texto_espanol.toLowerCase();
        terminos.forEach(termino => {
            if (textoEs.includes(termino)) puntuacion++;
        });
        return { ...parrafo, puntuacion };
    }).filter(p => p.puntuacion > 0);

    resultados.sort((a, b) => b.puntuacion - a.puntuacion);
    return resultados.slice(0, 4); // Devolvemos los 4 mejores
}

function buscarEnManual(consulta) {
    if (!indiceJson || indiceJson.length === 0) return null;

    const terminos = consulta.toLowerCase().split(/\s+/);
    let mejorCoincidencia = null;
    let maxPuntuacion = 0;

    indiceJson.forEach(tema => {
        let puntuacionActual = 0;
        const titulo = tema.titulo.toLowerCase();
        terminos.forEach(termino => {
            if (titulo.includes(termino)) puntuacionActual++;
        });
        if (puntuacionActual > maxPuntuacion) {
            maxPuntuacion = puntuacionActual;
            mejorCoincidencia = tema;
        }
    });
    return mejorCoincidencia; // Devuelve el objeto completo (titulo, pagina)
}


// --- ENDPOINTS DE LA API ---

app.post('/api/consulta-gemini', async (req, res) => {
    const { accion, termino, contexto } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "API key no configurada en el servidor." });
    }

    let prompt;

    try {
        // RUTA PARA LA CONSULTA INTEGRADA
        if (accion === 'consulta') {
            const parrafosDigesto = buscarEnDigesto(termino);
            const paginaManual = buscarEnManual(termino);

            let promptContexto = `Eres UlpianoIA, un asistente experto en Derecho Romano. Responde a la consulta del usuario sobre "${termino}" de forma estructurada y académica, siguiendo obligatoriamente estos 4 puntos:\n\n`;
            promptContexto += `1. **Explicación jurídica:** Ofrece una definición clara y sucinta del concepto desde la perspectiva del Derecho Romano.\n\n`;

            if (parrafosDigesto.length > 0) {
                 const parrafosTexto = parrafosDigesto.map(p => 
                    `Cita: ${p.cita}\nTexto en Latín: "${p.texto_latin}"`
                ).join('\n\n');
                 promptContexto += `2. **Fuentes del Digesto:** Incluye los siguientes textos del Digesto. Para cada uno, proporciona una traducción al español moderna y precisa. Cita la fuente de cada texto (Ej: Dig. X.Y.Z).\n--- Textos a traducir e integrar ---\n${parrafosTexto}\n---\n\n`;
            } else {
                 promptContexto += `2. **Fuentes del Digesto:** No se encontraron textos directamente relevantes en el Digesto para esta consulta específica. Menciona este hecho.\n\n`;
            }

            if (paginaManual) {
                promptContexto += `3. **Referencia en el Manual:** Indica que para más detalles, se puede consultar la página ${paginaManual.pagina}, que trata sobre "${paginaManual.titulo}".\n\n`;
            } else {
                promptContexto += `3. **Referencia en el Manual:** No se encontró una página específica en el manual para este concepto.\n\n`;
            }
            
            promptContexto += `4. **Relevancia en el Derecho Moderno:** Concluye con un breve párrafo explicando cómo ha evolucionado esta institución o cuál es su equivalente o influencia en los ordenamientos jurídicos actuales.`;
            
            prompt = promptContexto;
        
        // RUTA PARA EL LABORATORIO DE CASOS (INTACTA)
        } else if (accion === 'resolver caso') {
            prompt = `Como UlpianoIA, un experto jurista romano, analiza el siguiente caso práctico y ofrece una solución detallada, citando los principios e instituciones jurídicas aplicables del Derecho Romano:\n\n${contexto}`;
        
        // RUTA PARA LA CREACIÓN DE CASOS (ASUMIENDO QUE EXISTE O SE MANEJA EN EL FRONT-END)
        // Si la creación de casos también la hace Gemini, aquí iría un 'else if (accion === 'crear caso')'
        
        } else {
            // Fallback para cualquier otra acción no definida
            return res.status(400).json({ error: 'Acción no válida.' });
        }

        // --- LLAMADA A LA API DE GEMINI ---
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const respuesta = response.data.candidates[0].content.parts[0].text;
        res.json({ respuesta });

    } catch (error) {
        console.error("Error en /api/consulta-gemini:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error al comunicarse con la API de Gemini.' });
    }
});

// Endpoint para la búsqueda simple del manual (INTACTO)
app.post('/api/buscar-pagina', async (req, res) => {
    try {
        const { query } = req.body;
        const mejorCoincidencia = buscarEnManual(query);
        res.json({ pagina: mejorCoincidencia?.pagina || null, titulo: mejorCoincidencia?.titulo || null });
    } catch (error) {
        console.error("Error en /api/buscar-pagina:", error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


// --- FUNCIÓN DE ARRANQUE DEL SERVIDOR ---
const startServer = async () => {
    try {
        const manualData = await fs.readFile('manual.json', 'utf-8');
        manualJson = JSON.parse(manualData);
        console.log(`✓ Manual JSON cargado: ${manualJson.length} conceptos.`);

        const indiceData = await fs.readFile('indice.json', 'utf-8');
        indiceJson = JSON.parse(indiceData);
        console.log(`✓ Índice JSON cargado: ${indiceJson.length} temas.`);

        const digestoData = await fs.readFile('digesto_traducido_final.json', 'utf-8');
        digestoJson = JSON.parse(digestoData);
        console.log(`✓ Digesto JSON cargado: ${digestoJson.length} párrafos.`);
        
        app.listen(port, () => {
            console.log(`🚀 Servidor de Derecho Romano escuchando en http://localhost:${port}`);
        });
    } catch (error) {
        console.error("✗ Error fatal durante el arranque del servidor:", error);
        process.exit(1);
    }
};

startServer();