const { app, BrowserWindow, dialog, powerSaveBlocker, ipcMain } = require('electron');
const path = require('path');

// Limit V8 heap memory and enable Chrome's low end device mode to significantly reduce RAM usage
app.name = 'tikttoklive';
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
        icon: path.join(__dirname, 'public', 'assets', 'app-icons', 'icon.png'),
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });


    // Show window only when ready to avoid white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Cargamos la interfaz desde el servidor local
    // Esperamos 1 segundo para asegurarnos que el servidor levantó
    setTimeout(() => {
        mainWindow.loadURL('http://127.0.0.1:3000');
    }, 1000);

    // Permite abrir las herramientas de desarrollo usando Ctrl + Shift + I
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    // Buscar actualizaciones al mostrar la ventana
    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });

    // IPC: set/clear native acrylic blur for Liquid Glass mode
    ipcMain.removeAllListeners('set-background-material');
    ipcMain.on('set-background-material', (event, material) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            try {
                mainWindow.setBackgroundMaterial(material);
            } catch (e) {
                // setBackgroundMaterial may not exist on older Electron builds – ignore
            }
        }
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
    // Prevenir que la computadora se suspenda o apague la pantalla mientras el programa está abierto
    const powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    console.info(`[Sistema] Bloqueo de suspensión de PC activado (ID: ${powerBlockerId})`);
    
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
