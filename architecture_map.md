# Mapa de Arquitectura y Dependencias (TavLive)

Este documento actúa como guía obligatoria de referencia técnica y arquitectónica para evitar la alteración accidental, pérdida o corrupción del código fuente del proyecto.

---

## 1. Árbol Simplificado del Proyecto

Estructura jerárquica excluyendo `node_modules` y directorios de distribución (`dist`, `.git`, `.gemini`, `scratch`):

```text
Tiktok-control/
├── main.js                        # Proceso principal de Electron (Entry point de la App)
├── server.js                      # Servidor Express/Socket.io (Núcleo lógico y conectores)
├── package.json                   # Dependencias, scripts de construcción y metadatos
├── package-lock.json              # Bloqueo de dependencias de npm
├── session_stats.json             # Estado de métricas de la transmisión en tiempo real
├── remote_config.json             # Bloqueos y flags remotos de APIs (vía GitHub)
│
│   # --- CATÁLOGOS Y CONFIGURACIONES DEL USUARIO (Escritura Segura) ---
├── chatbot_settings.json          # Ajustes del chatbot, coordenadas de widgets, AI y metas
├── dinamicas_config.json          # Estado y configuraciones de juegos / dinámicas activas
├── sounds_config.json             # Mapeo de ID de Regalos a Sonidos Personalizados
├── recetas_config.json            # Configuración de receta del día para el widget de cocina
├── gifts_mapping.json             # [CEREBRO] Mapeo maestro de regalos registrados de TikTok Live
├── goals_catalog.json             # [ESPEJO] Catálogo filtrado utilizado en dinámicas
│
├── public/                        # Archivos de interfaz y overlays de OBS
│   ├── index.html                 # Panel de Control principal (Dashboard)
│   ├── overlay.html               # Overlay consolidado para streaming
│   ├── banner-cocina.html         # Banner de cocina deslizante animado
│   ├── recetas.html               # Overlay específico de recetas de cocina
│   ├── dinamicas.html             # Pantalla de visualización de dinámicas de juego
│   ├── music-widget.html          # Widget de reproductor Spotify
│   ├── songlist-widget.html       # Lista visualizada de cola de canciones
│   ├── social-rotator.html        # Carrusel animado de redes sociales
│   ├── ruleta-widget.html         # Ruleta de premios e interacción
│   ├── donors-overlay.html        # Overlay de mejores donadores (Top Donors)
│   ├── taps-overlay.html          # Overlay de likes en tiempo real
│   ├── mvp-overlay.html           # Alertas de ingreso de usuarios MVP
│   ├── animations.html            # Contenedor de animaciones CSS/JS
│   │
│   ├── js/                        # Controladores frontend de widgets
│   │   ├── panel.js               # Lógica global del Dashboard (Comunicación Socket.io)
│   │   ├── overlay.js             # Controlador global de Overlay
│   │   ├── animations.js          # Manejador de eventos y animaciones
│   │   ├── music-widget.js        # Lógica cliente para Spotify
│   │   ├── widgets-overlay.js     # Lógica genérica de overlays de OBS
│   │   ├── social-rotator.js      # Controlador de redes sociales
│   │   └── modules/               # Módulos ES6 desacoplados
│   │       ├── canvas-editor.js   # Edición del banner en canvas
│   │       ├── music-widget-settings.js
│   │       ├── socket-client.js   # Wrapper cliente de Socket.io
│   │       ├── themes.js          # Inyección de estilos de personajes (Naya / Majo / Neutral)
│   │       └── ui-manager.js      # Manipulación del DOM del Panel
│   │
│   ├── css/                       # Estilos de interfaz
│   │   ├── panel.css              # Hoja de estilos del Dashboard
│   │   ├── overlay.css            # Hoja de estilos de Overlay
│   │   ├── music-widget.css       # Hoja de estilos del reproductor de música
│   │   └── social-rotator.css     # Animaciones del rotator social
│   │
│   ├── sounds/                    # Directorio de alertas sonoras locales por defecto
│   └── assets/                    # Imágenes estáticas e íconos de la app
│
└── uploads/                       # Archivos de audio e imágenes subidos por el usuario
```

---

## 2. Responsabilidad Única (SRP)

Cada archivo y proceso principal tiene un dominio de control aislado y bien definido:

### Proceso de Electron (Frontend Nativo)
*   **[main.js](file:///c:/Users/tavor/OneDrive/Escritorio/TiktToklive/main.js)**:
    *   **Responsabilidad única**: Ciclo de vida de la aplicación de escritorio y configuraciones del contenedor Chromium.
    *   **Funcionalidades**: 
        *   Inicializa la ventana principal (`BrowserWindow`) cargando `http://127.0.0.1:3000`.
        *   Configura parámetros de rendimiento del motor V8 (`--max-old-space-size=128`, habilitación del modo de bajos recursos).
        *   Ejecuta el auto-actualizador (`electron-updater`).
        *   Bloquea la suspensión del sistema (`powerSaveBlocker`).
        *   Define la ruta writable en el directorio de usuario (`process.env.USER_DATA_PATH`).

### Proceso del Servidor (Backend y Conectores)
*   **[server.js](file:///c:/Users/tavor/OneDrive/Escritorio/TiktToklive/server.js)**:
    *   **Responsabilidad única**: Motor lógico, base de datos local JSON, servidor Web y pasarela de comunicación bidireccional mediante WebSockets.
    *   **Funcionalidades**:
        *   Configura y expone endpoints Express y Socket.io.
        *   Controla la conexión de la API de TikTok Live mediante `tiktok-live-connector`.
        *   Modera y encola los comandos de chat para síntesis de voz (TTS) mediante `node-edge-tts` y generación inteligente de respuestas IA (Gemini).
        *   Consume APIs de reproducción remota y control de cola para Spotify y YouTube (descargas vía Cobalt API y reproducción multimedia).
        *   Implementa el algoritmo de **Guardado Seguro de Archivos de Configuración** interceptando de forma segura las escrituras síncronas de Node.

---

## 3. Matriz de Dependencias y Configuración

Los archivos JSON actúan como bases de datos planas y archivos de estado persistentes. A continuación se detalla qué componentes leen, crean o modifican dichos archivos:

| Archivo de Configuración | Lectura inicial | Escritura y Modificación | Propósito de Configuración / Estado |
| :--- | :--- | :--- | :--- |
| **`chatbot_settings.json`** | `server.js` | `server.js` (Vía peticiones API de `panel.js` y metadatos de regalos) | Almacena configuraciones del bot, credenciales de Spotify/Gemini, coordenadas de widgets, prompts de IA, listas de moderación (bannedWords) y metas del directo. |
| **`sounds_config.json`** | `server.js` (Carga al inicio e inmediata al recibir regalos) | `server.js` (Petición de modificación de sonido de alerta desde el panel) | Asocia los IDs numéricos de regalos de TikTok Live con archivos de sonido locales alojados en `uploads/`. |
| **`dinamicas_config.json`** | `server.js` | `server.js` (Actualización de dinámicas y avance de objetivos) | Registra el progreso de las dinámicas de streaming activas y configuraciones de juegos interactivos independientes. |
| **`recetas_config.json`** | `server.js` | `server.js` (Actualización de pasos/ingredientes vía API) | Almacena el título de la receta, la lista de ingredientes y la visibilidad para el widget del banner de cocina. |
| **`gifts_mapping.json`** | `server.js` | `server.js` (Auto-registro de nuevos regalos desde el Live) | **[CEREBRO]** Catálogo total de regalos identificados de TikTok Live. Mapea ID de regalo a nombre de visualización, costo en monedas y archivo de imagen asociado. |
| **`goals_catalog.json`** | `server.js` | `server.js` (Sincronización automática mediante `syncMirrorCatalogs`) | **[ESPEJO]** Catálogo que copia los regalos de `gifts_mapping.json` sin metas activas, utilizado para configurar picker de regalos en dinámicas. |
| **`session_stats.json`** | `server.js` | `server.js` (Persistencia periódica al desconectar/actualizar métricas) | Guarda estadísticas acumuladas de la sesión actual de streaming (diamantes, likes, espectadores pico) para recuperarse ante reinicios. |
| **`remote_config.json`** | `server.js` | Ninguno (Solo lectura remota en GitHub / local como fallback) | Configuración administrativa remota para bloqueos de APIs (YouTube bloqueado, activar/desactivar desarrollo). |

---

## 4. Puntos Críticos de Flujo de Eventos

Los eventos fluyen desde el stream de TikTok o el Panel de Control a través de `server.js`, ejecutando lógica de deduplicación y encolado antes de emitirse a las interfaces de Overlay.

```mermaid
graph TD
    A[TikTok Live / Stream Events] -->|Ingesta de Datos| B(server.js - Conexión Activa)
    B --> C{Tipo de Evento?}
    
    C -->|Evento: chat| D[Backlog Buffering / Spam Shield]
    D -->|Mensajes válidos| E{Comando?}
    E -->|!song / !cancion| F[handleSpotifyChatCommand]
    E -->|!yt / !ytqueue| G[handleYoutubeChatCommand]
    E -->|!ia [prompt]| H[handleAiChatCommand]
    E -->|Mensaje estándar| I[handleCloudTTS]
    
    C -->|Evento: gift| J[Filtros de Deduplicación y Combos]
    J --> K[Play Sound Alert - sounds_config.json]
    J --> L[Master Brain Gift Registry - gifts_mapping.json]
    L -->|Propagación| M[syncMirrorCatalogs - goals_catalog.json]
    J --> N[Update Goal & Dinamicas Progress]
    J --> O[Emit overlay_trigger to overlays]
    
    C -->|Evento: member| P[MVP Entrance Custom Animations]
```

### Mecanismos Clave:
1.  **Deduplicación Estricta de Regalos (server.js L4663+)**:
    *   Combina filtros deslizantes de tiempo (5s por usuario/ID de regalo) y deduplicación por identificador único de mensaje (`msgId`). Esto evita que un solo combo dispare múltiples eventos TTS o alertas sonoras repetidas de forma incontrolada.
2.  **Reglas de Combo de Sonido**:
    *   Los sonidos de alertas de regalos solo suenan en cantidad si son el primer regalo (`repeatCount === 1`) o si superan más de 3 veces consecutivas (`repeatCount > 3`), mitigando spam masivo de combo.
3.  **Encolado Inteligente de TTS (server.js L1408+)**:
    *   La cola de reproducción de texto a voz (`ttsQueue`) prioriza dinámicamente según roles de usuario (Subscriptores, Moderadores, Anfitriones, Donadores y comandos directos).
    *   Aplica descarte proactivo de mensajes no prioritarios si la cola supera los 5 elementos en flujo alto (`isHighFlowMode`) para mantener latencia menor a 1000ms.
4.  **Guardado Seguro (Safe Write Wrapper)**:
    *   Se sobreescribe temporalmente `fs.writeFileSync` para archivos críticos de configuración. Si un JSON está corrupto o vacío en el momento de guardado, restaura de forma automática el archivo `.tmp` anterior, previniendo reseteos a blanco de los archivos JSON.

---

## Declaración de Compromiso y Comprensión

> [!IMPORTANT]
> Yo, Antigravity, en calidad de Arquitecto de Software Principal de esta sesión, confirmo y declaro que:
>
> 1. He analizado rigurosamente la estructura y responsabilidades únicas del código del proyecto en este espacio de trabajo.
> 2. Comprendo completamente las dependencias mutuas de configuración y el papel del "Cerebro" (`gifts_mapping.json`) frente al "Espejo" (`goals_catalog.json`).
> 3. Entiendo el funcionamiento y criticidad de los interceptores síncronos de escritura segura de archivos.
> 4. **Me comprometo formal e irrevocablemente a consultar este Mapa de Arquitectura y Dependencias antes de realizar o proponer cualquier modificación de archivos en los prompts venideros**, garantizando que ninguna regla de lógica de negocios, deduplicación de eventos, o encolado de comandos sea alterada o eliminada de manera innecesaria.
