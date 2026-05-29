// Close Spotify auth popup if loaded inside one
if (window.opener && window.location.search.includes('spotify=')) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'error') {
        alert('Error vinculando Spotify: ' + (params.get('message') || 'desconocido'));
    }
    window.close();
}

const socket = io();

// DOM Elements
const statusText = document.getElementById('connection-status');
const statusIndicator = document.querySelector('.status-indicator');
const eventLog = document.getElementById('event-log');
const clearLogBtn = document.getElementById('clear-log');
const filterGiftsCheckbox = document.getElementById('filter-gifts');

// Navigation
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
    if (activeItem && footer) {
        const targetId = activeItem.getAttribute('data-target');
        footer.style.display = (targetId === 'overlays-view') ? 'flex' : 'none';
    }
});

// Socket.io Events
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
        document.title = "TikTok Live - Control Panel";
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
    
    // Rules Table
    renderRulesTable(config.userVoices || []);
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
        spotifyVoteSkipLimit: parseInt(document.getElementById('spotify-voteskip-limit').value) || 3
    };
    
    socket.emit('update_chatbot_settings', updated);
}

// Event Listeners for inputs changing
const inputsToWatch = [
    'bot-active', 'bot-play-location', 'bot-read-username', 
    'bot-prefix-required', 'bot-permission', 'bot-block-rare-languages', 
    'bot-banned-action', 'bot-default-voice', 'bot-tts-engine', 'bot-cloud-voice',
    'bot-exclusive-enabled',
    'setup-auto-connect', 'setup-theme', 'spotify-active', 'spotify-theme', 'spotify-position',
    'spotify-chat-queue-enabled', 'spotify-explicit-allowed', 'spotify-permission',
    'spotify-neon-color', 'spotify-vinyl-design', 'spotify-vinyl-speed'
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
            sendUpdatedSettings();
        });
    }
});

// For text inputs and textareas, update on 'blur' to avoid socket spam on typing
const textInputsToWatch = [
    'bot-prefixes', 'bot-max-characters', 'bot-banned-words', 'bot-ignored-users',
    'bot-exclusive-user',
    'setup-tiktok-username', 'spotify-client-id', 'spotify-client-secret',
    'spotify-command-prefix', 'spotify-voteskip-limit'
];
textInputsToWatch.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('blur', sendUpdatedSettings);
});

// Save button click event handler
const btnSaveChatbot = document.getElementById('btn-save-chatbot-settings');
if (btnSaveChatbot) {
    btnSaveChatbot.addEventListener('click', () => {
        sendUpdatedSettings();
        const originalText = btnSaveChatbot.innerHTML;
        btnSaveChatbot.innerHTML = '<i data-lucide="check"></i> ¡Guardado!';
        btnSaveChatbot.style.backgroundColor = 'var(--accent-green)';
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
            btnSaveChatbot.innerHTML = originalText;
            btnSaveChatbot.style.backgroundColor = 'var(--accent-purple)';
            if (window.lucide) window.lucide.createIcons();
        }, 1500);
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
    
    const uniqueId = (data.uniqueId || '').toLowerCase();
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
    if (imgEl) imgEl.src = track.cover;
    if (bgArtEl) {
        bgArtEl.style.background = track.bgGradient;
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
if (devDetails) {
    const devSummary = devDetails.querySelector('summary');
    if (devSummary) {
        devSummary.addEventListener('click', (e) => {
            if (!devDetails.open && !isDeveloperAuthenticated) {
                e.preventDefault();
                e.stopPropagation();
                
                const password = prompt('Acceso Restringido - Ingresa la contraseña de Desarrollador:');
                if (password === 'tavo_dev' || password === 'naya_dev') {
                    isDeveloperAuthenticated = true;
                    devDetails.open = true;
                } else {
                    alert('Acceso denegado.');
                }
            }
        });
    }
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
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});


