<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <title>Guía Interactiva de Derecho Romano | Versión Definitiva</title>
    <meta name="description" content="Guía interactiva de Derecho Romano para estudiantes de la Universidad de Murcia, con un diseño moderno, herramientas de IA, infografías detalladas y casos prácticos.">
    <link rel="icon" href="favicon.ico" type="image/x-icon">

    <meta property="og:title" content="Guía Interactiva de Derecho Romano">
    <meta property="og:description" content="Recursos didácticos de Derecho Romano con IA - Universidad de Murcia">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://derechoromano.netlify.app">

    <link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Lato:wght@400;700&family=Inter:wght@400;500;600;700;900&display=swap"
      rel="stylesheet"
      media="print" 
      onload="this.media='all'">
    
    
    <style>
        body { font-family: 'Lato', sans-serif; background-color: #fdfbf7; color: #333; }
        h1, h2, h3, h4, h5, h6 { font-family: 'Cormorant Garamond', serif; }
        
        .roman-gradient { background: linear-gradient(135deg, #4a0e4e 0%, #811c5d 100%); }
        .card-hover { transition: all 0.3s ease; }
        .card-hover:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
        
        /* Animación suave para modales */
        .modal-enter { opacity: 0; transform: scale(0.95); }
        .modal-enter-active { opacity: 1; transform: scale(1); transition: opacity 300ms, transform 300ms; }
        .modal-exit { opacity: 1; transform: scale(1); }
        .modal-exit-active { opacity: 0; transform: scale(0.95); transition: opacity 300ms, transform 300ms; }

        /* Estilo Markdown básico */
        .prose h3 { color: #4a0e4e; font-size: 1.25rem; font-weight: bold; margin-top: 1rem; }
        .prose p { margin-bottom: 0.75rem; line-height: 1.6; }
        .prose ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .prose strong { color: #5D4037; font-weight: 700; }
        
        /* Loader Romano (Barra de progreso) */
        .progress-bar-container {
            width: 100%;
            height: 6px;
            background-color: #e0e0e0;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 15px;
        }
        .progress-bar {
            height: 100%;
            background-color: #811c5d;
            width: 0%;
            transition: width 0.3s ease;
            animation: progressAnimation 2s infinite ease-in-out;
        }
        @keyframes progressAnimation {
            0% { width: 0%; margin-left: 0%; }
            50% { width: 70%; margin-left: 30%; }
            100% { width: 0%; margin-left: 100%; }
        }
        
        /* Texto animado de carga */
        .loading-text {
            font-family: 'Cormorant Garamond', serif;
            font-style: italic;
            color: #666;
            margin-top: 10px;
            font-size: 1.1rem;
            min-height: 1.5rem; /* Evita saltos */
        }
    </style>
</head>
<body class="flex flex-col min-h-screen">

    <!-- Navbar -->
    <nav class="bg-white shadow-md sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-20 items-center">
                <div class="flex items-center space-x-3">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Escudo_de_la_Universidad_de_Murcia.svg/1200px-Escudo_de_la_Universidad_de_Murcia.svg.png" alt="Logo UM" class="h-12 w-auto">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900 tracking-tight leading-none">DERECHO ROMANO</h1>
                        <p class="text-xs text-gray-500 font-medium tracking-wide">UNIVERSIDAD DE MURCIA</p>
                    </div>
                </div>
                <div class="hidden md:flex space-x-8">
                    <a href="#inicio" class="text-gray-700 hover:text-purple-800 font-medium transition">Inicio</a>
                    <a href="#manual" class="text-gray-700 hover:text-purple-800 font-medium transition">Manual</a>
                    <a href="#casos" class="text-gray-700 hover:text-purple-800 font-medium transition">Casos Prácticos</a>
                    <a href="#recursos" class="text-gray-700 hover:text-purple-800 font-medium transition">Recursos</a>
                </div>
                <button onclick="document.getElementById('mobile-menu').classList.toggle('hidden')" class="md:hidden text-gray-500 focus:outline-none">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
            </div>
        </div>
        <!-- Menú Móvil -->
        <div id="mobile-menu" class="hidden md:hidden bg-white border-t">
            <a href="#inicio" class="block px-4 py-2 text-gray-700 hover:bg-gray-50">Inicio</a>
            <a href="#manual" class="block px-4 py-2 text-gray-700 hover:bg-gray-50">Manual</a>
            <a href="#casos" class="block px-4 py-2 text-gray-700 hover:bg-gray-50">Casos</a>
            <a href="#recursos" class="block px-4 py-2 text-gray-700 hover:bg-gray-50">Recursos</a>
        </div>
    </nav>

    <!-- Hero -->
    <header id="inicio" class="roman-gradient text-white py-20 px-4">
        <div class="max-w-4xl mx-auto text-center">
            <h2 class="text-4xl md:text-5xl font-bold mb-6 font-serif">El Derecho es el arte de lo bueno y lo justo</h2>
            <p class="text-xl md:text-2xl font-light opacity-90 mb-10">
                "Ius est ars boni et aequi" - Celso
            </p>
            <div class="flex justify-center gap-4">
                <a href="#manual" class="bg-white text-purple-900 px-8 py-3 rounded-full font-bold shadow-lg hover:bg-gray-100 transition transform hover:scale-105">
                    Consultar Manual
                </a>
                <a href="#casos" class="border-2 border-white text-white px-8 py-3 rounded-full font-bold hover:bg-white hover:text-purple-900 transition transform hover:scale-105">
                    Laboratorio de Casos
                </a>
            </div>
        </div>
    </header>

    <!-- ULPIANO IA (Chat) -->
    <section class="max-w-7xl mx-auto px-4 py-16">
        <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200 flex flex-col md:flex-row">
            <div class="md:w-1/3 bg-purple-50 p-8 flex flex-col justify-center items-center text-center border-r border-gray-100">
                <div class="w-24 h-24 bg-purple-200 rounded-full flex items-center justify-center mb-4 text-4xl">🏛️</div>
                <h3 class="text-2xl font-bold text-gray-800 mb-2 font-serif">UlpianoIA</h3>
                <p class="text-gray-600 text-sm">Tu tutor personal 24/7. Pregunta cualquier duda conceptual o definición. Respuestas basadas exclusivamente en el manual de la cátedra.</p>
            </div>
            <div class="md:w-2/3 p-8">
                <div class="mb-4">
                    <label for="chat-input" class="block text-sm font-medium text-gray-700 mb-1">¿Qué quieres saber?</label>
                    <div class="flex gap-2">
                        <input type="text" id="chat-input" placeholder="Ej: Diferencia entre auctoritas y potestas..." 
                               class="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition">
                        <button onclick="enviarConsultaUlpiano()" class="bg-purple-800 text-white px-6 py-3 rounded-lg hover:bg-purple-900 transition font-medium flex items-center gap-2">
                            <span>Preguntar</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                        </button>
                    </div>
                </div>
                
                <!-- Área de Respuesta -->
                <div id="chat-output" class="hidden mt-6 bg-gray-50 rounded-lg p-6 border border-gray-200 animate-fade-in">
                    <!-- Aquí se inyecta la respuesta -->
                </div>

                <!-- Spinner de Carga Divertido -->
                <div id="chat-loader" class="hidden mt-8 text-center">
                    <div class="w-16 h-16 border-4 border-purple-200 border-t-purple-800 rounded-full animate-spin mx-auto mb-4"></div>
                    <div class="progress-bar-container max-w-xs mx-auto mb-2">
                        <div class="progress-bar"></div>
                    </div>
                    <p id="chat-loader-text" class="loading-text">Ulpiano está consultando los rollos...</p>
                </div>
            </div>
        </div>
    </section>

    <!-- LABORATORIO DE CASOS -->
    <section id="casos" class="bg-gray-100 py-16">
        <div class="max-w-7xl mx-auto px-4">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold text-gray-900 mb-4 font-serif">Laboratorio de Casos Prácticos</h2>
                <p class="text-lg text-gray-600 max-w-2xl mx-auto">Genera casos infinitos para practicar. Pon a prueba tu razonamiento jurídico antes del examen.</p>
            </div>

            <div class="grid md:grid-cols-2 gap-8">
                <!-- Generador -->
                <div class="bg-white p-8 rounded-xl shadow-lg border-t-4 border-purple-600">
                    <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span class="text-2xl">🤖</span> Generar Nuevo Caso
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Tema o Institución (Opcional)</label>
                            <input type="text" id="caso-tema" placeholder="Ej: Hurto, Compraventa, Servidumbres..." class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none">
                        </div>
                        <button onclick="generarCaso()" class="w-full bg-gray-800 text-white py-3 rounded-lg hover:bg-gray-900 transition font-bold shadow-md">
                            GENERAR CASO ALEATORIO
                        </button>
                    </div>
                </div>

                <!-- Resolución -->
                <div class="bg-white p-8 rounded-xl shadow-lg border-t-4 border-yellow-500 relative">
                    <!-- Overlay de bloqueo si no hay caso -->
                    <div id="caso-overlay" class="absolute inset-0 bg-white bg-opacity-90 z-10 flex flex-col items-center justify-center text-center p-6">
                        <p class="text-gray-500 text-lg font-medium">Genera un caso primero para poder resolverlo.</p>
                    </div>

                    <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span class="text-2xl">📜</span> Enunciado del Caso
                    </h3>
                    <div id="caso-texto" class="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-gray-800 font-serif leading-relaxed min-h-[150px] mb-6 italic">
                        <!-- Aquí va el caso generado -->
                    </div>

                    <div class="flex gap-4">
                        <button onclick="verSolucion()" class="flex-1 bg-purple-700 text-white py-2 rounded-lg hover:bg-purple-800 transition font-medium shadow">
                            Ver Solución Motivada
                        </button>
                    </div>
                </div>
            </div>

            <!-- Modal de Solución -->
            <div id="modal-solucion" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm px-4">
                <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scale-up">
                    <div class="p-6 border-b flex justify-between items-center bg-purple-50 rounded-t-xl">
                        <h3 class="text-xl font-bold text-purple-900 font-serif">Solución Jurídica (UlpianoIA)</h3>
                        <button onclick="cerrarSolucion()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>
                    <div class="p-8 overflow-y-auto prose prose-purple max-w-none" id="solucion-contenido">
                        <!-- Contenido dinámico -->
                    </div>
                    
                    <!-- Loader Solución -->
                    <div id="solucion-loader" class="hidden p-10 text-center">
                        <div class="w-12 h-12 border-4 border-purple-200 border-t-purple-800 rounded-full animate-spin mx-auto mb-4"></div>
                        <div class="progress-bar-container max-w-xs mx-auto mb-2">
                            <div class="progress-bar"></div>
                        </div>
                        <p id="solucion-loader-text" class="loading-text">El Juez está deliberando...</p>
                    </div>

                    <div class="p-4 border-t bg-gray-50 rounded-b-xl text-right">
                        <button onclick="cerrarSolucion()" class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- CALCULADORA DE PARENTESCO -->
    <section class="max-w-7xl mx-auto px-4 py-16 bg-white">
        <div class="bg-purple-50 rounded-2xl p-8 border border-purple-100 text-center">
            <h2 class="text-2xl font-bold text-gray-900 mb-6 font-serif">Calculadora de Grados de Parentesco</h2>
            <div class="flex flex-col md:flex-row justify-center items-center gap-4 max-w-3xl mx-auto">
                <input type="text" id="pariente1" placeholder="Persona 1 (Ej: Ego)" class="p-3 border rounded-lg w-full md:w-1/3">
                <span class="text-2xl text-purple-300">↔</span>
                <input type="text" id="pariente2" placeholder="Persona 2 (Ej: Tío Abuelo)" class="p-3 border rounded-lg w-full md:w-1/3">
                <button onclick="calcularParentesco()" class="bg-purple-700 text-white px-6 py-3 rounded-lg hover:bg-purple-800 transition font-medium whitespace-nowrap w-full md:w-auto">
                    Calcular Grado
                </button>
            </div>
            <!-- Resultado Parentesco -->
            <div id="parentesco-resultado" class="hidden mt-6 bg-white p-4 rounded-lg border border-purple-200 inline-block text-left animate-fade-in shadow-sm">
                <!-- JS inserta aquí -->
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-gray-900 text-white py-12 mt-auto">
        <div class="max-w-7xl mx-auto px-4 grid md:grid-cols-3 gap-8 text-sm">
            <div>
                <h4 class="text-lg font-bold font-serif mb-4 text-purple-300">Cátedra de Derecho Romano</h4>
                <p class="text-gray-400">Universidad de Murcia</p>
                <p class="text-gray-400 mt-2">Prof. Adolfo A. Díaz-Bautista Cremades</p>
            </div>
            <div>
                <h4 class="text-lg font-bold font-serif mb-4 text-purple-300">Recursos</h4>
                <ul class="space-y-2 text-gray-400">
                    <li><a href="#" class="hover:text-white transition">Guía Docente</a></li>
                    <li><a href="#" class="hover:text-white transition">Campus Virtual</a></li>
                    <li><a href="#" class="hover:text-white transition">Digesto Online</a></li>
                </ul>
            </div>
            <div>
                <h4 class="text-lg font-bold font-serif mb-4 text-purple-300">Aviso Legal</h4>
                <p class="text-gray-400">Esta herramienta utiliza Inteligencia Artificial (Gemini) como apoyo docente. Las respuestas deben ser contrastadas siempre con el manual de referencia. No utilizar para resolver casos evaluables.</p>
            </div>
        </div>
    </footer>

    <!-- SCRIPTS -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
        // --- LÓGICA DE LOADING DIVERTIDO ---
        let loadingInterval;
        const frasesCarga = [
            "Ulpiano está consultando los rollos del Tablinum...",
            "Buscando jurisprudencia en la Biblioteca de Alejandría...",
            "El Pretor está redactando el Edicto...",
            "Interrogando a los testigos en el Foro...",
            "Consultando las XII Tablas...",
            "Gayo está escribiendo sus Instituciones...",
            "Justiniano está recopilando el Digesto...",
            "Papiniano está deliberando..."
        ];

        function startLoadingAnimation(elementId) {
            const textElement = document.getElementById(elementId);
            if(!textElement) return;
            
            // Mensaje inicial aleatorio
            textElement.innerText = frasesCarga[Math.floor(Math.random() * frasesCarga.length)];
            
            // Rotación cada 2 segundos
            loadingInterval = setInterval(() => {
                const frase = frasesCarga[Math.floor(Math.random() * frasesCarga.length)];
                textElement.innerText = frase;
            }, 2000);
        }

        function stopLoadingAnimation() {
            clearInterval(loadingInterval);
        }

        // --- URL DEL BACKEND (CAMBIAR EN PRODUCCIÓN SI ES NECESARIO) ---
        // Al estar en el mismo dominio (Netlify/Render), suele bastar con la ruta relativa si hay proxy,
        // o la URL absoluta de Render. 
        // IMPORTANTE: Cambia esto por tu URL real de Render si no usas proxy.
        const API_URL = 'https://ulpiano-backend.onrender.com'; // O la URL que te dé Render

        // --- 1. ULPIANO IA (CHAT) ---
        async function enviarConsultaUlpiano() {
            const input = document.getElementById('chat-input');
            const termino = input.value.trim();
            if (!termino) return;

            // UI Reset
            const outputDiv = document.getElementById('chat-output');
            const loader = document.getElementById('chat-loader');
            
            outputDiv.innerHTML = '';
            outputDiv.classList.add('hidden');
            loader.classList.remove('hidden');
            
            // Iniciar animación divertida
            startLoadingAnimation('chat-loader-text');

            try {
                // LLAMADA AL SERVIDOR
                const response = await fetch(`${API_URL}/api/consulta-unificada`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ termino })
                });

                if (!response.ok) throw new Error('Error en la conexión con el oráculo.');
                const data = await response.json();

                // RENDERIZADO
                let htmlContent = `
                    <div class="prose prose-purple max-w-none">
                        <h4 class="text-xl font-bold text-purple-900 mb-3 font-serif flex items-center gap-2">
                            <span>🎓</span> Explicación Docente
                        </h4>
                        <div class="text-gray-800 text-lg leading-relaxed mb-6">
                            ${marked.parse(data.respuesta || data.respuesta_principal)}
                        </div>
                `;

                if (data.moderno || data.conexion_moderna) {
                    htmlContent += `
                        <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg mt-4">
                            <h5 class="font-bold text-blue-900 text-sm uppercase tracking-wide mb-1">Conexión con el Derecho Vigente</h5>
                            <p class="text-blue-800 text-sm m-0">${data.moderno || data.conexion_moderna}</p>
                        </div>
                    `;
                }

                if (data.pagina) {
                    htmlContent += `
                        <div class="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
                            <span>📚 Referencia Manual: <strong>${data.titulo}</strong></span>
                            <span class="bg-gray-200 px-2 py-1 rounded text-xs">Pág. ${data.pagina}</span>
                        </div>
                    `;
                }
                
                htmlContent += `</div>`;

                outputDiv.innerHTML = htmlContent;
                outputDiv.classList.remove('hidden');

            } catch (error) {
                console.error(error);
                outputDiv.innerHTML = `<div class="text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">
                    <strong>Error:</strong> Ulpiano no ha podido encontrar respuesta en los archivos. (Error del servidor).
                </div>`;
                outputDiv.classList.remove('hidden');
            } finally {
                stopLoadingAnimation();
                loader.classList.add('hidden');
            }
        }

        // --- 2. LABORATORIO DE CASOS ---
        let casoActualTexto = ""; // Variable para guardar el caso generado

        async function generarCaso() {
            const temaInput = document.getElementById('caso-tema').value.trim();
            const tema = temaInput || "Derechos Reales o Contratos"; // Default
            
            const textoDiv = document.getElementById('caso-texto');
            const overlay = document.getElementById('caso-overlay');
            
            // Loading visual en el área de texto
            textoDiv.innerHTML = '<div class="animate-pulse flex space-x-4"><div class="flex-1 space-y-4 py-1"><div class="h-4 bg-yellow-200 rounded w-3/4"></div><div class="space-y-2"><div class="h-4 bg-yellow-200 rounded"></div><div class="h-4 bg-yellow-200 rounded w-5/6"></div></div></div></div>';
            
            try {
                const response = await fetch(`${API_URL}/api/consulta`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo: 'generar', termino: tema })
                });
                
                const data = await response.json();
                casoActualTexto = data.respuesta; // Guardamos para el juez
                
                // Mostrar caso
                textoDiv.innerHTML = marked.parse(casoActualTexto);
                overlay.classList.add('hidden'); // Desbloquear botón solución

            } catch (error) {
                textoDiv.innerHTML = "Error al generar el caso. Inténtalo de nuevo.";
            }
        }

        async function verSolucion() {
            if (!casoActualTexto) return;

            const modal = document.getElementById('modal-solucion');
            const contenido = document.getElementById('solucion-contenido');
            const loader = document.getElementById('solucion-loader');

            modal.classList.remove('hidden');
            contenido.innerHTML = '';
            loader.classList.remove('hidden');
            
            startLoadingAnimation('solucion-loader-text');

            try {
                const response = await fetch(`${API_URL}/api/consulta`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        tipo: 'resolver', 
                        termino: 'solucion', // No relevante, usa el texto
                        currentCaseText: casoActualTexto 
                    })
                });

                const data = await response.json();
                
                contenido.innerHTML = marked.parse(data.respuesta);

            } catch (error) {
                contenido.innerHTML = `<p class="text-red-600">Error al contactar con el Juez.</p>`;
            } finally {
                stopLoadingAnimation();
                loader.classList.add('hidden');
            }
        }

        function cerrarSolucion() {
            document.getElementById('modal-solucion').classList.add('hidden');
        }

        // --- 3. CALCULADORA PARENTESCO ---
        async function calcularParentesco() {
            const p1 = document.getElementById('pariente1').value;
            const p2 = document.getElementById('pariente2').value;
            const resDiv = document.getElementById('parentesco-resultado');

            if(!p1 || !p2) return;

            resDiv.innerHTML = '<span class="text-gray-500 italic">Calculando...</span>';
            resDiv.classList.remove('hidden');

            try {
                const response = await fetch(`${API_URL}/api/consulta-parentesco`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ person1: p1, person2: p2 })
                });
                const data = await response.json();

                resDiv.innerHTML = `
                    <ul class="space-y-2">
                        <li><strong>Línea:</strong> ${data.linea}</li>
                        <li><strong>Grado:</strong> ${data.grado}º</li>
                        <li class="text-sm text-gray-600 border-t pt-2 mt-2">${data.explicacion}</li>
                    </ul>
                `;
            } catch (error) {
                resDiv.innerHTML = "Error al calcular.";
            }
        }

        // Enter key listeners
        document.getElementById('chat-input').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') enviarConsultaUlpiano();
        });
    </script>
</body>
</html>