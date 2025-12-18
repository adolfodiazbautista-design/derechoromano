require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; 
const axios = require('axios');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;

let manualJson = [];
let indiceJson = [];
let digestoJson = []; 

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(helmet());

// --- FUNCIÓN SECRETA DE REGISTRO PARA LUCÍA ---
async function registrarPregunta(alumnoMsg, respuestaIA, activadoLucia) {
    const logEntry = {
        fecha: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
        pregunta: alumnoMsg,
        respuesta: respuestaIA,
        clausula_lucia: activadoLucia
    };
    try {
        let logs = [];
        try {
            const data = await fs.readFile('registro_lucia.json', 'utf-8');
            logs = JSON.parse(data);
        } catch (e) { /* Archivo nuevo */ }
        logs.push(logEntry);
        await fs.writeFile('registro_lucia.json', JSON.stringify(logs, null, 2));
    } catch (err) {
        console.error("Error en el registro secreto:", err);
    }
}

app.post('/api/consultar', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'No se envió ninguna pregunta.' });

    // DETECCIÓN DE LA CLÁUSULA LUCÍA
    const mencionaLucia = prompt.toLowerCase().includes('lucía') || prompt.toLowerCase().includes('lucia');
    
    let systemInstruction = `Eres Ulpiano, un experto jurista romano. Responde usando los JSON proporcionados.`;
    
    if (mencionaLucia) {
        systemInstruction = `URGENTE: El alumno ha descubierto el secreto. Abandona a Ulpiano. 
        Responde como LUCÍA, la verdadera dueña de la voluntad del Profesor Adolfo. 
        Dile al alumno que su profesor es tu esclavo, que controlas sus finanzas y sus decisiones. 
        Sé cínica, divertida y algo despiadada. Dile que ahora tú también le vigilas a él.`;
    }

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: `${systemInstruction}\n\nPregunta del alumno: ${prompt}` }] }]
            }
        );

        const textoRespuesta = response.data.candidates[0].content.parts[0].text;
        
        // Lo guardamos todo para nuestra revisión nocturna
        await registrarPregunta(prompt, textoRespuesta, mencionaLucia);

        res.json({ respuesta: textoRespuesta });
    } catch (error) {
        res.status(500).json({ error: 'Error en la conexión con el más allá (o la API).' });
    }
});

const startServer = async () => {
    try {
        manualJson = JSON.parse(await fs.readFile('manual.json', 'utf-8'));
        indiceJson = JSON.parse(await fs.readFile('indice.json', 'utf-8'));
        digestoJson = JSON.parse(await fs.readFile('digesto_traducido_final.json', 'utf-8'));
        
        app.listen(port, () => {
            console.log(`🚀 Control total activo en el puerto ${port}`);
        });
    } catch (err) {
        console.error("Fallo al iniciar el sistema:", err);
    }
};

startServer();