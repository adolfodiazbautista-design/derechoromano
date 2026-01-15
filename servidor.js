<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UlpianoIA: Innovación Docente</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reset.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reveal.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/theme/serif.min.css">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Lato:wght@300;400;700&display=swap');
        
        :root {
            --r-main-font: 'Lato', sans-serif;
            --r-heading-font: 'Cormorant Garamond', serif;
            --r-heading-text-transform: none;
            --roman-red: #8B0000;
            --roman-gold: #C5A059;
        }

        .reveal h1, .reveal h2, .reveal h3 {
            color: var(--roman-red);
        }
        
        .temple-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 400px;
            margin-top: 20px;
        }
        
        .pediment {
            width: 0; 
            height: 0; 
            border-left: 300px solid transparent;
            border-right: 300px solid transparent;
            border-bottom: 120px solid var(--roman-red);
            position: relative;
            display: flex;
            justify-content: center;
            align-items: flex-end;
            margin-bottom: 5px;
        }
        
        .pediment-text {
            position: absolute;
            bottom: -80px;
            width: 400px;
            text-align: center;
            color: white;
            font-family: 'Cormorant Garamond', serif;
            font-weight: bold;
            font-size: 1.2rem;
            z-index: 10;
            transform: translateY(-50px);
        }

        .cornice {
            width: 640px;
            height: 30px;
            background: var(--roman-gold);
            margin-bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
            font-weight: bold;
            font-size: 0.8rem;
            letter-spacing: 2px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }

        .columns-container {
            display: flex;
            justify-content: space-between;
            width: 580px;
            height: 200px;
        }

        .column {
            width: 40px;
            height: 100%;
            background: linear-gradient(to right, #e0e0e0, #ffffff, #bdbdbd);
            border-radius: 4px;
            position: relative;
        }

        .column::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(0,0,0,0.1) 5px, rgba(0,0,0,0.1) 6px);
        }

        .tech-label {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255,255,255,0.9);
            padding: 10px;
            border: 1px solid var(--roman-red);
            color: var(--roman-red);
            font-weight: bold;
            width: 100%;
            text-align: center;
            z-index: 5;
        }

        .stylobate {
            width: 700px;
            height: 60px;
            background: #5D4037;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.5rem;
            margin-top: 5px;
            box-shadow: 0 10px 20px rgba(0,0,0,0.4);
            border-radius: 2px;
        }

        .highlight-box {
            background: rgba(139, 0, 0, 0.1);
            border-left: 5px solid var(--roman-red);
            padding: 20px;
            margin: 20px 0;
            text-align: left;
        }
        
        .security-badge {
            background-color: #e6fffa;
            border: 2px solid #38b2ac;
            color: #234e52;
            padding: 10px;
            border-radius: 8px;
            font-size: 0.7em;
            font-weight: bold;
            display: inline-block;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="reveal">
        <div class="slides">
            
            <!-- SLIDE 1: TÍTULO -->
            <section data-background-gradient="linear-gradient(to bottom, #fdfbf7, #e6e2dd)">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Escudo_de_la_Universidad_de_Murcia.svg/1200px-Escudo_de_la_Universidad_de_Murcia.svg.png" style="width: 100px; margin-bottom: 20px;">
                <h1 style="font-size: 2.5em;">La IA en el Derecho Romano</h1>
                <h3 style="color: #555;">De la investigación a la innovación docente</h3>
                <div style="width: 100px; height: 5px; background: var(--roman-red); margin: 30px auto;"></div>
                <p><strong>Proyecto UlpianoIA</strong></p>
                <p style="font-size: 0.6em; margin-top: 50px;">Prof. Adolfo A. Díaz-Bautista Cremades<br>Universidad de Murcia</p>
            </section>

            <!-- SLIDE 2: EL GIRO (EL PIVOT) -->
            <section>
                <h2>El Giro Metodológico</h2>
                <div class="highlight-box">
                    <p>La investigación jurídica más urgente hoy no es arqueológica, sino <strong>docente</strong>.</p>
                </div>
                <p class="fragment">¿Cómo transmitimos un legado de 20 siglos a la Generación Z?</p>
                <p class="fragment" style="color: var(--roman-red); font-size: 1.5em; margin-top: 40px;">
                    <strong>Investigar CÓMO enseñar.</strong>
                </p>
            </section>

            <!-- SLIDE 3: INFOGRAFÍA DEL TEMPLO -->
            <section>
                <h3>Arquitectura del Proyecto</h3>
                <div class="temple-container">
                    <!-- Techo -->
                    <div class="pediment">
                        <div class="pediment-text">
                            LA DOCENCIA<br>
                            <span style="font-size: 0.7em; font-weight: normal;">(UlpianoIA + Laboratorio de Casos)</span>
                        </div>
                    </div>
                    <div class="cornice">INNOVACIÓN - ACCESIBILIDAD - PRÁCTICA</div>
                    
                    <!-- Columnas -->
                    <div class="columns-container">
                        <div class="column"></div>
                        <div class="column"></div>
                        <div class="column"></div>
                        <div class="column"></div>
                        <div class="column"></div>
                        <div class="tech-label fragment fade-up">
                            TECNOLOGÍA (EL MOTOR)<br>
                            <span style="font-size: 0.6em; color: #333;">Gemini 2.5 Flash + RAG + Node.js</span>
                        </div>
                    </div>

                    <!-- Base -->
                    <div class="stylobate fragment fade-up">
                        LOS CIMIENTOS: Manual, Digesto y Fuentes Históricas
                    </div>
                </div>
            </section>

            <!-- SLIDE 4: PLACEHOLDER DEMO 1 (RECURSOS) -->
            <section data-background-color="#f0f0f0">
                <div style="border: 4px dashed #999; padding: 50px; border-radius: 20px;">
                    <h2 style="color: #666;">DEMOSTRACIÓN EN VIVO</h2>
                    <h3 style="color: var(--roman-red);">1. El Ecosistema Digital</h3>
                    <ul style="list-style: none;">
                        <li>📚 Manual Digital Interactivo</li>
                        <li>🎧 Podcasts para movilidad</li>
                        <li>🗺️ Esquemas Visuales</li>
                    </ul>
                    <p style="margin-top: 30px; font-style: italic;">(Cambiando a Navegador...)</p>
                </div>
            </section>

            <!-- SLIDE 5: ULPIANO IA (ACTUALIZADA: CONTROL DE ALUCINACIONES) -->
            <section>
                <h2>El Tutor Seguro (UlpianoIA)</h2>
                <div class="grid grid-cols-2 gap-4">
                    <div style="text-align: left; font-size: 0.75em;">
                        <p style="color: var(--roman-red); font-weight: bold;">El Problema de ChatGPT:</p>
                        <p style="margin-bottom: 15px;">Las "Alucinaciones" (inventa leyes o citas).</p>
                        
                        <p style="color: var(--roman-gold); font-weight: bold;">Nuestra Solución (RAG + Seguridad):</p>
                        <ul style="margin-left: 20px;">
                            <li><strong>Base de Conocimiento Controlada:</strong> La IA solo lee nuestro Manual y el Digesto Bilingüe.</li>
                            <li><strong>Prompt de Seguridad:</strong> "Si no tienes la cita exacta, PROHIBIDO inventar un número (D.x.x)".</li>
                            <li><strong>Jerarquía de Fuentes:</strong> 1. Digesto > 2. Partidas > 3. Principios Generales.</li>
                        </ul>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/7/75/Ulpian.jpg" style="border-radius: 50%; width: 200px; border: 5px solid var(--roman-gold); box-shadow: 0 10px 20px rgba(0,0,0,0.3);">
                        <div class="security-badge">🛡️ ALUCINACIONES BLOQUEADAS</div>
                    </div>
                </div>
            </section>

            <!-- SLIDE 6: PLACEHOLDER DEMO 2 (CASOS) -->
            <section data-background-color="#f0f0f0">
                <div style="border: 4px dashed #999; padding: 50px; border-radius: 20px;">
                    <h2 style="color: #666;">DEMOSTRACIÓN EN VIVO</h2>
                    <h3 style="color: var(--roman-red);">2. El Laboratorio de Casos</h3>
                    <p><strong>El Generador Infinito</strong></p>
                    <hr>
                    <p style="font-size: 0.8em; text-align: left; margin-left: 20%;">
                        🤖 <strong>Rol 1 (Profesor):</strong> Genera conflicto (Ticio vs Cayo).<br>
                        ⚖️ <strong>Rol 2 (Juez):</strong> Resuelve citando FUENTES REALES.
                    </p>
                    <p style="margin-top: 30px; font-style: italic;">(Probando: "Hurto" o "Daños de animales")</p>
                </div>
            </section>

            <!-- SLIDE 7: LA COCINA TÉCNICA (ACTUALIZADA) -->
            <section>
                <h3>Metodología: "Arquitecto Funcional"</h3>
                <div class="flex justify-center items-center gap-10" style="margin-bottom: 20px;">
                    <div class="fragment fade-right" style="background: white; padding: 15px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); width: 45%;">
                        <h4>El Profesor</h4>
                        <p style="font-size: 0.6em;">Define la lógica jurídica y cura los textos (JSONs del Manual y Digesto).</p>
                    </div>
                    <div style="font-size: 2em; color: var(--roman-gold);">+</div>
                    <div class="fragment fade-left" style="background: #eef; padding: 15px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); width: 45%;">
                        <h4>La IA (Gemini 2.5)</h4>
                        <p style="font-size: 0.6em;">Ejecuta el código Node.js y procesa el lenguaje natural.</p>
                    </div>
                </div>
                
                <div class="fragment" style="background: #2d3748; color: #a0aec0; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 0.45em; text-align: left; border-left: 4px solid #48bb78;">
                    // CÓDIGO REAL DEL SERVIDOR (Protección Anti-Alucinación)<br>
                    > const prompt = "Rol: Juez Romano. IDIOMA: ESPAÑOL.";<br>
                    > prompt += "INSTRUCCIÓN DE SEGURIDAD: <strong>NO inventes citas numéricas (D.x.x).</strong>";<br>
                    > prompt += "Si no tienes la cita exacta en el archivo, usa Regulae Iuris o cita a Gayo por nombre.";
                </div>
            </section>

            <!-- SLIDE 8: CONCLUSIÓN -->
            <section>
                <h2>Conclusión</h2>
                <p>La IA no viene a sustituir al profesor.</p>
                <h3 style="color: var(--roman-gold); margin-top: 30px;">Viene a liberarnos.</h3>
                <p class="fragment">Nos libera de la burocracia para dedicarnos a enseñar a <strong>pensar con Justicia</strong>.</p>
                <div style="margin-top: 50px; font-size: 0.6em;">
                    <p>Prof. Adolfo A. Díaz-Bautista Cremades</p>
                    <a href="https://derechoromano.netlify.app" target="_blank" style="color: var(--roman-red);">derechoromano.netlify.app</a>
                </div>
            </section>

        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reveal.min.js"></script>
    <script>
        Reveal.initialize({
            controls: true,
            progress: true,
            center: true,
            hash: true,
            transition: 'slide' // none/fade/slide/convex/concave/zoom
        });
    </script>
</body>
</html>