const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

// Limit V8 heap memory and enable Chrome's low end device mode to significantly reduce RAM usage
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('enable-low-end-device-mode');

// Pass writable userData path to the backend server (to store settings, uploads, and temp files outside app.asar)
process.env.USER_DATA_PATH = app.getPath('userData');

// Requerimos nuestro servidor de Express/Socket.io
const server = require('./server.js');

const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: "GRLive",
        icon: path.join(__dirname, 'public', 'assets', 'icon.png'), // Puedes crear un ícono luego
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Cargamos la interfaz desde el servidor local
    // Esperamos 1 segundo para asegurarnos que el servidor levantó
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 1000);

    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    // Buscar actualizaciones al mostrar la ventana
    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });
}

// Eventos de Auto-Updater
let isManualCheck = false;

global.manualCheckForUpdates = function() {
    isManualCheck = true;
    console.info("Búsqueda manual de actualización iniciada.");
    autoUpdater.checkForUpdates();
};

autoUpdater.on('update-available', (info) => {
    console.info(`Nueva versión disponible: ${info.version}. Descargando...`);
    dialog.showMessageBox({
        type: 'info',
        title: 'Actualización disponible',
        message: `Una nueva versión (${info.version}) de GRLive está disponible y se está descargando en segundo plano de forma automática.`,
        buttons: ['Entendido']
    });
});

autoUpdater.on('update-not-available', (info) => {
    console.info('No hay actualizaciones disponibles.');
    if (isManualCheck) {
        dialog.showMessageBox({
            type: 'info',
            title: 'Sin actualizaciones',
            message: 'Ya tienes la versión más reciente de GRLive instalada.',
            buttons: ['Aceptar']
        });
        isManualCheck = false;
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.info('Actualización descargada.');
    dialog.showMessageBox({
        type: 'question',
        title: 'Actualización lista',
        message: `La versión ${info.version} ha sido descargada con éxito. ¿Deseas reiniciar la aplicación para instalar la nueva actualización ahora mismo?`,
        buttons: ['Instalar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
    isManualCheck = false;
});

autoUpdater.on('error', (err) => {
    console.error('Error en el actualizador automático:', err);
    if (isManualCheck) {
        dialog.showMessageBox({
            type: 'error',
            title: 'Error de actualización',
            message: `Ocurrió un error al buscar actualizaciones: ${err.message || err}`,
            buttons: ['Aceptar']
        });
        isManualCheck = false;
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
