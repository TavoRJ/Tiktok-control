const { app, BrowserWindow } = require('electron');
const path = require('path');

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
        title: "TikTok Live Panel",
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
autoUpdater.on('update-available', () => {
    console.info('Nueva actualización disponible. Descargando...');
});

autoUpdater.on('update-downloaded', () => {
    console.info('Actualización descargada. Se instalará al cerrar la aplicación.');
    autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (err) => {
    console.error('Error en el actualizador automático:', err);
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
