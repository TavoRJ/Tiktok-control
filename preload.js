/**
 * preload.js – Bridge between renderer (browser) and main process (Electron).
 * Exposes a minimal, safe API via contextBridge so the frontend can trigger
 * native window effects (e.g. acrylic blur) without enabling full Node.js access.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
    /**
     * Set the native Windows background material (blur/acrylic effect).
     * @param {'acrylic' | 'mica' | 'none'} material
     */
    setBackgroundMaterial: (material) => {
        ipcRenderer.send('set-background-material', material);
    }
});
