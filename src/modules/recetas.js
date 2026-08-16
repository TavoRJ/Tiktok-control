const fs = require('fs');
const path = require('path');

let getRecetasConfig = null;
let setRecetasConfig = null;
let getRecetasFilePath = null;

/**
 * Inicializa el módulo independiente de Recetas de Cocina.
 * 
 * @param {object} app Instancia del servidor Express.
 * @param {object} io Instancia del servidor Socket.io.
 * @param {object} options Opciones de configuración y callbacks.
 */
function init(app, io, options) {
    getRecetasConfig = options.getConfig;
    setRecetasConfig = options.setConfig;
    getRecetasFilePath = options.getFilePath;

    // 1. Registrar rutas de Express para los widgets
    app.get('/recetas', (req, res) => {
        res.sendFile(path.join(options.rootDir, 'public', 'recetas.html'));
    });

    app.get('/banner-cocina', (req, res) => {
        res.sendFile(path.join(options.rootDir, 'public', 'banner-cocina.html'));
    });

    // 2. Registrar listeners de Socket.io
    io.on('connection', (socket) => {
        // Enviar la configuración inicial del widget al conectarse
        socket.emit('initReceta', getRecetasConfig());

        // Manejar las peticiones de actualización de recetas
        socket.on('manual_control', (data) => {
            if (!data || !data.action) return;

            const config = getRecetasConfig();

            if (data.action === 'vs_update') {
                config.title = data.title;
                config.items = data.items;
                saveConfig(config, io);
            } else if (data.action === 'vs_show') {
                config.visible = true;
                saveConfig(config, io);
            } else if (data.action === 'vs_hide') {
                config.visible = false;
                saveConfig(config, io);
            } else if (data.action === 'vs_reset') {
                const defaultConfig = {
                    title: "RECETA DEL DÍA: PASTEL DE FRESAS",
                    items: [
                        { name: "Fresas Frescas 10 tazas" },
                        { name: "Harina de Trigo 300g" },
                        { name: "Azúcar Morena 150g" },
                        { name: "Esencia de Vainilla 2 cdas" }
                    ],
                    visible: true
                };
                saveConfig(defaultConfig, io);
            }
        });
    });
}

/**
 * Guarda de forma persistente la configuración de la receta y lo notifica a los clientes.
 * 
 * @param {object} newConfig Nueva configuración.
 * @param {object} io Instancia de Socket.io.
 */
function saveConfig(newConfig, io) {
    setRecetasConfig(newConfig);
    const filePath = getRecetasFilePath();
    try {
        // Se utiliza fs.writeFileSync, el cual pasa automáticamente por el Safe Write Wrapper global de server.js
        fs.writeFileSync(filePath, JSON.stringify(newConfig, null, 2), 'utf8');
        io.emit('initReceta', newConfig);
    } catch (err) {
        console.error('[Recetas Module] Error saving recetas_config.json:', err);
    }
}

module.exports = { init };
