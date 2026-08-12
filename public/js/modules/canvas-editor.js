import { WidgetRenderers } from './dynamic-widget-renderers.js';

export const DEMO_PAYLOADS = {
    donors: { type: 'donors', mode: 'compact', nickname: 'Juan', amount: '5.2K' },
    gift: { type: 'gift', nickname: 'Juan', giftName: 'Rose', count: 5 },
    follow: { type: 'follow', nickname: 'Juan' },
    share: { type: 'share', nickname: 'Juan' },
    comment: { type: 'comment', nickname: 'Juan', comment: 'Saludos desde México' },
    taps: { type: 'taps', nickname: 'María', count: 127, total: 4500 },
    spotify: { type: 'spotify', title: 'Blinding Lights', artist: 'The Weeknd' },
    recetas: { type: 'viewers', count: 1420 },
    dinamicas: { type: 'goal', title: 'Meta de Rosas', current: 75, target: 100 },
    mvp: { type: 'leaderboard', title: 'TOP DEL LIVE', items: [{ rank: 1, name: 'Juan', value: '5.2K' }, { rank: 2, name: 'María', value: '3.1K' }, { rank: 3, name: 'Pedro', value: '1.8K' }] },
    'song-requests': { type: 'song-requests', queue: [{ title: 'Blinding Lights', artist: 'The Weeknd', requester: 'Carlos' }, { title: 'Starboy', artist: 'The Weeknd', requester: 'María' }, { title: 'One More Time', artist: 'Daft Punk', requester: 'Pedro' }] }
};

export class CanvasEditorManager {
    constructor(socketClient) {
        this.socket = socketClient;
        this.widgetsConfig = {};
        this.activeWidgetId = null;

        // Dom elements
        this.canvasArea = document.getElementById('design-canvas-area');
        this.inspectorEmpty = document.getElementById('inspector-empty-state');
        this.inspectorDetails = document.getElementById('inspector-content');
        this.inspectorTitle = document.getElementById('inspector-widget-title');
        this.inspectorDimensions = document.getElementById('inspector-widget-pixel-dimensions');
        
        this.valX = document.getElementById('widget-val-x');
        this.valY = document.getElementById('widget-val-y');
        this.valW = document.getElementById('widget-val-w');
        this.valH = document.getElementById('widget-val-h');
        
        this.inputX = document.getElementById('inspector-input-x');
        this.inputY = document.getElementById('inspector-input-y');
        this.inputW = document.getElementById('inspector-input-w');
        this.inputH = document.getElementById('inspector-input-h');
        
        this.inputSize = document.getElementById('inspector-input-size');
        this.valSize = document.getElementById('widget-val-size');
        this.inputFont = document.getElementById('inspector-input-font');

        // Dynamic Widget Engine Inputs (Fase 1)
        this.inputDuration = document.getElementById('inspector-input-duration');
        this.valDuration = document.getElementById('widget-val-duration');
        this.inputStyle = document.getElementById('inspector-input-style');
        this.inputEnterAnim = document.getElementById('inspector-input-enter-anim');
        this.inputExitAnim = document.getElementById('inspector-input-exit-anim');

        this.obstructionBadge = document.getElementById('canvas-obstruction-badge');
        this.streamerZoneOverlay = document.getElementById('streamer-protection-zone');
        
        this.inputTitle = document.getElementById('inspector-input-title');
        this.inputBgOpacity = document.getElementById('inspector-input-bg-opacity');
        this.valBgOpacity = document.getElementById('widget-val-bg-opacity');
        this.inputBorderColor = document.getElementById('inspector-input-border-color');
        this.inputBorderStyle = document.getElementById('inspector-input-border-style');
        this.inputBgColor = document.getElementById('inspector-input-bg-color');
        this.inputBgType = document.getElementById('inspector-input-bg-type');
        this.inputTextColor = document.getElementById('inspector-input-text-color');
        this.inputMaxSongs = document.getElementById('inspector-input-max-songs');
        this.fieldMaxSongsWrapper = document.getElementById('field-max-songs-wrapper');
        
        this.btnFloatingSave = document.getElementById('btn-floating-save-canvas');
        this.btnSaveInspector = document.getElementById('btn-save-inspector-widget');
        this.btnResetInspector = document.getElementById('btn-reset-inspector-widget');
        
        this.inputUrl = document.getElementById('inspector-obs-url');
        this.btnCopyUrl = document.getElementById('btn-copy-inspector-url');
        this.btnResetLayout = document.getElementById('btn-reset-canvas-layout');
        this.btnDisableAll = document.getElementById('btn-disable-all-overlays');
        this.btnEnableAll = document.getElementById('btn-enable-all-overlays');

        this.canvasWidth = 324;
        this.canvasHeight = 576;

        const defaultWidgetConfig = {
            duration: 4,
            opacity: 85,
            scale: 100,
            style: 'minimal',
            enterAnim: 'slide-up',
            exitAnim: 'fade'
        };

        this.widgets = {
            donors: { name: 'Top Donator', icon: 'award', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 5, y: 5, width: 35, height: 5 } },
            gift: { name: 'Gift Alert', icon: 'gift', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 45, y: 5, width: 35, height: 5 } },
            follow: { name: 'Follow Alert', icon: 'user-plus', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 5, y: 15, width: 35, height: 5 } },
            share: { name: 'Share Alert', icon: 'share-2', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 45, y: 15, width: 35, height: 5 } },
            comment: { name: 'Featured Comment', icon: 'message-square', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 5, y: 25, width: 50, height: 5 } },
            taps: { name: 'Tap Tap Contador', icon: 'heart', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 5, y: 35, width: 25, height: 5 } },
            spotify: { name: 'Music Player', icon: 'music', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 45, y: 35, width: 35, height: 5 } },
            recetas: { name: 'Viewer Counter', icon: 'eye', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 5, y: 45, width: 20, height: 5 } },
            dinamicas: { name: 'Goal / Progress', icon: 'target', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 5, y: 55, width: 45, height: 5 } },
            mvp: { name: 'Leaderboard Top 3', icon: 'trophy', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 5, y: 65, width: 55, height: 5 } },
            'song-requests': { name: 'Lista de peticiones', icon: 'list-music', url: '/widgets.html', default: { ...defaultWidgetConfig, active: true, x: 45, y: 65, width: 45, height: 12, maxSongs: 3, borderStyle: 'none', bgType: 'transparent' } }
        };

        this.init();
    }

    init() {
        if (!this.canvasArea) return;

        // Click on canvas (deselect)
        this.canvasArea.addEventListener('mousedown', (e) => {
            if (e.target === this.canvasArea) {
                this.selectWidget(null);
            }
        });

        // Listen for input changes in inspector to update preview
        const updateFromInputs = () => {
            if (!this.activeWidgetId) return;
            const x = this.inputX ? parseFloat(this.inputX.value) || 0 : 0;
            const y = this.inputY ? parseFloat(this.inputY.value) || 0 : 0;
            const w = this.inputW ? parseFloat(this.inputW.value) || 0 : 0;
            const h = this.inputH ? parseFloat(this.inputH.value) || 0 : 0;
            const z = this.inputSize ? parseInt(this.inputSize.value) || 100 : 100;

            const box = document.getElementById(`widget-box-${this.activeWidgetId}`);
            if (box) {
                if (this.inputX) box.style.left = `${(x / 100) * this.canvasWidth}px`;
                if (this.inputY) box.style.top = `${(y / 100) * this.canvasHeight}px`;
                
                if (this.valX) this.valX.textContent = `${x.toFixed(1)}%`;
                if (this.valY) this.valY.textContent = `${y.toFixed(1)}%`;
                if (this.valW && this.inputW) this.valW.textContent = `${w.toFixed(1)}%`;
                if (this.valH && this.inputH) this.valH.textContent = `${h.toFixed(1)}%`;
                if (this.valSize) this.valSize.textContent = `${z}%`;
            }
        };

        if (this.inputX) this.inputX.addEventListener('input', updateFromInputs);
        if (this.inputY) this.inputY.addEventListener('input', updateFromInputs);
        if (this.inputW) this.inputW.addEventListener('input', updateFromInputs);
        if (this.inputH) this.inputH.addEventListener('input', updateFromInputs);

        const saveOnSliderRelease = () => {
            if (this.activeWidgetId) {
                const info = this.widgets[this.activeWidgetId];
                const currentConfig = this.widgetsConfig[this.activeWidgetId] || { ...info.default };
                if (this.inputX) currentConfig.x = parseFloat(this.inputX.value);
                if (this.inputY) currentConfig.y = parseFloat(this.inputY.value);
                if (this.inputW) currentConfig.width = parseFloat(this.inputW.value);
                if (this.inputH) currentConfig.height = parseFloat(this.inputH.value);
                if (this.inputSize) currentConfig.scale = parseInt(this.inputSize.value) || 100;
                this.widgetsConfig[this.activeWidgetId] = currentConfig;
                this.saveAllWidgets();
            }
        };

        if (this.inputX) this.inputX.addEventListener('change', saveOnSliderRelease);
        if (this.inputY) this.inputY.addEventListener('change', saveOnSliderRelease);

        if (this.inputSize) {
            this.inputSize.addEventListener('input', () => {
                if (this.valSize) {
                    this.valSize.textContent = `${this.inputSize.value}%`;
                }
                if (this.activeWidgetId) {
                    const id = this.activeWidgetId;
                    this.widgetsConfig[id] = this.widgetsConfig[id] || { ...this.widgets[id].default };
                    this.widgetsConfig[id].scale = parseInt(this.inputSize.value) || 100;
                    this.renderCanvasWidgets();
                    this.saveAllWidgets();
                }
            });
        }

        if (this.inputDuration) {
            this.inputDuration.addEventListener('input', () => {
                if (this.valDuration) {
                    this.valDuration.textContent = `${this.inputDuration.value}s`;
                }
            });
        }

        if (this.inputBgOpacity) {
            this.inputBgOpacity.addEventListener('input', () => {
                if (this.valBgOpacity) {
                    this.valBgOpacity.textContent = `${this.inputBgOpacity.value}%`;
                }
                if (this.activeWidgetId) {
                    const id = this.activeWidgetId;
                    this.widgetsConfig[id] = this.widgetsConfig[id] || { ...this.widgets[id].default };
                    this.widgetsConfig[id].opacity = parseInt(this.inputBgOpacity.value) || 85;
                    this.renderCanvasWidgets();
                    this.saveAllWidgets();
                }
            });
        }

        const applyInspectorChanges = () => {
            if (!this.activeWidgetId) return;
            const info = this.widgets[this.activeWidgetId];
            const currentConfig = { ...info.default, ...(this.widgetsConfig[this.activeWidgetId] || {}) };
            
            if (this.inputSize) currentConfig.scale = parseInt(this.inputSize.value) || 100;
            if (this.inputTitle) currentConfig.title = this.inputTitle.value.trim();
            if (this.inputBgOpacity) {
                currentConfig.opacity = parseInt(this.inputBgOpacity.value);
            }
            if (this.inputDuration) currentConfig.duration = parseFloat(this.inputDuration.value) || 4;
            if (this.inputStyle) currentConfig.style = this.inputStyle.value;
            if (this.inputEnterAnim) currentConfig.enterAnim = this.inputEnterAnim.value;
            if (this.inputExitAnim) currentConfig.exitAnim = this.inputExitAnim.value;
            if (this.inputBorderColor) currentConfig.borderColor = this.inputBorderColor.value;
            if (this.inputBorderStyle) currentConfig.borderStyle = this.inputBorderStyle.value;
            if (this.inputBgColor) currentConfig.bgColor = this.inputBgColor.value;
            if (this.inputBgType) currentConfig.bgType = this.inputBgType.value;
            if (this.inputTextColor) currentConfig.textColor = this.inputTextColor.value;

            this.widgetsConfig[this.activeWidgetId] = currentConfig;
            this.saveAllWidgets();
            this.renderCanvasWidgets();
        };

        if (this.btnSaveInspector) {
            this.btnSaveInspector.addEventListener('click', applyInspectorChanges);
        }

        if (this.btnResetInspector) {
            this.btnResetInspector.addEventListener('click', () => {
                if (!this.activeWidgetId) return;
                const id = this.activeWidgetId;
                const info = this.widgets[id];
                this.widgetsConfig[id] = { ...info.default };
                this.saveAllWidgets();
                this.renderCanvasWidgets();
                this.selectWidget(id);
                if (window.showToast) window.showToast(`Configuración de ${info.name} restablecida.`, 'success');
            });
        }

        if (this.btnFloatingSave) {
            this.btnFloatingSave.addEventListener('click', () => {
                this.saveAllWidgets();
                if (window.showToast) window.showToast('Configuración de lienzo guardada exitosamente.', 'success');
            });
        }

        if (this.btnCopyUrl) {
            this.btnCopyUrl.addEventListener('click', () => {
                if (this.inputUrl) {
                    this.inputUrl.select();
                    navigator.clipboard.writeText(this.inputUrl.value);
                    alert('¡Enlace de OBS copiado al portapapeles!');
                }
            });
        }

        // Test Dynamic Alert Button (Fase 1)
        this.btnTestWidget = document.getElementById('btn-test-inspector-widget');
        if (this.btnTestWidget) {
            this.btnTestWidget.addEventListener('click', () => {
                if (!this.activeWidgetId) return;
                const widgetKey = this.activeWidgetId;
                const payload = DEMO_PAYLOADS[widgetKey] || {
                    type: widgetKey,
                    nickname: 'UsuarioDemo',
                    subtext: 'Demostración de Alerta Dinámica'
                };

                if (window.triggerDynamicWidgetEvent) {
                    window.triggerDynamicWidgetEvent(widgetKey, payload);
                }
                if (this.socket) {
                    this.socket.emit('trigger_dynamic_widget_event', { widgetKey, payload });
                }

                if (window.showToast) {
                    window.showToast(`⚡ Alerta de prueba enviada para ${this.widgets[widgetKey]?.name || widgetKey}`, 'success');
                }
            });
        }

        // Reset Layout Button
        if (this.btnResetLayout) {
            this.btnResetLayout.addEventListener('click', () => {
                if (confirm('¿Estás seguro de que deseas restablecer las posiciones de todos los widgets a sus valores por defecto?')) {
                    Object.entries(this.widgets).forEach(([id, info]) => {
                        this.widgetsConfig[id] = { ...info.default };
                    });
                    this.saveAllWidgets();
                    this.renderCanvasWidgets();
                    this.renderWidgetToggles();
                    this.selectWidget(null);
                }
            });
        }

        // Enable All Overlays Button
        if (this.btnEnableAll) {
            this.btnEnableAll.addEventListener('click', () => {
                if (confirm('¿Estás seguro de que deseas activar todos los overlays?')) {
                    Object.keys(this.widgets).forEach(id => {
                        if (this.widgetsConfig[id]) {
                            this.widgetsConfig[id].active = true;
                        } else {
                            this.widgetsConfig[id] = { ...this.widgets[id].default, active: true };
                        }
                    });
                    this.saveAllWidgets();
                    this.renderWidgetToggles();
                    this.renderCanvasWidgets();
                }
            });
        }

        // Disable All Overlays Button
        if (this.btnDisableAll) {
            this.btnDisableAll.addEventListener('click', () => {
                if (confirm('¿Estás seguro de que deseas desactivar todos los overlays?')) {
                    Object.keys(this.widgets).forEach(id => {
                        if (this.widgetsConfig[id]) {
                            this.widgetsConfig[id].active = false;
                        } else {
                            this.widgetsConfig[id] = { ...this.widgets[id].default, active: false };
                        }
                    });
                    this.saveAllWidgets();
                    this.renderCanvasWidgets();
                    this.renderWidgetToggles();
                    this.selectWidget(null);
                }
            });
        }

        // Initial UI Render
        this.renderWidgetToggles();
        this.renderCanvasWidgets();

        // Handle window events for dragging
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Socket config listener
        if (this.socket) {
            this.socket.on('chatbot_settings_updated', (config) => {
                if (config && config.widgets) {
                    this.widgetsConfig = config.widgets;
                    this.renderWidgetToggles();
                    this.renderCanvasWidgets();
                }
            });

            this.socket.emit('get_chatbot_settings');
        }
    }

    renderWidgetToggles() {
        const grid = document.getElementById('canvas-widget-toggles-grid');
        if (!grid) return;

        grid.innerHTML = '';

        Object.entries(this.widgets).forEach(([id, info]) => {
            const config = this.widgetsConfig[id] || info.default;

            const col = document.createElement('div');
            col.className = 'span-4';
            col.style.display = 'flex';
            col.style.alignItems = 'center';
            col.style.background = 'rgba(255, 255, 255, 0.02)';
            col.style.padding = '10px 12px';
            col.style.borderRadius = '8px';
            col.style.border = '1px solid rgba(255, 255, 255, 0.05)';

            col.innerHTML = `
                <label class="switch-container" style="display: flex; width: 100%; justify-content: space-between; align-items: center; margin: 0; cursor: pointer;">
                    <span style="font-size: 13px; font-weight: 600; color: var(--text-color);">${info.name}</span>
                    <div style="position: relative; width: 40px; height: 20px;">
                        <input type="checkbox" data-widget="${id}" ${config.active ? 'checked' : ''} style="opacity: 0; position: absolute; width: 100%; height: 100%; cursor: pointer; z-index: 2; margin: 0;">
                        <span class="switch-slider" style="position: absolute; top:0; left:0; right:0; bottom:0; z-index: 1;"></span>
                    </div>
                </label>
            `;

            const checkbox = col.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                this.toggleWidgetState(id, e.target.checked);
            });

            grid.appendChild(col);
        });
    }

    toggleWidgetState(id, active) {
        if (!this.widgetsConfig[id]) {
            this.widgetsConfig[id] = { ...this.widgets[id].default };
        }
        this.widgetsConfig[id].active = active;
        this.saveAllWidgets();
        this.renderCanvasWidgets();
    }

    renderCanvasWidgets() {
        if (!this.canvasArea) return;
        
        const activeId = this.activeWidgetId;
        this.canvasArea.innerHTML = '';

        Object.entries(this.widgets).forEach(([id, info]) => {
            const config = this.widgetsConfig[id] || info.default;
            if (config.active === false) return;

            const box = document.createElement('div');
            box.id = `widget-box-${id}`;
            box.className = `canvas-widget-box ${activeId === id ? 'selected' : ''}`;
            
            const leftVal = (config.x / 100) * this.canvasWidth;
            const topVal = (config.y / 100) * this.canvasHeight;
            const widthVal = (config.width / 100) * this.canvasWidth;
            const heightVal = (config.height / 100) * this.canvasHeight;

            box.style.left = `${leftVal}px`;
            box.style.top = `${topVal}px`;
            box.style.width = `${widthVal}px`;
            box.style.height = `${heightVal}px`;

            // Render live DEMO HTML inside preview wrapper
            let demoHtml = '';
            const scaleFactor = (config.scale !== undefined ? parseFloat(config.scale) : 100) / 100;

            if (WidgetRenderers && WidgetRenderers[id]) {
                const demoPayload = DEMO_PAYLOADS[id] || { type: id, nickname: 'Juan' };
                demoHtml = WidgetRenderers[id](demoPayload, config);
            }

            box.innerHTML = `
                <div class="canvas-widget-preview-wrapper" style="width: 100%; height: 100%; overflow: visible; pointer-events: none; opacity: 0.95; transform: scale(${scaleFactor}); scale: ${scaleFactor}; transform-origin: top left;">
                    ${demoHtml ? demoHtml : `<i data-lucide="${info.icon}"></i><span class="canvas-widget-label">${info.name}</span>`}
                </div>
                <span class="canvas-widget-label-badge" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.7); color: #00ffcc; font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px; z-index: 10; pointer-events: none;">${info.name}</span>
                <div class="canvas-widget-resize-handle" id="resize-handle-${id}"></div>
            `;

            box.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('canvas-widget-resize-handle')) {
                    this.startResize(e, id);
                } else {
                    this.startDrag(e, id);
                }
            });

            this.canvasArea.appendChild(box);
        });

        if (window.lucide) {
            window.lucide.createIcons();
        }

        this.checkStreamerObstruction();
    }

    selectWidget(id) {
        this.activeWidgetId = id;
        
        document.querySelectorAll('.canvas-widget-box').forEach(el => {
            el.classList.remove('selected');
        });

        if (!id) {
            if (this.inspectorEmpty) this.inspectorEmpty.style.display = 'block';
            if (this.inspectorDetails) this.inspectorDetails.style.display = 'none';
            return;
        }

        const info = this.widgets[id];
        const config = this.widgetsConfig[id] || info.default;
        
        const box = document.getElementById(`widget-box-${id}`);
        if (box) {
            box.classList.add('selected');
        }

        if (this.inspectorEmpty) this.inspectorEmpty.style.display = 'none';
        if (this.inspectorDetails) this.inspectorDetails.style.display = 'flex';
        if (this.inspectorTitle) this.inspectorTitle.textContent = info.name;
        
        if (this.valX) this.valX.textContent = `${config.x.toFixed(1)}%`;
        if (this.valY) this.valY.textContent = `${config.y.toFixed(1)}%`;
        if (this.valW) this.valW.textContent = `${config.width.toFixed(1)}%`;
        if (this.valH) this.valH.textContent = `${config.height.toFixed(1)}%`;

        if (this.inputX) this.inputX.value = config.x.toFixed(1);
        if (this.inputY) this.inputY.value = config.y.toFixed(1);
        if (this.inputSize) {
            this.inputSize.value = config.scale || config.zoom || 100;
            if (this.valSize) this.valSize.textContent = `${this.inputSize.value}%`;
        }

        if (this.inputDuration) {
            this.inputDuration.value = config.duration || 4;
            if (this.valDuration) this.valDuration.textContent = `${this.inputDuration.value}s`;
        }

        if (this.inputBgOpacity) {
            this.inputBgOpacity.value = config.opacity !== undefined ? config.opacity : 85;
            if (this.valBgOpacity) this.valBgOpacity.textContent = `${this.inputBgOpacity.value}%`;
        }

        if (this.inputStyle) this.inputStyle.value = config.style || 'minimal';
        if (this.inputEnterAnim) this.inputEnterAnim.value = config.enterAnim || 'slide-up';
        if (this.inputExitAnim) this.inputExitAnim.value = config.exitAnim || 'fade';
        if (this.inputTitle) this.inputTitle.value = config.title || info.name;
        if (this.inputBorderColor) this.inputBorderColor.value = config.borderColor || '#00f0ff';
        if (this.inputBorderStyle) this.inputBorderStyle.value = config.borderStyle || 'none';
        if (this.inputBgColor) this.inputBgColor.value = config.bgColor || '#0f0a19';
        if (this.inputBgType) this.inputBgType.value = config.bgType || 'solid';
        if (this.inputTextColor) this.inputTextColor.value = config.textColor || '#ffffff';
        if (this.inputMaxSongs) this.inputMaxSongs.value = config.maxSongs || 3;

        if (this.fieldMaxSongsWrapper) {
            this.fieldMaxSongsWrapper.style.display = id === 'song-requests' ? 'block' : 'none';
        }

        if (this.inspectorDimensions) {
            const pxW = Math.round((config.width / 100) * 1080);
            const pxH = Math.round((config.height / 100) * 1920);
            this.inspectorDimensions.textContent = `${pxW} x ${pxH} px`;
        }

        if (this.inputUrl) {
            const host = window.location.host;
            this.inputUrl.value = `http://${host}${info.url || '/widgets.html'}`;
        }

        this.checkStreamerObstruction();
    }

    startDrag(e, id) {
        e.preventDefault();
        this.selectWidget(id);

        this.isDragging = true;
        this.draggedWidgetId = id;
        this.startX = e.clientX;
        this.startY = e.clientY;

        const config = { ...this.widgets[id].default, ...(this.widgetsConfig[id] || {}) };
        this.initialWidgetX = config.x;
        this.initialWidgetY = config.y;
    }

    startResize(e, id) {
        e.preventDefault();
        e.stopPropagation();
        this.selectWidget(id);

        this.isResizing = true;
        this.draggedWidgetId = id;
        this.startX = e.clientX;
        this.startY = e.clientY;

        const config = { ...this.widgets[id].default, ...(this.widgetsConfig[id] || {}) };
        this.initialWidgetW = config.width;
        this.initialWidgetH = config.height;
    }

    handleMouseMove(e) {
        if (!this.draggedWidgetId) return;

        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;

        const dxPercent = (dx / this.canvasWidth) * 100;
        const dyPercent = (dy / this.canvasHeight) * 100;

        const currentWidgetInfo = this.widgets[this.draggedWidgetId];
        const config = { ...currentWidgetInfo.default, ...(this.widgetsConfig[this.draggedWidgetId] || {}) };

        if (this.isDragging) {
            let newX = Math.max(0, Math.min(100 - config.width, this.initialWidgetX + dxPercent));
            let newY = Math.max(0, Math.min(100 - config.height, this.initialWidgetY + dyPercent));

            config.x = newX;
            config.y = newY;
        } else if (this.isResizing) {
            let newW = Math.max(10, Math.min(100 - config.x, this.initialWidgetW + dxPercent));
            let newH = Math.max(5, Math.min(100 - config.y, this.initialWidgetH + dyPercent));

            config.width = newW;
            config.height = newH;

            // Automatically compute scale from box expansion ratio so resizing box scales text!
            const defaultW = currentWidgetInfo.default.width || 35;
            const computedScale = Math.round((newW / defaultW) * 100);
            config.scale = Math.max(50, Math.min(500, computedScale));

            if (this.inputSize) this.inputSize.value = config.scale;
            if (this.valSize) this.valSize.textContent = `${config.scale}%`;
        }

        this.widgetsConfig[this.draggedWidgetId] = config;

        const box = document.getElementById(`widget-box-${this.draggedWidgetId}`);
        if (box) {
            box.style.left = `${(config.x / 100) * this.canvasWidth}px`;
            box.style.top = `${(config.y / 100) * this.canvasHeight}px`;
            box.style.width = `${(config.width / 100) * this.canvasWidth}px`;
            box.style.height = `${(config.height / 100) * this.canvasHeight}px`;
        }

        if (this.activeWidgetId === this.draggedWidgetId) {
            if (this.valX) this.valX.textContent = `${config.x.toFixed(1)}%`;
            if (this.valY) this.valY.textContent = `${config.y.toFixed(1)}%`;
            if (this.valW) this.valW.textContent = `${config.width.toFixed(1)}%`;
            if (this.valH) this.valH.textContent = `${config.height.toFixed(1)}%`;

            if (this.inputX) this.inputX.value = config.x.toFixed(1);
            if (this.inputY) this.inputY.value = config.y.toFixed(1);

            if (this.inspectorDimensions) {
                const pxW = Math.round((config.width / 100) * 1080);
                const pxH = Math.round((config.height / 100) * 1920);
                this.inspectorDimensions.textContent = `${pxW} x ${pxH} px`;
            }
        }

        this.checkStreamerObstruction();
    }

    handleMouseUp() {
        if (this.isDragging || this.isResizing) {
            this.isDragging = false;
            this.isResizing = false;
            this.draggedWidgetId = null;
            this.saveAllWidgets();
        }
    }

    checkStreamerObstruction() {
        if (!this.streamerZoneOverlay || !this.activeWidgetId) {
            if (this.obstructionBadge) {
                this.obstructionBadge.className = 'status-badge safe';
                this.obstructionBadge.textContent = '✓ Posición Recomendada';
            }
            return;
        }

        const config = this.widgetsConfig[this.activeWidgetId] || this.widgets[this.activeWidgetId].default;
        
        // Streamer protection zone coordinates (20% to 80% X, 30% to 75% Y)
        const streamerBox = { left: 20, right: 80, top: 30, bottom: 75 };
        const widgetBox = {
            left: config.x,
            right: config.x + config.width,
            top: config.y,
            bottom: config.y + config.height
        };

        const overlapX = Math.max(0, Math.min(streamerBox.right, widgetBox.right) - Math.max(streamerBox.left, widgetBox.left));
        const overlapY = Math.max(0, Math.min(streamerBox.bottom, widgetBox.bottom) - Math.max(streamerBox.top, widgetBox.top));
        const overlapArea = overlapX * overlapY;
        const widgetArea = config.width * config.height;

        const overlapPct = widgetArea > 0 ? (overlapArea / widgetArea) * 100 : 0;

        if (this.obstructionBadge) {
            if (overlapPct === 0) {
                this.obstructionBadge.className = 'status-badge safe';
                this.obstructionBadge.textContent = '✓ Posición Recomendada';
            } else if (overlapPct < 30) {
                this.obstructionBadge.className = 'status-badge warning';
                this.obstructionBadge.textContent = '⚠️ Posible Obstrucción';
            } else {
                this.obstructionBadge.className = 'status-badge danger';
                this.obstructionBadge.textContent = '🚫 Obstrucción Alta';
            }
        }
    }

    saveAllWidgets() {
        if (this.socket) {
            this.socket.emit('update_chatbot_settings', {
                widgets: this.widgetsConfig
            });
        }
    }
}
