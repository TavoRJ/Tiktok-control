// Music Widget Settings Module
// Handles initialization, UI rendering, and user input validation for the music monetization system

let socket;
let currentSettings = {};

export function init(socketInstance) {
    socket = socketInstance;
    console.info('[MusicSettings] Initialized module.');

    // Request settings when connection is established
    socket.on('connect', () => {
        requestSettings();
    });

    // Handle incoming settings updates
    socket.on('settings_saved', (settings) => {
        currentSettings = settings;
        renderMusicSettings();
    });

    // Fallback if connect was already done
    requestSettings();
}

function requestSettings() {
    socket.emit('getChatbotSettings');
}

// Render the settings HTML dynamically inside the panel
export function renderMusicSettings() {
    const container = document.getElementById('music-settings-container');
    if (!container) {
        console.warn('[MusicSettings] music-settings-container element not found in DOM.');
        return;
    }

    const musicEnabled = currentSettings.musicMonetizationEnabled !== false; // Default true
    const ticketPrice = currentSettings.musicTicketPrice || 10;
    const playlistId = currentSettings.musicPlaylistId || '';
    const style = currentSettings.globalWidgetStyles || {};
    const primaryColor = style.primaryColor || '#ecc158'; // default to gold/yellowish
    const font = style.fontFamily || 'Outfit';

    container.innerHTML = `
        <div class="card-config">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <i class="fas fa-music" style="color: var(--accent-red); font-size:1.5rem;"></i>
                    <h3 style="margin:0; font-family:'Outfit',sans-serif; font-size:1.25rem; font-weight:600;">Monetización de Música</h3>
                </div>
                <div class="toggle-switch-container">
                    <label class="switch">
                        <input type="checkbox" id="music-monetize-toggle" ${musicEnabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                    <span style="font-size:0.85rem; color: var(--text-muted); margin-left:0.5rem;" id="music-status-text">
                        ${musicEnabled ? 'Activado' : 'Desactivado'}
                    </span>
                </div>
            </div>

            <div class="card-body" style="display: flex; flex-direction: column; gap:1.25rem;">
                <p style="margin:0; font-size:0.9rem; color: var(--text-muted); line-height:1.4;">
                    Permite que los espectadores soliciten canciones de tu lista de reproducción a cambio de monedas o cofres.
                </p>

                <!-- Ticket price config -->
                <div class="form-group" style="display: flex; flex-direction: column; gap:0.5rem;">
                    <label for="music-ticket-price" style="font-size:0.85rem; color: var(--text-muted); font-weight:500; display:flex; justify-content:space-between;">
                        <span>Precio de Solicitud (Monedas o equivalente)</span>
                        <span id="price-badge" style="background: rgba(236,193,88,0.15); color:#ecc158; padding: 2px 8px; border-radius:12px; font-size:0.75rem;">
                            ${ticketPrice} Monedas
                        </span>
                    </label>
                    <input type="number" id="music-ticket-price" class="form-control" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--text-main); padding: 0.75rem; border-radius: 8px; font-size:0.95rem; width:100%;" value="${ticketPrice}" min="1" max="1000">
                </div>

                <!-- Playlist/Spotify Link config -->
                <div class="form-group" style="display: flex; flex-direction: column; gap:0.5rem;">
                    <label for="music-playlist-id" style="font-size:0.85rem; color: var(--text-muted); font-weight:500;">
                        ID / Link de Playlist de Spotify o YouTube
                    </label>
                    <input type="text" id="music-playlist-id" class="form-control" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--text-main); padding: 0.75rem; border-radius: 8px; font-size:0.95rem; width:100%;" value="${playlistId}" placeholder="Ej: 37i9dQZF1DX10zKzsJ2jva o URL completa">
                </div>

                <!-- Global style preferences -->
                <div style="border-top: 1px solid var(--border-color); margin-top: 0.5rem; padding-top: 1rem;">
                    <h4 style="margin: 0 0 1rem 0; font-size:0.95rem; font-weight:600; color: var(--text-main);">Aspecto Visual de la Lista</h4>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                        <div class="form-group" style="display:flex; flex-direction:column; gap:0.5rem;">
                            <label style="font-size:0.8rem; color: var(--text-muted);">Color Principal</label>
                            <div style="display:flex; gap:0.5rem; align-items:center;">
                                <input type="color" id="music-style-color" style="border:none; background:none; cursor:pointer; width:36px; height:36px; padding:0;" value="${primaryColor}">
                                <input type="text" id="music-style-color-hex" class="form-control" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--text-main); padding: 0.5rem; border-radius: 6px; font-size:0.85rem; width:80px; text-align:center;" value="${primaryColor}">
                            </div>
                        </div>

                        <div class="form-group" style="display:flex; flex-direction:column; gap:0.5rem;">
                            <label for="music-style-font" style="font-size:0.8rem; color: var(--text-muted);">Tipografía</label>
                            <select id="music-style-font" class="form-control" style="background: #160e13; border: 1px solid var(--border-color); color: var(--text-main); padding: 0.5rem; border-radius: 6px; font-size:0.85rem; height:36px;">
                                <option value="Outfit" ${font === 'Outfit' ? 'selected' : ''}>Outfit</option>
                                <option value="Inter" ${font === 'Inter' ? 'selected' : ''}>Inter</option>
                                <option value="Montserrat" ${font === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
                                <option value="Roboto" ${font === 'Roboto' ? 'selected' : ''}>Roboto</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Save action -->
                <div style="margin-top: 0.5rem; display:flex; gap:0.75rem; justify-content: flex-end;">
                    <button id="music-save-btn" class="btn btn-primary" style="background: var(--accent-red); border: none; color:#fff; padding: 0.6rem 1.5rem; border-radius: 8px; font-weight:600; cursor:pointer; transition: background 0.2s;">
                        <i class="fas fa-save" style="margin-right:0.5rem;"></i> Guardar Ajustes
                    </button>
                </div>
            </div>
        </div>
    `;

    // Hook up listeners
    setupListeners();
}

function setupListeners() {
    const toggle = document.getElementById('music-monetize-toggle');
    const statusText = document.getElementById('music-status-text');
    const ticketPriceInput = document.getElementById('music-ticket-price');
    const badge = document.getElementById('price-badge');
    const playlistInput = document.getElementById('music-playlist-id');
    const colorPicker = document.getElementById('music-style-color');
    const colorHex = document.getElementById('music-style-color-hex');
    const fontSelect = document.getElementById('music-style-font');
    const saveBtn = document.getElementById('music-save-btn');

    if (toggle) {
        toggle.addEventListener('change', () => {
            statusText.innerText = toggle.checked ? 'Activado' : 'Desactivado';
        });
    }

    if (ticketPriceInput && badge) {
        ticketPriceInput.addEventListener('input', () => {
            badge.innerText = `${ticketPriceInput.value || 0} Monedas`;
        });
    }

    if (colorPicker && colorHex) {
        colorPicker.addEventListener('input', () => {
            colorHex.value = colorPicker.value;
        });
        colorHex.addEventListener('input', () => {
            if (/^#[0-9A-F]{6}$/i.test(colorHex.value)) {
                colorPicker.value = colorHex.value;
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const updatedSettings = {
                ...currentSettings,
                musicMonetizationEnabled: toggle ? toggle.checked : true,
                musicTicketPrice: ticketPriceInput ? parseInt(ticketPriceInput.value, 10) || 10 : 10,
                musicPlaylistId: playlistInput ? playlistInput.value.trim() : '',
                globalWidgetStyles: {
                    ...currentSettings.globalWidgetStyles,
                    primaryColor: colorPicker ? colorPicker.value : '#ecc158',
                    fontFamily: fontSelect ? fontSelect.value : 'Outfit'
                }
            };

            // Update local object immediately to keep UI in sync
            currentSettings = updatedSettings;

            // Emit to server (using standard save_settings)
            socket.emit('save_settings', updatedSettings);

            // Emit styling updates separately so server broadcasts to the widget immediately
            socket.emit('updateGlobalWidgetStyles', updatedSettings.globalWidgetStyles);

            // Show a temporary success style or alert
            saveBtn.innerHTML = '<i class="fas fa-check"></i> ¡Guardado!';
            saveBtn.style.background = '#28a745';
            setTimeout(() => {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Ajustes';
                saveBtn.style.background = 'var(--accent-red)';
            }, 2000);
        });
    }
}
