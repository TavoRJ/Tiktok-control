const { app, BrowserWindow, dialog, powerSaveBlocker, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// Global Process Exception Protection (v1.4.2)
process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception Captured:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

function sanitizeStorageKey(key) {
    if (!key || typeof key !== 'string') return 'default';
    return key.replace(/[^a-zA-Z0-9_-]/g, '');
}

// Runtime ASAR Integrity Check (Subphase 7C)
function verifyAsarIntegrity() {
    if (!app.isPackaged) {
        return { valid: true, reason: 'dev_mode_bypassed' };
    }
    try {
        let ofs = fs;
        try {
            ofs = require('original-fs');
        } catch (e) {
            ofs = fs;
        }

        const asarPath = path.join(process.resourcesPath, 'app.asar');
        if (!ofs.existsSync(asarPath)) {
            const appPath = app.getAppPath();
            if (appPath && ofs.existsSync(appPath)) {
                return { valid: true, reason: 'valid_app_path' };
            }
            return { valid: false, reason: 'asar_missing' };
        }

        const stat = ofs.statSync(asarPath);
        if (!stat) {
            return { valid: false, reason: 'asar_stat_failed' };
        }

        // When using original-fs, stat.size is the real physical file size in bytes
        if (stat.size === 0) {
            const appPath = app.getAppPath();
            if (appPath && ofs.existsSync(appPath)) {
                return { valid: true, reason: 'valid_package' };
            }
        }

        if (stat.size > 0 && stat.size < 1000) {
            return { valid: false, reason: 'asar_corrupted' };
        }

        return { valid: true, reason: 'valid_package' };
    } catch (err) {
        return { valid: false, reason: err.message || 'unknown_error' };
    }
}
global.verifyAsarIntegrity = verifyAsarIntegrity;

// Runtime Anti-Debugging & Process Environment Hardening (Subphase 7D)
function verifyProcessHardening(customArgv = null, customEnv = null) {
    if (!app.isPackaged && !customArgv && !customEnv) {
        return { valid: true, reason: 'dev_mode_allowed' };
    }

    const dangerousSwitches = [
        '--inspect',
        '--inspect-brk',
        '--remote-debugging-port',
        '--remote-debugging-pipe',
        '--inspect-port'
    ];

    const argv = customArgv || process.argv || [];
    for (const arg of argv) {
        const argLower = String(arg).toLowerCase();
        for (const sw of dangerousSwitches) {
            if (argLower.startsWith(sw)) {
                return { valid: false, reason: `debugging_switch_detected: ${sw}` };
            }
        }
    }

    const env = customEnv || process.env || {};
    const envKeys = Object.keys(env);
    for (const key of envKeys) {
        if (key.toUpperCase().includes('NODE_OPTIONS')) {
            const val = String(env[key] || '').toLowerCase();
            if (val.includes('--inspect') || val.includes('--inspect-brk')) {
                return { valid: false, reason: 'node_options_inspect_detected' };
            }
        }
    }

    return { valid: true, reason: 'clean_environment' };
}
global.verifyProcessHardening = verifyProcessHardening;

// IPC Handlers for OS safeStorage (Windows DPAPI Encryption)
ipcMain.handle('secure-store-save', async (event, key, value) => {
    try {
        const safeKey = sanitizeStorageKey(key);
        const tokenPath = path.join(app.getPath('userData'), `.secure_${safeKey}.bin`);
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(value);
            fs.writeFileSync(tokenPath, encrypted);
        } else {
            fs.writeFileSync(tokenPath, Buffer.from(value, 'utf-8'));
        }
        return true;
    } catch (err) {
        console.error('[safeStorage] Error saving token:', err);
        return false;
    }
});

ipcMain.handle('secure-store-get', async (event, key) => {
    try {
        const safeKey = sanitizeStorageKey(key);
        const tokenPath = path.join(app.getPath('userData'), `.secure_${safeKey}.bin`);
        if (!fs.existsSync(tokenPath)) return null;
        const fileBuffer = fs.readFileSync(tokenPath);
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
            return safeStorage.decryptString(fileBuffer);
        }
        return fileBuffer.toString('utf-8');
    } catch (err) {
        console.error('[safeStorage] Error reading token:', err);
        return null;
    }
});

ipcMain.handle('secure-store-delete', async (event, key) => {
    try {
        const safeKey = sanitizeStorageKey(key);
        const tokenPath = path.join(app.getPath('userData'), `.secure_${safeKey}.bin`);
        if (fs.existsSync(tokenPath)) {
            fs.unlinkSync(tokenPath);
        }
        return true;
    } catch (err) {
        console.error('[safeStorage] Error deleting token:', err);
        return false;
    }
});

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
        title: "TavLive",
        icon: path.join(__dirname, 'public', 'assets', 'app-icons', 'icon.png'),
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: !app.isPackaged
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

    // Hardening DevTools en producción
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            if (app.isPackaged) {
                event.preventDefault(); // Block DevTools shortcut in production builds
            } else {
                mainWindow.webContents.toggleDevTools();
                event.preventDefault();
            }
        }
    });

    // Navigation hardening in packaged production builds
    mainWindow.webContents.on('will-navigate', (event, reqUrl) => {
        if (app.isPackaged) {
            const parsed = new URL(reqUrl);
            const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
            const isAuthDomain = parsed.hostname.endsWith('google.com') || parsed.hostname.endsWith('github.com');
            if (!isLocal && !isAuthDomain) {
                event.preventDefault();
            }
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
        message: `Una nueva versión (${info.version}) de TavLive está disponible y se está descargando en segundo plano de forma automática.`,
        buttons: ['Entendido']
    });
});

autoUpdater.on('update-not-available', (info) => {
    console.info('No hay actualizaciones disponibles.');
    if (isManualCheck) {
        dialog.showMessageBox({
            type: 'info',
            title: 'Sin actualizaciones',
            message: 'Ya tienes la versión más reciente de TavLive instalada.',
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
    // Check runtime ASAR integrity & Anti-Debugging process hardening in production
    if (app.isPackaged) {
        const integrity = verifyAsarIntegrity();
        if (!integrity.valid) {
            console.error('[Anti-Tamper] Critical integrity failure detected:', integrity.reason);
            dialog.showErrorBox(
                'Error de Integridad',
                'Se ha detectado una modificación no autorizada o corrupción en los archivos ejecutables de TavLive. La aplicación se cerrará por seguridad.'
            );
            app.quit();
            return;
        }

        const hardening = verifyProcessHardening();
        if (!hardening.valid) {
            console.error('[Anti-Tamper] Depuración no autorizada detectada:', hardening.reason);
            dialog.showErrorBox(
                'Acceso No Autorizado',
                'Se ha detectado un intento no autorizado de depuración en caliente. La aplicación se cerrará por seguridad.'
            );
            app.quit();
            return;
        }
    }

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
