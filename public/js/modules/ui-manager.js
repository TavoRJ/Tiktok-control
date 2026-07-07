// public/js/modules/ui-manager.js

export const UIManager = {
    elements: {},
    // Keep track of internal drag coordinate shifts for each widget
    dragPositions: {
        spotify:  { x: 0, y: 0 },
        youtube:  { x: 0, y: 0 },
        donors:   { x: 0, y: 0 },
        taps:     { x: 0, y: 0 },
        mvp:      { x: 0, y: 0 },
        songlist: { x: 0, y: 0 },
        banner:   { x: 0, y: 0 }
    },

    init(chatbotConfig) {
        console.info('[UIManager] Initializing UI controls...');
        this.cacheDOM();
        this.bindGlobalActions();
        this.initDraggableWidgets(chatbotConfig);

        const goals        = (chatbotConfig && chatbotConfig.goals)        ? chatbotConfig.goals        : [];
        const wheelOptions = (chatbotConfig && chatbotConfig.wheelOptions) ? chatbotConfig.wheelOptions : [];

        this.renderGoalsList(goals);
        this.renderWheelOptionsList(wheelOptions);
        this.initRecipeControls();

        if (chatbotConfig) {
            this.updateWidgetUI(chatbotConfig);
        }
    },

    cacheDOM() {
        this.elements = {
            goalsTableBody:        document.getElementById('goals-table-body'),
            wheelOptionsList:      document.getElementById('wheel-options-list'),
            giftSelectorModal:     document.getElementById('gift-selector-modal'),
            soundSelectorModal:    document.getElementById('sound-selector-modal'),
            canvas:                document.getElementById('stream-canvas-preview'),
            dragSpotify:           document.getElementById('drag-spotify'),
            dragYoutube:           document.getElementById('drag-youtube'),
            dragDonors:            document.getElementById('drag-donors'),
            dragTaps:              document.getElementById('drag-taps'),
            dragMvp:               document.getElementById('drag-mvp'),
            dragSonglist:          document.getElementById('drag-songlist'),
            dragBanner:            document.getElementById('drag-banner'),
            switchSpotify:         document.getElementById('switch-widget-spotify'),
            switchYoutube:         document.getElementById('switch-widget-youtube'),
            switchDonors:          document.getElementById('switch-widget-donors'),
            switchTaps:            document.getElementById('switch-widget-taps'),
            switchMvp:             document.getElementById('switch-widget-mvp'),
            switchSonglist:        document.getElementById('switch-widget-songlist'),
            switchBanner:          document.getElementById('switch-widget-banner'),
            ingredientsContainer:  document.getElementById('ingredients-container'),
            btnAddIngredient:      document.getElementById('btn-add-ingredient'),
            btnVsShow:             document.getElementById('btn-vs-show'),
            btnVsHide:             document.getElementById('btn-vs-hide'),
            btnVsReset:            document.getElementById('btn-vs-reset'),
            vsTitleInput:          document.getElementById('vs-title-input'),
            connectionWidget:      document.querySelector('.sidebar-connection-widget'),
            tiktokStudioView:      document.getElementById('tiktok-studio-view')
        };
    },

    bindGlobalActions() {
        window.deleteGoal = (id) => {
            window.dispatchEvent(new CustomEvent('ui:deleteGoal', { detail: { id } }));
        };
        window.deleteWheelOption = (index) => {
            window.dispatchEvent(new CustomEvent('ui:deleteWheelOption', { detail: { index } }));
        };
    },

    // Initialize Interact.js drag behavior and switch listeners for all widgets
    initDraggableWidgets(chatbotConfig) {
        if (typeof interact === 'undefined') {
            console.warn('[UIManager] Interact.js is not loaded yet. Skipping drag init.');
            return;
        }

        // Map of widgetName -> switch element
        const switchMap = {
            spotify:  this.elements.switchSpotify,
            youtube:  this.elements.switchYoutube,
            donors:   this.elements.switchDonors,
            taps:     this.elements.switchTaps,
            mvp:      this.elements.switchMvp,
            songlist: this.elements.switchSonglist,
            banner:   this.elements.switchBanner
        };

        // Bind onChange for every switch
        Object.entries(switchMap).forEach(([widgetName, switchEl]) => {
            if (!switchEl) return;
            switchEl.onchange = (e) => {
                const isActive = e.target.checked;
                // Dispatch event so panel.js can forward to backend
                window.dispatchEvent(new CustomEvent('ui:toggleWidget', {
                    detail: { widget: widgetName, active: isActive }
                }));
                // Immediately mirror visibility on the canvas preview block
                const dragEl = document.getElementById(`drag-${widgetName}`);
                if (dragEl) dragEl.style.display = isActive ? 'flex' : 'none';
            };
        });

        // Setup Interact.js drag for all 7 widgets
        ['spotify', 'youtube', 'donors', 'taps', 'mvp', 'songlist', 'banner'].forEach(widgetName => {
            const el = document.getElementById(`drag-${widgetName}`);
            if (el) this.setupDragElement(`#drag-${widgetName}`, widgetName);
        });
    },

    setupDragElement(selector, widgetName) {
        const self = this;
        interact(selector).draggable({
            modifiers: [
                interact.modifiers.restrictRect({
                    restriction: '#stream-canvas-preview',
                    endOnly: false
                })
            ],
            autoScroll: false,
            listeners: {
                move(event) {
                    const pos = self.dragPositions[widgetName];
                    pos.x += event.dx;
                    pos.y += event.dy;
                    event.target.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
                },
                end(event) {
                    const canvas = self.elements.canvas;
                    if (!canvas) return;

                    const canvasRect = canvas.getBoundingClientRect();
                    const elemRect   = event.target.getBoundingClientRect();

                    const relX = ((elemRect.left - canvasRect.left) / canvasRect.width)  * 100;
                    const relY = ((elemRect.top  - canvasRect.top)  / canvasRect.height) * 100;

                    console.info(`[UIManager] Drag ended for '${widgetName}'. RelX: ${relX.toFixed(2)}%, RelY: ${relY.toFixed(2)}%`);

                    window.dispatchEvent(new CustomEvent('ui:updateWidgetPosition', {
                        detail: {
                            widget: widgetName,
                            x: Math.round(relX),
                            y: Math.round(relY)
                        }
                    }));
                }
            }
        });
    },

    // Sync widget state (position + switch) from backend config
    updateWidgetUI(config) {
        if (!config || !config.widgets) return;

        const canvas = this.elements.canvas || document.getElementById('stream-canvas-preview');
        if (!canvas) return;
        const canvasRect = canvas.getBoundingClientRect();

        const applyWidget = (widgetName, switchEl, dragEl) => {
            const cfg = config.widgets[widgetName];
            if (!cfg) return;

            if (switchEl) switchEl.checked = !!cfg.active;

            const el = dragEl || document.getElementById(`drag-${widgetName}`);
            if (el) {
                el.style.display = cfg.active ? 'flex' : 'none';
                const pxX = (cfg.x / 100) * canvasRect.width;
                const pxY = (cfg.y / 100) * canvasRect.height;
                this.dragPositions[widgetName] = { x: pxX, y: pxY };
                el.style.transform = `translate(${pxX}px, ${pxY}px)`;
            }
        };

        applyWidget('spotify',  this.elements.switchSpotify,  this.elements.dragSpotify);
        applyWidget('youtube',  this.elements.switchYoutube,  this.elements.dragYoutube);
        applyWidget('donors',   this.elements.switchDonors,   this.elements.dragDonors);
        applyWidget('taps',     this.elements.switchTaps,     this.elements.dragTaps);
        applyWidget('mvp',      this.elements.switchMvp,      this.elements.dragMvp);
        applyWidget('songlist', this.elements.switchSonglist, this.elements.dragSonglist);
        applyWidget('banner',   this.elements.switchBanner,   this.elements.dragBanner);
    },

    renderGoalsList(goals) {
        const tbody = document.getElementById('goals-table-body') || this.elements.goalsTableBody;
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!goals || goals.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: #888; font-size: 12px; padding: 15px;">
                        No hay metas configuradas. Crea una arriba.
                    </td>
                </tr>
            `;
            return;
        }

        goals.forEach((goal, index) => {
            const tr = document.createElement('tr');
            let typeLabel = '';
            if      (goal.type === 'likes')   typeLabel = 'Me Gusta (Likes)';
            else if (goal.type === 'follows') typeLabel = 'Seguidores';
            else if (goal.type === 'shares')  typeLabel = 'Compartidos';
            else if (goal.type === 'gift')    typeLabel = `Regalo: ${goal.giftName || 'Cualquiera'}`;

            const pct = Math.min(100, Math.round(((goal.current || 0) / (goal.target || 1)) * 100));

            tr.innerHTML = `
                <td>
                    <div style="font-weight: bold; color: white;">${goal.title || 'Sin título'}</div>
                    <div style="font-size: 11px; color: #888;">${typeLabel}</div>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; min-width: 60px;">
                            <div style="width: ${pct}%; height: 100%; background: var(--accent-color, #d900ff); box-shadow: 0 0 8px var(--accent-color);"></div>
                        </div>
                        <span style="font-size: 12px; font-weight: bold; min-width: 60px; text-align: right;">${goal.current || 0} / ${goal.target}</span>
                    </div>
                </td>
                <td class="text-right">
                    <button class="btn-delete" onclick="window.deleteGoal('${goal.id}')" style="background: transparent; border: none; color: #ff3366; cursor: pointer; padding: 5px;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) window.lucide.createIcons();
    },

    renderWheelOptionsList(options) {
        const container = document.getElementById('wheel-options-list') || this.elements.wheelOptionsList;
        if (!container) return;
        container.innerHTML = '';

        if (!options || options.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #888; font-size: 11px; padding: 10px;">
                    No hay opciones en la ruleta.
                </div>
            `;
            return;
        }

        options.forEach((opt, index) => {
            const item = document.createElement('div');
            item.style = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);';
            item.innerHTML = `
                <span style="font-size: 12px; color: white; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80%;">${opt}</span>
                <button onclick="window.deleteWheelOption(${index})" style="background: transparent; border: none; color: #ff3366; cursor: pointer; padding: 2px; display: flex; align-items: center;">
                    <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                </button>
            `;
            container.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    },

    applyThemeBranding(assets) {
        if (!assets) return;
        console.info('[UIManager] Applying host branding assets:', assets);
        document.documentElement.style.setProperty('--accent-color', assets.accentColor);
        document.documentElement.style.setProperty('--accent-pink', assets.spotifyColor);
        const hostLogo = document.getElementById('host-logo');
        if (hostLogo) {
            hostLogo.src = assets.logo;
            hostLogo.style.boxShadow = assets.shadow;
        }
    },

    initRecipeControls() {
        const container = this.elements.ingredientsContainer;
        const btnAdd = this.elements.btnAddIngredient;
        const btnShow = this.elements.btnVsShow;
        const btnHide = this.elements.btnVsHide;
        const btnReset = this.elements.btnVsReset;
        const titleInput = this.elements.vsTitleInput;

        if (!container || !btnAdd) return;

        const createRow = (val = "") => {
            const row = document.createElement('div');
            row.className = 'vs-control-row';
            row.style = 'display: flex; gap: 10px; align-items: center; width: 100%; margin-bottom: 8px;';
            row.innerHTML = `
                <input type="text" class="vs-item-name-input" value="${val}" placeholder="Ingrediente...">
                <button type="button" class="btn-delete-ingredient" style="background: transparent; border: none; color: #ff3b30; cursor: pointer; padding: 4px; display: inline-flex; align-items: center; justify-content: center; transition: background-color 0.2s; border-radius: 4px; height: 38px; width: 38px; flex-shrink: 0;">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                </button>
            `;

            row.querySelector('.btn-delete-ingredient').addEventListener('click', () => {
                row.remove();
                this.triggerRecipeUpdate();
            });

            row.querySelector('.vs-item-name-input').addEventListener('input', () => {
                this.triggerRecipeUpdate();
            });

            container.appendChild(row);
            if (window.lucide) window.lucide.createIcons();
        };

        btnAdd.addEventListener('click', () => {
            createRow("");
            this.triggerRecipeUpdate();
        });

        if (titleInput) {
            titleInput.addEventListener('input', () => {
                this.triggerRecipeUpdate();
            });
        }

        if (btnShow) {
            btnShow.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('ui:recipeAction', { detail: { action: 'vs_show' } }));
                this.triggerRecipeUpdate();
            });
        }

        if (btnHide) {
            btnHide.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('ui:recipeAction', { detail: { action: 'vs_hide' } }));
            });
        }

        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (titleInput) titleInput.value = "RECETA DEL DÍA: PASTEL DE FRESAS";
                container.innerHTML = '';
                const defaultNames = ["Fresas Frescas 10 tazas", "Harina de Trigo 300g", "Azúcar Morena 150g", "Esencia de Vainilla 2 cdas"];
                defaultNames.forEach(name => createRow(name));

                window.dispatchEvent(new CustomEvent('ui:recipeAction', { detail: { action: 'vs_reset' } }));
                this.triggerRecipeUpdate();
            });
        }

        // Initialize default rows if empty
        if (container.children.length === 0) {
            const defaultNames = ["Fresas Frescas 10 tazas", "Harina de Trigo 300g", "Azúcar Morena 150g", "Esencia de Vainilla 2 cdas"];
            defaultNames.forEach(name => createRow(name));
        }
    },

    triggerRecipeUpdate() {
        const titleInput = this.elements.vsTitleInput;
        const title = titleInput ? titleInput.value : '';
        const items = [];

        document.querySelectorAll('.vs-item-name-input').forEach(input => {
            const name = input.value;
            if (name.trim() !== '') {
                items.push({ name, count: 1 });
            }
        });

        window.dispatchEvent(new CustomEvent('ui:recipeUpdate', {
            detail: { title, items }
        }));
    }
};
