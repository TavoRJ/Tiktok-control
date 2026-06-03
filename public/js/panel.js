// Close Spotify auth popup if loaded inside one
if (window.opener && window.location.search.includes('spotify=')) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'error') {
        alert('Error vinculando Spotify: ' + (params.get('message') || 'desconocido'));
    }
    window.close();
}

// Premium Toast Notification System
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container not found, logging message:', message);
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    
    // Choose icon based on type
    let icon = '🔔';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'info') icon = 'ℹ️';
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close">&times;</button>
    `;
    
    // Bind close button click
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            toast.remove();
        });
    }
    
    // Auto-remove toast from DOM after animations complete (3.7 seconds total)
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 3700);
    
    container.appendChild(toast);
}

// Override global window.alert to automatically use showToast and prevent Electron focus lock
window.alert = function(msg) {
    console.log('Intercepted alert:', msg);
    
    // Detect errors/warnings or success in message to colorize toast
    let type = 'info';
    const lower = msg.toLowerCase();
    if (lower.includes('error') || lower.includes('falló') || lower.includes('denegado') || lower.includes('incorrecta') || lower.includes('selecciona') || lower.includes('escribe')) {
        type = 'error';
    } else if (lower.includes('éxito') || lower.includes('exitosamente') || lower.includes('guardado') || lower.includes('actualizado') || lower.includes('registrado') || lower.includes('copiado')) {
        type = 'success';
    } else if (lower.includes('cuidado') || lower.includes('advertencia') || lower.includes('seguro')) {
        type = 'warning';
    }
    
    showToast(msg, type);
    
    // Focus recovery helper
    if (document.activeElement && typeof document.activeElement.focus === 'function') {
        setTimeout(() => {
            document.activeElement.focus();
        }, 50);
    }
};

// Override window.confirm to restore keyboard focus to inputs immediately in Electron
const originalConfirm = window.confirm;
window.confirm = function(msg) {
    console.log('Intercepted confirm:', msg);
    const result = originalConfirm(msg);
    
    // Force Electron window and inputs refocus in the next frame
    setTimeout(() => {
        window.focus();
        if (document.activeElement && typeof document.activeElement.focus === 'function') {
            document.activeElement.focus();
        }
    }, 50);
    
    return result;
};

const socket = io();
let latestRemoteConfig = {};

// DOM Elements
const statusText = document.getElementById('connection-status');
const statusIndicator = document.querySelector('.status-indicator');
const eventLog = document.getElementById('event-log');
const clearLogBtn = document.getElementById('clear-log');
const filterGiftsCheckbox = document.getElementById('filter-gifts');

// Navigation
function updateFloatingSaveButtonVisibility(targetId) {
    const floatingSaveBtn = document.getElementById('floating-save-btn');
    if (!floatingSaveBtn) return;
    const configViews = ['music-view', 'youtube-view', 'multimedia-view', 'chatbot-view', 'setup-view'];
    if (configViews.includes(targetId)) {
        floatingSaveBtn.classList.add('visible');
    } else {
        floatingSaveBtn.classList.remove('visible');
    }
}

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();

        // Remove active class from all
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

        // Add active to current
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        if (targetId) {
            document.getElementById(targetId).style.display = 'block';
        }

        // Update floating save button
        updateFloatingSaveButtonVisibility(targetId);

        // Show/Hide controls footer (only in Overlays view)
        const footer = document.querySelector('.controls-footer');
        if (footer) {
            footer.style.display = (targetId === 'overlays-view') ? 'flex' : 'none';
        }
    });
});

// Initialize footer state on load
document.addEventListener('DOMContentLoaded', () => {
    const activeItem = document.querySelector('.menu-item.active');
    const footer = document.querySelector('.controls-footer');
    const targetId = activeItem ? activeItem.getAttribute('data-target') : '';
    if (footer) {
        footer.style.display = (targetId === 'overlays-view') ? 'flex' : 'none';
    }
    updateFloatingSaveButtonVisibility(targetId);
});

// Socket.io Events
socket.on('app_version', (version) => {
    const versionLabel = document.getElementById('app-version-label');
    if (versionLabel) {
        versionLabel.textContent = `v${version}`;
    }
});

socket.on('remote_config_updated', (config) => {
    if (!config) return;
    latestRemoteConfig = config;
    
    const youtubeBtn = document.getElementById('menu-youtube-btn');
    const youtubeOverlay = document.getElementById('youtube-blocked-overlay');
    const youtubeText = document.getElementById('youtube-blocked-text');
    
    if (config.youtubeBlocked) {
        if (youtubeBtn) youtubeBtn.classList.add('menu-item-blocked');
        if (youtubeOverlay) youtubeOverlay.style.display = 'flex';
        if (youtubeText) youtubeText.textContent = config.youtubeBlockMessage || "Esta función ha sido deshabilitada temporalmente de forma remota por mantenimiento.";
        
        // If the user is currently on the youtube-view tab, force switch them to overlays-view
        const activeItem = document.querySelector('.menu-item.active');
        if (activeItem && activeItem.getAttribute('data-target') === 'youtube-view') {
            const overlaysItem = document.querySelector('.menu-item[data-target="overlays-view"]');
            if (overlaysItem) overlaysItem.click();
        }
    } else {
        if (youtubeBtn) youtubeBtn.classList.remove('menu-item-blocked');
        if (youtubeOverlay) youtubeOverlay.style.display = 'none';
    }
});

socket.on('system', (data) => {
    if (data.type === 'connected') {
        statusText.textContent = data.message;
        statusIndicator.classList.remove('error');
    } else if (data.type === 'error') {
        statusText.textContent = data.message;
        statusIndicator.classList.add('error');
    }
    appendLog('system', data.message);
});

// Raw Events for Scanner
socket.on('tiktok_event_raw', (payload) => {
    const { eventType, data } = payload;

    // Filtering logic
    if (filterGiftsCheckbox.checked) {
        // Incluimos envelope y social ya que los guantes y cofres suelen llegar por ahí
        if (!['gift', 'linkMicBattle', 'linkMicArmies', 'envelope', 'social'].includes(eventType)) {
            return;
        }
    }

    let logMessage = '';
    let cssClass = 'system';

    if (eventType === 'gift') {
        cssClass = 'gift';
        logMessage = `[REGALO] ${data.nickname} envió ${data.giftName} (ID: ${data.giftId}) x${data.repeatCount}`;
    } else if (eventType === 'chat') {
        cssClass = 'chat';
        logMessage = `[CHAT] ${data.nickname}: ${data.comment}`;
    } else if (eventType === 'linkMicBattle') {
        cssClass = 'battle';
        logMessage = `[BATALLA] Status actualizado (Battle Event)`;
    } else if (eventType === 'envelope') {
        cssClass = 'battle';
        logMessage = `[SOBRE/ITEM] Evento de Cofre o Item detectado: ${JSON.stringify(data)}`;
    } else if (eventType === 'social') {
        cssClass = 'system';
        logMessage = `[SOCIAL] Acción: ${data.label || 'Interacción'} por ${data.nickname}`;
    } else {
        logMessage = `[${eventType.toUpperCase()}] ${JSON.stringify(data)}`;
    }

    appendLog(cssClass, logMessage);
});

function appendLog(type, message) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const time = new Date().toLocaleTimeString();

    entry.innerHTML = `
        <span class="timestamp">[${time}]</span>
        <span class="content">${message}</span>
    `;

    eventLog.prepend(entry); // Add to top

    // Keep max 100 entries
    if (eventLog.children.length > 100) {
        eventLog.removeChild(eventLog.lastChild);
    }
}

clearLogBtn.addEventListener('click', () => {
    eventLog.innerHTML = '';
    appendLog('system', 'Log limpiado.');
});

// Controls
document.getElementById('btn-stop-all').addEventListener('click', () => {
    socket.emit('manual_control', { action: 'stop_all' });
});

document.getElementById('btn-stop-front').addEventListener('click', () => {
    socket.emit('manual_control', { action: 'stop_front' });
});

document.getElementById('btn-stop-back').addEventListener('click', () => {
    socket.emit('manual_control', { action: 'stop_back' });
});

// User connection
document.getElementById('btn-connect').addEventListener('click', () => {
    const input = document.getElementById('username-input');
    const username = input.value.trim().replace('@', '');
    if (username) {
        socket.emit('change_user', { username });
    }
});

document.getElementById('btn-disconnect').addEventListener('click', () => {
    socket.emit('disconnect_tiktok');
});

// Sidebar Toggle
document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('collapsed');
});

// Versus Table Controls
document.getElementById('btn-vs-show').addEventListener('click', () => {
    socket.emit('manual_control', { action: 'vs_show' });
});

document.getElementById('btn-vs-hide').addEventListener('click', () => {
    socket.emit('manual_control', { action: 'vs_hide' });
});

document.getElementById('btn-vs-reset').addEventListener('click', () => {
    socket.emit('manual_control', { action: 'vs_reset' });
});

// Card clicks (Manual trigger for testing)
document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
        // Evitar simulación si se hace clic en el menú de 3 puntos o sus opciones
        if (e.target.closest('.card-menu-container')) {
            return;
        }
        const eventType = card.getAttribute('data-event');
        if (eventType) {
            socket.emit('manual_control', { action: 'test_trigger', event: eventType });
        }
    });
});

// Initialize Lucide Icons
lucide.createIcons();

// ==========================================
// CHATBOT TTS LOGIC
// ==========================================
let chatbotConfig = null;
let systemVoices = [];

// Populate voice dropdowns
function populateVoices() {
    if (!window.speechSynthesis) return;
    systemVoices = window.speechSynthesis.getVoices();
    
    const defaultVoiceSelect = document.getElementById('bot-default-voice');
    const ruleVoiceSelect = document.getElementById('rule-voice');
    
    if (!defaultVoiceSelect || !ruleVoiceSelect) return;
    
    // Save current values if any
    const prevDefault = defaultVoiceSelect.value;
    const prevRule = ruleVoiceSelect.value;
    
    // Clear
    defaultVoiceSelect.innerHTML = '<option value="">(Voz por defecto del navegador)</option>';
    ruleVoiceSelect.innerHTML = '<option value="">(Voz por defecto)</option>';
    
    // Set cloud voices in rule selection first
    const cloudVoiceOptions = [
        { name: 'es-CO-SalomeNeural', label: 'Salomé (Colombia 🇨🇴 - Femenino)' },
        { name: 'es-CO-GonzaloNeural', label: 'Gonzalo (Colombia 🇨🇴 - Masculino)' },
        { name: 'es-MX-DaliaNeural', label: 'Dalia (México 🇲🇽 - Femenino)' },
        { name: 'es-MX-JorgeNeural', label: 'Jorge (México 🇲🇽 - Masculino)' },
        { name: 'es-ES-ElviraNeural', label: 'Elvira (España 🇪🇸 - Femenino)' },
        { name: 'es-ES-AlvaroNeural', label: 'Álvaro (España 🇪🇸 - Masculino)' },
        { name: 'en-US-AriaNeural', label: 'Aria (EE.UU. 🇺🇸 - Femenino)' },
        { name: 'en-US-GuyNeural', label: 'Guy (EE.UU. 🇺🇸 - Masculino)' }
    ];
    
    const cloudGroup = document.createElement('optgroup');
    cloudGroup.label = 'Voces en la nube (Edge Cloud)';
    cloudVoiceOptions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.label;
        cloudGroup.appendChild(opt);
    });
    ruleVoiceSelect.appendChild(cloudGroup);
    
    // Sort local voices: Colombia (es-CO) first, then other Spanish (es), then the rest alphabetically
    systemVoices.sort((a, b) => {
        const langA = (a.lang || '').toLowerCase();
        const langB = (b.lang || '').toLowerCase();
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        
        const isColombiaA = langA === 'es-co' || nameA.includes('colombia');
        const isColombiaB = langB === 'es-co' || nameB.includes('colombia');
        
        if (isColombiaA && !isColombiaB) return -1;
        if (!isColombiaA && isColombiaB) return 1;
        
        const isSpanishA = langA.startsWith('es');
        const isSpanishB = langB.startsWith('es');
        
        if (isSpanishA && !isSpanishB) return -1;
        if (!isSpanishA && isSpanishB) return 1;
        
        return a.name.localeCompare(b.name);
    });
    
    const localGroup = document.createElement('optgroup');
    localGroup.label = 'Voces de tu computadora (Locales)';
    
    // Fill voices
    systemVoices.forEach(voice => {
        const optionText = `${voice.name} (${voice.lang})`;
        
        const opt1 = document.createElement('option');
        opt1.value = voice.name;
        opt1.textContent = optionText;
        defaultVoiceSelect.appendChild(opt1);
        
        const opt2 = document.createElement('option');
        opt2.value = voice.name;
        opt2.textContent = optionText;
        localGroup.appendChild(opt2);
    });
    ruleVoiceSelect.appendChild(localGroup);
    
    // Restore values
    if (prevDefault) defaultVoiceSelect.value = prevDefault;
    if (prevRule) ruleVoiceSelect.value = prevRule;
}

if (window.speechSynthesis) {
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = populateVoices;
    }
    // Try populating immediately
    setTimeout(populateVoices, 100);
}

// Receive updated settings from server
socket.on('chatbot_settings_updated', (config) => {
    chatbotConfig = config;
    if (!config.active) {
        stopAllTTS();
    }
    updateUIWithConfig(config);
    updateMasterAnimationsUI(config);
});

// Update Panel inputs with active configuration
function updateUIWithConfig(config) {
    if (!config) return;
    
    const activeEl = document.getElementById('bot-active');
    const playLocEl = document.getElementById('bot-play-location');
    const readUserEl = document.getElementById('bot-read-username');
    const prefReqEl = document.getElementById('bot-prefix-required');
    const prefixesEl = document.getElementById('bot-prefixes');
    const permEl = document.getElementById('bot-permission');
    const blockRareEl = document.getElementById('bot-block-rare-languages');
    const maxCharEl = document.getElementById('bot-max-characters');
    const bannedWordsEl = document.getElementById('bot-banned-words');
    const bannedActionEl = document.getElementById('bot-banned-action');
    const ignoredUsersEl = document.getElementById('bot-ignored-users');
    const defVoiceEl = document.getElementById('bot-default-voice');
    
    if (activeEl) activeEl.checked = config.active;
    if (playLocEl) playLocEl.value = config.playLocation || 'overlay';
    if (readUserEl) readUserEl.checked = config.readUsername !== false;
    if (prefReqEl) prefReqEl.checked = !!config.readPrefixRequired;
    if (prefixesEl) prefixesEl.value = (config.prefixes || []).join(', ');
    if (permEl) permEl.value = config.permission || 'all';
    if (blockRareEl) blockRareEl.checked = config.blockRareLanguages !== false;
    if (maxCharEl) maxCharEl.value = config.maxCharacters || 150;
    if (bannedWordsEl) bannedWordsEl.value = (config.bannedWords || []).join(', ');
    if (bannedActionEl) bannedActionEl.value = config.bannedWordsAction || 'skip';
    if (ignoredUsersEl) ignoredUsersEl.value = (config.ignoreUserList || []).join(', ');
    
    // Exclusive Voice Chat config fields
    const exclusiveEnabledEl = document.getElementById('bot-exclusive-enabled');
    const exclusiveUserEl = document.getElementById('bot-exclusive-user');
    if (exclusiveEnabledEl) exclusiveEnabledEl.checked = !!config.exclusiveTtsEnabled;
    if (exclusiveUserEl) exclusiveUserEl.value = config.exclusiveTtsUser || '';

    // TTS direct event elements
    const readFollowsEl = document.getElementById('bot-read-follows');
    const readSharesEl = document.getElementById('bot-read-shares');
    const readGiftsEl = document.getElementById('bot-read-gifts');
    const readLikesEl = document.getElementById('bot-read-likes');
    const likesMilestoneEl = document.getElementById('bot-likes-milestone');
    
    if (readFollowsEl) readFollowsEl.checked = !!config.readFollowsEnabled;
    if (readSharesEl) readSharesEl.checked = !!config.readSharesEnabled;
    if (readGiftsEl) readGiftsEl.checked = !!config.readGiftsEnabled;
    if (readLikesEl) readLikesEl.checked = !!config.readLikesMilestoneEnabled;
    if (likesMilestoneEl) likesMilestoneEl.value = config.likesMilestoneValue || 100;
    
    // Sync custom phrases and formatting settings
    const filterEmojisEl = document.getElementById('bot-filter-emojis-names');
    const thankShareEl = document.getElementById('bot-thank-share-phrase');
    const thankFollowEl = document.getElementById('bot-thank-follow-phrase');
    const thankGiftEl = document.getElementById('bot-thank-gift-phrase');
    
    if (filterEmojisEl) filterEmojisEl.checked = !!config.filterEmojisFromNames;
    if (thankShareEl) thankShareEl.value = config.thankYouSharePhrase || '';
    if (thankFollowEl) thankFollowEl.value = config.thankYouFollowPhrase || '';
    if (thankGiftEl) thankGiftEl.value = config.thankYouGiftPhrase || '';

    // Metas, Ruleta y Overlays
    const wheelEnabledEl = document.getElementById('wheel-enabled');
    const wheelGiftEl = document.getElementById('wheel-trigger-gift');
    const wheelCoinsEl = document.getElementById('wheel-trigger-coins');
    const overlayMusicEl = document.getElementById('overlay-music-enabled');
    const overlayChatEl = document.getElementById('overlay-chat-enabled');
    const overlayChatPremiumEl = document.getElementById('overlay-chat-premium');
    const ttsEffectsEl = document.getElementById('tts-effects-enabled');

    if (wheelEnabledEl) wheelEnabledEl.checked = !!config.wheelEnabled;
    if (wheelGiftEl) wheelGiftEl.value = config.wheelTriggerGift || 'any';
    if (wheelCoinsEl) wheelCoinsEl.value = config.wheelTriggerCoins || 10;
    if (overlayMusicEl) overlayMusicEl.checked = config.overlayMusicQueueEnabled !== false;
    if (overlayChatEl) overlayChatEl.checked = config.overlayChatEnabled !== false;
    if (overlayChatPremiumEl) overlayChatPremiumEl.checked = config.overlayChatFilterPremium !== false;
    if (ttsEffectsEl) ttsEffectsEl.checked = config.ttsEffectsEnabled !== false;

    // Render dynamic lists (Metas, Ruleta)
    renderGoalsList(config.goals || []);
    renderWheelOptionsList(config.wheelOptions || []);
    
    // Setup and Spotify values
    const setupUserEl = document.getElementById('setup-tiktok-username');
    const setupAutoEl = document.getElementById('setup-auto-connect');
    const setupThemeEl = document.getElementById('setup-theme');
    const spotActiveEl = document.getElementById('spotify-active');
    const spotClientEl = document.getElementById('spotify-client-id');
    const spotSecretEl = document.getElementById('spotify-client-secret');
    const spotThemeEl = document.getElementById('spotify-theme');
    const spotPosEl = document.getElementById('spotify-position');
    
    if (setupUserEl) setupUserEl.value = config.tiktokUsername || '';
    if (setupAutoEl) setupAutoEl.checked = config.autoConnect !== false;
    
    // Sync header username input
    const usernameInput = document.getElementById('username-input');
    if (usernameInput) {
        usernameInput.value = config.tiktokUsername || '';
    }
    
    // Update theme profile (Naya / Majo / Neutral)
    const themeName = config.themeName || 'neutral';
    document.body.className = 'theme-' + themeName;
    const logoEl = document.querySelector('.brand-logo');
    if (themeName === 'neutral') {
        document.title = "GRLive - Control Panel";
        if (logoEl) {
            logoEl.src = `assets/neutral-logo.jpg`;
            logoEl.alt = 'GR Logo';
            logoEl.style.display = 'block';
        }
    } else {
        document.title = themeName === 'majo' ? "Majo's - Control Panel" : "Naya's - Control Panel";
        if (logoEl) {
            logoEl.src = `assets/${themeName}-logo.png`;
            logoEl.alt = themeName.charAt(0).toUpperCase() + themeName.slice(1) + ' Logo';
            logoEl.style.display = 'block';
        }
    }

    // Dynamic artist name for mockup track index 0
    if (currentTrackIndex === 0 && (!config.spotifyConnected || !config.spotifyEnabled)) {
        const artistEl = document.getElementById('mockup-artist');
        if (artistEl) {
            if (themeName === 'majo') {
                artistEl.textContent = 'Majo Vibe';
            } else if (themeName === 'naya') {
                artistEl.textContent = 'Naya Vibe';
            } else {
                artistEl.textContent = 'Live Vibe';
            }
        }
    }
    if (setupThemeEl) setupThemeEl.value = themeName;
    if (spotActiveEl) spotActiveEl.checked = !!config.spotifyEnabled;
    if (spotClientEl) spotClientEl.value = config.spotifyClientId || '';
    if (spotSecretEl) spotSecretEl.value = config.spotifyClientSecret || '';
    
    if (spotThemeEl) {
        let selectedValue = config.spotifyTheme || 'apple-music';
        let isSelectedValueVisible = true;
        const options = spotThemeEl.options;
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            if (themeName === 'majo') {
                if (opt.value === 'naya-chibi' || opt.value === 'coquette-hearts') {
                    opt.style.display = 'none';
                    if (selectedValue === opt.value) isSelectedValueVisible = false;
                } else {
                    opt.style.display = '';
                }
            } else if (themeName === 'naya') {
                if (opt.value === 'anime-gojo' || opt.value === 'majo-spider') {
                    opt.style.display = 'none';
                    if (selectedValue === opt.value) isSelectedValueVisible = false;
                } else {
                    opt.style.display = '';
                }
            } else {
                if (opt.value === 'naya-chibi' || opt.value === 'anime-gojo' || opt.value === 'majo-spider') {
                    opt.style.display = 'none';
                    if (selectedValue === opt.value) isSelectedValueVisible = false;
                } else {
                    opt.style.display = '';
                }
            }
        }
        if (!isSelectedValueVisible) {
            selectedValue = themeName === 'majo' ? 'majo-spider' : (themeName === 'naya' ? 'naya-chibi' : 'apple-music');
        }
        spotThemeEl.value = selectedValue;
        updateMockupThemeClass(selectedValue);
    }
    if (spotPosEl) spotPosEl.value = config.spotifyPosition || 'bottom-left';
    
    const spotNeonColorEl = document.getElementById('spotify-neon-color');
    const spotVinylDesignEl = document.getElementById('spotify-vinyl-design');
    const spotVinylSpeedEl = document.getElementById('spotify-vinyl-speed');
    if (spotNeonColorEl) spotNeonColorEl.value = config.spotifyNeonColor || 'pink';
    if (spotVinylDesignEl) spotVinylDesignEl.value = config.spotifyVinylDesign || 'classic';
    if (spotVinylSpeedEl) spotVinylSpeedEl.value = config.spotifyVinylSpeed || 'normal';

    // Spotify interactive settings
    const spotVolEl = document.getElementById('spotify-volume-slider');
    const spotVolVal = document.getElementById('spotify-volume-val');
    const spotQueueEnabledEl = document.getElementById('spotify-chat-queue-enabled');
    const spotExplicitEl = document.getElementById('spotify-explicit-allowed');
    const spotPermEl = document.getElementById('spotify-permission');
    const spotPrefixEl = document.getElementById('spotify-command-prefix');
    const spotVoteLimitEl = document.getElementById('spotify-voteskip-limit');
    
    if (spotVolEl) {
        spotVolEl.value = config.spotifyVolume !== undefined ? config.spotifyVolume : 80;
        if (spotVolVal) spotVolVal.textContent = `${spotVolEl.value}%`;
    }
    if (spotQueueEnabledEl) spotQueueEnabledEl.checked = config.spotifyChatQueueEnabled !== false;
    if (spotExplicitEl) spotExplicitEl.checked = !!config.spotifyExplicitAllowed;
    if (spotPermEl) spotPermEl.value = config.spotifyPermission || 'all';
    if (spotPrefixEl) spotPrefixEl.value = config.spotifyCommandPrefix || '!song';
    if (spotVoteLimitEl) spotVoteLimitEl.value = config.spotifyVoteSkipLimit || 3;
    
    // YouTube settings sync
    const ytActiveEl = document.getElementById('youtube-active');
    const ytVolEl = document.getElementById('youtube-volume-slider');
    const ytVolVal = document.getElementById('youtube-volume-val');
    const ytQueueEnabledEl = document.getElementById('youtube-chat-queue-enabled');
    const ytPermEl = document.getElementById('youtube-permission');
    const ytPrefixEl = document.getElementById('youtube-command-prefix');
    const ytVoteLimitEl = document.getElementById('youtube-voteskip-limit');
    
    if (ytActiveEl) ytActiveEl.checked = !!config.youtubeEnabled;
    if (ytVolEl) {
        ytVolEl.value = config.youtubeVolume !== undefined ? config.youtubeVolume : 80;
        if (ytVolVal) ytVolVal.textContent = `${ytVolEl.value}%`;
    }
    if (ytQueueEnabledEl) ytQueueEnabledEl.checked = config.youtubeChatQueueEnabled !== false;
    if (ytPermEl) ytPermEl.value = config.youtubePermission || 'all';
    if (ytPrefixEl) ytPrefixEl.value = config.youtubeCommandPrefix || '!yt';
    if (ytVoteLimitEl) ytVoteLimitEl.value = config.youtubeVoteSkipLimit || 3;
    
    // Spotify OAuth connection profile UI
    const spotifyProfileContainer = document.getElementById('spotify-profile-container');
    const btnVincularSpotify = document.getElementById('btn-vincular-spotify');
    const btnDesvincularSpotify = document.getElementById('btn-desvincular-spotify');
    const spotifyAvatar = document.getElementById('spotify-avatar');
    const spotifyUserDisplay = document.getElementById('spotify-username-display');

    if (config.spotifyConnected) {
        if (spotifyProfileContainer) spotifyProfileContainer.style.display = 'flex';
        if (btnDesvincularSpotify) btnDesvincularSpotify.style.display = 'flex';
        if (btnVincularSpotify) btnVincularSpotify.style.display = 'none';
        
        if (spotifyUserDisplay) spotifyUserDisplay.textContent = config.spotifyUserName || 'Usuario Spotify';
        if (spotifyAvatar) {
            spotifyAvatar.src = config.spotifyUserProfilePic || "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2250%22%20height%3D%2250%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%2523222%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%2523aaa%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-size%3D%2220%22%3E%25E2%2599%25AB%3C%2Ftext%3E%3C%2Fsvg%3E";
        }
    } else {
        if (spotifyProfileContainer) spotifyProfileContainer.style.display = 'none';
        if (btnDesvincularSpotify) btnDesvincularSpotify.style.display = 'none';
        if (btnVincularSpotify) btnVincularSpotify.style.display = 'flex';
    }
    
    // Engine & Voice settings
    const engineEl = document.getElementById('bot-tts-engine');
    const cloudVoiceEl = document.getElementById('bot-cloud-voice');
    
    if (engineEl) {
        engineEl.value = config.ttsEngine || 'cloud';
        if (engineEl.value === 'cloud') {
            document.getElementById('container-cloud-voice').style.display = 'block';
            document.getElementById('container-local-voice').style.display = 'none';
        } else {
            document.getElementById('container-cloud-voice').style.display = 'none';
            document.getElementById('container-local-voice').style.display = 'block';
        }
    }
    if (cloudVoiceEl) cloudVoiceEl.value = config.cloudVoiceName || 'es-CO-SalomeNeural';
    
    if (systemVoices.length === 0) populateVoices();
    if (defVoiceEl) defVoiceEl.value = config.voiceName || '';
    
    const volEl = document.getElementById('bot-default-volume');
    const valVolEl = document.getElementById('val-default-volume');
    if (volEl && valVolEl) {
        volEl.value = config.volume !== undefined ? config.volume : 1;
        valVolEl.textContent = `${Math.round(volEl.value * 100)}%`;
    }
    
    const pitchEl = document.getElementById('bot-default-pitch');
    const valPitchEl = document.getElementById('val-default-pitch');
    if (pitchEl && valPitchEl) {
        pitchEl.value = config.pitch !== undefined ? config.pitch : 1;
        valPitchEl.textContent = parseFloat(pitchEl.value).toFixed(1);
    }
    
    const rateEl = document.getElementById('bot-default-rate');
    const valRateEl = document.getElementById('val-default-rate');
    if (rateEl && valRateEl) {
        rateEl.value = config.rate !== undefined ? config.rate : 1;
        valRateEl.textContent = parseFloat(rateEl.value).toFixed(1);
    }
    
    // Spotify and YouTube monetization sync
    const spotMonetizationEl = document.getElementById('spotify-monetization-active');
    const spotMonetizationCoinsEl = document.getElementById('spotify-monetization-coins');
    const ytMonetizationEl = document.getElementById('youtube-monetization-active');
    const ytMonetizationCoinsEl = document.getElementById('youtube-monetization-coins');
    
    if (spotMonetizationEl) spotMonetizationEl.checked = !!config.spotifyMonetizationEnabled;
    if (spotMonetizationCoinsEl) spotMonetizationCoinsEl.value = config.spotifyMinCoins || 5;
    if (ytMonetizationEl) ytMonetizationEl.checked = !!config.youtubeMonetizationEnabled;
    if (ytMonetizationCoinsEl) ytMonetizationCoinsEl.value = config.youtubeMinCoins || 5;
    
    // Toggle coins group visibility based on checkbox status
    const spotCoinsGroup = document.getElementById('spotify-monetization-coins-group');
    if (spotCoinsGroup && spotMonetizationEl) {
        spotCoinsGroup.style.display = spotMonetizationEl.checked ? 'block' : 'none';
    }
    const ytCoinsGroup = document.getElementById('youtube-monetization-coins-group');
    if (ytCoinsGroup && ytMonetizationEl) {
        ytCoinsGroup.style.display = ytMonetizationEl.checked ? 'block' : 'none';
    }

    // Sound alerts general active switch sync
    const soundAlertsActiveEl = document.getElementById('sound-alerts-active');
    if (soundAlertsActiveEl) soundAlertsActiveEl.checked = config.soundAlertsEnabled !== false;

    // Rules Table
    renderRulesTable(config.userVoices || []);
    
    // Render Sound Alerts Table
    renderSoundAlertsTable(config.soundAlerts || []);
}

// Render specific user voice rules table
function renderRulesTable(rules) {
    const tbody = document.getElementById('rules-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (rules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 15px;">No hay voces personalizadas.</td></tr>`;
        return;
    }
    
    rules.forEach((rule, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>@${rule.username}</strong></td>
            <td>
                <small style="color: var(--text-main); font-weight: 600;">${rule.voice ? rule.voice.substring(0, 25) : 'Voz por defecto'}</small>
                <small style="color: var(--text-muted)">Vol: ${Math.round(rule.volume * 100)}% | Tono: ${rule.pitch} | Vel: ${rule.rate}</small>
            </td>
            <td class="text-right">
                <button class="btn-delete" onclick="deleteUserRule(${index})">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
}

// Sync inputs to server
function sendUpdatedSettings() {
    if (!chatbotConfig) return;
    
    const prefixes = document.getElementById('bot-prefixes').value
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
        
    const bannedWords = document.getElementById('bot-banned-words').value
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0);
        
    const ignoreUserList = document.getElementById('bot-ignored-users').value
        .split(',')
        .map(u => u.trim().replace('@', '').toLowerCase())
        .filter(u => u.length > 0);

    const updated = {
        active: document.getElementById('bot-active').checked,
        playLocation: document.getElementById('bot-play-location').value,
        exclusiveTtsEnabled: document.getElementById('bot-exclusive-enabled').checked,
        exclusiveTtsUser: document.getElementById('bot-exclusive-user').value.trim().replace('@', ''),
        readUsername: document.getElementById('bot-read-username').checked,
        readPrefixRequired: document.getElementById('bot-prefix-required').checked,
        prefixes: prefixes,
        permission: document.getElementById('bot-permission').value,
        blockRareLanguages: document.getElementById('bot-block-rare-languages').checked,
        maxCharacters: parseInt(document.getElementById('bot-max-characters').value) || 150,
        bannedWords: bannedWords,
        bannedWordsAction: document.getElementById('bot-banned-action').value,
        ignoreUserList: ignoreUserList,
        ttsEngine: document.getElementById('bot-tts-engine').value,
        cloudVoiceName: document.getElementById('bot-cloud-voice').value,
        voiceName: document.getElementById('bot-default-voice').value,
        volume: parseFloat(document.getElementById('bot-default-volume').value),
        pitch: parseFloat(document.getElementById('bot-default-pitch').value),
        rate: parseFloat(document.getElementById('bot-default-rate').value),
        
        // Direct events read settings
        readFollowsEnabled: document.getElementById('bot-read-follows').checked,
        readSharesEnabled: document.getElementById('bot-read-shares').checked,
        readGiftsEnabled: document.getElementById('bot-read-gifts').checked,
        readLikesMilestoneEnabled: document.getElementById('bot-read-likes').checked,
        likesMilestoneValue: parseInt(document.getElementById('bot-likes-milestone').value) || 100,
        
        // New Settings fields
        tiktokUsername: document.getElementById('setup-tiktok-username').value.trim().replace('@', ''),
        autoConnect: document.getElementById('setup-auto-connect').checked,
        themeName: document.getElementById('setup-theme').value,
        spotifyClientId: document.getElementById('spotify-client-id').value.trim(),
        spotifyClientSecret: document.getElementById('spotify-client-secret').value.trim(),
        spotifyEnabled: document.getElementById('spotify-active').checked,
        spotifyTheme: document.getElementById('spotify-theme').value,
        spotifyPosition: document.getElementById('spotify-position').value,
        spotifyNeonColor: document.getElementById('spotify-neon-color').value,
        spotifyVinylDesign: document.getElementById('spotify-vinyl-design').value,
        spotifyVinylSpeed: document.getElementById('spotify-vinyl-speed').value,
        
        // Spotify interactive settings
        spotifyVolume: parseInt(document.getElementById('spotify-volume-slider').value) || 80,
        spotifyChatQueueEnabled: document.getElementById('spotify-chat-queue-enabled').checked,
        spotifyExplicitAllowed: document.getElementById('spotify-explicit-allowed').checked,
        spotifyPermission: document.getElementById('spotify-permission').value,
        spotifyCommandPrefix: document.getElementById('spotify-command-prefix').value.trim(),
        spotifyVoteSkipLimit: parseInt(document.getElementById('spotify-voteskip-limit').value) || 3,
        
        // YouTube interactive settings
        youtubeEnabled: document.getElementById('youtube-active').checked,
        youtubeVolume: parseInt(document.getElementById('youtube-volume-slider').value) || 80,
        youtubeChatQueueEnabled: document.getElementById('youtube-chat-queue-enabled').checked,
        youtubePermission: document.getElementById('youtube-permission').value,
        youtubeCommandPrefix: document.getElementById('youtube-command-prefix').value.trim(),
        youtubeVoteSkipLimit: parseInt(document.getElementById('youtube-voteskip-limit').value) || 3,
        
        // Music Request Monetization settings
        spotifyMonetizationEnabled: document.getElementById('spotify-monetization-active').checked,
        spotifyMinCoins: parseInt(document.getElementById('spotify-monetization-coins').value) || 5,
        youtubeMonetizationEnabled: document.getElementById('youtube-monetization-active').checked,
        youtubeMinCoins: parseInt(document.getElementById('youtube-monetization-coins').value) || 5,
        
        // Sound alerts setting
        soundAlertsEnabled: document.getElementById('sound-alerts-active').checked,
        
        // Custom events / formatting
        filterEmojisFromNames: document.getElementById('bot-filter-emojis-names').checked,
        thankYouSharePhrase: document.getElementById('bot-thank-share-phrase').value,
        thankYouFollowPhrase: document.getElementById('bot-thank-follow-phrase').value,
        thankYouGiftPhrase: document.getElementById('bot-thank-gift-phrase').value,

        // Metas, Ruleta, Overlays
        wheelEnabled: document.getElementById('wheel-enabled').checked,
        wheelTriggerGift: document.getElementById('wheel-trigger-gift').value,
        wheelTriggerCoins: parseInt(document.getElementById('wheel-trigger-coins').value) || 10,
        overlayMusicQueueEnabled: document.getElementById('overlay-music-enabled').checked,
        overlayChatEnabled: document.getElementById('overlay-chat-enabled').checked,
        overlayChatFilterPremium: document.getElementById('overlay-chat-premium').checked,
        ttsEffectsEnabled: document.getElementById('tts-effects-enabled').checked
    };
    
    socket.emit('update_chatbot_settings', updated);
}

// Event Listeners for inputs changing
const inputsToWatch = [
    'bot-active', 'bot-play-location', 'bot-read-username', 'bot-filter-emojis-names',
    'bot-prefix-required', 'bot-permission', 'bot-block-rare-languages', 
    'bot-banned-action', 'bot-default-voice', 'bot-tts-engine', 'bot-cloud-voice',
    'bot-exclusive-enabled',
    'bot-read-follows', 'bot-read-shares', 'bot-read-gifts', 'bot-read-likes',
    'setup-auto-connect', 'setup-theme', 'spotify-active', 'spotify-theme', 'spotify-position',
    'spotify-chat-queue-enabled', 'spotify-explicit-allowed', 'spotify-permission',
    'spotify-neon-color', 'spotify-vinyl-design', 'spotify-vinyl-speed',
    'spotify-monetization-active',
    'youtube-active', 'youtube-chat-queue-enabled', 'youtube-permission',
    'youtube-command-prefix', 'youtube-voteskip-limit', 'youtube-monetization-active',
    'sound-alerts-active',
    'wheel-enabled', 'overlay-music-enabled', 'overlay-chat-enabled', 'overlay-chat-premium', 'tts-effects-enabled'
];

inputsToWatch.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => {
            if (id === 'bot-tts-engine') {
                const engine = el.value;
                if (engine === 'cloud') {
                    document.getElementById('container-cloud-voice').style.display = 'block';
                    document.getElementById('container-local-voice').style.display = 'none';
                } else {
                    document.getElementById('container-cloud-voice').style.display = 'none';
                    document.getElementById('container-local-voice').style.display = 'block';
                }
            }
            if (id === 'spotify-theme') {
                updateMockupThemeClass(el.value);
            }
            if (id === 'spotify-monetization-active') {
                const group = document.getElementById('spotify-monetization-coins-group');
                if (group) group.style.display = el.checked ? 'block' : 'none';
            }
            if (id === 'youtube-monetization-active') {
                const group = document.getElementById('youtube-monetization-coins-group');
                if (group) group.style.display = el.checked ? 'block' : 'none';
            }
            sendUpdatedSettings();
        });
    }
});

// For text inputs and textareas, update on 'blur' to avoid socket spam on typing
const textInputsToWatch = [
    'bot-prefixes', 'bot-max-characters', 'bot-banned-words', 'bot-ignored-users',
    'bot-exclusive-user', 'bot-likes-milestone',
    'bot-thank-share-phrase', 'bot-thank-follow-phrase', 'bot-thank-gift-phrase',
    'setup-tiktok-username', 'spotify-client-id', 'spotify-client-secret',
    'spotify-command-prefix', 'spotify-voteskip-limit',
    'spotify-monetization-coins', 'youtube-monetization-coins',
    'wheel-trigger-gift', 'wheel-trigger-coins'
];
textInputsToWatch.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('blur', sendUpdatedSettings);
});

// Chatbot local Save button click event handler
const btnSaveChatbot = document.getElementById('btn-save-chatbot-settings');
if (btnSaveChatbot) {
    btnSaveChatbot.addEventListener('click', () => {
        sendUpdatedSettings();
        showToast('¡Configuración guardada y actualizada con éxito!', 'success');
        const originalText = btnSaveChatbot.innerHTML;
        btnSaveChatbot.innerHTML = '<i data-lucide="check"></i> ¡Guardado!';
        btnSaveChatbot.style.background = 'var(--accent-green, #10b981)';
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
            btnSaveChatbot.innerHTML = originalText;
            btnSaveChatbot.style.background = 'linear-gradient(135deg, #a100ff 0%, #7b00d6 100%)';
            if (window.lucide) window.lucide.createIcons();
        }, 1500);
    });
}

// Floating Save button click event handler
const floatingSaveBtn = document.getElementById('floating-save-btn');
if (floatingSaveBtn) {
    floatingSaveBtn.addEventListener('click', () => {
        sendUpdatedSettings();
        showToast('¡Configuración guardada y actualizada con éxito!', 'success');
    });
}

// Slider feedback & change
const volEl = document.getElementById('bot-default-volume');
if (volEl) {
    volEl.addEventListener('input', (e) => {
        document.getElementById('val-default-volume').textContent = `${Math.round(e.target.value * 100)}%`;
    });
    volEl.addEventListener('change', sendUpdatedSettings);
}

const spotVolEl = document.getElementById('spotify-volume-slider');
if (spotVolEl) {
    spotVolEl.addEventListener('input', (e) => {
        document.getElementById('spotify-volume-val').textContent = `${e.target.value}%`;
    });
    spotVolEl.addEventListener('change', sendUpdatedSettings);
}

const pitchEl = document.getElementById('bot-default-pitch');
if (pitchEl) {
    pitchEl.addEventListener('input', (e) => {
        document.getElementById('val-default-pitch').textContent = parseFloat(e.target.value).toFixed(1);
    });
    pitchEl.addEventListener('change', sendUpdatedSettings);
}

const rateEl = document.getElementById('bot-default-rate');
if (rateEl) {
    rateEl.addEventListener('input', (e) => {
        document.getElementById('val-default-rate').textContent = parseFloat(e.target.value).toFixed(1);
    });
    rateEl.addEventListener('change', sendUpdatedSettings);
}

// Add rule sliders feedback
const rVol = document.getElementById('rule-volume');
if (rVol) {
    rVol.addEventListener('input', (e) => {
        document.getElementById('val-rule-volume').textContent = `${Math.round(e.target.value * 100)}%`;
    });
}
const rPitch = document.getElementById('rule-pitch');
if (rPitch) {
    rPitch.addEventListener('input', (e) => {
        document.getElementById('val-rule-pitch').textContent = parseFloat(e.target.value).toFixed(1);
    });
}
const rRate = document.getElementById('rule-rate');
if (rRate) {
    rRate.addEventListener('input', (e) => {
        document.getElementById('val-rule-rate').textContent = parseFloat(e.target.value).toFixed(1);
    });
}

// Test Default Voice Button
const testBtn = document.getElementById('btn-test-default-voice');
if (testBtn) {
    testBtn.addEventListener('click', () => {
        const text = document.getElementById('bot-test-text').value.trim();
        if (!text) return;
        
        const engine = document.getElementById('bot-tts-engine').value;
        const volume = parseFloat(document.getElementById('bot-default-volume').value);
        const pitch = parseFloat(document.getElementById('bot-default-pitch').value);
        const rate = parseFloat(document.getElementById('bot-default-rate').value);
        
        if (engine === 'cloud') {
            const voiceName = document.getElementById('bot-cloud-voice').value;
            socket.emit('test_cloud_tts', { text, voiceName, pitch, rate });
        } else {
            const voiceName = document.getElementById('bot-default-voice').value;
            speakText(text, voiceName, volume, pitch, rate);
        }
    });
}

// Add Voice Rule for User
const addRuleBtn = document.getElementById('btn-add-user-rule');
if (addRuleBtn) {
    addRuleBtn.addEventListener('click', () => {
        const usernameInput = document.getElementById('rule-username');
        const username = usernameInput.value.trim().replace('@', '').toLowerCase();
        
        if (!username) {
            alert('Escribe un nombre de usuario de TikTok.');
            return;
        }
        
        const voice = document.getElementById('rule-voice').value;
        const volume = parseFloat(document.getElementById('rule-volume').value);
        const pitch = parseFloat(document.getElementById('rule-pitch').value);
        const rate = parseFloat(document.getElementById('rule-rate').value);
        
        if (!chatbotConfig) return;
        
        const rules = [...(chatbotConfig.userVoices || [])];
        
        // Check if rule already exists for user
        const existingIndex = rules.findIndex(r => r.username.toLowerCase() === username);
        if (existingIndex > -1) {
            rules[existingIndex] = { username, voice, volume, pitch, rate };
        } else {
            rules.push({ username, voice, volume, pitch, rate });
        }
        
        socket.emit('update_chatbot_settings', { userVoices: rules });
        
        // Reset form username field
        usernameInput.value = '';
    });
}

// Delete specific voice rule (global scope helper)
window.deleteUserRule = function(index) {
    if (!chatbotConfig || !chatbotConfig.userVoices) return;
    const rules = [...chatbotConfig.userVoices];
    rules.splice(index, 1);
    socket.emit('update_chatbot_settings', { userVoices: rules });
};

// ==========================================
// UNIFIED TTS AUDIO QUEUE
// ==========================================
const ttsQueue = [];
let isPlayingTts = false;
let currentAudioTts = null;

function stopAllTTS() {
    ttsQueue.length = 0; // Clear the queue array
    isPlayingTts = false;
    if (currentAudioTts) {
        try {
            currentAudioTts.pause();
            currentAudioTts.src = "";
        } catch (e) {}
        currentAudioTts = null;
    }
    if (window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
        } catch (e) {}
    }
}

function queueCloudTTS(base64Audio, playLocation) {
    ttsQueue.push({
        type: 'cloud',
        base64Audio,
        playLocation
    });
    // Cap queue to max 3 waiting items to prevent massive backlog (user request #1)
    while (ttsQueue.length > 3) {
        ttsQueue.shift();
    }
    processTtsQueue();
}

function queueLocalTTS(text, voiceName, volume, pitch, rate) {
    ttsQueue.push({
        type: 'local',
        text,
        voiceName,
        volume,
        pitch,
        rate
    });
    // Cap queue to max 3 waiting items to prevent massive backlog (user request #1)
    while (ttsQueue.length > 3) {
        ttsQueue.shift();
    }
    processTtsQueue();
}

function processTtsQueue() {
    if (isPlayingTts || ttsQueue.length === 0) return;
    
    isPlayingTts = true;
    const item = ttsQueue.shift();
    
    // Auto speed-up (rate-adjust) if queue is getting overloaded (more than 4 items)
    let rateMultiplier = 1.0;
    if (ttsQueue.length >= 4) {
        rateMultiplier = 1.3; // 30% faster to catch up
    }
    
    if (item.type === 'cloud') {
        try {
            currentAudioTts = new Audio("data:audio/mp3;base64," + item.base64Audio);
            
            if (rateMultiplier > 1.0) {
                currentAudioTts.playbackRate = rateMultiplier;
            }
            
            currentAudioTts.onended = () => {
                isPlayingTts = false;
                currentAudioTts = null;
                setTimeout(processTtsQueue, 400); // 400ms cooldown gap
            };
            
            currentAudioTts.onerror = (err) => {
                console.error('Audio playback error:', err);
                isPlayingTts = false;
                currentAudioTts = null;
                setTimeout(processTtsQueue, 100);
            };
            
            currentAudioTts.play().catch(err => {
                console.error('Audio play failed:', err);
                isPlayingTts = false;
                currentAudioTts = null;
                setTimeout(processTtsQueue, 100);
            });
        } catch (err) {
            console.error('Audio setup error:', err);
            isPlayingTts = false;
            currentAudioTts = null;
            setTimeout(processTtsQueue, 100);
        }
    } else {
        // Local synthesis
        if (!window.speechSynthesis) {
            isPlayingTts = false;
            return;
        }
        
        const utterance = new SpeechSynthesisUtterance(item.text);
        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.name === item.voiceName);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        
        utterance.volume = parseFloat(item.volume);
        utterance.pitch = parseFloat(item.pitch);
        utterance.rate = parseFloat(item.rate) * rateMultiplier;
        
        utterance.onend = () => {
            isPlayingTts = false;
            setTimeout(processTtsQueue, 400);
        };
        
        utterance.onerror = (err) => {
            console.error('SpeechSynthesis error:', err);
            isPlayingTts = false;
            setTimeout(processTtsQueue, 100);
        };
        
        window.speechSynthesis.speak(utterance);
    }
}

// Handle playing Cloud TTS audio sent from the server
socket.on('play_tts_audio', (data) => {
    const { base64Audio, playLocation } = data;
    
    // Check play location
    const isPanel = window.location.pathname === '/' || !window.location.pathname.includes('overlay');
    if (playLocation === 'overlay' && isPanel) return;
    if (playLocation === 'panel' && !isPanel) return;
    
    queueCloudTTS(base64Audio, playLocation);
});

// Handle playing sound alerts
socket.on('play_sound_alert', (data) => {
    const { soundUrl, volume } = data;
    
    // Check play location
    if (chatbotConfig.playLocation !== 'panel' && chatbotConfig.playLocation !== 'both') return;
    
    const audio = new Audio(soundUrl);
    audio.volume = (volume !== undefined ? volume : 100) / 100;
    audio.play().catch(err => {
        console.error('Failed to play sound alert in panel:', err);
    });
});

// Handle speaking in Panel if destination matches
socket.on('tiktok_event_raw', (payload) => {
    const { eventType, data } = payload;
    if (eventType === 'chat') {
        processAndSpeak(data);
    }
});

// Text-to-Speech Core Logic
function processAndSpeak(data) {
    if (!chatbotConfig) return;
    if (chatbotConfig.ttsEngine === 'cloud') return; // Handled in backend by play_tts_audio!
    
    const uniqueId = (data.uniqueId || '').toLowerCase();
    const isExclusiveUser = chatbotConfig.exclusiveTtsEnabled && 
                            chatbotConfig.exclusiveTtsUser && 
                            uniqueId === chatbotConfig.exclusiveTtsUser.toLowerCase().trim();

    // If chatbot is inactive, ONLY allow exclusive user (if enabled)
    if (!chatbotConfig.active) {
        if (!isExclusiveUser) return;
    }

    // If exclusive user mode is enabled, ONLY read from this user
    if (chatbotConfig.exclusiveTtsEnabled) {
        if (!isExclusiveUser) return;
    }
    
    // Check play location
    const isPanel = window.location.pathname === '/' || !window.location.pathname.includes('overlay');
    if (chatbotConfig.playLocation === 'overlay' && isPanel) return;
    if (chatbotConfig.playLocation === 'panel' && !isPanel) return;
    
    const nickname = data.nickname || data.uniqueId || 'Usuario';
    let comment = data.comment || '';
    
    // 1. Blacklist check
    const blacklist = (chatbotConfig.ignoreUserList || []).map(u => u.toLowerCase().trim());
    if (blacklist.includes(uniqueId)) return;
    
    // 2. Permission check
    const userRole = chatbotConfig.permission || 'all';
    const isSubscriber = data.isSubscriber || (data.userIdentity && data.userIdentity.isSubscriberOfAnchor);
    const isModerator = data.isModerator || (data.userIdentity && data.userIdentity.isModeratorOfAnchor);
    const isAnchor = data.isAnchor || (data.userIdentity && data.userIdentity.isAnchor);
    
    if (userRole === 'mods' && !isModerator && !isAnchor) return;
    if (userRole === 'subs' && !isSubscriber && !isModerator && !isAnchor) return;
    
    // 3. Prefix command check
    if (chatbotConfig.readPrefixRequired) {
        const prefixes = chatbotConfig.prefixes || ['.', '/'];
        const hasPrefix = prefixes.some(p => comment.trim().startsWith(p));
        if (!hasPrefix) return;
        
        // Strip prefix
        for (const p of prefixes) {
            if (comment.trim().startsWith(p)) {
                comment = comment.trim().substring(p.length).trim();
                break;
            }
        }
    }
    
    // 4. Character filtering (block rare languages)
    if (chatbotConfig.blockRareLanguages) {
        // Blocks Chinese, Arabic, Hindi, Cyrillic scripts
        const disallowedRegex = /[\u0900-\u097F\u0600-\u06FF\u0400-\u04FF\u4e00-\u9fa5]/;
        if (disallowedRegex.test(comment)) {
            return;
        }
    }
    
    // 5. Clean emojis
    comment = comment.replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]/gu, '');
    
    if (!comment.trim()) return;
    
    // 6. Custom Blocked Words check
    const banned = (chatbotConfig.bannedWords || []).map(w => w.toLowerCase().trim()).filter(w => w.length > 0);
    for (const word of banned) {
        if (comment.toLowerCase().includes(word)) {
            if (chatbotConfig.bannedWordsAction === 'skip') {
                return;
            } else {
                const censorRegex = new RegExp(word, 'gi');
                comment = comment.replace(censorRegex, '***');
            }
        }
    }
    
    // 7. Limit length
    const maxChars = parseInt(chatbotConfig.maxCharacters ?? 150);
    if (comment.length > maxChars) {
        comment = comment.substring(0, maxChars) + '...';
    }
    
    // 8. Username reading format
    let textToSpeak = comment;
    if (chatbotConfig.readUsername) {
        textToSpeak = `${nickname} dice: ${comment}`;
    }
    
    // 9. Determine voice settings
    const userVoiceRule = (chatbotConfig.userVoices || []).find(v => v.username.toLowerCase() === uniqueId);
    let voiceName = chatbotConfig.voiceName;
    let volume = chatbotConfig.volume ?? 1;
    let pitch = chatbotConfig.pitch ?? 1;
    let rate = chatbotConfig.rate ?? 1;
    
    if (userVoiceRule) {
        voiceName = userVoiceRule.voice;
        volume = userVoiceRule.volume ?? 1;
        pitch = userVoiceRule.pitch ?? 1;
        rate = userVoiceRule.rate ?? 1;
    }
    
    queueLocalTTS(textToSpeak, voiceName, volume, pitch, rate);
}

// ==========================================
// SPOTIFY PLAYER MOCKUP & SETUP ADJUSTMENTS
// ==========================================

// Mockup Theme Switcher helper
function updateMockupThemeClass(themeName) {
    const player = document.getElementById('mockup-player');
    if (!player) return;
    
    player.classList.remove(
        'theme-apple-music', 
        'theme-spotify-classic', 
        'theme-neon-gradient', 
        'theme-transparent',
        'theme-coquette-hearts',
        'theme-anime-luffy',
        'theme-naya-chibi',
        'theme-anime-gojo',
        'theme-majo-spider'
    );
    
    // Add new theme class
    player.classList.add(`theme-${themeName}`);
}

// Copy Buttons listeners
const setupCopyUrlBtn = document.getElementById('btn-copy-obs-url');
if (setupCopyUrlBtn) {
    setupCopyUrlBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-overlay-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = setupCopyUrlBtn.textContent;
                setupCopyUrlBtn.textContent = '¡Copiado!';
                setTimeout(() => setupCopyUrlBtn.textContent = originalText, 1500);
            });
        }
    });
}

const spotifyCopyRedirectBtn = document.getElementById('btn-copy-redirect');
if (spotifyCopyRedirectBtn) {
    spotifyCopyRedirectBtn.addEventListener('click', () => {
        const input = document.getElementById('spotify-redirect-uri');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = spotifyCopyRedirectBtn.textContent;
                spotifyCopyRedirectBtn.textContent = '¡Copiado!';
                setTimeout(() => spotifyCopyRedirectBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsMusicBtn = document.getElementById('btn-copy-obs-music');
if (copyObsMusicBtn) {
    copyObsMusicBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-music-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsMusicBtn.textContent;
                copyObsMusicBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsMusicBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsYoutubeBtn = document.getElementById('btn-copy-obs-youtube');
if (copyObsYoutubeBtn) {
    copyObsYoutubeBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-youtube-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsYoutubeBtn.textContent;
                copyObsYoutubeBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsYoutubeBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsMusicHorizontalBtn = document.getElementById('btn-copy-obs-music-horizontal');
if (copyObsMusicHorizontalBtn) {
    copyObsMusicHorizontalBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-music-horizontal-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsMusicHorizontalBtn.textContent;
                copyObsMusicHorizontalBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsMusicHorizontalBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsYoutubeHorizontalBtn = document.getElementById('btn-copy-obs-youtube-horizontal');
if (copyObsYoutubeHorizontalBtn) {
    copyObsYoutubeHorizontalBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-youtube-horizontal-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsYoutubeHorizontalBtn.textContent;
                copyObsYoutubeHorizontalBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsYoutubeHorizontalBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsDonorsBtn = document.getElementById('btn-copy-obs-donors');
if (copyObsDonorsBtn) {
    copyObsDonorsBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-donors-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsDonorsBtn.textContent;
                copyObsDonorsBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsDonorsBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsTapsBtn = document.getElementById('btn-copy-obs-taps');
if (copyObsTapsBtn) {
    copyObsTapsBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-taps-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsTapsBtn.textContent;
                copyObsTapsBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsTapsBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsMvpBtn = document.getElementById('btn-copy-obs-mvp');
if (copyObsMvpBtn) {
    copyObsMvpBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-mvp-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsMvpBtn.textContent;
                copyObsMvpBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsMvpBtn.textContent = originalText, 1500);
            });
        }
    });
}

// Manual Updates Check Trigger
const checkUpdatesBtn = document.getElementById('btn-check-updates');
if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', () => {
        const originalText = checkUpdatesBtn.innerHTML;
        checkUpdatesBtn.disabled = true;
        checkUpdatesBtn.innerHTML = '🔍 Buscando...';
        
        socket.emit('check_for_updates');
        
        setTimeout(() => {
            checkUpdatesBtn.disabled = false;
            checkUpdatesBtn.innerHTML = originalText;
        }, 3000);
    });
}

// Spotify OAuth buttons
const btnVincularSpotify = document.getElementById('btn-vincular-spotify');
if (btnVincularSpotify) {
    btnVincularSpotify.addEventListener('click', () => {
        window.open(window.location.origin + '/spotify-login', 'SpotifyLogin', 'width=600,height=800,scrollbars=yes');
    });
}

const btnDesvincularSpotify = document.getElementById('btn-desvincular-spotify');
if (btnDesvincularSpotify) {
    btnDesvincularSpotify.addEventListener('click', () => {
        socket.emit('disconnect_spotify');
    });
}

// Track Pool for mockup simulation
const mockupTracks = [
    {
        title: "Late Night Streams",
        artist: "Naya Vibe",
        cover: "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22200%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%25232d0c2e%22%2F%3E%3Cpath%20d%3D%22M50%20100a50%2050%200%201%200%20100%200%2050%2050%200%201%200-100%200%22%20fill%3D%22none%22%20stroke%3D%22%2523d900ff%22%20stroke-width%3D%2210%22%2F%3E%3Ccircle%20cx%3D%22100%22%20cy%3D%22100%22%20r%3D%2215%22%20fill%3D%22%252300f2fe%22%2F%3E%3C%2Fsvg%3E",
        bgGradient: "linear-gradient(135deg, #d900ff, #3d004a)",
        duration: 192 // in seconds (3:12)
    },
    {
        title: "Chill Cafe Gaming",
        artist: "Lofi Beats Collective",
        cover: "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22200%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%25231e3d2f%22%2F%3E%3Cpath%20d%3D%22M50%20100a50%2050%200%201%200%20100%200%2050%2050%200%201%200-100%200%22%20fill%3D%22none%22%20stroke%3D%22%25231DB954%22%20stroke-width%3D%2210%22%2F%3E%3Ccircle%20cx%3D%22100%22%20cy%3D%22100%22%20r%3D%2215%22%20fill%3D%22%2523cca43b%22%2F%3E%3C%2Fsvg%3E",
        bgGradient: "linear-gradient(135deg, #1DB954, #121212)",
        duration: 168 // (2:48)
    },
    {
        title: "Sunset Boulevard",
        artist: "Retrowave Pilot",
        cover: "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22200%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%25233c0919%22%2F%3E%3Cpath%20d%3D%22M50%20100a50%2050%200%201%200%20100%200%2050%2050%200%201%200-100%200%22%20fill%3D%22none%22%20stroke%3D%22%2523ff3366%22%20stroke-width%3D%2210%22%2F%3E%3Ccircle%20cx%3D%22100%22%20cy%3D%22100%22%20r%3D%2215%22%20fill%3D%22%2523ffdd55%22%2F%3E%3C%2Fsvg%3E",
        bgGradient: "linear-gradient(135deg, #ff3366, #ffdd55)",
        duration: 215 // (3:35)
    }
];

let currentTrackIndex = 0;
let mockupIsPlaying = false;
let mockupTimeElapsed = 0;
let mockupInterval = null;

function loadMockupTrack(index) {
    const track = mockupTracks[index];
    
    // Set text elements
    const titleEl = document.getElementById('mockup-title');
    const artistEl = document.getElementById('mockup-artist');
    if (titleEl) titleEl.textContent = track.title;
    
    let artistName = track.artist;
    if (index === 0) {
        const theme = (chatbotConfig && chatbotConfig.themeName) || 'neutral';
        if (theme === 'majo') {
            artistName = 'Majo Vibe';
        } else if (theme === 'naya') {
            artistName = 'Naya Vibe';
        } else {
            artistName = 'Live Vibe';
        }
    }
    if (artistEl) artistEl.textContent = artistName;
    
    // Set artwork
    const imgEl = document.getElementById('mockup-album-img');
    const bgArtEl = document.getElementById('mockup-bg-art');
    if (imgEl) {
        if (index === 0 && ((chatbotConfig && chatbotConfig.themeName) || 'neutral') === 'naya') {
            imgEl.src = 'assets/naya-logo.png';
        } else {
            imgEl.src = track.cover;
        }
    }
    if (bgArtEl) {
        if (index === 0 && ((chatbotConfig && chatbotConfig.themeName) || 'neutral') === 'naya') {
            bgArtEl.style.background = 'linear-gradient(135deg, #ff69b4, #2a0b16)';
        } else {
            bgArtEl.style.background = track.bgGradient;
        }
    }
    
    // Time & Progress reset
    mockupTimeElapsed = 0;
    updateMockupProgressUI();
}

function updateMockupProgressUI() {
    const track = mockupTracks[currentTrackIndex];
    const fillEl = document.getElementById('mockup-progress-fill');
    const currentEl = document.getElementById('mockup-time-current');
    const totalEl = document.getElementById('mockup-time-total');
    
    if (fillEl) {
        const percent = (mockupTimeElapsed / track.duration) * 100;
        fillEl.style.width = `${percent}%`;
    }
    
    if (currentEl) {
        currentEl.textContent = formatTime(mockupTimeElapsed);
    }
    
    if (totalEl) {
        totalEl.textContent = formatTime(track.duration);
    }
}

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function toggleMockupPlayback() {
    mockupIsPlaying = !mockupIsPlaying;
    const playerEl = document.getElementById('mockup-player');
    const playIconEl = document.getElementById('mockup-play-icon');
    
    if (!playerEl || !playIconEl) return;
    
    if (mockupIsPlaying) {
        playerEl.classList.add('is-playing');
        playIconEl.setAttribute('data-lucide', 'pause');
        
        // Start progress timer
        if (mockupInterval) clearInterval(mockupInterval);
        mockupInterval = setInterval(() => {
            const track = mockupTracks[currentTrackIndex];
            mockupTimeElapsed++;
            
            if (mockupTimeElapsed >= track.duration) {
                // Next track on end
                mockupTimeElapsed = 0;
                currentTrackIndex = (currentTrackIndex + 1) % mockupTracks.length;
                loadMockupTrack(currentTrackIndex);
            } else {
                updateMockupProgressUI();
            }
        }, 1000);
    } else {
        playerEl.classList.remove('is-playing');
        playIconEl.setAttribute('data-lucide', 'play');
        
        if (mockupInterval) {
            clearInterval(mockupInterval);
            mockupInterval = null;
        }
    }
    
    lucide.createIcons();
}

// Mockup Play/Pause Listener
const mockupPlayBtn = document.getElementById('mockup-btn-play');
if (mockupPlayBtn) {
    mockupPlayBtn.addEventListener('click', () => {
        if (chatbotConfig && chatbotConfig.spotifyConnected && chatbotConfig.spotifyEnabled) {
            socket.emit('spotify_toggle_play');
        } else {
            toggleMockupPlayback();
        }
    });
}

// Mockup Prev Button
const mockupPrevBtn = document.getElementById('mockup-btn-prev');
if (mockupPrevBtn) {
    mockupPrevBtn.addEventListener('click', () => {
        if (chatbotConfig && chatbotConfig.spotifyConnected && chatbotConfig.spotifyEnabled) {
            socket.emit('spotify_prev');
        } else {
            mockupTimeElapsed = 0;
            currentTrackIndex = (currentTrackIndex - 1 + mockupTracks.length) % mockupTracks.length;
            loadMockupTrack(currentTrackIndex);
            updateMockupProgressUI();
        }
    });
}

// Mockup Next Button
const mockupNextBtn = document.getElementById('mockup-btn-next');
if (mockupNextBtn) {
    mockupNextBtn.addEventListener('click', () => {
        if (chatbotConfig && chatbotConfig.spotifyConnected && chatbotConfig.spotifyEnabled) {
            socket.emit('skip_spotify_track');
        } else {
            mockupTimeElapsed = 0;
            currentTrackIndex = (currentTrackIndex + 1) % mockupTracks.length;
            loadMockupTrack(currentTrackIndex);
            updateMockupProgressUI();
        }
    });
}

// Click to scrub progress bar mockup
const mockupScrubArea = document.getElementById('mockup-progress-click-area');
if (mockupScrubArea) {
    mockupScrubArea.addEventListener('click', (e) => {
        const rect = mockupScrubArea.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const track = mockupTracks[currentTrackIndex];
        
        const pct = Math.max(0, Math.min(1, clickX / width));
        mockupTimeElapsed = Math.floor(pct * track.duration);
        updateMockupProgressUI();
    });
}

// Initialize Mockup Track
loadMockupTrack(0);

// Local Network IP listener
socket.on('local_ips', (ips) => {
    const localIpText = document.getElementById('local-ip-text');
    const localIpContainer = document.getElementById('local-ip-container');
    if (!localIpContainer) return;

    if (!ips || ips.length === 0) {
        if (localIpText) localIpText.textContent = 'No se detectó dirección IP local';
        return;
    }

    localIpContainer.innerHTML = '';
    ips.forEach(ip => {
        const url = `http://${ip}:3000`;
        const div = document.createElement('div');
        div.style = "background: rgba(0,255,0,0.05); border: 1px dashed rgba(0,255,0,0.3); border-radius: 8px; padding: 12px; display: flex; align-items: center; gap: 15px; margin-bottom: 8px;";
        div.innerHTML = `
            <div style="background: rgba(0,255,0,0.1); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #00ff00;">
                <i data-lucide="wifi"></i>
            </div>
            <div style="flex-grow: 1;">
                <small style="color: var(--text-muted); display: block; text-transform: uppercase; font-size: 10px; font-weight: 800; letter-spacing: 0.5px;">URL en red local</small>
                <span style="font-family: monospace; font-size: 14px; font-weight: bold; color: #00ff00;">${url}</span>
            </div>
            <button class="btn secondary small btn-copy-ip-url" data-url="${url}" style="padding: 0 10px; height: 30px;">Copiar</button>
        `;
        localIpContainer.appendChild(div);
    });

    document.querySelectorAll('.btn-copy-ip-url').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-url');
            navigator.clipboard.writeText(url).then(() => {
                const prevText = btn.textContent;
                btn.textContent = '¡Copiado!';
                setTimeout(() => btn.textContent = prevText, 1500);
            });
        });
    });

    lucide.createIcons();
});

// Rankings update listener
socket.on('rankings_updated', (rankings) => {
    updateRankingTable('ranking-gifts-body', rankings.gifts, 'monedas');
    updateRankingTable('ranking-likes-body', rankings.likes, 'likes');
    updateRankingTable('ranking-mvp-body', rankings.mvp, 'puntos');
});

function updateRankingTable(elementId, dataList, unitLabel) {
    const body = document.getElementById(elementId);
    if (!body) return;
    
    if (!dataList || dataList.length === 0) {
        body.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--text-muted); padding: 20px;">Esperando datos de la transmisión...</td></tr>`;
        return;
    }
    
    body.innerHTML = '';
    dataList.forEach((user, index) => {
        const row = document.createElement('tr');
        
        let positionBadge = `${index + 1}.`;
        if (index === 0) positionBadge = '🥇';
        else if (index === 1) positionBadge = '🥈';
        else if (index === 2) positionBadge = '🥉';
        
        const boldStyle = index < 3 ? 'font-weight: bold; color: var(--text-main);' : 'color: var(--text-muted);';
        
        row.innerHTML = `
            <td style="font-size: 16px; width: 60px; vertical-align: middle;">${positionBadge}</td>
            <td style="${boldStyle} vertical-align: middle;">${escapeHtml(user.nickname)} <small style="color: var(--text-muted); display: block; font-size: 10px;">@${escapeHtml(user.username)}</small></td>
            <td class="text-right" style="font-weight: bold; font-family: monospace; font-size: 14px; vertical-align: middle;">${user.count.toLocaleString()}</td>
        `;
        body.appendChild(row);
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Listen to actual Spotify playback for live preview mockup inside the control panel
socket.on('spotify_track', (track) => {
    // If not connected to Spotify, ignore (keep manual mockup functioning)
    if (!chatbotConfig || !chatbotConfig.spotifyConnected || !chatbotConfig.spotifyEnabled) return;
    
    // Update live mockup player UI in real-time
    const titleEl = document.getElementById('mockup-title');
    const artistEl = document.getElementById('mockup-artist');
    const imgEl = document.getElementById('mockup-album-img');
    const bgArtEl = document.getElementById('mockup-bg-art');
    const playerEl = document.getElementById('mockup-player');
    const playIconEl = document.getElementById('mockup-play-icon');
    const fillEl = document.getElementById('mockup-progress-fill');
    const currentEl = document.getElementById('mockup-time-current');
    const totalEl = document.getElementById('mockup-time-total');
    
    if (track && track.title) {
        if (titleEl) titleEl.textContent = track.title;
        if (artistEl) artistEl.textContent = track.artist;
        if (imgEl && track.albumArt) imgEl.src = track.albumArt;
        if (bgArtEl && track.albumArt) {
            bgArtEl.style.backgroundImage = `url('${track.albumArt}')`;
            bgArtEl.style.backgroundSize = 'cover';
        }
        
        if (track.isPlaying) {
            if (playerEl) playerEl.classList.add('is-playing');
            if (playIconEl) playIconEl.setAttribute('data-lucide', 'pause');
        } else {
            if (playerEl) playerEl.classList.remove('is-playing');
            if (playIconEl) playIconEl.setAttribute('data-lucide', 'play');
        }
        
        // Progress display
        if (fillEl && track.durationMs) {
            const percent = (track.progressMs / track.durationMs) * 100;
            fillEl.style.width = `${percent}%`;
        }
        if (currentEl && track.progressMs) {
            currentEl.textContent = formatTime(track.progressMs / 1000);
        }
        if (totalEl && track.durationMs) {
            totalEl.textContent = formatTime(track.durationMs / 1000);
        }
        
        lucide.createIcons();
    }
});

// ==========================================
// SPOTIFY QUEUE UI RENDERER
// ==========================================
socket.on('spotify_queue_updated', (queue) => {
    renderSpotifyQueue(queue);
});

function renderSpotifyQueue(queue) {
    const tbody = document.getElementById('spotify-queue-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!queue || queue.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px 15px;">
                    La cola de reproducción está vacía.
                </td>
            </tr>
        `;
        return;
    }
    
    queue.forEach((track, index) => {
        const tr = document.createElement('tr');
        const albumArtSrc = track.albumArt || 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%2523222%22%2F%3E%3C%2Fsvg%3E';
        
        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${albumArtSrc}" class="queue-thumb" alt="Cover">
                    <div class="track-details">
                        <span class="track-title">${track.title}</span>
                        <span class="track-artist">${track.artist}</span>
                    </div>
                </div>
            </td>
            <td>
                <span class="requester-badge">@${track.requester}</span>
            </td>
            <td class="text-right">
                <div class="queue-actions">
                    <button class="btn-queue-play" onclick="playQueueItem(${index})" title="Reproducir ahora">
                        <i data-lucide="play" class="icon-small"></i>
                    </button>
                    <button class="btn-queue-delete" onclick="deleteQueueItem(${index})" title="Eliminar de la cola">
                        <i data-lucide="trash-2" class="icon-small"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
}

// Global click handlers
window.playQueueItem = function(index) {
    socket.emit('play_queue_item', index);
};

window.deleteQueueItem = function(index) {
    socket.emit('delete_queue_item', index);
};

// Bind clear queue button
const btnClearQueue = document.getElementById('btn-clear-spotify-queue');
if (btnClearQueue) {
    btnClearQueue.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que deseas vaciar toda la cola de reproducción?')) {
            socket.emit('clear_spotify_queue');
        }
    });
}

// Developer Settings Panel Authentication Lock
let isDeveloperAuthenticated = false;
const devDetails = document.getElementById('dev-settings-details');
const devPasswordModal = document.getElementById('dev-password-modal');
const devPasswordInput = document.getElementById('dev-password-input');
const devPasswordError = document.getElementById('dev-password-error');
const btnCloseDevModal = document.getElementById('btn-close-dev-modal');
const btnSubmitDevPassword = document.getElementById('btn-submit-dev-password');

if (devDetails) {
    const devSummary = devDetails.querySelector('summary');
    if (devSummary) {
        devSummary.addEventListener('click', (e) => {
            console.log('Clicked advanced API settings summary. Open state:', devDetails.open, 'Authenticated:', isDeveloperAuthenticated);
            if (!devDetails.open && !isDeveloperAuthenticated) {
                // If remote config unlocks developer settings, open directly without password
                if (latestRemoteConfig && (latestRemoteConfig.devSettingsUnlocked || latestRemoteConfig.disableDevPassword)) {
                    console.log('Access granted remotely via raw.githubusercontent config');
                    isDeveloperAuthenticated = true;
                    devDetails.open = true;
                    return;
                }
                
                // Show custom password modal instead of window.prompt (which fails in Electron)
                if (devPasswordModal) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Opening custom developer password modal...');
                    if (devPasswordInput) devPasswordInput.value = '';
                    if (devPasswordError) devPasswordError.style.display = 'none';
                    devPasswordModal.style.display = 'flex';
                    if (devPasswordInput) devPasswordInput.focus();
                } else {
                    console.warn('dev-password-modal element was not found in the DOM. Falling back to default browser behavior.');
                }
            }
        });
    }
}

// Handle Developer Password Modal interactions
if (btnCloseDevModal && devPasswordModal) {
    btnCloseDevModal.addEventListener('click', () => {
        devPasswordModal.style.display = 'none';
    });
    
    devPasswordModal.addEventListener('click', (e) => {
        if (e.target === devPasswordModal) {
            devPasswordModal.style.display = 'none';
        }
    });
}

function handleDevPasswordSubmit() {
    if (!devPasswordInput || !devDetails || !devPasswordModal) return;
    const password = devPasswordInput.value.trim();
    if (password === 'tavo_dev' || password === 'naya_dev') {
        isDeveloperAuthenticated = true;
        devDetails.open = true;
        devPasswordModal.style.display = 'none';
    } else {
        if (devPasswordError) devPasswordError.style.display = 'block';
    }
}

if (btnSubmitDevPassword) {
    btnSubmitDevPassword.addEventListener('click', handleDevPasswordSubmit);
}
if (devPasswordInput) {
    devPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleDevPasswordSubmit();
        }
    });
}

// ==========================================
// CUSTOM ANIMATIONS & MVP ENTRANCES LOGIC
// ==========================================

let customAnimations = [];
let mvps = [];

// Load custom animations from API
async function loadCustomAnimations() {
    try {
        const response = await fetch('/api/custom-animations');
        customAnimations = await response.json();
        renderCustomAnimationsList();
        populateMvpAnimationsDropdown();
    } catch (err) {
        console.error('Error loading custom animations:', err);
    }
}

// Render custom animations table
function renderCustomAnimationsList() {
    const list = document.getElementById('custom-animations-list');
    if (!list) return;
    
    if (customAnimations.length === 0) {
        list.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">
                    No hay animaciones personalizadas subidas aún.
                </td>
            </tr>
        `;
        return;
    }
    
    list.innerHTML = customAnimations.map(anim => {
        const obsUrl = `${window.location.origin}/overlay.html?animation=${anim.id}`;
        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(anim.name)}</td>
                <td>${anim.duration / 1000}s</td>
                <td><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">${anim.layer === 'front' ? 'Frente' : 'Atrás'}</span></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn secondary small" onclick="testCustomAnimation('${anim.id}')" style="padding: 4px 10px; font-size: 11px;">Probar</button>
                        <button class="btn secondary small" onclick="copyToClipboard('${obsUrl}')" style="padding: 4px 10px; font-size: 11px;">Copiar URL</button>
                        <button class="btn danger small" onclick="deleteCustomAnimation('${anim.id}')" style="padding: 4px 10px; font-size: 11px; background: rgba(255,0,0,0.1); border-color: rgba(255,0,0,0.2); color: #ff4444;">Eliminar</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Helper to escape HTML characters
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// Copy URL to clipboard helper
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('¡Enlace de OBS copiado al portapapeles!');
    }).catch(err => {
        console.error('Error copying text:', err);
    });
};

// Populate the select animations dropdown in MVP form
function populateMvpAnimationsDropdown() {
    const select = document.getElementById('mvp-animation');
    if (!select) return;
    
    // Save current selection if any
    const currentVal = select.value;
    
    // Default animations options
    let html = `
        <optgroup label="Animaciones Predeterminadas">
            <option value="trigger_glove">Guante Pro (Predet.)</option>
            <option value="trigger_levelup">Level Up (Predet.)</option>
            <option value="trigger_quiereme">Quiéreme (Predet.)</option>
            <option value="trigger_x2">X2 Battle Mode (Predet.)</option>
        </optgroup>
    `;
    
    // Custom uploaded animations options
    if (customAnimations.length > 0) {
        html += `
            <optgroup label="Animaciones Personalizadas">
                ${customAnimations.map(anim => `<option value="${anim.id}">${escapeHtml(anim.name)}</option>`).join('')}
            </optgroup>
        `;
    }
    
    select.innerHTML = html;
    if (currentVal) {
        select.value = currentVal;
    }
}

// Test trigger manual custom animation
window.testCustomAnimation = function(id) {
    const anim = customAnimations.find(a => a.id === id);
    if (!anim) return;
    socket.emit('manual_control', {
        action: 'play_custom_animation',
        animation: anim,
        nickname: 'TEST'
    });
};

// Delete custom animation
window.deleteCustomAnimation = async function(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta animación? Esto también quitará cualquier asignación MVP asociada.')) {
        return;
    }
    try {
        const response = await fetch(`/api/custom-animations/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            customAnimations = customAnimations.filter(a => a.id !== id);
            renderCustomAnimationsList();
            populateMvpAnimationsDropdown();
            // Reload MVPs in case some mappings were cleaned up
            await loadMvps();
        } else {
            alert('Error eliminando animación: ' + result.error);
        }
    } catch (err) {
        console.error('Error deleting animation:', err);
    }
};

// Load MVPs from API
async function loadMvps() {
    try {
        const response = await fetch('/api/mvps');
        mvps = await response.json();
        renderMvpList();
    } catch (err) {
        console.error('Error loading MVPs:', err);
    }
}

// Render MVPs list table
function renderMvpList() {
    const list = document.getElementById('mvp-list');
    if (!list) return;
    
    if (mvps.length === 0) {
        list.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">
                    No hay usuarios MVP registrados aún.
                </td>
            </tr>
        `;
        return;
    }
    
    list.innerHTML = mvps.map(mvp => {
        // Resolve animation name
        let animName = 'Desconocida';
        if (mvp.animationId.startsWith('trigger_')) {
            const defaultNames = {
                'trigger_glove': 'Guante Pro (Predet.)',
                'trigger_levelup': 'Level Up (Predet.)',
                'trigger_quiereme': 'Quiéreme (Predet.)',
                'trigger_x2': 'X2 Battle (Predet.)'
            };
            animName = defaultNames[mvp.animationId] || mvp.animationId;
        } else {
            const anim = customAnimations.find(a => a.id === mvp.animationId);
            if (anim) animName = anim.name;
        }
        
        return `
            <tr>
                <td style="font-weight: bold; color: var(--accent-red);">@${escapeHtml(mvp.username)}</td>
                <td>${escapeHtml(animName)}</td>
                <td style="text-align: center;">
                    <label class="switch-container" style="justify-content: center; padding: 0;">
                        <input type="checkbox" ${mvp.enabled ? 'checked' : ''} onchange="toggleMvpEnabled('${mvp.username}', this.checked)">
                        <span class="switch-slider"></span>
                    </label>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn secondary small" onclick="testMvpEntrance('${mvp.username}')" style="padding: 4px 10px; font-size: 11px;">Probar Entrada</button>
                        <button class="btn danger small" onclick="deleteMvp('${mvp.username}')" style="padding: 4px 10px; font-size: 11px; background: rgba(255,0,0,0.1); border-color: rgba(255,0,0,0.2); color: #ff4444;">Eliminar</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Toggle MVP enabled status
window.toggleMvpEnabled = async function(username, enabled) {
    try {
        const response = await fetch(`/api/mvps/${encodeURIComponent(username)}/toggle`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const result = await response.json();
        if (!result.success) {
            alert('Error modificando estado: ' + result.error);
        } else {
            const mvp = mvps.find(m => m.username.toLowerCase() === username.toLowerCase());
            if (mvp) mvp.enabled = enabled;
        }
    } catch (err) {
        console.error('Error toggling MVP enabled status:', err);
    }
};

// Test MVP entrance manually
window.testMvpEntrance = function(username) {
    const mvp = mvps.find(m => m.username.toLowerCase() === username.toLowerCase());
    if (!mvp) return;
    
    if (mvp.animationId.startsWith('trigger_')) {
        socket.emit('manual_control', {
            action: 'test_trigger',
            event: mvp.animationId,
            nickname: mvp.username
        });
    } else {
        const anim = customAnimations.find(a => a.id === mvp.animationId);
        if (anim) {
            socket.emit('manual_control', {
                action: 'play_custom_animation',
                animation: anim,
                nickname: mvp.username
            });
        }
    }
};

// Delete MVP
window.deleteMvp = async function(username) {
    if (!confirm(`¿Estás seguro de que deseas eliminar a @${username} del registro MVP?`)) {
        return;
    }
    try {
        const response = await fetch(`/api/mvps/${encodeURIComponent(username)}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            mvps = mvps.filter(m => m.username.toLowerCase() !== username.toLowerCase());
            renderMvpList();
        } else {
            alert('Error eliminando MVP: ' + result.error);
        }
    } catch (err) {
        console.error('Error deleting MVP:', err);
    }
};

// Setup forms event listeners
document.addEventListener('DOMContentLoaded', () => {
    // 1. Upload Form
    const uploadForm = document.getElementById('upload-animation-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('anim-name').value.trim();
            const text = document.getElementById('anim-text').value.trim();
            const layer = document.getElementById('anim-layer').value;
            const duration = document.getElementById('anim-duration').value;
            const fileInput = document.getElementById('anim-file');
            
            if (fileInput.files.length === 0) {
                alert('Por favor selecciona un archivo.');
                return;
            }
            
            const file = fileInput.files[0];
            
            // Read file as base64
            const reader = new FileReader();
            reader.onload = async function() {
                const base64Data = reader.result;
                
                try {
                    const submitBtn = uploadForm.querySelector('button[type="submit"]');
                    const origBtnText = submitBtn.innerHTML;
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = 'Subiendo...';
                    
                    const response = await fetch('/api/custom-animations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name,
                            text,
                            layer,
                            duration,
                            filename: file.name,
                            fileData: base64Data
                        })
                    });
                    
                    const result = await response.json();
                    
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = origBtnText;
                    
                    if (result.success) {
                        alert('¡Animación subida exitosamente!');
                        uploadForm.reset();
                        
                        // Reload
                        await loadCustomAnimations();
                    } else {
                        alert('Error subiendo archivo: ' + result.error);
                    }
                } catch (err) {
                    console.error('Error uploading:', err);
                    alert('Error en el servidor al subir el archivo.');
                }
            };
            reader.readAsDataURL(file);
        });
    }
    
    // 2. MVP Register Form
    const registerMvpForm = document.getElementById('register-mvp-form');
    if (registerMvpForm) {
        registerMvpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('mvp-username').value.trim();
            const animationId = document.getElementById('mvp-animation').value;
            
            try {
                const response = await fetch('/api/mvps', {
                    headers: { 'Content-Type': 'application/json' },
                    method: 'POST',
                    body: JSON.stringify({ username, animationId })
                });
                
                const result = await response.json();
                if (result.success) {
                    alert(`¡@${username} registrado como MVP con éxito!`);
                    registerMvpForm.reset();
                    await loadMvps();
                } else {
                    alert('Error registrando MVP: ' + result.error);
                }
            } catch (err) {
                console.error('Error registering MVP:', err);
            }
        });
    }
    
    // Initialize data
    loadCustomAnimations().then(() => {
        loadMvps();
    });
});

// ==========================================
// MASTER ANIMATIONS CUSTOM OVERRIDES LOGIC
// ==========================================

let activeMasterKey = null;

// Toggle card menu dropdown
window.toggleCardMenu = function(event, key) {
    event.preventDefault();
    event.stopPropagation();
    
    // Close other dropdowns
    document.querySelectorAll('.card-menu-dropdown').forEach(dropdown => {
        if (dropdown.id !== `dropdown-${key}`) {
            dropdown.classList.remove('show');
        }
    });
    
    const dropdown = document.getElementById(`dropdown-${key}`);
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
};

// Trigger hidden file input click
window.uploadMasterAnimationFile = function(event, key) {
    event.preventDefault();
    event.stopPropagation();
    
    // Close dropdown
    const dropdown = document.getElementById(`dropdown-${key}`);
    if (dropdown) dropdown.classList.remove('show');
    
    activeMasterKey = key;
    const fileInput = document.getElementById('upload-master-file-input');
    if (fileInput) {
        fileInput.value = ''; // reset so same file selection triggers change
        fileInput.click();
    }
};

// Delete custom override for master animation
window.deleteMasterAnimationFile = async function(event, key) {
    event.preventDefault();
    event.stopPropagation();
    
    // Close dropdown
    const dropdown = document.getElementById(`dropdown-${key}`);
    if (dropdown) dropdown.classList.remove('show');
    
    if (!confirm('¿Estás seguro de que deseas borrar el archivo personalizado de esta animación? Volverá al diseño predeterminado.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/master-animations/${key}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            alert('Archivo personalizado eliminado. Volviendo al predeterminado.');
            // Reload settings to update UI
            socket.emit('update_chatbot_settings', {});
        } else {
            alert('Error eliminando archivo: ' + result.error);
        }
    } catch (err) {
        console.error('Error deleting master animation:', err);
    }
};

// Update master custom badges on the cards
function updateMasterAnimationsUI(settings) {
    const keys = ['trigger_glove', 'trigger_levelup', 'trigger_quiereme', 'trigger_x2'];
    keys.forEach(key => {
        const card = document.querySelector(`[data-event="${key}"]`);
        if (!card) return;
        
        // Remove existing custom badge if any
        const existingBadge = card.querySelector('.badge.custom-badge');
        if (existingBadge) existingBadge.remove();
        
        const hasCustom = settings.masterAnimations && settings.masterAnimations[key] && settings.masterAnimations[key].filepath;
        if (hasCustom) {
            const meta = card.querySelector('.card-meta');
            if (meta) {
                const badge = document.createElement('span');
                badge.className = 'badge custom-badge';
                badge.innerText = 'MOD';
                badge.style.background = '#00ffcc';
                badge.style.color = '#000';
                badge.style.fontWeight = 'bold';
                badge.style.marginLeft = '5px';
                meta.appendChild(badge);
            }
        }
    });
}

// Close card menus when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.card-menu-dropdown').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
});

// Setup Master File Input Change Listener
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('upload-master-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            if (fileInput.files.length === 0 || !activeMasterKey) return;
            
            const file = fileInput.files[0];
            const key = activeMasterKey;
            activeMasterKey = null; // reset
            
            const reader = new FileReader();
            reader.onload = async function() {
                const base64Data = reader.result;
                
                try {
                    const response = await fetch(`/api/master-animations/${key}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename: file.name,
                            fileData: base64Data
                        })
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        alert('¡Archivo personalizado cargado con éxito para esta animación!');
                        // Trigger setting sync by sending empty update
                        socket.emit('update_chatbot_settings', {});
                    } else {
                        alert('Error cargando archivo: ' + result.error);
                    }
                } catch (err) {
                    console.error('Error uploading master file:', err);
                    alert('Error de servidor al subir archivo.');
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Export Settings
    const btnExportSettings = document.getElementById('btn-export-settings');
    if (btnExportSettings) {
        btnExportSettings.addEventListener('click', () => {
            if (!chatbotConfig) {
                alert('Aún no se ha cargado la configuración.');
                return;
            }
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chatbotConfig, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href",     dataStr);
            downloadAnchor.setAttribute("download", `${chatbotConfig.themeName || 'neutral'}_chatbot_settings_${new Date().toISOString().slice(0,10)}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });
    }

    // Trigger Import
    const btnTriggerImport = document.getElementById('btn-trigger-import');
    const importFileEl = document.getElementById('import-settings-file');
    if (btnTriggerImport && importFileEl) {
        btnTriggerImport.addEventListener('click', () => {
            importFileEl.click();
        });
        
        importFileEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (typeof parsed !== 'object' || parsed === null) {
                        throw new Error('Formato de JSON inválido.');
                    }
                    
                    if (confirm('¿Estás seguro de que deseas importar esta configuración? Sobrescribirá tus ajustes actuales de voces, Spotify y MVPs.')) {
                        socket.emit('update_chatbot_settings', parsed);
                        alert('¡Configuración importada y guardada con éxito!');
                    }
                } catch (err) {
                    alert('Error al leer el archivo de configuración: ' + err.message);
                }
            };
            reader.readAsText(file);
        });
    }
    
    // ==========================================
    // YOUTUBE TRACK & COLA CONTROLS & LISTENERS
    // ==========================================

    socket.on('youtube_queue_updated', (queue) => {
        renderYoutubeQueue(queue);
    });

    function renderYoutubeQueue(queue) {
        const tbody = document.getElementById('youtube-queue-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (!queue || queue.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px 15px;">
                        La cola de reproducción de YouTube está vacía.
                    </td>
                </tr>
            `;
            return;
        }
        
        queue.forEach((track, index) => {
            const tr = document.createElement('tr');
            const albumArtSrc = track.albumArt || 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%2523222%22%2F%3E%3C%2Fsvg%3E';
            
            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${albumArtSrc}" class="queue-thumb" alt="Cover" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
                        <div class="track-details" style="display: flex; flex-direction: column;">
                            <span class="track-title" style="font-weight: bold; font-size: 13px; color: var(--text-main);">${track.title}</span>
                            <span class="track-artist" style="font-size: 11px; color: var(--text-muted);">${track.artist}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="requester-badge" style="background: rgba(255, 0, 0, 0.1); color: #ff0000; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">@${track.requester}</span>
                </td>
                <td class="text-right">
                    <div class="queue-actions">
                        <button class="btn-queue-play" onclick="playYoutubeQueueItem(${index})" title="Reproducir ahora" style="background: none; border: none; color: var(--text-main); cursor: pointer; padding: 4px;">
                            <i data-lucide="play" class="icon-small"></i>
                        </button>
                        <button class="btn-queue-delete" onclick="deleteYoutubeQueueItem(${index})" title="Eliminar de la cola" style="background: none; border: none; color: var(--accent-red); cursor: pointer; padding: 4px;">
                            <i data-lucide="trash-2" class="icon-small"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    window.playYoutubeQueueItem = function(index) {
        socket.emit('play_youtube_queue_item', index);
    };

    window.deleteYoutubeQueueItem = function(index) {
        socket.emit('delete_youtube_queue_item', index);
    };

    // Bind clear YouTube queue button
    const btnClearYoutubeQueue = document.getElementById('btn-clear-youtube-queue');
    if (btnClearYoutubeQueue) {
        btnClearYoutubeQueue.addEventListener('click', () => {
            if (confirm('¿Estás seguro de que deseas vaciar toda la cola de YouTube?')) {
                socket.emit('clear_youtube_queue');
            }
        });
    }

    // Listen to actual YouTube playback for live preview mockup
    socket.on('youtube_track', (track) => {
        const titleEl = document.getElementById('youtube-mockup-title');
        const artistEl = document.getElementById('youtube-mockup-artist');
        const imgEl = document.getElementById('youtube-mockup-album-img');
        const bgArtEl = document.getElementById('youtube-mockup-bg-art');
        const playIconEl = document.getElementById('youtube-mockup-play-icon');
        const fillEl = document.getElementById('youtube-mockup-progress-fill');
        const currentEl = document.getElementById('youtube-mockup-time-current');
        const totalEl = document.getElementById('youtube-mockup-time-total');
        
        if (track && track.title) {
            if (titleEl) titleEl.textContent = track.title;
            if (artistEl) artistEl.textContent = track.artist || 'YouTube';
            if (imgEl && track.albumArt) {
                imgEl.src = track.albumArt;
                imgEl.style.animationPlayState = track.isPlaying ? 'running' : 'paused';
            }
            if (bgArtEl && track.albumArt) {
                bgArtEl.style.backgroundImage = `url('${track.albumArt}')`;
                bgArtEl.style.backgroundSize = 'cover';
            }
            
            if (playIconEl) {
                playIconEl.setAttribute('data-lucide', track.isPlaying ? 'pause' : 'play');
            }
            
            // Progress display
            if (fillEl && track.durationMs) {
                const percent = (track.progressMs / track.durationMs) * 100;
                fillEl.style.width = `${percent}%`;
            } else if (fillEl && !track.isPlaying) {
                fillEl.style.width = '0%';
            }
            if (currentEl) {
                currentEl.textContent = track.progressMs ? formatTime(track.progressMs / 1000) : '0:00';
            }
            if (totalEl) {
                totalEl.textContent = track.durationMs ? formatTime(track.durationMs / 1000) : '0:00';
            }
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } else {
            if (titleEl) titleEl.textContent = 'Sin reproducción';
            if (artistEl) artistEl.textContent = 'Cola de YouTube vacía';
            if (imgEl) {
                imgEl.src = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22200%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%231a1a1a%22%2F%3E%3Ccircle%20cx%3D%22100%22%20cy%3D%22100%22%20r%3D%2230%22%20fill%3D%22%23ff0000%22%2F%3E%3Cpolygon%20points%3D%2295%2C90%2095%2C110%20112%2C100%22%20fill%3D%22%23fff%22%2F%3E%3C%2Fsvg%3E";
                imgEl.style.animationPlayState = 'paused';
            }
            if (playIconEl) playIconEl.setAttribute('data-lucide', 'play');
            if (fillEl) fillEl.style.width = '0%';
            if (currentEl) currentEl.textContent = '0:00';
            if (totalEl) totalEl.textContent = '0:00';
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    });

    // Sync progress update in real-time from YouTube widget player status
    socket.on('youtube_track_progress', (status) => {
        const fillEl = document.getElementById('youtube-mockup-progress-fill');
        const currentEl = document.getElementById('youtube-mockup-time-current');
        const totalEl = document.getElementById('youtube-mockup-time-total');
        
        if (fillEl && status.durationMs) {
            const percent = (status.progressMs / status.durationMs) * 100;
            fillEl.style.width = `${percent}%`;
        }
        if (currentEl) {
            currentEl.textContent = formatTime(status.progressMs / 1000);
        }
        if (totalEl) {
            totalEl.textContent = formatTime(status.durationMs / 1000);
        }
    });

    // YouTube mockup play/pause control action
    const ytMockupPlayBtn = document.getElementById('youtube-mockup-btn-play');
    if (ytMockupPlayBtn) {
        ytMockupPlayBtn.addEventListener('click', () => {
            const imgEl = document.getElementById('youtube-mockup-album-img');
            const isPlayingNow = imgEl && imgEl.style.animationPlayState === 'running';
            socket.emit('youtube_toggle_play', !isPlayingNow);
        });
    }

    const ytMockupNextBtn = document.getElementById('youtube-mockup-btn-next');
    if (ytMockupNextBtn) {
        ytMockupNextBtn.addEventListener('click', () => {
            socket.emit('skip_youtube_track');
        });
    }

    const ytVolSlider = document.getElementById('youtube-volume-slider');
    if (ytVolSlider) {
        ytVolSlider.addEventListener('input', () => {
            const val = ytVolSlider.value;
            const valLabel = document.getElementById('youtube-volume-val');
            if (valLabel) valLabel.textContent = `${val}%`;
        });
        
        ytVolSlider.addEventListener('change', () => {
            const val = parseInt(ytVolSlider.value) || 80;
            socket.emit('youtube_volume_change', val);
        });
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// ============================================================================
// MULTIMEDIA SOUND ALERTS & MODALS SYSTEM
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Library Definitions
    const SYSTEM_SOUNDS = [
        { name: 'GRLive Bruh', url: '/sounds/bruh.mp3' },
        { name: 'GRLive Fart', url: '/sounds/fart.mp3' },
        { name: 'GRLive Vine Boom', url: '/sounds/vine-boom.mp3' },
        { name: 'GRLive Anime Wow', url: '/sounds/anime-wow.mp3' },
        { name: 'GRLive Roblox Oof', url: '/sounds/oof.mp3' },
        { name: 'GRLive Bonk', url: '/sounds/bonk.mp3' },
        { name: 'GRLive Taco Bell', url: '/sounds/taco-bell.mp3' },
        { name: 'GRLive Yeet', url: '/sounds/yeet.mp3' },
        { name: 'GRLive Nice Click', url: '/sounds/nice.mp3' },
        { name: 'GRLive Discord Notif', url: '/sounds/discord-notification.mp3' }
    ];

                const DEFAULT_GIFTS = [
        {
                "name": "Adicto a las pantallas",
                "coins": 1,
                "iconUrl": "/assets/gift/Adicto a las pantallas.png"
        },
        {
                "name": "ASMR Starter Kit",
                "coins": 1,
                "iconUrl": "/assets/gift/ASMR Starter Kit.png"
        },
        {
                "name": "Beach Date",
                "coins": 1,
                "iconUrl": "/assets/gift/Beach Date.png"
        },
        {
                "name": "Breakthrough superstar",
                "coins": 1,
                "iconUrl": "/assets/gift/Breakthrough superstar.png"
        },
        {
                "name": "Cheems Dog",
                "coins": 1,
                "iconUrl": "/assets/gift/Cheems Dog.png"
        },
        {
                "name": "Heart on Hands",
                "coins": 1,
                "iconUrl": "/assets/gift/Corazon en Manos.png"
        },
        {
                "name": "Finger Heart",
                "coins": 1,
                "iconUrl": "/assets/gift/Corazón Coreano.png"
        },
        {
                "name": "Beating Heart",
                "coins": 1,
                "iconUrl": "/assets/gift/Corazón que late.png"
        },
        {
                "name": "Heart Me",
                "coins": 1,
                "iconUrl": "/assets/gift/Corazón.png"
        },
        {
                "name": "Corona de la comunidad",
                "coins": 1,
                "iconUrl": "/assets/gift/Corona de la comunidad.png"
        },
        {
                "name": "Correo",
                "coins": 1,
                "iconUrl": "/assets/gift/Correo.png"
        },
        {
                "name": "Día de muertos",
                "coins": 1,
                "iconUrl": "/assets/gift/Día de muertos.png"
        },
        {
                "name": "Pop",
                "coins": 1,
                "iconUrl": "/assets/gift/Equipo Poder.png"
        },
        {
                "name": "Eres increíble",
                "coins": 1,
                "iconUrl": "/assets/gift/Eres Asombroso.png"
        },
        {
                "name": "Buen Juego (GG)",
                "coins": 1,
                "iconUrl": "/assets/gift/GG.png"
        },
        {
                "name": "Gift Box 2",
                "coins": 1,
                "iconUrl": "/assets/gift/Gift Box 2.png"
        },
        {
                "name": "Barra luminosa",
                "coins": 1,
                "iconUrl": "/assets/gift/Glow Stick.png"
        },
        {
                "name": "Heart",
                "coins": 1,
                "iconUrl": "/assets/gift/Heart.png"
        },
        {
                "name": "Cono de helado",
                "coins": 1,
                "iconUrl": "/assets/gift/Helado.png"
        },
        {
                "name": "Te amo",
                "coins": 1,
                "iconUrl": "/assets/gift/Love you.png"
        },
        {
                "name": "Corn",
                "coins": 1,
                "iconUrl": "/assets/gift/Maiz.png"
        },
        {
                "name": "Maracas",
                "coins": 1,
                "iconUrl": "/assets/gift/Maracas.png"
        },
        {
                "name": "Álbum de música",
                "coins": 1,
                "iconUrl": "/assets/gift/Música.png"
        },
        {
                "name": "Nachos",
                "coins": 1,
                "iconUrl": "/assets/gift/Nachos.png"
        },
        {
                "name": "Rebanada de pastel",
                "coins": 1,
                "iconUrl": "/assets/gift/Pastel.png"
        },
        {
                "name": "Pato",
                "coins": 1,
                "iconUrl": "/assets/gift/Pato.png"
        },
        {
                "name": "Quiereme",
                "coins": 1,
                "iconUrl": "/assets/gift/Quiereme.png"
        },
        {
                "name": "Rey de leyendas",
                "coins": 1,
                "iconUrl": "/assets/gift/Rey de leyendas.png"
        },
        {
                "name": "White Rose",
                "coins": 1,
                "iconUrl": "/assets/gift/Rosa Blanca.png"
        },
        {
                "name": "Cosmic Rose",
                "coins": 1,
                "iconUrl": "/assets/gift/Rosa Cosmica.png"
        },
        {
                "name": "Eternity Rose",
                "coins": 1,
                "iconUrl": "/assets/gift/Rosa de la Eternidad.png"
        },
        {
                "name": "Big Rose",
                "coins": 1,
                "iconUrl": "/assets/gift/Rosa Grande.png"
        },
        {
                "name": "Rose",
                "coins": 1,
                "iconUrl": "/assets/gift/Rosa.png"
        },
        {
                "name": "Te quiero mucho",
                "coins": 1,
                "iconUrl": "/assets/gift/Te Quiero.png"
        },
        {
                "name": "Pulgar arriba",
                "coins": 1,
                "iconUrl": "/assets/gift/Thumbs Up.png"
        },
        {
                "name": "TikTok All Stars",
                "coins": 1,
                "iconUrl": "/assets/gift/Tik Tok All Stars.png"
        },
        {
                "name": "TikTok Live",
                "coins": 1,
                "iconUrl": "/assets/gift/Tik Tok Live.png"
        },
        {
                "name": "TikTok Universe",
                "coins": 1,
                "iconUrl": "/assets/gift/Tik tok Universo.png"
        },
        {
                "name": "TikTok",
                "coins": 1,
                "iconUrl": "/assets/gift/Tik Tok.png"
        },
        {
                "name": "Alegrarte el día",
                "coins": 9,
                "iconUrl": "/assets/gift/Cheer You Up.png"
        },
        {
                "name": "Perfume",
                "coins": 20,
                "iconUrl": "/assets/gift/Perfume.png"
        },
        {
                "name": "Capybara",
                "coins": 30,
                "iconUrl": "/assets/gift/Capibara.png"
        },
        {
                "name": "Dancing Capybaras",
                "coins": 30,
                "iconUrl": "/assets/gift/Capibaras Bailando.png"
        },
        {
                "name": "Bathing Capybaras",
                "coins": 30,
                "iconUrl": "/assets/gift/Capibaras Bañandose.png"
        },
        {
                "name": "Dona",
                "coins": 30,
                "iconUrl": "/assets/gift/Dona.png"
        },
        {
                "name": "Autumn Leaves",
                "coins": 99,
                "iconUrl": "/assets/gift/Autumn Leaves.png"
        },
        {
                "name": "Cabeza de calabaza",
                "coins": 99,
                "iconUrl": "/assets/gift/Cabeza de calabaza.png"
        },
        {
                "name": "Calabaza",
                "coins": 99,
                "iconUrl": "/assets/gift/Calabaza.png"
        },
        {
                "name": "Candado de amor",
                "coins": 99,
                "iconUrl": "/assets/gift/Candado de amor.png"
        },
        {
                "name": "Candado y llave",
                "coins": 99,
                "iconUrl": "/assets/gift/Candado y llave.png"
        },
        {
                "name": "Casco de leyendas",
                "coins": 99,
                "iconUrl": "/assets/gift/Casco de leyendas.png"
        },
        {
                "name": "Celebración de la comunidad",
                "coins": 99,
                "iconUrl": "/assets/gift/Celebración de la comunidad.png"
        },
        {
                "name": "Celebridad",
                "coins": 99,
                "iconUrl": "/assets/gift/Celebridad.png"
        },
        {
                "name": "Community Fest",
                "coins": 99,
                "iconUrl": "/assets/gift/Community Fest.png"
        },
        {
                "name": "Corona pequeña",
                "coins": 99,
                "iconUrl": "/assets/gift/Corona.png"
        },
        {
                "name": "el gato de la furgoneta",
                "coins": 99,
                "iconUrl": "/assets/gift/el gato de la furgoneta.png"
        },
        {
                "name": "encanto del café",
                "coins": 99,
                "iconUrl": "/assets/gift/encanto del café.png"
        },
        {
                "name": "Equipo Animador",
                "coins": 99,
                "iconUrl": "/assets/gift/Equipo Animador.png"
        },
        {
                "name": "Equipo de ensueño",
                "coins": 99,
                "iconUrl": "/assets/gift/Equipo de ensueño.png"
        },
        {
                "name": "Equipo victoria",
                "coins": 99,
                "iconUrl": "/assets/gift/Equipo victoria.png"
        },
        {
                "name": "Falling For You",
                "coins": 99,
                "iconUrl": "/assets/gift/Falling For You.png"
        },
        {
                "name": "Fantasmita",
                "coins": 99,
                "iconUrl": "/assets/gift/Fantasmita.png"
        },
        {
                "name": "Fiesta de caramelos",
                "coins": 99,
                "iconUrl": "/assets/gift/Fiesta de caramelos.png"
        },
        {
                "name": "Flor Bailarina",
                "coins": 99,
                "iconUrl": "/assets/gift/Flor Bailarina.png"
        },
        {
                "name": "Fruits Hat",
                "coins": 99,
                "iconUrl": "/assets/gift/Fruits Hat.png"
        },
        {
                "name": "Gimme the mic",
                "coins": 99,
                "iconUrl": "/assets/gift/Gimme the mic.png"
        },
        {
                "name": "Gorra",
                "coins": 99,
                "iconUrl": "/assets/gift/Gorra.png"
        },
        {
                "name": "Guirnalda",
                "coins": 99,
                "iconUrl": "/assets/gift/Guirnalda.png"
        },
        {
                "name": "Health Potion",
                "coins": 99,
                "iconUrl": "/assets/gift/Health Potion.png"
        },
        {
                "name": "Holiday Stocking",
                "coins": 99,
                "iconUrl": "/assets/gift/Holiday Stocking.png"
        },
        {
                "name": "Husky",
                "coins": 99,
                "iconUrl": "/assets/gift/Husky.png"
        },
        {
                "name": "iris de verano",
                "coins": 99,
                "iconUrl": "/assets/gift/iris de verano.png"
        },
        {
                "name": "Like-Pop",
                "coins": 99,
                "iconUrl": "/assets/gift/Like-Pop.png"
        },
        {
                "name": "Magic Hat",
                "coins": 99,
                "iconUrl": "/assets/gift/Magic Hat.png"
        },
        {
                "name": "Make-up Box",
                "coins": 99,
                "iconUrl": "/assets/gift/Make-up Box.png"
        },
        {
                "name": "Manos danzantes",
                "coins": 99,
                "iconUrl": "/assets/gift/Manos danzantes.png"
        },
        {
                "name": "Maquina de suerte",
                "coins": 99,
                "iconUrl": "/assets/gift/Maquina de suerte.png"
        },
        {
                "name": "Me alegro por ti",
                "coins": 99,
                "iconUrl": "/assets/gift/Me alegro por ti.png"
        },
        {
                "name": "Mejores Amigos",
                "coins": 99,
                "iconUrl": "/assets/gift/Mejores Amigos.png"
        },
        {
                "name": "Mirror Bloom",
                "coins": 99,
                "iconUrl": "/assets/gift/Mirror Bloom.png"
        },
        {
                "name": "Música agradable",
                "coins": 99,
                "iconUrl": "/assets/gift/Música agradable.png"
        },
        {
                "name": "Osito",
                "coins": 99,
                "iconUrl": "/assets/gift/Osito.png"
        },
        {
                "name": "Panther Paws",
                "coins": 99,
                "iconUrl": "/assets/gift/Panther Paws.png"
        },
        {
                "name": "Patas de gato",
                "coins": 99,
                "iconUrl": "/assets/gift/Patas de gato.png"
        },
        {
                "name": "Pintura de amor",
                "coins": 99,
                "iconUrl": "/assets/gift/Pintura de amor.png"
        },
        {
                "name": "Piñata",
                "coins": 99,
                "iconUrl": "/assets/gift/Piñata.png"
        },
        {
                "name": "Pool Party",
                "coins": 99,
                "iconUrl": "/assets/gift/Pool Party.png"
        },
        {
                "name": "Pug",
                "coins": 99,
                "iconUrl": "/assets/gift/Pug.png"
        },
        {
                "name": "Pulsera de Equipo",
                "coins": 99,
                "iconUrl": "/assets/gift/Pulsera de Equipo.png"
        },
        {
                "name": "Rabbit",
                "coins": 99,
                "iconUrl": "/assets/gift/Rabbit.png"
        },
        {
                "name": "Sandía enamorada",
                "coins": 99,
                "iconUrl": "/assets/gift/Sandía enamorada.png"
        },
        {
                "name": "Sombrero de Mariachi",
                "coins": 99,
                "iconUrl": "/assets/gift/Sombrero de Mariachi.png"
        },
        {
                "name": "Sombrero y bigote",
                "coins": 99,
                "iconUrl": "/assets/gift/Sombrero y bigote.png"
        },
        {
                "name": "Spooktacular",
                "coins": 99,
                "iconUrl": "/assets/gift/Spooktacular.png"
        },
        {
                "name": "Tango",
                "coins": 99,
                "iconUrl": "/assets/gift/Tango.png"
        },
        {
                "name": "Gorra",
                "coins": 99,
                "iconUrl": "/assets/gift/Toca para ti.png"
        },
        {
                "name": "trompo",
                "coins": 99,
                "iconUrl": "/assets/gift/trompo.png"
        },
        {
                "name": "Trono de Estrellas",
                "coins": 99,
                "iconUrl": "/assets/gift/Trono de Estrellas.png"
        },
        {
                "name": "Visitando el espacio",
                "coins": 99,
                "iconUrl": "/assets/gift/Visitando el espacio.png"
        },
        {
                "name": "Confeti",
                "coins": 100,
                "iconUrl": "/assets/gift/confeti premiun.png"
        },
        {
                "name": "Confeti",
                "coins": 100,
                "iconUrl": "/assets/gift/Confeti.png"
        },
        {
                "name": "Control de videojuegos",
                "coins": 100,
                "iconUrl": "/assets/gift/Control.png"
        },
        {
                "name": "Explosión de amor",
                "coins": 100,
                "iconUrl": "/assets/gift/Explosión de amor.png"
        },
        {
                "name": "Cocoa de Santa",
                "coins": 149,
                "iconUrl": "/assets/gift/Taco.png"
        },
        {
                "name": "Corazones",
                "coins": 199,
                "iconUrl": "/assets/gift/Corazones.png"
        },
        {
                "name": "Corona de flores para la cabeza",
                "coins": 199,
                "iconUrl": "/assets/gift/Corona de flores.png"
        },
        {
                "name": "Masaje para ti",
                "coins": 199,
                "iconUrl": "/assets/gift/masaje para ti.png"
        },
        {
                "name": "Masaje para ti",
                "coins": 199,
                "iconUrl": "/assets/gift/Sage.png"
        },
        {
                "name": "Estrella nocturna",
                "coins": 199,
                "iconUrl": "/assets/gift/star.png"
        },
        {
                "name": "Abeja picadora",
                "coins": 199,
                "iconUrl": "/assets/gift/Stinging Bee.png"
        },
        {
                "name": "Gafas de sol",
                "coins": 199,
                "iconUrl": "/assets/gift/Sunglasses.png"
        },
        {
                "name": "Te estoy viendo",
                "coins": 199,
                "iconUrl": "/assets/gift/Te veo.png"
        },
        {
                "name": "Medalla de oro",
                "coins": 200,
                "iconUrl": "/assets/gift/Medalla de oro.png"
        },
        {
                "name": "Medalla de oro",
                "coins": 200,
                "iconUrl": "/assets/gift/Medalla.png"
        },
        {
                "name": "Caja de tulipanes",
                "coins": 200,
                "iconUrl": "/assets/gift/Tulipanes.png"
        },
        {
                "name": "Aves melódicas",
                "coins": 249,
                "iconUrl": "/assets/gift/Aves.png"
        },
        {
                "name": "Micrófono de helado",
                "coins": 249,
                "iconUrl": "/assets/gift/Micrófono.png"
        },
        {
                "name": "Brisa de palmeras",
                "coins": 249,
                "iconUrl": "/assets/gift/Palmeras.png"
        },
        {
                "name": "Apretar mejillas",
                "coins": 249,
                "iconUrl": "/assets/gift/Pinch Face.png"
        },
        {
                "name": "Amigos de frutas",
                "coins": 299,
                "iconUrl": "/assets/gift/Amigos Frutas.png"
        },
        {
                "name": "Guantes de boxeo",
                "coins": 299,
                "iconUrl": "/assets/gift/Boxing Gloves.png"
        },
        {
                "name": "Corgi",
                "coins": 299,
                "iconUrl": "/assets/gift/Corgi.png"
        },
        {
                "name": "Trompa de elefante",
                "coins": 299,
                "iconUrl": "/assets/gift/Elefante.png"
        },
        {
                "name": "Estrella de rock",
                "coins": 299,
                "iconUrl": "/assets/gift/Estrella de Rock.png"
        },
        {
                "name": "Caja de regalo de Eid",
                "coins": 299,
                "iconUrl": "/assets/gift/Gift Box.png"
        },
        {
                "name": "Llamada de amor",
                "coins": 299,
                "iconUrl": "/assets/gift/Llama.png"
        },
        {
                "name": "Pollo travieso",
                "coins": 299,
                "iconUrl": "/assets/gift/Pollo Travieso.png"
        },
        {
                "name": "¡Hola, Rosie!",
                "coins": 299,
                "iconUrl": "/assets/gift/Rosie.png"
        },
        {
                "name": "Trompa de elefante",
                "coins": 299,
                "iconUrl": "/assets/gift/Trompa y orejas de elefante.png"
        },
        {
                "name": "El abrazo de Tom",
                "coins": 399,
                "iconUrl": "/assets/gift/Abrazo de Tom.png"
        },
        {
                "name": "Jollie el frijol de la alegría",
                "coins": 399,
                "iconUrl": "/assets/gift/Jollie.png"
        },
        {
                "name": "Ganso relajado",
                "coins": 399,
                "iconUrl": "/assets/gift/Oca relajada.png"
        },
        {
                "name": "Ritmo mágico",
                "coins": 399,
                "iconUrl": "/assets/gift/Ritmo mágico.png"
        },
        {
                "name": "Campeón del micrófono",
                "coins": 400,
                "iconUrl": "/assets/gift/Campeon.png"
        },
        {
                "name": "Coral",
                "coins": 499,
                "iconUrl": "/assets/gift/Coral.png"
        },
        {
                "name": "Manos arriba",
                "coins": 499,
                "iconUrl": "/assets/gift/Hands UP.png"
        },
        {
                "name": "Manos arriba",
                "coins": 499,
                "iconUrl": "/assets/gift/Manos arriba.png"
        },
        {
                "name": "Gafas de DJ",
                "coins": 500,
                "iconUrl": "/assets/gift/Anteojos de DJ.png"
        },
        {
                "name": "Gafas de realidad virtual",
                "coins": 500,
                "iconUrl": "/assets/gift/Gafas de RV.png"
        },
        {
                "name": "Pistola de gemas",
                "coins": 500,
                "iconUrl": "/assets/gift/Gem Gun.png"
        },
        {
                "name": "Guitarra de corazón",
                "coins": 500,
                "iconUrl": "/assets/gift/Guitarra.png"
        },
        {
                "name": "Manifestando",
                "coins": 500,
                "iconUrl": "/assets/gift/Manifesting.png"
        },
        {
                "name": "Pistola de dinero",
                "coins": 500,
                "iconUrl": "/assets/gift/Pistola.png"
        },
        {
                "name": "Cisne",
                "coins": 699,
                "iconUrl": "/assets/gift/cisne de papel.png"
        },
        {
                "name": "Cisne",
                "coins": 699,
                "iconUrl": "/assets/gift/Cisne.png"
        },
        {
                "name": "TE AMO",
                "coins": 899,
                "iconUrl": "/assets/gift/LOVE U.png"
        },
        {
                "name": "Tren",
                "coins": 899,
                "iconUrl": "/assets/gift/Spring train.png"
        },
        {
                "name": "Tren",
                "coins": 899,
                "iconUrl": "/assets/gift/Tren.png"
        },
        {
                "name": "Caja de suministros de la suerte",
                "coins": 999,
                "iconUrl": "/assets/gift/Caja de lanzamiento aéreo de la suerte.png"
        },
        {
                "name": "Flower Overflow",
                "coins": 999,
                "iconUrl": "/assets/gift/Flower Overflow.png"
        },
        {
                "name": "Mina de Oro",
                "coins": 999,
                "iconUrl": "/assets/gift/Mina de Oro.png"
        },
        {
                "name": "Pistola de Dulces",
                "coins": 999,
                "iconUrl": "/assets/gift/Pistola de Dulces.png"
        },
        {
                "name": "Que siga la fiesta",
                "coins": 999,
                "iconUrl": "/assets/gift/Que siga la fiesta.png"
        },
        {
                "name": "Todo por un sueño",
                "coins": 999,
                "iconUrl": "/assets/gift/Todo por un sueño.png"
        },
        {
                "name": "Viajar contigo",
                "coins": 999,
                "iconUrl": "/assets/gift/Travel with You.png"
        },
        {
                "name": "Cintas florecientes",
                "coins": 1000,
                "iconUrl": "/assets/gift/Blooming Ribbons.png"
        },
        {
                "name": "Disco ball",
                "coins": 1000,
                "iconUrl": "/assets/gift/Disco ball.png"
        },
        {
                "name": "El pueblo de bu",
                "coins": 1000,
                "iconUrl": "/assets/gift/El pueblo de bu.png"
        },
        {
                "name": "Foca y ballena",
                "coins": 1000,
                "iconUrl": "/assets/gift/Foca y ballena.png"
        },
        {
                "name": "Futuro Encuentro",
                "coins": 1000,
                "iconUrl": "/assets/gift/Futuro Encuentro.png"
        },
        {
                "name": "Futuro viaje",
                "coins": 1000,
                "iconUrl": "/assets/gift/Futuro viaje.png"
        },
        {
                "name": "Galaxia",
                "coins": 1000,
                "iconUrl": "/assets/gift/Galaxia.png"
        },
        {
                "name": "Gamer Cat",
                "coins": 1000,
                "iconUrl": "/assets/gift/Gamer Cat.png"
        },
        {
                "name": "Gatita Bruja",
                "coins": 1000,
                "iconUrl": "/assets/gift/Gatita Bruja.png"
        },
        {
                "name": "Gato terrorífico",
                "coins": 1000,
                "iconUrl": "/assets/gift/Gato terrorífico.png"
        },
        {
                "name": "jets volando",
                "coins": 1000,
                "iconUrl": "/assets/gift/jets volando.png"
        },
        {
                "name": "La pandilla de bu",
                "coins": 1000,
                "iconUrl": "/assets/gift/La pandilla de bu.png"
        },
        {
                "name": "Globo de aire brillante",
                "coins": 1000,
                "iconUrl": "/assets/gift/Shiny air balloon.png"
        },
        {
                "name": "Wanda la bruja",
                "coins": 1000,
                "iconUrl": "/assets/gift/Wanda la bruja.png"
        },
        {
                "name": "Fuegos artificiales",
                "coins": 1088,
                "iconUrl": "/assets/gift/Fuegos Artificiales.png"
        },
        {
                "name": "Bajo control",
                "coins": 1500,
                "iconUrl": "/assets/gift/Bajo Control.png"
        },
        {
                "name": "Tarjeta de felicitación",
                "coins": 1500,
                "iconUrl": "/assets/gift/Greeting Card.png"
        },
        {
                "name": "Aquí vamos",
                "coins": 1799,
                "iconUrl": "/assets/gift/Here We Go.png"
        },
        {
                "name": "Gota de amor",
                "coins": 1800,
                "iconUrl": "/assets/gift/Love Drop.png"
        },
        {
                "name": "Cooper vuela a casa",
                "coins": 1999,
                "iconUrl": "/assets/gift/Cooper Flies Home.png"
        },
        {
                "name": "Fuegos artificiales misteriosos",
                "coins": 1999,
                "iconUrl": "/assets/gift/Fuegos Artificiales Misteriosos.png"
        },
        {
                "name": "Estrella de la alfombra roja",
                "coins": 1999,
                "iconUrl": "/assets/gift/Red Carpet.png"
        },
        {
                "name": "Ballena Sumergida",
                "coins": 2150,
                "iconUrl": "/assets/gift/Ballena Sumergida.png"
        },
        {
                "name": "Ballena sumergiéndose",
                "coins": 2150,
                "iconUrl": "/assets/gift/Ballena.png"
        },
        {
                "name": "Banda de animales",
                "coins": 2500,
                "iconUrl": "/assets/gift/Banda animal.png"
        },
        {
                "name": "Motocicleta",
                "coins": 2988,
                "iconUrl": "/assets/gift/moto.png"
        },
        {
                "name": "Oso rítmico",
                "coins": 2999,
                "iconUrl": "/assets/gift/Rhythemic Bear.png"
        },
        {
                "name": "Lluvia de meteoros",
                "coins": 3000,
                "iconUrl": "/assets/gift/Lluvia de meteoritos.png"
        },
        {
                "name": "Tu concierto",
                "coins": 4500,
                "iconUrl": "/assets/gift/Tu concierto.png"
        },
        {
                "name": "Jet privado",
                "coins": 4888,
                "iconUrl": "/assets/gift/Jet Privado premiun.png"
        },
        {
                "name": "Jet privado",
                "coins": 4888,
                "iconUrl": "/assets/gift/Jet Privado.png"
        },
        {
                "name": "Leon el gatito",
                "coins": 4888,
                "iconUrl": "/assets/gift/Leon Gatito.png"
        },
        {
                "name": "Jungla",
                "coins": 5000,
                "iconUrl": "/assets/gift/Jungla.png"
        },
        {
                "name": "Magic Forest",
                "coins": 5000,
                "iconUrl": "/assets/gift/Magic Forest.png"
        },
        {
                "name": "Pistola de diamantes",
                "coins": 5000,
                "iconUrl": "/assets/gift/Pistola de Diamantes.png"
        },
        {
                "name": "Portal antiguo",
                "coins": 5000,
                "iconUrl": "/assets/gift/Portal antiguo.png"
        },
        {
                "name": "Pueblo Embrujado",
                "coins": 5000,
                "iconUrl": "/assets/gift/Pueblo Embrujado.png"
        },
        {
                "name": "Fantasía de unicornio",
                "coins": 5000,
                "iconUrl": "/assets/gift/Unicornio.png"
        },
        {
                "name": "Corazón devoto",
                "coins": 5999,
                "iconUrl": "/assets/gift/Voto.png"
        },
        {
                "name": "Ciudad del futuro",
                "coins": 6000,
                "iconUrl": "/assets/gift/cuidad del futuro.png"
        },
        {
                "name": "Trabaja duro, juega más duro",
                "coins": 6000,
                "iconUrl": "/assets/gift/Trabaja Duro.png"
        },
        {
                "name": "Lili la leoparda",
                "coins": 6599,
                "iconUrl": "/assets/gift/Lili.png"
        },
        {
                "name": "Tiempo de celebración",
                "coins": 6999,
                "iconUrl": "/assets/gift/Celebration Time.png"
        },
        {
                "name": "Fiesta feliz",
                "coins": 6999,
                "iconUrl": "/assets/gift/Happy Party.png"
        },
        {
                "name": "Carro Deportivo",
                "coins": 7000,
                "iconUrl": "/assets/gift/Carro Deportivo.png"
        },
        {
                "name": "Interestelar",
                "coins": 10000,
                "iconUrl": "/assets/gift/interstellar.png"
        },
        {
                "name": "Halcón",
                "coins": 10999,
                "iconUrl": "/assets/gift/Halcón.png"
        },
        {
                "name": "Relámpago rojo",
                "coins": 12000,
                "iconUrl": "/assets/gift/Red Lightning.png"
        },
        {
                "name": "Galope dorado",
                "coins": 15000,
                "iconUrl": "/assets/gift/Golden.png"
        },
        {
                "name": "Leopardo",
                "coins": 15000,
                "iconUrl": "/assets/gift/Leopardo.png"
        },
        {
                "name": "Parque de atracciones",
                "coins": 17000,
                "iconUrl": "/assets/gift/Amusement Park.png"
        },
        {
                "name": "Vuelo de amor",
                "coins": 19999,
                "iconUrl": "/assets/gift/Fly Love.png"
        },
        {
                "name": "Fantasía de castillo",
                "coins": 20000,
                "iconUrl": "/assets/gift/Castillo.png"
        },
        {
                "name": "Transbordador premium",
                "coins": 20000,
                "iconUrl": "/assets/gift/Premium Shuttle.png"
        },
        {
                "name": "Transbordador de TikTok",
                "coins": 20000,
                "iconUrl": "/assets/gift/TikTok Shuttle.png"
        },
        {
                "name": "El sueño de Adam",
                "coins": 25999,
                "iconUrl": "/assets/gift/Adams Dream.png"
        },
        {
                "name": "Phoenix",
                "coins": 25999,
                "iconUrl": "/assets/gift/Fenix.png"
        },
        {
                "name": "Fire Phoenix",
                "coins": 25999,
                "iconUrl": "/assets/gift/Phoenix de Fuego.png"
        },
        {
                "name": "Llama de dragón",
                "coins": 26999,
                "iconUrl": "/assets/gift/Dragon Flame.png"
        },
        {
                "name": "Bulevar",
                "coins": 29999,
                "iconUrl": "/assets/gift/Bulevar.png"
        },
        {
                "name": "Lion and Cub",
                "coins": 29999,
                "iconUrl": "/assets/gift/Leon y Leoncito.png"
        },
        {
                "name": "Lion",
                "coins": 29999,
                "iconUrl": "/assets/gift/Leon.png"
        },
        {
                "name": "Lion and Lili",
                "coins": 29999,
                "iconUrl": "/assets/gift/Leoncito y lili.png"
        },
        {
                "name": "Noria",
                "coins": 29999,
                "iconUrl": "/assets/gift/Noria.png"
        },
        {
                "name": "Rio de janeiro",
                "coins": 29999,
                "iconUrl": "/assets/gift/Rio de janeiro.png"
        },
        {
                "name": "Gorila",
                "coins": 30000,
                "iconUrl": "/assets/gift/Gorilla.png"
        },
        {
                "name": "Zeus",
                "coins": 34000,
                "iconUrl": "/assets/gift/Zeus.png"
        },
        {
                "name": "Halcón de trueno",
                "coins": 39999,
                "iconUrl": "/assets/gift/Halcón de Trueno.png"
        },
        {
                "name": "Pegaso",
                "coins": 42999,
                "iconUrl": "/assets/gift/Pegaso.png"
        }
];

    const giftNameMappings = {
        "rose": "rosa",
        "white rose": "rosa blanca",
        "corn": "es maíz",
        "it's corn": "es maíz",
        "it’s corn": "es maíz",
        "tiktok": "tik tok",
        "tiktok universe": "tik tok universo",
        "heart": "corazón",
        "donut": "dona",
        "paper duck": "pato",
        "duck": "pato",
        "finger heart": "corazón coreano",
        "crown": "corona",
        "gg": "buen juego (gg)",
        "cap": "gorra",
        "tom's hug": "abrazo de tom",
        "capybara": "capibara",
        "love you": "te amo",
        "rose cosmic": "rose cosmic",
        "rose eternity": "rose eternity",
        "rose big": "rose big",
        "coffee charm": "encanto del café",
        "coffee cup": "encanto del café",
        "motorcycle": "moto",
        "star": "estrella",
        
        "rosa": "rose",
        "rosa blanca": "white rose",
        "es maíz": "corn",
        "maiz": "corn",
        "tik tok": "tiktok",
        "tik tok universo": "tiktok universe",
        "corazón": "heart",
        "corazon": "heart",
        "dona": "donut",
        "pato": "duck",
        "corazón coreano": "finger heart",
        "corona": "crown",
        "buen juego (gg)": "gg",
        "gorra": "cap",
        "abrazo de tom": "tom's hug",
        "capibara": "capybara",
        "te amo": "love you",
        "rosa cosmica": "rose cosmic",
        "rosa de la eternidad": "rose eternity",
        "rosa grande": "rose big",
        "encanto del café": "coffee charm",
        "moto": "motorcycle",
        "estrella": "star"
    };

    function normalizeGiftName(name) {
        if (!name) return "";
        return name.toLowerCase()
            .replace(/\s+/g, '') // remove spaces
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents
    }

    function findDefaultGift(triggerName) {
        if (!triggerName) return null;
        const normTrigger = normalizeGiftName(triggerName);
        
        // 1. Direct match (space & accent insensitive)
        let found = DEFAULT_GIFTS.find(g => normalizeGiftName(g.name) === normTrigger);
        if (found) return found;
        
        // 2. Mapped translation match
        const cleanTrigger = triggerName.toLowerCase().trim();
        const mapped = giftNameMappings[cleanTrigger];
        if (mapped) {
            const normMapped = normalizeGiftName(mapped);
            found = DEFAULT_GIFTS.find(g => normalizeGiftName(g.name) === normMapped);
            if (found) return found;
        }
        
        // 3. Accent-only insensitive translation match
        const normCleanTrigger = cleanTrigger.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const mappedNorm = giftNameMappings[normCleanTrigger];
        if (mappedNorm) {
            const normMappedNorm = normalizeGiftName(mappedNorm);
            found = DEFAULT_GIFTS.find(g => normalizeGiftName(g.name) === normMappedNorm);
            if (found) return found;
        }
        
        return null;
    }

    let activeEditRowIndex = null;
    let localPreviewAudio = null;
    let currentlyPlayingIdx = null;

    // 2. DOM Elements
    const btnCreateAlert = document.getElementById('btn-create-sound-alert');
    const tableBody = document.getElementById('sound-alerts-body');
    const searchAlertsInput = document.getElementById('search-alerts');
    const alertsStatusText = document.getElementById('alerts-status-text');
    
    // Modals
    const giftModal = document.getElementById('gift-selector-modal');
    const btnCloseGiftModal = document.getElementById('btn-close-gift-modal');
    const giftsGrid = document.getElementById('gifts-grid-container');
    const searchGiftsInput = document.getElementById('search-gifts-input');

    const soundModal = document.getElementById('sound-selector-modal');
    const btnCloseSoundModal = document.getElementById('btn-close-sound-modal');
    const systemSoundsList = document.getElementById('system-sounds-list');
    const customSoundsList = document.getElementById('custom-sounds-list');
    const searchSoundsInput = document.getElementById('search-sounds-input');
    
    const btnTriggerUpload = document.getElementById('btn-trigger-upload-sound');
    const soundFileInput = document.getElementById('sound-file-input');
    const dropzone = document.getElementById('sound-upload-dropzone');

    // 3. Render Table
    window.renderSoundAlertsTable = function(alerts) {
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const searchQuery = (searchAlertsInput ? searchAlertsInput.value.toLowerCase().trim() : '');
        const filtered = alerts.filter((alert, idx) => {
            if (!searchQuery) return true;
            const typeText = alert.type === 'gift' ? 'regalo' : (alert.type === 'follow' ? 'seguir' : (alert.type === 'share' ? 'compartir' : 'like tap tap'));
            const triggerText = (alert.trigger || '').toLowerCase();
            const soundText = (alert.soundName || '').toLowerCase();
            return typeText.includes(searchQuery) || triggerText.includes(searchQuery) || soundText.includes(searchQuery);
        });

        // Update status text
        if (alertsStatusText) {
            const activeCount = alerts.filter(a => a.enabled).length;
            alertsStatusText.textContent = `${alerts.length} alertas creadas (${activeCount} activas)`;
        }

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
                        No se encontraron alertas configuradas. Haz clic en "+ Crear alerta sonora" para empezar.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach((alert, actualIdx) => {
            const idx = alerts.indexOf(alert);
            const tr = document.createElement('tr');
            
            // Play icon
            const isPlaying = (currentlyPlayingIdx === idx);
            const playIcon = isPlaying ? 'square' : 'play';
            
            // Gift icon url
            let giftIconHtml = '';
            if (alert.type === 'gift') {
                const metadata = chatbotConfig.giftMetadata || {};
                const defaultGift = findDefaultGift(alert.trigger);
                
                let iconSrc = 'assets/neutral-logo.jpg';
                if (defaultGift && defaultGift.iconUrl && (defaultGift.iconUrl.startsWith('assets/') || defaultGift.iconUrl.startsWith('/assets/'))) {
                    iconSrc = defaultGift.iconUrl;
                } else {
                    const cleanTrigger = (alert.trigger || '').toLowerCase().trim();
                    const mappedTrigger = giftNameMappings[cleanTrigger] || alert.trigger;
                    const giftMeta = metadata[alert.trigger] || metadata[mappedTrigger] || defaultGift;
                    if (giftMeta) iconSrc = giftMeta.iconUrl;
                }
                giftIconHtml = `<img src="${iconSrc}" style="width: 20px; height: 20px; object-fit: contain; border-radius: 4px;">`;
            }

            // Generate row HTML
            tr.innerHTML = `
                <td>
                    <button class="btn-icon btn-test-sound" data-idx="${idx}" style="color: ${isPlaying ? 'var(--accent-pink)' : 'var(--text-main)'}; background: transparent; border: none; cursor: pointer;">
                        <i data-lucide="${playIcon}" style="width: 18px; height: 18px;"></i>
                    </button>
                </td>
                <td>
                    <button class="btn-icon btn-delete-alert" data-idx="${idx}" style="color: var(--accent-red); background: transparent; border: none; cursor: pointer;">
                        <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                    </button>
                </td>
                <td>
                    <input type="checkbox" class="alert-row-enabled" data-idx="${idx}" ${alert.enabled ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--accent-pink);">
                </td>
                <td>
                    <select class="alert-row-type" data-idx="${idx}" style="padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color); color: var(--text-main); font-weight: 700; width: 100%;">
                        <option value="gift" ${alert.type === 'gift' ? 'selected' : ''}>Regalo</option>
                        <option value="follow" ${alert.type === 'follow' ? 'selected' : ''}>Seguir</option>
                        <option value="share" ${alert.type === 'share' ? 'selected' : ''}>Compartir</option>
                        <option value="like" ${alert.type === 'like' ? 'selected' : ''}>Like / Tap Tap</option>
                    </select>
                </td>
                <td>
                    ${alert.type === 'gift' 
                        ? `<button class="gift-trigger-btn" data-idx="${idx}">${giftIconHtml} <span>${alert.trigger || 'Rose'}</span></button>` 
                        : `<span style="color: var(--text-muted); font-size: 12px; font-weight: 600; padding-left: 8px;">Cualquiera</span>`
                    }
                </td>
                <td>
                    <input type="number" class="alert-row-qty" data-idx="${idx}" min="1" value="${alert.cantidad || 1}" 
                        style="padding: 6px 10px; border-radius: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-main); text-align: center; width: 70px;"
                        ${(alert.type === 'follow' || alert.type === 'share') ? 'disabled style="opacity: 0.3;"' : ''}
                    >
                </td>
                <td>
                    <button class="btn-sound-select" data-idx="${idx}">
                        <span>${alert.soundName || 'Seleccionar sonido...'}</span>
                        <i data-lucide="chevron-down" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
                    </button>
                </td>
                <td>
                    <div class="volume-slider-container">
                        <input type="range" class="alert-row-volume" data-idx="${idx}" min="0" max="100" value="${alert.volume !== undefined ? alert.volume : 100}">
                        <span class="volume-val">${alert.volume !== undefined ? alert.volume : 100}%</span>
                    </div>
                </td>
            `;

            tableBody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Attach listeners
        attachRowListeners();
    };

    function attachRowListeners() {
        // Play/Preview
        document.querySelectorAll('.btn-test-sound').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                const alert = chatbotConfig.soundAlerts[idx];
                if (!alert || !alert.sound) return;

                if (currentlyPlayingIdx === idx) {
                    stopSoundPreview();
                } else {
                    playSoundPreview(alert.sound, alert.volume !== undefined ? alert.volume : 100, idx);
                }
            });
        });

        // Delete
        document.querySelectorAll('.btn-delete-alert').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                chatbotConfig.soundAlerts.splice(idx, 1);
                saveSoundAlertsSettings();
            });
        });

        // Enabled checkbox
        document.querySelectorAll('.alert-row-enabled').forEach(cb => {
            cb.addEventListener('change', () => {
                const idx = parseInt(cb.getAttribute('data-idx'));
                chatbotConfig.soundAlerts[idx].enabled = cb.checked;
                saveSoundAlertsSettings();
            });
        });

        // Type select change
        document.querySelectorAll('.alert-row-type').forEach(sel => {
            sel.addEventListener('change', () => {
                const idx = parseInt(sel.getAttribute('data-idx'));
                const type = sel.value;
                chatbotConfig.soundAlerts[idx].type = type;
                if (type === 'gift') {
                    chatbotConfig.soundAlerts[idx].trigger = 'Rose';
                    chatbotConfig.soundAlerts[idx].cantidad = 1;
                } else if (type === 'like') {
                    chatbotConfig.soundAlerts[idx].trigger = 'likes';
                    chatbotConfig.soundAlerts[idx].cantidad = 100;
                } else {
                    chatbotConfig.soundAlerts[idx].trigger = '';
                    chatbotConfig.soundAlerts[idx].cantidad = 1;
                }
                saveSoundAlertsSettings();
            });
        });

        // Quantity change
        document.querySelectorAll('.alert-row-qty').forEach(inp => {
            inp.addEventListener('change', () => {
                const idx = parseInt(inp.getAttribute('data-idx'));
                chatbotConfig.soundAlerts[idx].cantidad = parseInt(inp.value) || 1;
                saveSoundAlertsSettings();
            });
        });

        // Volume range input
        document.querySelectorAll('.alert-row-volume').forEach(range => {
            range.addEventListener('input', (e) => {
                const idx = parseInt(range.getAttribute('data-idx'));
                const val = range.value;
                const parent = range.closest('.volume-slider-container');
                if (parent) {
                    const label = parent.querySelector('.volume-val');
                    if (label) label.textContent = `${val}%`;
                }
            });

            range.addEventListener('change', () => {
                const idx = parseInt(range.getAttribute('data-idx'));
                chatbotConfig.soundAlerts[idx].volume = parseInt(range.value);
                saveSoundAlertsSettings();
            });
        });

        // Gift Trigger Select Button Click
        document.querySelectorAll('.gift-trigger-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                activeEditRowIndex = parseInt(btn.getAttribute('data-idx'));
                openGiftModal();
            });
        });

        // Sound Select Button Click
        document.querySelectorAll('.btn-sound-select').forEach(btn => {
            btn.addEventListener('click', () => {
                activeEditRowIndex = parseInt(btn.getAttribute('data-idx'));
                openSoundModal();
            });
        });
    }

    function saveSoundAlertsSettings() {
        socket.emit('update_chatbot_settings', { soundAlerts: chatbotConfig.soundAlerts });
    }

    // 4. Preview Sound Logic
    function playSoundPreview(soundUrl, volume, idx) {
        stopSoundPreview();
        
        localPreviewAudio = new Audio(soundUrl);
        localPreviewAudio.volume = volume / 100;
        currentlyPlayingIdx = idx;
        
        renderSoundAlertsTable(chatbotConfig.soundAlerts || []);

        localPreviewAudio.play().catch(e => {
            console.error('Failed to preview sound:', e);
            stopSoundPreview();
        });

        localPreviewAudio.addEventListener('ended', () => {
            stopSoundPreview();
        });
    }

    function stopSoundPreview() {
        if (localPreviewAudio) {
            localPreviewAudio.pause();
            localPreviewAudio = null;
        }
        currentlyPlayingIdx = null;
        renderSoundAlertsTable(chatbotConfig.soundAlerts || []);
    }

    // 5. Create Button Event
    if (btnCreateAlert) {
        btnCreateAlert.addEventListener('click', () => {
            if (!chatbotConfig.soundAlerts) {
                chatbotConfig.soundAlerts = [];
            }
            // Add a default gift sound alert (Rose - bruh.mp3)
            chatbotConfig.soundAlerts.push({
                id: `alert_${Date.now()}`,
                enabled: true,
                type: 'gift',
                trigger: 'Rose',
                cantidad: 1,
                sound: '/sounds/bruh.mp3',
                soundName: 'GRLive Bruh',
                volume: 100
            });
            saveSoundAlertsSettings();
        });
    }

    if (searchAlertsInput) {
        searchAlertsInput.addEventListener('input', () => {
            renderSoundAlertsTable(chatbotConfig.soundAlerts || []);
        });
    }

    // 6. Gift Selector Modal Operations
    function openGiftModal() {
        if (!giftModal) return;
        giftModal.style.display = 'flex';
        renderGiftsGrid('');
    }

    function closeGiftModal() {
        if (giftModal) giftModal.style.display = 'none';
        activeEditRowIndex = null;
    }

    if (btnCloseGiftModal) btnCloseGiftModal.addEventListener('click', closeGiftModal);
    if (giftModal) {
        giftModal.addEventListener('click', (e) => {
            if (e.target === giftModal) closeGiftModal();
        });
    }

    if (searchGiftsInput) {
        searchGiftsInput.addEventListener('input', (e) => {
            renderGiftsGrid(e.target.value);
        });
    }

    function renderGiftsGrid(searchQuery) {
        if (!giftsGrid) return;
        giftsGrid.innerHTML = '';

        const query = searchQuery.toLowerCase().trim();
        
        // Merge default gifts and dynamic cached ones from server metadata
        const metadata = chatbotConfig.giftMetadata || {};
        const allGiftsMap = {};
        
        // Load default gifts first (clone to avoid modifying original array objects)
        DEFAULT_GIFTS.forEach(g => {
            allGiftsMap[g.name.toLowerCase()] = { ...g };
        });

        // Load cached gifts next (preserving custom local icons starting with 'assets/')
        Object.keys(metadata).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (allGiftsMap[lowerKey]) {
                // Only override if the default gift does NOT have a local icon
                if (!allGiftsMap[lowerKey].iconUrl || (!allGiftsMap[lowerKey].iconUrl.startsWith('assets/') && !allGiftsMap[lowerKey].iconUrl.startsWith('/assets/'))) {
                    allGiftsMap[lowerKey].iconUrl = metadata[key].iconUrl;
                }
            } else {
                allGiftsMap[lowerKey] = {
                    name: metadata[key].name,
                    coins: metadata[key].coins,
                    iconUrl: metadata[key].iconUrl
                };
            }
        });

        const list = Object.values(allGiftsMap).sort((a,b) => a.coins - b.coins);
        const filtered = list.filter(g => g.name.toLowerCase().includes(query));

        if (filtered.length === 0) {
            giftsGrid.innerHTML = `<div style="grid-column: span 4; text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron regalos.</div>`;
            return;
        }

        filtered.forEach(gift => {
            const item = document.createElement('div');
            item.className = 'gift-item';
            item.innerHTML = `
                <img src="${gift.iconUrl || 'assets/neutral-logo.jpg'}" alt="${gift.name}">
                <span class="gift-name">${gift.name}</span>
                <span class="gift-coins">${gift.coins} <span style="color: #ffd700;">●</span></span>
            `;
            item.addEventListener('click', () => {
                if (activeEditRowIndex !== null && chatbotConfig.soundAlerts[activeEditRowIndex]) {
                    chatbotConfig.soundAlerts[activeEditRowIndex].trigger = gift.name;
                    saveSoundAlertsSettings();
                }
                closeGiftModal();
            });
            giftsGrid.appendChild(item);
        });
    }

    // 7. Sound Selector Modal Operations
    function openSoundModal() {
        if (!soundModal) return;
        soundModal.style.display = 'flex';
        renderSoundsList('');
    }

    function closeSoundModal() {
        if (soundModal) soundModal.style.display = 'none';
        activeEditRowIndex = null;
    }

    if (btnCloseSoundModal) btnCloseSoundModal.addEventListener('click', closeSoundModal);
    if (soundModal) {
        soundModal.addEventListener('click', (e) => {
            if (e.target === soundModal) closeSoundModal();
        });
    }

    if (searchSoundsInput) {
        searchSoundsInput.addEventListener('input', (e) => {
            renderSoundsList(e.target.value);
        });
    }

    let modalPreviewAudio = null;
    let modalPlayingUrl = null;

    function playModalSoundPreview(url, btn) {
        if (modalPreviewAudio && modalPlayingUrl === url) {
            modalPreviewAudio.pause();
            modalPreviewAudio = null;
            modalPlayingUrl = null;
            if (btn) btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px;"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Reset all play buttons in modal
        document.querySelectorAll('.btn-modal-preview-sound').forEach(b => {
            b.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px;"></i>';
        });

        if (modalPreviewAudio) {
            modalPreviewAudio.pause();
        }

        modalPreviewAudio = new Audio(url);
        modalPlayingUrl = url;
        if (btn) btn.innerHTML = '<i data-lucide="square" style="width: 14px; height: 14px;"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        modalPreviewAudio.play().catch(e => {
            console.error(e);
            if (btn) btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px;"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            modalPreviewAudio = null;
            modalPlayingUrl = null;
        });

        modalPreviewAudio.addEventListener('ended', () => {
            if (btn) btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px;"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            modalPreviewAudio = null;
            modalPlayingUrl = null;
        });
    }

    function renderSoundsList(searchQuery) {
        if (!systemSoundsList || !customSoundsList) return;
        systemSoundsList.innerHTML = '';
        customSoundsList.innerHTML = '';

        const query = searchQuery.toLowerCase().trim();

        // 1. System Sounds
        const filteredSystem = SYSTEM_SOUNDS.filter(s => s.name.toLowerCase().includes(query));
        if (filteredSystem.length === 0) {
            systemSoundsList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">No se encontraron sonidos de sistema.</div>`;
        } else {
            filteredSystem.forEach(sound => {
                const item = document.createElement('div');
                item.className = 'sound-list-item';
                item.innerHTML = `
                    <div class="sound-info">
                        <i data-lucide="music" style="width: 14px; height: 14px;"></i>
                        <span>${sound.name}</span>
                    </div>
                    <div class="sound-actions">
                        <button class="btn-modal-preview-sound btn secondary small" data-url="${sound.url}" style="padding: 6px 10px;">
                            <i data-lucide="play" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn-modal-select-sound btn primary small" data-url="${sound.url}" data-name="${sound.name}" style="padding: 6px 12px; font-size: 11px;">
                            Seleccionar
                        </button>
                    </div>
                `;
                
                // Add preview listener
                const previewBtn = item.querySelector('.btn-modal-preview-sound');
                previewBtn.addEventListener('click', () => {
                    playModalSoundPreview(sound.url, previewBtn);
                });

                // Add select listener
                const selectBtn = item.querySelector('.btn-modal-select-sound');
                selectBtn.addEventListener('click', () => {
                    if (activeEditRowIndex !== null && chatbotConfig.soundAlerts[activeEditRowIndex]) {
                        chatbotConfig.soundAlerts[activeEditRowIndex].sound = sound.url;
                        chatbotConfig.soundAlerts[activeEditRowIndex].soundName = sound.name;
                        saveSoundAlertsSettings();
                    }
                    if (modalPreviewAudio) modalPreviewAudio.pause();
                    closeSoundModal();
                });

                systemSoundsList.appendChild(item);
            });
        }

        // 2. Custom Uploaded Sounds
        const customSounds = chatbotConfig.customSounds || [];
        const filteredCustom = customSounds.filter(s => s.name.toLowerCase().includes(query));
        if (filteredCustom.length === 0) {
            customSoundsList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">Aún no has subido sonidos. Sube un archivo .mp3 o .wav para verlo aquí.</div>`;
        } else {
            filteredCustom.forEach(sound => {
                const item = document.createElement('div');
                item.className = 'sound-list-item';
                item.innerHTML = `
                    <div class="sound-info">
                        <i data-lucide="volume-2" style="width: 14px; height: 14px;"></i>
                        <span>${sound.name}</span>
                    </div>
                    <div class="sound-actions">
                        <button class="btn-modal-preview-sound btn secondary small" data-url="${sound.filepath}" style="padding: 6px 10px;">
                            <i data-lucide="play" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn-modal-select-sound btn primary small" data-url="${sound.filepath}" data-name="${sound.name}" style="padding: 6px 12px; font-size: 11px;">
                            Seleccionar
                        </button>
                        <button class="btn-modal-delete-sound btn danger small" data-id="${sound.id}" style="padding: 6px 8px; color: var(--accent-red); background: transparent; border: 1px solid rgba(255,0,0,0.15);">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                `;

                // Add preview listener
                const previewBtn = item.querySelector('.btn-modal-preview-sound');
                previewBtn.addEventListener('click', () => {
                    playModalSoundPreview(sound.filepath, previewBtn);
                });

                // Add select listener
                const selectBtn = item.querySelector('.btn-modal-select-sound');
                selectBtn.addEventListener('click', () => {
                    if (activeEditRowIndex !== null && chatbotConfig.soundAlerts[activeEditRowIndex]) {
                        chatbotConfig.soundAlerts[activeEditRowIndex].sound = sound.filepath;
                        chatbotConfig.soundAlerts[activeEditRowIndex].soundName = sound.name;
                        saveSoundAlertsSettings();
                    }
                    if (modalPreviewAudio) modalPreviewAudio.pause();
                    closeSoundModal();
                });

                // Add delete listener
                const deleteBtn = item.querySelector('.btn-modal-delete-sound');
                deleteBtn.addEventListener('click', () => {
                    if (confirm(`¿Estás seguro de eliminar el sonido "${sound.name}"?`)) {
                        deleteCustomSound(sound.id);
                    }
                });

                customSoundsList.appendChild(item);
            });
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // 8. Custom Sound Upload Actions
    if (btnTriggerUpload && soundFileInput) {
        btnTriggerUpload.addEventListener('click', () => {
            soundFileInput.click();
        });
    }

    if (soundFileInput) {
        soundFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                uploadSoundFile(file);
            }
        });
    }

    // Drag and drop dropzone
    if (dropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const file = dt.files[0];
            if (file && (file.type === 'audio/mpeg' || file.type === 'audio/wav' || file.name.endsWith('.mp3') || file.name.endsWith('.wav'))) {
                uploadSoundFile(file);
            } else {
                alert('Por favor, arrastra solo archivos de audio (.mp3 o .wav).');
            }
        });
    }

    function uploadSoundFile(file) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = function() {
            const base64Data = reader.result;
            
            // Show uploading status
            if (btnTriggerUpload) btnTriggerUpload.innerHTML = '<i data-lucide="loader" class="spin" style="width: 14px; height: 14px;"></i> Subiendo...';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            fetch('/api/upload-sound', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: file.name,
                    fileData: base64Data
                })
            })
            .then(res => res.json())
            .then(data => {
                // Reset upload button
                if (btnTriggerUpload) btnTriggerUpload.innerHTML = '<i data-lucide="upload" style="width: 14px; height: 14px;"></i> Subir Audio';
                if (typeof lucide !== 'undefined') lucide.createIcons();

                if (data.success) {
                    console.log('Sound uploaded successfully:', data.sound);
                    // Refresh selectors
                    renderSoundsList(searchSoundsInput ? searchSoundsInput.value : '');
                } else {
                    alert('Error subiendo sonido: ' + (data.error || 'Desconocido'));
                }
            })
            .catch(err => {
                if (btnTriggerUpload) btnTriggerUpload.innerHTML = '<i data-lucide="upload" style="width: 14px; height: 14px;"></i> Subir Audio';
                if (typeof lucide !== 'undefined') lucide.createIcons();
                console.error('Error uploading file:', err);
                alert('Fallo la conexión con el servidor para subir el sonido.');
            });
        };
    }

    function deleteCustomSound(id) {
        fetch(`/api/upload-sound/${id}`, {
            method: 'DELETE'
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                console.log('Sound deleted successfully.');
                renderSoundsList(searchSoundsInput ? searchSoundsInput.value : '');
            } else {
                alert('Error al borrar: ' + (data.error || 'Desconocido'));
            }
        })
        .catch(err => {
            console.error('Error deleting sound:', err);
            alert('Error en conexión al intentar borrar el sonido.');
        });
    }

    // =========================================================================
    // DYNAMIC METAS (GOALS) & WHEEL OPTIONS (RULETA) LOGIC
    // =========================================================================

    // Render goals table in chatbot settings view
    function renderGoalsList(goals) {
        const tbody = document.getElementById('goals-table-body');
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
            if (goal.type === 'likes') typeLabel = 'Me Gusta (Likes)';
            else if (goal.type === 'follows') typeLabel = 'Seguidores';
            else if (goal.type === 'shares') typeLabel = 'Compartidos';
            else if (goal.type === 'gift') {
                typeLabel = `Regalo: ${goal.giftName || 'Cualquiera'}`;
            }

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
                    <button class="btn-delete" onclick="window.deleteGoal(${index})" style="background: transparent; border: none; color: #ff3366; cursor: pointer; padding: 5px;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // Render wheel options list
    function renderWheelOptionsList(options) {
        const container = document.getElementById('wheel-options-list');
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
    }

    // Define global action hooks
    window.deleteGoal = function(index) {
        if (!chatbotConfig || !chatbotConfig.goals) return;
        chatbotConfig.goals.splice(index, 1);
        renderGoalsList(chatbotConfig.goals);
        sendUpdatedSettings();
    };

    window.deleteWheelOption = function(index) {
        if (!chatbotConfig || !chatbotConfig.wheelOptions) return;
        if (chatbotConfig.wheelOptions.length <= 3) {
            alert('La ruleta debe tener al menos 3 opciones.');
            return;
        }
        chatbotConfig.wheelOptions.splice(index, 1);
        renderWheelOptionsList(chatbotConfig.wheelOptions);
        sendUpdatedSettings();
    };

    // Wire goal creator
    const btnAddGoal = document.getElementById('btn-add-goal');
    if (btnAddGoal) {
        btnAddGoal.addEventListener('click', () => {
            const type = document.getElementById('goal-type').value;
            const giftName = document.getElementById('goal-gift-name').value.trim();
            const title = document.getElementById('goal-title').value.trim();
            const target = parseInt(document.getElementById('goal-target').value) || 100;

            if (!title) {
                alert('Por favor ingresa un título para la meta.');
                return;
            }

            if (type === 'gift' && !giftName) {
                alert('Por favor especifica el nombre del regalo.');
                return;
            }

            if (!chatbotConfig.goals) {
                chatbotConfig.goals = [];
            }

            const newGoal = {
                id: 'goal_' + Date.now(),
                type: type,
                giftName: type === 'gift' ? giftName : '',
                title: title,
                target: target,
                current: 0,
                enabled: true
            };

            chatbotConfig.goals.push(newGoal);
            renderGoalsList(chatbotConfig.goals);
            sendUpdatedSettings();

            // Clear inputs
            document.getElementById('goal-title').value = '';
            document.getElementById('goal-gift-name').value = '';
        });
    }

    const btnResetAllGoals = document.getElementById('btn-reset-all-goals');
    if (btnResetAllGoals) {
        btnResetAllGoals.addEventListener('click', () => {
            if (!confirm('¿Estás seguro de reiniciar el progreso de todas las metas a 0?')) return;
            if (chatbotConfig && chatbotConfig.goals) {
                chatbotConfig.goals.forEach(goal => goal.current = 0);
                renderGoalsList(chatbotConfig.goals);
                sendUpdatedSettings();
            }
        });
    }

    const goalTypeSelect = document.getElementById('goal-type');
    const groupGoalGiftSelect = document.getElementById('group-goal-gift-select');
    if (goalTypeSelect && groupGoalGiftSelect) {
        const toggleGiftSelect = () => {
            groupGoalGiftSelect.style.display = goalTypeSelect.value === 'gift' ? 'block' : 'none';
        };
        goalTypeSelect.addEventListener('change', toggleGiftSelect);
        toggleGiftSelect(); // initial trigger
    }

    // Wire wheel option adder
    const btnAddWheelOption = document.getElementById('btn-add-wheel-option');
    if (btnAddWheelOption) {
        btnAddWheelOption.addEventListener('click', () => {
            const input = document.getElementById('wheel-new-option');
            const val = input.value.trim();
            if (!val) return;

            if (!chatbotConfig.wheelOptions) {
                chatbotConfig.wheelOptions = [];
            }

            chatbotConfig.wheelOptions.push(val);
            renderWheelOptionsList(chatbotConfig.wheelOptions);
            sendUpdatedSettings();

            input.value = '';
        });
    }

    // Dynamic goals update push
    socket.on('goals_updated', (goals) => {
        if (chatbotConfig) {
            chatbotConfig.goals = goals;
        }
        renderGoalsList(goals);
    });
});


