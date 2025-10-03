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

// --- FUNCIONES DE BÚSQUEDA ROBUSTAS ---
function buscarEnDigesto(consulta) {
    if (!consulta || typeof consulta !== 'string' || !digestoJson || digestoJson.length === 0) {
        return [];
    }
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
    return resultados.slice(0, 4);
}

function buscarEnManual(consulta) {
    // ESTA VALIDACIÓN CORRIGE EL ERROR 'toLowerCase'
    if (!consulta || typeof consulta !== 'string' || !indiceJson || indiceJson.length === 0) {
        return null;
    }
    const terminos = consulta.toLowerCase().split(/\s+/);
    let mejorCoincidencia = null;
    let maxPuntuacion = 0;

    indiceJson.forEach(tema => {
        if (tema && typeof tema.titulo === 'string') {
            let puntuacionActual = 0;
            const titulo = tema.titulo.toLowerCase();
            terminos.forEach(termino => {
                if (titulo.includes(termino)) puntuacionActual++;
            });
            if (puntuacionActual > maxPuntuacion) {
                maxPuntuacion = puntuacionActual;
                mejorCoincidencia = tema;
            }
        }
    });
    return mejorCoincidencia;
}

// --- ENDPOINTS DE LA API ---
app.post('/api/consulta-gemini', async (req, res) => {
    const { accion, termino, contexto } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API key no configurada en el servidor." });

    let prompt;
    try {
        if (accion === 'consulta') {
            const parrafosDigesto = buscarEnDigesto(termino);
            const paginaManual = buscarEnManual(termino);

            let promptContexto = `Eres UlpianoIA, un asistente experto en Derecho Romano. Responde a la consulta sobre "${termino}" siguiendo estos 4 puntos:\n\n1. **Explicación jurídica:** Define el concepto en Derecho Romano.\n\n`;

            if (parrafosDigesto.length > 0) {
                 const parrafosTexto = parrafosDigesto.map(p => `Cita: ${p.cita}\nTexto en Latín: "${p.texto_latin}"`).join('\n\n');
                 promptContexto += `2. **Fuentes del Digesto:** A continuación se presentan textos en latín del Corpus Iuris Civilis. Tradúcelos al español de forma precisa e intégralos en tu explicación, citando la fuente (Ej: Dig. X.Y.Z).\n--- Textos a traducir ---\n${parrafosTexto}\n---\n\n`;
            } else {
                 promptContexto += `2. **Fuentes del Digesto:** No se encontraron textos relevantes en el Digesto para esta consulta.\n\n`;
            }

            if (paginaManual) {
                promptContexto += `3. **Referencia en el Manual:** Para más detalles, consultar la página ${paginaManual.pagina} sobre "${paginaManual.titulo}".\n\n`;
            } else {
                promptContexto += `3. **Referencia en el Manual:** No se encontró una página específica en el manual.\n\n`;
            }
            
            promptContexto += `4. **Relevancia en el Derecho Moderno:** Explica brevemente su evolución o equivalencia en el derecho actual.`;
            prompt = promptContexto;
        
        } else if (accion === 'resolver caso') {
            prompt = `Como UlpianoIA, jurista romano, analiza el siguiente caso práctico y ofrece una solución basada en el Derecho Romano:\n\n${contexto}`;
        } else {
            return res.status(400).json({ error: 'Acción no válida.' });
        }

        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
            requestBody,
            { headers: { 'Content-Type': 'application/json' } }
        );

        const candidate = response.data.candidates && response.data.candidates[0];
        if (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0].text) {
            res.json({ respuesta: candidate.content.parts[0].text });
        } else {
            const finishReason = candidate ? candidate.finishReason : 'UNKNOWN_REASON';
            console.warn(`Respuesta de Gemini sin contenido. Razón: ${finishReason}`);
            res.status(500).json({ error: `La API no generó una respuesta. Razón: ${finishReason}.` });
        }

    } catch (error) {
        console.error("Error en la llamada a Gemini:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ error: 'Hubo un problema al comunicarse con la IA.' });
    }
});

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
        const [manualData, indiceData, digestoData] = await Promise.all([
            fs.readFile('manual.json', 'utf-8'),
            fs.readFile('indice.json', 'utf-8'),
            fs.readFile('digesto_traducido_final.json', 'utf-8')
        ]);
        
        manualJson = JSON.parse(manualData);
        console.log(`✓ Manual JSON cargado: ${manualJson.length} conceptos.`);
        indiceJson = JSON.parse(indiceData);
        console.log(`✓ Índice JSON cargado: ${indiceJson.length} temas.`);
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