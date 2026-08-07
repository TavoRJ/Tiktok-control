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
        
        this.inputTitle = document.getElementById('inspector-input-title');
        this.inputBgOpacity = document.getElementById('inspector-input-bg-opacity');
        this.valBgOpacity = document.getElementById('widget-val-bg-opacity');
        this.inputBorderColor = document.getElementById('inspector-input-border-color');
        this.inputBgColor = document.getElementById('inspector-input-bg-color');
        
        this.btnFloatingSave = document.getElementById('btn-floating-save-canvas');
        this.btnSaveInspector = document.getElementById('btn-save-inspector-widget');
        
        this.inputUrl = document.getElementById('inspector-obs-url');
        this.btnCopyUrl = document.getElementById('btn-copy-inspector-url');
        this.btnResetLayout = document.getElementById('btn-reset-canvas-layout');
        this.btnDisableAll = document.getElementById('btn-disable-all-overlays');

        this.canvasWidth = 324;
        this.canvasHeight = 576;

        // Dynamic Card Relocation variables
        this.currentRelocatedCard = null;
        this.lastWidgetId = null;
        this.cardMapping = {
            spotify: 'spotify-widget-custom-card',
            banner: 'banner-widget-custom-card',
            recetas: 'recetas-widget-custom-card',
            dinamicas: 'dinamicas-widget-custom-card',
            ruleta: 'ruleta-widget-custom-card',
            socials: 'socials-widget-custom-card'
        };

        this.widgets = {
            spotify: { name: 'Spotify / Music', icon: 'music', url: '/music-widget.html', default: { active: false, x: 5, y: 73, width: 90, height: 15, zoom: 100 } },
            banner: { name: 'Banner Cocina', icon: 'image', url: '/banner-cocina.html', default: { active: false, x: 0, y: 0, width: 100, height: 8, zoom: 100 } },
            donors: { name: 'Historial Donaciones', icon: 'heart', url: '/donors-overlay.html', default: { active: false, x: 5, y: 10, width: 42.5, height: 20, zoom: 100 } },
            taps: { name: 'Historial Taps', icon: 'thumbs-up', url: '/taps-overlay.html', default: { active: false, x: 52.5, y: 10, width: 42.5, height: 20, zoom: 100 } },
            mvp: { name: 'MVP Overlay', icon: 'award', url: '/mvp-overlay.html', default: { active: false, x: 5, y: 31, width: 42.5, height: 15, zoom: 100 } },
            songlist: { name: 'Song Request Queue', icon: 'list-music', url: '/songlist-widget.html', default: { active: false, x: 5, y: 47, width: 90, height: 12, zoom: 100 } },
            recetas: { name: 'Lista Recetas', icon: 'utensils', url: '/recetas.html', default: { active: false, x: 52.5, y: 31, width: 42.5, height: 15, zoom: 100 } },
            dinamicas: { name: 'Metas Dinámicas', icon: 'target', url: '/dinamicas.html', default: { active: false, x: 5, y: 60, width: 90, height: 12, zoom: 100 } },
            ruleta: { name: 'Ruleta Desafíos', icon: 'help-circle', url: '', default: { active: false, x: 10, y: 30, width: 80, height: 40, zoom: 100 } },
            socials: { name: 'Socials Rotator', icon: 'share-2', url: '/social-rotator.html', default: { active: false, x: 5, y: 89, width: 90, height: 8, zoom: 100 } },
            tts: { name: 'Ondas Voz / IA Asistente', icon: 'mic', url: '/tts-widget.html', default: { active: false, x: 25, y: 5, width: 50, height: 12, zoom: 100 } }
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
            const x = parseFloat(this.inputX.value) || 0;
            const y = parseFloat(this.inputY.value) || 0;
            const w = parseFloat(this.inputW.value) || 0;
            const h = parseFloat(this.inputH.value) || 0;
            const z = this.inputZoom ? parseInt(this.inputZoom.value) || 100 : 100;

            const box = document.getElementById(`widget-box-${this.activeWidgetId}`);
            if (box) {
                box.style.left = `${(x / 100) * this.canvasWidth}px`;
                box.style.top = `${(y / 100) * this.canvasHeight}px`;
                box.style.width = `${(w / 100) * this.canvasWidth}px`;
                box.style.height = `${(h / 100) * this.canvasHeight}px`;
                
                if (this.valX) this.valX.textContent = `${x.toFixed(1)}%`;
                if (this.valY) this.valY.textContent = `${y.toFixed(1)}%`;
                if (this.valW) this.valW.textContent = `${w.toFixed(1)}%`;
                if (this.valH) this.valH.textContent = `${h.toFixed(1)}%`;
                if (this.valZoom) this.valZoom.textContent = `${z}%`;

                if (this.inspectorDimensions) {
                    const pxW = Math.round((w / 100) * 1080);
                    const pxH = Math.round((h / 100) * 1920);
                    this.inspectorDimensions.textContent = `${pxW} x ${pxH} px`;
                }
            }
        };

        if (this.inputX) {
            this.inputX.addEventListener('input', updateFromInputs);
            this.inputY.addEventListener('input', updateFromInputs);
            this.inputW.addEventListener('input', updateFromInputs);
            this.inputH.addEventListener('input', updateFromInputs);

            const saveOnSliderRelease = () => {
                if (this.activeWidgetId) {
                    const info = this.widgets[this.activeWidgetId];
                    const currentConfig = this.widgetsConfig[this.activeWidgetId] || { ...info.default };
                    currentConfig.x = parseFloat(this.inputX.value);
                    currentConfig.y = parseFloat(this.inputY.value);
                    currentConfig.width = parseFloat(this.inputW.value);
                    currentConfig.height = parseFloat(this.inputH.value);
                    if (this.inputZoom) {
                        currentConfig.zoom = parseInt(this.inputZoom.value) || 100;
                    }
                    this.widgetsConfig[this.activeWidgetId] = currentConfig;
                    this.saveAllWidgets();
                }
            };
            this.inputX.addEventListener('change', saveOnSliderRelease);
            this.inputY.addEventListener('change', saveOnSliderRelease);
            this.inputW.addEventListener('change', saveOnSliderRelease);
            this.inputH.addEventListener('change', saveOnSliderRelease);
        }

        if (this.inputSize) {
            this.inputSize.addEventListener('input', () => {
                if (this.valSize) {
                    this.valSize.textContent = `${this.inputSize.value}%`;
                }
            });
        }

        if (this.inputBgOpacity) {
            this.inputBgOpacity.addEventListener('input', () => {
                if (this.valBgOpacity) {
                    this.valBgOpacity.textContent = `${this.inputBgOpacity.value}%`;
                }
            });
        }

        const applyInspectorChanges = () => {
            if (!this.activeWidgetId) return;
            const info = this.widgets[this.activeWidgetId];
            const currentConfig = this.widgetsConfig[this.activeWidgetId] || { ...info.default };
            
            if (this.inputSize) currentConfig.zoom = parseInt(this.inputSize.value) || 100;
            if (this.inputFont) currentConfig.fontFamily = this.inputFont.value;
            if (this.inputTitle) currentConfig.title = this.inputTitle.value.trim();
            if (this.inputBgOpacity) currentConfig.bgOpacity = parseInt(this.inputBgOpacity.value);
            if (this.inputBorderColor) currentConfig.borderColor = this.inputBorderColor.value;
            if (this.inputBgColor) currentConfig.bgColor = this.inputBgColor.value;
            
            this.widgetsConfig[this.activeWidgetId] = currentConfig;
            this.saveAllWidgets();
        };

        ['input', 'change'].forEach(evtType => {
            if (this.inputSize) this.inputSize.addEventListener(evtType, applyInspectorChanges);
            if (this.inputFont) this.inputFont.addEventListener(evtType, applyInspectorChanges);
            if (this.inputTitle) this.inputTitle.addEventListener(evtType, applyInspectorChanges);
            if (this.inputBgOpacity) this.inputBgOpacity.addEventListener(evtType, applyInspectorChanges);
            if (this.inputBorderColor) this.inputBorderColor.addEventListener(evtType, applyInspectorChanges);
            if (this.inputBgColor) this.inputBgColor.addEventListener(evtType, applyInspectorChanges);
        });

        if (this.btnSaveInspector) {
            this.btnSaveInspector.addEventListener('click', applyInspectorChanges);
        }

        if (this.btnFloatingSave) {
            this.btnFloatingSave.addEventListener('click', () => {
                applyInspectorChanges();
                this.saveAllWidgets();
                if (window.showToast) {
                    window.showToast('¡Todos los cambios fueron aplicados y guardados en OBS!', 'success');
                }
            });
        }

        // Copy OBS URL Button
        if (this.btnCopyUrl && this.inputUrl) {
            this.btnCopyUrl.addEventListener('click', () => {
                this.inputUrl.select();
                document.execCommand('copy');
                if (window.showToast) {
                    window.showToast('¡Enlace de OBS copiado al portapapeles!', 'success');
                } else {
                    alert('¡Enlace de OBS copiado al portapapeles!');
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

        // Handle window events for dragging
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Socket config listener
        if (this.socket) {
            this.socket.on('chatbot_settings_updated', (config) => {
                if (config && config.widgets) {
                    this.widgetsConfig = config.widgets;
                    this.renderCanvasWidgets();
                    this.updateListToggles();
                    
                    // Populate toggles if grid is empty
                    const grid = document.getElementById('canvas-widget-toggles-grid');
                    if (grid && grid.children.length === 0) {
                        this.renderWidgetToggles();
                    }
                }
            });

            // Request settings immediately to ensure we load coordinates on startup
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
            col.className = 'span-4'; // 3 columns
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

    updateListToggles() {
        Object.entries(this.widgets).forEach(([id, info]) => {
            const config = this.widgetsConfig[id] || info.default;
            const checkbox = document.querySelector(`#canvas-widget-toggles-grid input[type="checkbox"][data-widget="${id}"]`);
            if (checkbox) {
                checkbox.checked = config.active;
            }
        });
    }

    renderCanvasWidgets() {
        if (!this.canvasArea) return;
        
        const activeId = this.activeWidgetId;
        this.canvasArea.innerHTML = '';

        Object.entries(this.widgets).forEach(([id, info]) => {
            const config = this.widgetsConfig[id] || info.default;
            if (!config.active) return; // Only render active widgets on canvas editor

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

            box.innerHTML = `
                <i data-lucide="${info.icon}"></i>
                <span class="canvas-widget-label">${info.name}</span>
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
    }

    selectWidget(id) {
        // Return previously relocated card to its placeholder (if any)
        if (this.currentRelocatedCard && this.lastWidgetId) {
            const placeholder = document.getElementById(`placeholder-${this.lastWidgetId}-widget-custom-card`);
            if (placeholder) {
                placeholder.appendChild(this.currentRelocatedCard);
            }
            this.currentRelocatedCard = null;
            this.lastWidgetId = null;
        }

        this.activeWidgetId = id;
        
        document.querySelectorAll('.canvas-widget-box').forEach(el => {
            el.classList.remove('selected');
        });

        // Hide custom settings card by default
        const customSettingsCard = document.getElementById('canvas-widget-custom-settings-card');
        if (customSettingsCard) {
            customSettingsCard.style.display = 'none';
        }

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

        if (this.inputX) this.inputX.value = config.x;
        if (this.inputY) this.inputY.value = config.y;
        if (this.inputW) this.inputW.value = config.width;
        if (this.inputH) this.inputH.value = config.height;

        const sizeVal = config.zoom !== undefined ? config.zoom : (config.size !== undefined ? config.size : 100);
        if (this.inputSize) this.inputSize.value = sizeVal;
        if (this.valSize) this.valSize.textContent = `${sizeVal}%`;

        if (this.inputFont) this.inputFont.value = config.fontFamily || 'Outfit';

        if (this.inputTitle) this.inputTitle.value = config.title || '';
        
        const opacityVal = config.bgOpacity !== undefined ? config.bgOpacity : 45;
        if (this.inputBgOpacity) this.inputBgOpacity.value = opacityVal;
        if (this.valBgOpacity) this.valBgOpacity.textContent = `${opacityVal}%`;
        
        if (this.inputBorderColor) this.inputBorderColor.value = config.borderColor || '#00f0ff';
        if (this.inputBgColor) this.inputBgColor.value = config.bgColor || '#0f0a19';

        if (this.inspectorDimensions) {
            const pxW = Math.round((config.width / 100) * 1080);
            const pxH = Math.round((config.height / 100) * 1920);
            this.inspectorDimensions.textContent = `${pxW} x ${pxH} px`;
        }

        if (this.inputUrl) {
            this.inputUrl.value = 'http://127.0.0.1:3000/widgets.html';
        }

        // Relocate customization card to the inspector
        const cardId = this.cardMapping[id];
        if (cardId) {
            const card = document.getElementById(cardId);
            const inspectorContainer = document.getElementById('inspector-widget-customizer');
            if (card && inspectorContainer) {
                inspectorContainer.appendChild(card);
                this.currentRelocatedCard = card;
                this.lastWidgetId = id;
                if (customSettingsCard) {
                    customSettingsCard.style.display = 'block';
                }
            }
        }
    }

    startDrag(e, id) {
        e.preventDefault();
        this.selectWidget(id);
        
        const box = document.getElementById(`widget-box-${id}`);
        const rect = this.canvasArea.getBoundingClientRect();
        
        this.dragState = {
            id: id,
            type: 'drag',
            startX: e.clientX,
            startY: e.clientY,
            startLeft: parseFloat(box.style.left) || 0,
            startTop: parseFloat(box.style.top) || 0,
            rect: rect
        };
    }

    startResize(e, id) {
        e.preventDefault();
        e.stopPropagation();
        this.selectWidget(id);
        
        const box = document.getElementById(`widget-box-${id}`);
        
        this.dragState = {
            id: id,
            type: 'resize',
            startX: e.clientX,
            startY: e.clientY,
            startWidth: parseFloat(box.style.width) || 50,
            startHeight: parseFloat(box.style.height) || 50
        };
    }

    handleMouseMove(e) {
        if (!this.dragState) return;

        const { id, type, startX, startY, startLeft, startTop, startWidth, startHeight } = this.dragState;
        const box = document.getElementById(`widget-box-${id}`);
        if (!box) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (type === 'drag') {
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            const maxLeft = this.canvasWidth - box.offsetWidth;
            const maxTop = this.canvasHeight - box.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            box.style.left = `${newLeft}px`;
            box.style.top = `${newTop}px`;

            const pctX = (newLeft / this.canvasWidth) * 100;
            const pctY = (newTop / this.canvasHeight) * 100;
            if (this.inputX) this.inputX.value = pctX.toFixed(1);
            if (this.inputY) this.inputY.value = pctY.toFixed(1);
            if (this.valX) this.valX.textContent = `${pctX.toFixed(1)}%`;
            if (this.valY) this.valY.textContent = `${pctY.toFixed(1)}%`;

        } else if (type === 'resize') {
            let newWidth = startWidth + deltaX;
            let newHeight = startHeight + deltaY;

            newWidth = Math.max(30, Math.min(newWidth, this.canvasWidth));
            newHeight = Math.max(20, Math.min(newHeight, this.canvasHeight));

            const leftVal = parseFloat(box.style.left) || 0;
            const topVal = parseFloat(box.style.top) || 0;
            if (leftVal + newWidth > this.canvasWidth) {
                newWidth = this.canvasWidth - leftVal;
            }
            if (topVal + newHeight > this.canvasHeight) {
                newHeight = this.canvasHeight - topVal;
            }

            box.style.width = `${newWidth}px`;
            box.style.height = `${newHeight}px`;

            const pctW = (newWidth / this.canvasWidth) * 100;
            const pctH = (newHeight / this.canvasHeight) * 100;
            if (this.inputW) this.inputW.value = pctW.toFixed(1);
            if (this.inputH) this.inputH.value = pctH.toFixed(1);
            if (this.valW) this.valW.textContent = `${pctW.toFixed(1)}%`;
            if (this.valH) this.valH.textContent = `${pctH.toFixed(1)}%`;

            if (this.inspectorDimensions) {
                const pxW = Math.round((pctW / 100) * 1080);
                const pxH = Math.round((pctH / 100) * 1920);
                this.inspectorDimensions.textContent = `${pxW} x ${pxH} px`;
            }
        }
    }

    handleMouseUp(e) {
        if (!this.dragState) return;

        const { id } = this.dragState;
        this.dragState = null;

        const info = this.widgets[id];
        const currentConfig = this.widgetsConfig[id] || { ...info.default };
        
        if (this.inputX) currentConfig.x = parseFloat(this.inputX.value);
        if (this.inputY) currentConfig.y = parseFloat(this.inputY.value);
        if (this.inputW) currentConfig.width = parseFloat(this.inputW.value);
        if (this.inputH) currentConfig.height = parseFloat(this.inputH.value);
        if (this.inputZoom) currentConfig.zoom = parseInt(this.inputZoom.value) || 100;

        this.widgetsConfig[id] = currentConfig;
        
        this.saveAllWidgets();
    }

    saveAllWidgets() {
        if (!this.socket) return;
        
        const widgets = {};
        Object.keys(this.widgets).forEach(id => {
            const info = this.widgets[id];
            widgets[id] = this.widgetsConfig[id] || { ...info.default };
        });

        this.socket.emit('update_chatbot_settings', { widgets });

        if (this.inputBorderColor || this.inputBgColor || this.inputBgOpacity) {
            this.socket.emit('updateGlobalWidgetStyles', {
                borderColor: this.inputBorderColor ? this.inputBorderColor.value : '#00f0ff',
                bgColor: this.inputBgColor ? this.inputBgColor.value : '#0f0a19',
                bgOpacity: this.inputBgOpacity ? parseInt(this.inputBgOpacity.value) : 45
            });
        }
    }

    toggleWidgetState(id, active) {
        const info = this.widgets[id];
        const config = this.widgetsConfig[id] || { ...info.default };
        config.active = active;
        this.widgetsConfig[id] = config;
        
        this.renderCanvasWidgets();
        if (this.activeWidgetId === id) {
            this.selectWidget(active ? id : null);
        }

        this.saveAllWidgets();
    }
}
