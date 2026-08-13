import { SocketClient } from './modules/socket-client.js';
import { UIManager } from './modules/ui-manager.js';
import { ThemesManager } from './modules/themes.js';
import { CanvasEditorManager } from './modules/canvas-editor.js';
import { AuthUI } from './auth/auth-ui.js';
import { authState } from './auth/auth-state.js';

// Initialize TavLive Auth System (FASE 2)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AuthUI.init();
        authState.restoreSession();
    });
} else {
    AuthUI.init();
    authState.restoreSession();
}

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

const socket = SocketClient.init();
let latestRemoteConfig = {};
let canvasEditor = null;

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
    const configViews = ['music-view', 'chatbot-view', 'setup-view', 'dynamics-view', 'ai-view'];
    if (configViews.includes(targetId)) {
        floatingSaveBtn.classList.add('visible');
    } else {
        floatingSaveBtn.classList.remove('visible');
    }
}

let isDeveloperAuthenticated = false;
let pendingNavigationTarget = null;

function switchToTab(item, targetId) {
    // Remove active class from all
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

    // Add active to current
    item.classList.add('active');
    if (targetId) {
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.style.display = 'block';
    }

    // Update header title dynamically
    const title = item.getAttribute('title') || 'Dashboard';
    const headerTitleEl = document.getElementById('header-view-title');
    if (headerTitleEl) headerTitleEl.textContent = title;

    // Update floating save button
    updateFloatingSaveButtonVisibility(targetId);

    // Show/Hide controls footer (only in Overlays view)
    const footer = document.querySelector('.controls-footer');
    if (footer) {
        footer.style.display = (targetId === 'overlays-view') ? 'flex' : 'none';
    }

    if (targetId === 'canvas-editor-view' && window.canvasEditor) {
        window.canvasEditor.renderWidgetToggles();
        window.canvasEditor.renderCanvasWidgets();
    }
}

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = item.getAttribute('data-target');

        // Access check removed for AI View (Requested by User)

        switchToTab(item, targetId);
    });
});

// Initialize footer state on load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme switching module
    ThemesManager.init();

    // Initialize unified OBS designer canvas editor
    canvasEditor = new CanvasEditorManager(SocketClient);
    window.canvasEditor = canvasEditor;

    const activeItem = document.querySelector('.menu-item.active');
    const footer = document.querySelector('.controls-footer');
    const targetId = activeItem ? activeItem.getAttribute('data-target') : '';
    if (footer) {
        footer.style.display = (targetId === 'overlays-view') ? 'flex' : 'none';
    }
    // Fetch dynamic version on load
    fetch('/api/version')
        .then(res => res.json())
        .then(data => {
            const versionLabel = document.getElementById('app-version-label');
            if (versionLabel) {
                versionLabel.textContent = `v${data.version}`;
            }
        })
        .catch(err => console.error('Error fetching version:', err));

    updateFloatingSaveButtonVisibility(targetId);

    // Listen to theme changed event
    window.addEventListener('theme:changed', (e) => {
        const theme = e.detail.theme;
        if (chatbotConfig) {
            chatbotConfig.themeName = theme;
            updateAiUI(chatbotConfig);
            sendUpdatedSettings();
        }
    });

    // Listen to save AI config button click
    const saveAiConfigBtn = document.getElementById('btn-save-ai-config');
    if (saveAiConfigBtn) {
        saveAiConfigBtn.addEventListener('click', () => {
            sendUpdatedSettings();
            showToast('¡Configuración de IA guardada con éxito!', 'success');
        });
    }
});

// Socket.io Events
let latencyInterval = null;

// Initial state if socket connected on load
if (socket.connected) {
    const localPillar = document.getElementById('status-pillar-local');
    if (localPillar) localPillar.className = 'status-pill status--connected';
}

socket.on('connect', () => {
    const localPillar = document.getElementById('status-pillar-local');
    if (localPillar) localPillar.className = 'status-pill status--connected';
    
    if (latencyInterval) clearInterval(latencyInterval);
    latencyInterval = setInterval(() => {
        const startTime = Date.now();
        socket.emit('ping_latency', () => {
            const latency = Date.now() - startTime;
            const latencyEl = document.getElementById('latency-val');
            if (latencyEl) latencyEl.textContent = latency + ' ms';
        });
    }, 5000);
});

socket.on('disconnect', () => {
    const localPillar = document.getElementById('status-pillar-local');
    if (localPillar) localPillar.className = 'status-pill status--disconnected';
    const latencyEl = document.getElementById('latency-val');
    if (latencyEl) latencyEl.textContent = '-- ms';
    if (latencyInterval) {
        clearInterval(latencyInterval);
        latencyInterval = null;
    }
});

socket.on('app_version', (version) => {
    const versionLabel = document.getElementById('app-version-label');
    if (versionLabel) {
        versionLabel.textContent = `v${version}`;
    }
});

socket.on('remote_config_updated', (config) => {
    if (!config) return;
    latestRemoteConfig = config;
});

let isTiktokConnected = false;

socket.on('system', (data) => {
    // Append to raw log
    appendLog('system', data.message);
    
    // Map system event type to toast type
    let toastType = 'info';
    if (data.type === 'connected' || data.type === 'success') {
        toastType = 'success';
    } else if (data.type === 'error') {
        toastType = 'error';
    } else if (data.type === 'warning') {
        toastType = 'warning';
    }
    
    // Show toast for all system events, except simple connection toggles which already have UI badges
    const isRedundantConnectionMsg = data.message.startsWith('Conectado a @') || 
                                     data.message === 'DESCONECTADO' || 
                                     data.message.startsWith('Desconectando y cambiando a @');
                                     
    if (!isRedundantConnectionMsg && data.message) {
        showToast(data.message, toastType);
    }
});

// Metrics Tracking & Uptime Counter
let connectionStartTime = null;
let uptimeInterval = null;
let accumulatedDiamonds = 0;

function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function startUptimeCounter() {
    if (uptimeInterval) clearInterval(uptimeInterval);
    connectionStartTime = Date.now();
    const uptimeEl = document.getElementById('metrics-uptime-timestamp');
    if (uptimeEl) uptimeEl.textContent = '00:00:00';
    const sessionUptimeEl = document.getElementById('session-uptime');
    if (sessionUptimeEl) sessionUptimeEl.textContent = 'Started 00:00:00 ago';
    
    uptimeInterval = setInterval(() => {
        if (connectionStartTime) {
            const elapsed = Date.now() - connectionStartTime;
            const timeStr = formatUptime(elapsed);
            if (uptimeEl) uptimeEl.textContent = timeStr;
            if (sessionUptimeEl) sessionUptimeEl.textContent = `Started ${timeStr} ago`;
        }
    }, 1000);
}

function stopUptimeCounter() {
    if (uptimeInterval) {
        clearInterval(uptimeInterval);
        uptimeInterval = null;
    }
    const uptimeEl = document.getElementById('metrics-uptime-timestamp');
    if (uptimeEl) uptimeEl.textContent = '00:00:00';
    const sessionUptimeEl = document.getElementById('session-uptime');
    if (sessionUptimeEl) sessionUptimeEl.textContent = 'Not connected';
}

let connectionLockTimeout = null;

function setConnectingState(isConnecting) {
    const tiktokToggleBtn = document.getElementById('tiktok-toggle-btn');
    if (!tiktokToggleBtn) return;
    
    if (isConnecting) {
        tiktokToggleBtn.disabled = true;
        tiktokToggleBtn.textContent = 'Conectando...';
        tiktokToggleBtn.style.opacity = '0.7';
        tiktokToggleBtn.style.cursor = 'not-allowed';
        
        if (connectionLockTimeout) {
            clearTimeout(connectionLockTimeout);
        }
        
        // Timeout de seguridad: re-habilitar tras 8 segundos por si falla la red silenciosamente
        connectionLockTimeout = setTimeout(() => {
            setConnectingState(false);
        }, 8000);
    } else {
        tiktokToggleBtn.disabled = false;
        tiktokToggleBtn.textContent = 'Conectar';
        tiktokToggleBtn.style.opacity = '';
        tiktokToggleBtn.style.cursor = '';
        if (connectionLockTimeout) {
            clearTimeout(connectionLockTimeout);
            connectionLockTimeout = null;
        }
    }
}

function updateConnectionStateUI(connected, username = '', avatarUrl = '') {
    setConnectingState(false);
    const statusText = document.getElementById('connection-status');
    const subBadge = document.getElementById('connection-sub-badge');
    const sessionUsernameEl = document.getElementById('session-username');
    const headerUsernameEl = document.getElementById('header-username-display');
    const headerStatusBadge = document.getElementById('header-status-badge');
    const sessionUptimeEl = document.getElementById('session-uptime');
    const healthCard = document.querySelector('.dashboard-health-card');
    
    // Status pillars elements (v1.3.7)
    const tiktokPillar = document.getElementById('status-pillar-tiktok');
    const tiktokUserVal = document.getElementById('tiktok-user-val');

    // Creator avatar elements inside pulsar
    const creatorImg = document.getElementById('creator-avatar-img');
    const creatorFallback = document.getElementById('creator-avatar-fallback');
    
    if (connected) {
        isTiktokConnected = true;
        
        if (statusText) statusText.textContent = 'Optimal';
        if (subBadge) subBadge.textContent = 'All systems nominal';
        if (sessionUsernameEl) sessionUsernameEl.textContent = '@' + username;
        if (headerUsernameEl) headerUsernameEl.textContent = '@' + username;
        if (headerStatusBadge) headerStatusBadge.style.display = 'flex';
        
        if (tiktokPillar) {
            tiktokPillar.className = 'status-pill status--connected';
        }
        if (tiktokUserVal) {
            tiktokUserVal.textContent = '@' + username;
        }
        
        if (healthCard) {
            healthCard.classList.add('is-connected');
            healthCard.classList.remove('is-disconnected');
        }

        // Set input value if different and not currently editing
        const input = document.getElementById('username-input');
        if (input && !input.matches(':focus') && !input.value) {
            input.value = '@' + username;
        }

        // Handle creator avatar display inside pulsar
        if (avatarUrl && avatarUrl.trim().length > 0) {
            if (creatorImg) {
                creatorImg.src = avatarUrl;
                creatorImg.style.display = 'block';
            }
            if (creatorFallback) {
                creatorFallback.style.display = 'none';
            }
        } else {
            if (creatorImg) {
                creatorImg.style.display = 'none';
                creatorImg.removeAttribute('src');
            }
            if (creatorFallback) {
                creatorFallback.style.display = 'flex';
                creatorFallback.textContent = username ? username.substring(0, 2).toUpperCase() : 'LIVE';
            }
        }
    } else {
        isTiktokConnected = false;
        
        if (statusText) statusText.textContent = 'Offline';
        if (subBadge) subBadge.textContent = 'Connection offline';
        if (sessionUsernameEl) sessionUsernameEl.textContent = '@offline';
        if (headerStatusBadge) headerStatusBadge.style.display = 'none';
        if (sessionUptimeEl) sessionUptimeEl.textContent = 'Not connected';
        
        if (tiktokPillar) {
            tiktokPillar.className = 'status-pill status--disconnected';
        }
        if (tiktokUserVal) {
            tiktokUserVal.textContent = 'DESCONECTADO';
        }
        
        if (healthCard) {
            healthCard.classList.add('is-disconnected');
            healthCard.classList.remove('is-connected');
        }

        // Reset creator avatar inside pulsar
        if (creatorImg) {
            creatorImg.style.display = 'none';
            creatorImg.removeAttribute('src');
        }
        if (creatorFallback) {
            creatorFallback.style.display = 'none';
        }
    }
}

socket.on('tiktok_connected', (data) => {
    updateConnectionStateUI(true, data.username, data.avatarUrl);
    
    startUptimeCounter();
});

socket.on('tiktok_disconnected', () => {
    updateConnectionStateUI(false);

    stopUptimeCounter();
    accumulatedDiamonds = 0;
    const diamondsEl = document.getElementById('metrics-diamonds-count');
    if (diamondsEl) diamondsEl.textContent = '0';
    const viewersEl = document.getElementById('metrics-viewers-count');
    if (viewersEl) viewersEl.textContent = '0';
    const likesEl = document.getElementById('metrics-likes-count');
    if (likesEl) likesEl.textContent = '0';
});

socket.on('session_stats_updated', (data) => {
    const viewersEl = document.getElementById('metrics-viewers-count');
    const likesEl = document.getElementById('metrics-likes-count');
    const diamondsEl = document.getElementById('metrics-diamonds-count');
    
    if (viewersEl && data.viewers !== undefined) viewersEl.textContent = data.viewers;
    if (likesEl && data.likes !== undefined) likesEl.textContent = data.likes;
    if (diamondsEl && data.diamonds !== undefined) {
        diamondsEl.textContent = data.diamonds;
        accumulatedDiamonds = data.diamonds;
        if (typeof updateLeagueDiamonds === 'function') {
            updateLeagueDiamonds(data.diamonds);
        }
    }
});

// Raw Events for Scanner
socket.on('tiktok_event_raw', (payload) => {
    const { eventType, data } = payload;

    // Update live metrics on dashboard
    if (eventType === 'roomUserSeq' || eventType === 'roomUser') {
        const viewersEl = document.getElementById('metrics-viewers-count');
        if (viewersEl && data) {
            if (typeof data.totalUser !== 'undefined') {
                viewersEl.textContent = data.totalUser;
            } else if (typeof data.viewerCount !== 'undefined') {
                const currentVal = parseInt(viewersEl.textContent) || 0;
                if (data.viewerCount > currentVal) {
                    viewersEl.textContent = data.viewerCount;
                }
            }
        }
    } else if (eventType === 'like') {
        const likesEl = document.getElementById('metrics-likes-count');
        if (likesEl && data) {
            if (typeof data.totalLikeCount !== 'undefined') {
                likesEl.textContent = data.totalLikeCount;
            } else if (data.likeCount) {
                const currentLikes = parseInt(likesEl.textContent) || 0;
                likesEl.textContent = currentLikes + data.likeCount;
            }
        }
    } else if (eventType === 'gift') {
        const diamondsEl = document.getElementById('metrics-diamonds-count');
        if (diamondsEl && data) {
            const count = data.repeatCount || 1;
            const diamonds = data.diamondCount || 0;
            accumulatedDiamonds += diamonds * count;
            diamondsEl.textContent = accumulatedDiamonds;
        }
    }

    // Filtering logic
    if (filterGiftsCheckbox.checked) {
        // Incluimos envelope y social ya que los guantes y cofres suelen llegar por ahí
        if (!['gift', 'linkMicBattle', 'linkMicArmies', 'envelope', 'social', 'ai_response'].includes(eventType)) {
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
        // Speak comment in Panel if enabled
        processAndSpeak(data);
    } else if (eventType === 'linkMicBattle') {
        cssClass = 'battle';
        const rewardsText = data.hasRewards ? '<span style="color: #4caf50; font-weight: 800;">[🎁 CON RECOMPENSAS]</span>' : '<span style="color: #ff9800;">[SIN RECOMPENSAS]</span>';
        const boostersText = (data.activeBoosters && data.activeBoosters.length > 0)
            ? `<span style="color: #00e5ff; font-weight: 800;">[⚡ POTENCIADORES: ${data.activeBoosters.join(', ')}]</span>`
            : '[SIN POTENCIADORES ACTIVOS]';
        logMessage = `[BATALLA] Estado de PK recibido. ${rewardsText} - ${boostersText} - Raw: ${JSON.stringify(data)}`;
    } else if (eventType === 'linkMicArmies') {
        cssClass = 'battle';
        const boostersText = (data.activeBoosters && data.activeBoosters.length > 0)
            ? `<span style="color: #00e5ff; font-weight: 800;">[⚡ POTENCIADORES: ${data.activeBoosters.join(', ')}]</span>`
            : '[SIN POTENCIADORES ACTIVOS]';
        logMessage = `[EJÉRCITO] Actualización de puntos de batalla. ${boostersText} - Raw: ${JSON.stringify(data)}`;
    } else if (eventType === 'envelope') {
        cssClass = 'battle';
        logMessage = `[SOBRE/ITEM] Evento de Cofre o Item detectado: ${JSON.stringify(data)}`;
    } else if (eventType === 'social') {
        cssClass = 'system';
        logMessage = `[SOCIAL] Acción: ${data.label || 'Interacción'} por ${data.nickname}`;
    } else if (eventType === 'ai_response') {
        cssClass = 'system';
        logMessage = `<span style="color: #ffeb3b; font-weight: bold; background: rgba(255,235,59,0.1); padding: 3px 6px; border-radius: 4px;">[IA RESPONSE] ${data.nickname}: ${data.comment}</span>`;
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
const tiktokToggleBtn = document.getElementById('tiktok-toggle-btn');
if (tiktokToggleBtn) {
    tiktokToggleBtn.addEventListener('click', () => {
        const input = document.getElementById('username-input');
        const username = input.value.trim().replace('@', '');
        if (username) {
            setConnectingState(true);
            socket.emit('change_user', { username });
        }
    });
}

const btnDisconnectSession = document.getElementById('btn-disconnect-session');
if (btnDisconnectSession) {
    btnDisconnectSession.addEventListener('click', () => {
        socket.emit('disconnect_tiktok');
    });
}

const btnRestartEngine = document.getElementById('btn-restart-engine');
if (btnRestartEngine) {
    btnRestartEngine.addEventListener('click', () => {
        socket.emit('disconnect_tiktok');
        setConnectingState(true);
        setTimeout(() => {
            const input = document.getElementById('username-input');
            let username = input ? input.value.trim().replace('@', '') : '';
            if (!username && chatbotConfig && chatbotConfig.tiktokUsername) {
                username = chatbotConfig.tiktokUsername;
            }
            if (username) {
                socket.emit('change_user', { username });
            } else {
                setConnectingState(false);
                showToast('No hay un usuario de TikTok configurado para conectar.', 'error');
            }
        }, 1000);
    });
}

// Sidebar Toggle
document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('collapsed');
});

// Versus / Receta Table Controls
window.addEventListener('ui:recipeAction', (e) => {
    socket.emit('manual_control', { action: e.detail.action });
});

window.addEventListener('ui:recipeUpdate', (e) => {
    socket.emit('manual_control', {
        action: 'vs_update',
        title: e.detail.title,
        items: e.detail.items
    });
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
let giftsMapping = {};
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
    
    // Set Gemini voices in rule selection
    const geminiVoiceOptions = [
        { name: 'Aoede', label: 'Aoede (Gemini - Femenino - Suave)' },
        { name: 'Charon', label: 'Charon (Gemini - Masculino - Maduro)' },
        { name: 'Fenrir', label: 'Fenrir (Gemini - Masculino - Grueso)' },
        { name: 'Kore', label: 'Kore (Gemini - Femenino - Fuerte)' },
        { name: 'Puck', label: 'Puck (Gemini - Masculino - Alegre)' },
        { name: 'Achernar', label: 'Achernar (Gemini - Masculino - Neutral)' }
    ];
    const geminiGroup = document.createElement('optgroup');
    geminiGroup.label = 'Voces de Google Gemini TTS';
    geminiVoiceOptions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.label;
        geminiGroup.appendChild(opt);
    });
    ruleVoiceSelect.appendChild(geminiGroup);
    
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
let uiManagerInitialized = false;
socket.on('chatbot_settings_updated', (config) => {
    chatbotConfig = config;
    if (!config?.active) {
        stopAllTTS();
    }
    updateUIWithConfig(config);
    updateMasterAnimationsUI(config);
    
    // Initialize or update UIManager
    if (!uiManagerInitialized) {
        UIManager.init(config);
        uiManagerInitialized = true;
    } else {
        UIManager.updateWidgetUI(config);
    }
    
    // Fetch theme-based branding assets dynamically
    fetch('/api/active-assets')
        .then(res => res.json())
        .then(assets => {
            if (assets) {
                UIManager.applyThemeBranding(assets);
            }
        })
        .catch(err => console.error('Error fetching host branding assets:', err));
});

// Widget Scene design synchronization
window.addEventListener('ui:updateWidgetPosition', (e) => {
    const { widget, x, y } = e.detail;
    SocketClient.emit('update_widget_position', { widget, x, y });
});

window.addEventListener('ui:toggleWidget', (e) => {
    const { widget, active } = e.detail;
    SocketClient.emit('toggle_widget', { widget, active });
});

socket.on('widget_status_changed', (data) => {
    if (chatbotConfig && chatbotConfig.widgets && chatbotConfig.widgets[data.widget]) {
        chatbotConfig.widgets[data.widget].active = data.active;
        UIManager.updateWidgetUI(chatbotConfig);
    }
});

socket.on('widget_position_changed', (data) => {
    if (chatbotConfig && chatbotConfig.widgets && chatbotConfig.widgets[data.widget]) {
        chatbotConfig.widgets[data.widget].x = data.x;
        chatbotConfig.widgets[data.widget].y = data.y;
        UIManager.updateWidgetUI(chatbotConfig);
    }
});

// Sync dynamic gift goals and mapping (cerebro — usado por Multimedia modal)
socket.on('initMetas', (data) => {
    giftsMapping = data || {};
    // El modal de Multimedia sigue usando giftsMapping (cerebro)
    // El selector de Dinámicas usa goalsCatalog (espejo independiente)
    if (typeof renderCatalogGiftsGrid === 'function') renderCatalogGiftsGrid();
});

socket.on('updateMeta', (data) => {
    const { giftId, name, coins, image } = data;
    if (!giftsMapping[giftId]) {
        giftsMapping[giftId] = { name, coins, image, sound: "" };
        if (typeof renderCatalogGiftsGrid === 'function') renderCatalogGiftsGrid();
    }
});

let soundsConfig = {};
socket.on('initSoundsConfig', (data) => {
    soundsConfig = data || {};
    if (typeof window.renderSoundAlertsTable === 'function') window.renderSoundAlertsTable(soundsConfig);
});

// ─────────────────────────────────────────────────────────────────────
// CATÁLOGO ESPEJO: goalsCatalog
// Copia de solo lectura del cerebro (gifts_mapping.json).
// Usado exclusivamente como picker de regalos en Dinámicas.
// NO contiene metas activas — esas van en dinamicas_config.json.
// ─────────────────────────────────────────────────────────────────────
let goalsCatalog = {};
socket.on('initGoalsCatalog', (data) => {
    goalsCatalog = data || {};
    populateGoalsCatalogSelectors();
    if (typeof populateApuestasGiftDropdowns === 'function') populateApuestasGiftDropdowns();
});

function populateGiftSelectors(config) {
    const goalGiftSelect = document.getElementById('goal-gift-select');
    if (goalGiftSelect) {
        const prevVal = goalGiftSelect.value;
        goalGiftSelect.innerHTML = '';
        const sortedGifts = Object.entries(giftsMapping || {})
            .map(([id, g]) => ({ id, ...g }))
            .sort((a, b) => a.coins - b.coins);
        if (sortedGifts.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Cargando regalos...';
            goalGiftSelect.appendChild(opt);
        } else {
            const serverPort = window.location.port || '3000';
            sortedGifts.forEach(gift => {
                const opt = document.createElement('option');
                opt.value = gift.id;
                const giftImage = gift.image || `${(gift.name || '').toLowerCase().replace(/\s+/g, '_')}.png`;
                opt.setAttribute('data-image', `http://127.0.0.1:${serverPort}/gift-assets/${giftImage}`);
                opt.setAttribute('data-name', gift.name || '');
                opt.textContent = `${gift.name} (${gift.coins} ●)`;
                goalGiftSelect.appendChild(opt);
            });
        }
        if (prevVal && Array.from(goalGiftSelect.options).some(o => o.value === prevVal)) {
            goalGiftSelect.value = prevVal;
        }
        // Trigger change event to update the preview image in the UI
        goalGiftSelect.dispatchEvent(new Event('change'));
    }

    const goalGiftNameEl = document.getElementById('goal-gift-name');
    const activeGoalGiftNameEl = document.getElementById('meta-gift-select');
    const activeGoalTargetEl = document.getElementById('meta-limit-input');

    if (!goalGiftNameEl && !activeGoalGiftNameEl) return;
    
    const activeGiftGoal = (config && config.goals || []).find(g => g.type === 'gift' && g.enabled);
    const currentVal = activeGiftGoal ? (activeGiftGoal.giftName || '') : '';
    
    const giftsList = [];
    Object.values(giftsMapping).forEach(g => {
        if (g.name) {
            giftsList.push({ name: g.name, coins: g.coins || 1 });
        }
    });
    
    // Sort alphabetically
    giftsList.sort((a, b) => a.name.localeCompare(b.name));
    
    const selectsToPopulate = [];
    if (goalGiftNameEl) selectsToPopulate.push(goalGiftNameEl);
    if (activeGoalGiftNameEl) selectsToPopulate.push(activeGoalGiftNameEl);
    
    selectsToPopulate.forEach(selectEl => {
        const prevVal = selectEl.value;
        selectEl.innerHTML = '';
        
        // If empty, add a placeholder option
        if (giftsList.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Cargando regalos...';
            selectEl.appendChild(opt);
        } else {
            giftsList.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.name;
                opt.textContent = `${g.name} (${g.coins} Moneda${g.coins > 1 ? 's' : ''})`;
                selectEl.appendChild(opt);
            });
        }
        
        if (prevVal && Array.from(selectEl.options).some(o => o.value === prevVal)) {
            selectEl.value = prevVal;
        }
    });
    
    if (activeGoalGiftNameEl && currentVal) {
        activeGoalGiftNameEl.value = currentVal;
    }
    if (activeGoalTargetEl && activeGiftGoal) {
        activeGoalTargetEl.value = activeGiftGoal.target || 100;
    }
}

/**
 * populateGoalsCatalogSelectors
 * Pobla el selector de regalos del módulo Dinámicas (#goal-gift-select)
 * usando exclusivamente goalsCatalog (espejo del cerebro).
 * No interfiere con Multimedia ni con giftsMapping.
 */
function populateGoalsCatalogSelectors() {
    const goalGiftSelect = document.getElementById('goal-gift-select');
    if (!goalGiftSelect) return;

    const catalog = goalsCatalog;
    const prevVal = goalGiftSelect.value;
    goalGiftSelect.innerHTML = '';

    const sorted = Object.entries(catalog || {})
        .map(([id, g]) => ({ id, ...g }))
        .sort((a, b) => (a.coins || 0) - (b.coins || 0));

    if (sorted.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Cargando regalos del catálogo...';
        goalGiftSelect.appendChild(opt);
    } else {
        const serverPort = window.location.port || '3000';
        sorted.forEach(gift => {
            const opt = document.createElement('option');
            opt.value = gift.id;
            const giftImage = gift.image || `${(gift.name || '').toLowerCase().replace(/\s+/g, '_')}.png`;
            opt.setAttribute('data-image', `http://127.0.0.1:${serverPort}/gift-assets/${giftImage}`);
            opt.setAttribute('data-name', gift.name || '');
            opt.textContent = `${gift.name} (${gift.coins || 1} ●)`;
            goalGiftSelect.appendChild(opt);
        });
    }

    if (prevVal && Array.from(goalGiftSelect.options).some(o => o.value === prevVal)) {
        goalGiftSelect.value = prevVal;
    }
    goalGiftSelect.dispatchEvent(new Event('change'));
}

// Helper: ensure giftsMapping is populated — fetches /api/gifts if cache is empty
async function fetchGiftsCatalog() {
    if (Object.keys(giftsMapping).length > 0) return giftsMapping;
    try {
        const res = await fetch('/api/gifts');
        const data = await res.json();
        giftsMapping = data || {};
        console.info('[fetchGiftsCatalog] Catalog loaded from API:', Object.keys(giftsMapping).length, 'gifts');
    } catch (e) {
        console.error('[fetchGiftsCatalog] Error fetching catalog:', e);
    }
    return giftsMapping;
}

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
    const bannedUsernamesEl = document.getElementById('bot-banned-username-words');
    if (bannedUsernamesEl) bannedUsernamesEl.value = (config.bannedUsernames || []).join(', ');

    const aiApiKeyEl = document.getElementById('ai-api-key');
    if (aiApiKeyEl) aiApiKeyEl.value = config.geminiApiKey || '';
    const aiApiKeyShortcutEl = document.getElementById('bot-gemini-api-key-shortcut');
    if (aiApiKeyShortcutEl) aiApiKeyShortcutEl.value = config.geminiApiKey || '';
    
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
    const thankLikeEl = document.getElementById('bot-thank-like-phrase');
    
    if (filterEmojisEl) filterEmojisEl.checked = !!config.filterEmojisFromNames;
    if (thankShareEl) thankShareEl.value = config.thankYouSharePhrase || '';
    if (thankFollowEl) thankFollowEl.value = config.thankYouFollowPhrase || '';
    if (thankGiftEl) thankGiftEl.value = config.thankYouGiftPhrase || '';
    if (thankLikeEl) thankLikeEl.value = config.thankYouLikePhrase || '';

    // Event Alert Actions & Sounds
    const shareActionEl = document.getElementById('bot-share-action');
    const shareSoundEl = document.getElementById('bot-share-sound');
    const followActionEl = document.getElementById('bot-follow-action');
    const followSoundEl = document.getElementById('bot-follow-sound');
    const giftActionEl = document.getElementById('bot-gift-action');
    const giftSoundEl = document.getElementById('bot-gift-sound');
    const likeActionEl = document.getElementById('bot-like-action');
    const likeSoundEl = document.getElementById('bot-like-sound');

    if (shareActionEl) shareActionEl.value = config.shareAction || 'read';
    if (shareSoundEl) shareSoundEl.value = config.shareSound || '';
    if (followActionEl) followActionEl.value = config.followAction || 'read';
    if (followSoundEl) followSoundEl.value = config.followSound || '';
    if (giftActionEl) giftActionEl.value = config.giftAction || 'read';
    if (giftSoundEl) giftSoundEl.value = config.giftSound || '';
    if (likeActionEl) likeActionEl.value = config.likeAction || 'read';
    if (likeSoundEl) likeSoundEl.value = config.likeSound || '';

    // Metas, Ruleta y Overlays
    const wheelEnabledEl = document.getElementById('wheel-enabled');
    const wheelGiftEl = document.getElementById('wheel-trigger-gift');
    const wheelCoinsEl = document.getElementById('wheel-trigger-coins');
    const overlayMusicEl = document.getElementById('overlay-music-enabled');
    const overlayChatEl = document.getElementById('overlay-chat-enabled');
    const overlayChatPremiumEl = document.getElementById('overlay-chat-premium');
    const ttsEffectsEl = document.getElementById('tts-effects-enabled');
    const recipeGoalColorEl = document.getElementById('recipe-goal-color-input');

    if (wheelEnabledEl) wheelEnabledEl.checked = !!config.wheelEnabled;
    if (wheelGiftEl) wheelGiftEl.value = config.wheelTriggerGift || 'any';
    if (wheelCoinsEl) wheelCoinsEl.value = config.wheelTriggerCoins || 10;
    if (overlayMusicEl) overlayMusicEl.checked = config.overlayMusicQueueEnabled !== false;
    if (overlayChatEl) overlayChatEl.checked = config.overlayChatEnabled !== false;
    if (overlayChatPremiumEl) overlayChatPremiumEl.checked = config.overlayChatFilterPremium !== false;
    if (ttsEffectsEl) ttsEffectsEl.checked = config.ttsEffectsEnabled !== false;
    if (recipeGoalColorEl) recipeGoalColorEl.value = config.recipeGoalColor || '#ff477e';
    
    // Configuración de Redes Sociales
    const socialRotatorEnabledEl = document.getElementById('social-rotator-enabled');
    const socialDisplayTimeEl = document.getElementById('social-display-time');
    const socialPauseTimeEl = document.getElementById('social-pause-time');
    
    if (socialRotatorEnabledEl) {
        socialRotatorEnabledEl.checked = config.socialsSettings ? !!config.socialsSettings.enabled : true;
    }
    if (socialDisplayTimeEl) {
        socialDisplayTimeEl.value = config.socialsSettings ? (config.socialsSettings.displayTime || 10) : 10;
    }
    if (socialPauseTimeEl) {
        socialPauseTimeEl.value = config.socialsSettings ? (config.socialsSettings.pauseTime !== undefined ? config.socialsSettings.pauseTime : 2) : 2;
    }
    
    if (typeof renderSocialsTable === 'function') {
        renderSocialsTable(config.socials || []);
    }

    // Popular inputs del banner
    const bSettings = config.bannerSettings || {
        width: '100%',
        height: '80px',
        borderStyle: 'solid',
        borderColor: '#ff0077',
        borderWidth: '2px',
        borderRadius: '25px',
        backgroundColor: '#140a0f',
        backgroundOpacity: 45,
        fontFamily: 'Outfit',
        fontSize: '24px',
        fontColor: '#ffffff',
        rotationSpeed: 8,
        slides: [
            config.bannerSlide1 || "Ejemplo de texto",
            config.bannerSlide2 || "¡Pide tu canción en el chat usando !song 🎵",
            config.bannerSlide3 || "Meta de Regalos Activa (Calculada automáticamente)"
        ]
    };

    const bWidth = document.getElementById('banner-width-input');
    const bHeight = document.getElementById('banner-height-input');
    const bBorderStyle = document.getElementById('banner-border-style');
    const bBorderColor = document.getElementById('banner-border-color');
    const bBorderWidth = document.getElementById('banner-border-width');
    const bBorderRadius = document.getElementById('banner-border-radius');
    const bBgColor = document.getElementById('banner-bg-color');
    const bBgOpacity = document.getElementById('banner-bg-opacity');
    const bFontFamily = document.getElementById('banner-font-family');
    const bFontSize = document.getElementById('banner-font-size');
    const bFontColor = document.getElementById('banner-font-color');
    const bRotationSpeed = document.getElementById('banner-rotation-speed');

    if (bWidth) bWidth.value = bSettings.width || '100%';
    if (bHeight) bHeight.value = bSettings.height || '80px';
    if (bBorderStyle) bBorderStyle.value = bSettings.borderStyle || 'solid';
    if (bBorderColor) bBorderColor.value = bSettings.borderColor || '#ff0077';
    if (bBorderWidth) {
        const val = parseInt(bSettings.borderWidth) || 0;
        bBorderWidth.value = val;
        const valEl = document.getElementById('val-banner-border-width');
        if (valEl) valEl.textContent = val + 'px';
    }
    if (bBorderRadius) {
        const val = parseInt(bSettings.borderRadius) || 0;
        bBorderRadius.value = val;
        const valEl = document.getElementById('val-banner-border-radius');
        if (valEl) valEl.textContent = val + 'px';
    }
    if (bBgColor) bBgColor.value = bSettings.backgroundColor || '#140a0f';
    if (bBgOpacity) {
        const val = bSettings.backgroundOpacity !== undefined ? bSettings.backgroundOpacity : 45;
        bBgOpacity.value = val;
        const valEl = document.getElementById('val-banner-bg-opacity');
        if (valEl) valEl.textContent = val + '%';
    }
    if (bFontFamily) bFontFamily.value = bSettings.fontFamily || 'Outfit';
    if (bFontSize) {
        const val = parseInt(bSettings.fontSize) || 24;
        bFontSize.value = val;
        const valEl = document.getElementById('val-banner-font-size');
        if (valEl) valEl.textContent = val + 'px';
    }
    if (bFontColor) bFontColor.value = bSettings.fontColor || '#ffffff';
    if (bRotationSpeed) {
        const val = bSettings.rotationSpeed !== undefined ? bSettings.rotationSpeed : 8;
        bRotationSpeed.value = val;
        const valEl = document.getElementById('val-banner-rotation-speed');
        if (valEl) valEl.textContent = val + 's';
    }

    if (typeof renderBannerSlides === 'function') {
        renderBannerSlides(bSettings.slides || []);
    }

    // Render dynamic lists (Metas, Ruleta)
    try {
        if (typeof renderGoalsList === 'function') {
            renderGoalsList(config.goals || []);
        } else {
            console.warn('renderGoalsList is not defined yet');
        }
        
        // Sync active goal inputs and selectors
        populateGiftSelectors(config);
    } catch (e) {
        console.error('Error rendering goals list:', e);
    }
    
    try {
        if (typeof renderWheelOptionsList === 'function') {
            renderWheelOptionsList(config.wheelOptions || []);
        } else {
            console.warn('renderWheelOptionsList is not defined yet');
        }
    } catch (e) {
        console.error('Error rendering wheel options list:', e);
    }
    
    // Setup and Spotify values
    const setupUserEl = document.getElementById('setup-tiktok-username');
    const setupAutoEl = document.getElementById('setup-auto-connect');
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
    document.body.setAttribute('data-user-role', themeName === 'neutral' ? 'standard' : themeName);

    // Update visual rendering style
    const visualStyle = config.visualStyle || 'glassmorphism';
    document.body.setAttribute('data-visual-style', visualStyle);
    const visualStyleSelect = document.getElementById('setup-visual-style');
    if (visualStyleSelect) visualStyleSelect.value = visualStyle;

    // Toggle native acrylic/blur for Liquid Glass mode (Electron only)
    if (window.electronBridge) {
        if (visualStyle === 'liquidglass') {
            document.documentElement.style.background = 'transparent';
            document.documentElement.style.backgroundColor = 'transparent';
            window.electronBridge.setBackgroundMaterial('acrylic');
        } else {
            document.documentElement.style.background = '';
            document.documentElement.style.backgroundColor = '';
            window.electronBridge.setBackgroundMaterial('none');
        }
    }

    const logoEl = document.querySelector('.brand-logo');
    const serverPort = window.location.port || '3000';
    if (themeName === 'neutral') {
        document.title = "TavLive - Control Panel";
        if (logoEl) {
            logoEl.src = `http://127.0.0.1:${serverPort}/app-assets/neutral-logo.jpg`;
            logoEl.alt = 'GR Logo';
            logoEl.style.display = 'block';
        }
    } else {
        document.title = themeName === 'majo' ? "Majo's - Control Panel" : "Naya's - Control Panel";
        if (logoEl) {
            const logoFile = themeName === 'majo' ? 'majo-logo2.png' : `${themeName}-logo.png`;
            logoEl.src = `http://127.0.0.1:${serverPort}/streamer-assets/${logoFile}`;
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
    const songlistColorEl = document.getElementById('songlist-color');
    const ttsWaveColorEl = document.getElementById('tts-wave-color');
    const spotVinylDesignEl = document.getElementById('spotify-vinyl-design');
    const spotVinylSpeedEl = document.getElementById('spotify-vinyl-speed');
    if (spotNeonColorEl) spotNeonColorEl.value = config.spotifyNeonColor || 'cyan';
    if (songlistColorEl) songlistColorEl.value = config.songlistColor || 'cyan';
    if (ttsWaveColorEl) ttsWaveColorEl.value = config.ttsWaveColor || 'cyan';
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
    
    const spotSkipAllowedUsersEl = document.getElementById('spotify-skip-allowed-users');
    if (spotSkipAllowedUsersEl) {
        spotSkipAllowedUsersEl.value = config.spotifySkipAllowedUsers || '';
    }
    

    
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
            document.getElementById('container-gemini-model').style.display = 'none';
            document.getElementById('container-gemini-language').style.display = 'none';
            document.getElementById('container-gemini-voice').style.display = 'none';
            document.getElementById('container-gemini-style').style.display = 'none';
            if (document.getElementById('container-gemini-key-warning')) document.getElementById('container-gemini-key-warning').style.display = 'none';
        } else if (engineEl.value === 'gemini') {
            document.getElementById('container-cloud-voice').style.display = 'none';
            document.getElementById('container-local-voice').style.display = 'none';
            document.getElementById('container-gemini-model').style.display = 'block';
            document.getElementById('container-gemini-language').style.display = 'block';
            document.getElementById('container-gemini-voice').style.display = 'block';
            document.getElementById('container-gemini-style').style.display = 'block';
            if (document.getElementById('container-gemini-key-warning')) document.getElementById('container-gemini-key-warning').style.display = 'block';
        } else {
            document.getElementById('container-cloud-voice').style.display = 'none';
            document.getElementById('container-local-voice').style.display = 'block';
            document.getElementById('container-gemini-model').style.display = 'none';
            document.getElementById('container-gemini-language').style.display = 'none';
            document.getElementById('container-gemini-voice').style.display = 'none';
            document.getElementById('container-gemini-style').style.display = 'none';
            if (document.getElementById('container-gemini-key-warning')) document.getElementById('container-gemini-key-warning').style.display = 'none';
        }
    }
    if (cloudVoiceEl) cloudVoiceEl.value = config.cloudVoiceName || 'es-CO-SalomeNeural';
    if (document.getElementById('bot-gemini-model')) document.getElementById('bot-gemini-model').value = config.geminiModel || 'gemini-3.1-flash-tts';
    if (document.getElementById('bot-gemini-language')) document.getElementById('bot-gemini-language').value = config.geminiLanguage || 'es-MX';
    if (document.getElementById('bot-gemini-voice')) document.getElementById('bot-gemini-voice').value = config.geminiVoiceName || 'Aoede';
    if (document.getElementById('bot-gemini-style')) document.getElementById('bot-gemini-style').value = config.geminiStyleInstructions || 'Read aloud in a warm, welcoming tone.';
    
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
    
    // Spotify monetization sync
    const spotMonetizationEl = document.getElementById('spotify-monetization-active');
    const spotMonetizationCoinsEl = document.getElementById('spotify-monetization-coins');
    
    if (spotMonetizationEl) spotMonetizationEl.checked = !!config.spotifyMonetizationEnabled;
    if (spotMonetizationCoinsEl) spotMonetizationCoinsEl.value = config.spotifyMinCoins || 5;
    
    // Toggle coins group visibility based on checkbox status
    const spotCoinsGroup = document.getElementById('spotify-monetization-coins-group');
    if (spotCoinsGroup && spotMonetizationEl) {
        spotCoinsGroup.style.display = spotMonetizationEl.checked ? 'block' : 'none';
    }

    // Sound alerts general active switch sync
    const soundAlertsActiveEl = document.getElementById('sound-alerts-active');
    if (soundAlertsActiveEl) soundAlertsActiveEl.checked = config.soundAlertsEnabled !== false;

    // Rules Table
    renderRulesTable(config.userVoices || []);
    
    // Render Sound Alerts Table
    if (typeof window.renderSoundAlertsTable === 'function') {
        window.renderSoundAlertsTable(soundsConfig);
    } else {
        console.warn('renderSoundAlertsTable is not defined yet');
    }
    
    // Sync AI inputs
    updateAiUI(config);
    
    // Sync Apuestas / Betting configuration inputs
    if (config.apuestas) {
        const apEnabledEl = document.getElementById('apuestas-enabled');
        const apTitleEl = document.getElementById('apuestas-title');
        const apCountEl = document.getElementById('apuestas-count');
        
        if (apEnabledEl) apEnabledEl.checked = !!config.apuestas.enabled;
        if (apTitleEl) apTitleEl.value = config.apuestas.title || '';
        if (apCountEl) {
            apCountEl.value = config.apuestas.count || 4;
            if (typeof toggleApuestasParticipantRows === 'function') {
                toggleApuestasParticipantRows(config.apuestas.count || 4);
            }
        }
        
        ['p1', 'p2', 'p3', 'p4'].forEach(pKey => {
            const participant = config.apuestas[pKey];
            if (participant) {
                const nameEl = document.getElementById(`apuestas-${pKey}-name`);
                const giftEl = document.getElementById(`apuestas-${pKey}-gift`);
                if (nameEl) nameEl.value = participant.name || '';
                if (giftEl) giftEl.value = participant.giftId || '';
            }
        });
        
        // Render Voters captured in the panel
        if (typeof renderApuestasVotersSummary === 'function') {
            renderApuestasVotersSummary(config.apuestas);
        }
    }
}

// Function to populate AI Inputs based on current config and theme profile
function updateAiUI(config) {
    if (!config || !config.ai) return;
    const themeName = config.themeName || 'neutral';
    const aiProfile = themeName === 'majo' ? 'majo' : 'naya';
    const profileData = config.ai[aiProfile] || {};

    const aiBotActiveEl = document.getElementById('ai-bot-active');
    const aiMonetizationEl = document.getElementById('ai-monetization-active');
    const aiMinCoinsEl = document.getElementById('ai-min-coins');
    const aiMaxCharsEl = document.getElementById('ai-max-chars');
    const aiCooldownEl = document.getElementById('ai-cooldown');
    const aiReadUsernameEl = document.getElementById('ai-read-username');
    const aiVoiceNameEl = document.getElementById('ai-voice-name');
    const aiVoiceStyleEl = document.getElementById('ai-voice-style');
    const aiPromptPersonalityEl = document.getElementById('ai-prompt-personality');
    const aiCommandPrefixEl = document.getElementById('ai-command-prefix');
    const aiGiftAutoRespondEl = document.getElementById('ai-gift-auto-respond');
    const aiGiftMinCoinsEl = document.getElementById('ai-gift-min-coins');

    if (aiBotActiveEl) aiBotActiveEl.checked = !!profileData.ai_bot_active;
    if (aiMonetizationEl) aiMonetizationEl.checked = !!profileData.ai_monetization_active;
    if (aiMinCoinsEl) aiMinCoinsEl.value = profileData.ai_min_coins !== undefined ? profileData.ai_min_coins : (aiProfile === 'majo' ? 10 : 5);
    if (aiMaxCharsEl) aiMaxCharsEl.value = profileData.ai_max_chars !== undefined ? profileData.ai_max_chars : 150;
    if (aiCooldownEl) aiCooldownEl.value = profileData.ai_cooldown !== undefined ? profileData.ai_cooldown : 10;
    if (aiReadUsernameEl) aiReadUsernameEl.checked = profileData.ai_read_username !== false;
    if (aiVoiceNameEl) aiVoiceNameEl.value = profileData.ai_voice_name || "default";
    if (aiVoiceStyleEl) aiVoiceStyleEl.value = profileData.ai_voice_style || "";
    if (aiPromptPersonalityEl) aiPromptPersonalityEl.value = profileData.ai_prompt_personality || "";
    if (aiCommandPrefixEl) aiCommandPrefixEl.value = profileData.ai_command_prefix || "!ia";
    if (aiGiftAutoRespondEl) aiGiftAutoRespondEl.checked = !!profileData.ai_gift_auto;
    if (aiGiftMinCoinsEl) aiGiftMinCoinsEl.value = profileData.ai_gift_min_coins !== undefined ? profileData.ai_gift_min_coins : 100;
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
        const styleLabel = rule.style ? `<small style="color: var(--accent); display:block;">🎤 ${rule.style.substring(0, 40)}</small>` : '';
        tr.innerHTML = `
            <td><strong>@${rule.username}</strong></td>
            <td>
                <small style="color: var(--text-main); font-weight: 600;">${rule.voice ? rule.voice.substring(0, 25) : 'Voz por defecto'}</small>
                <small style="color: var(--text-muted)">Vol: ${Math.round(rule.volume * 100)}% | Tono: ${rule.pitch} | Vel: ${rule.rate}</small>
                ${styleLabel}
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

    const bannedUsernames = document.getElementById('bot-banned-username-words') ? document.getElementById('bot-banned-username-words').value
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0) : [];

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
        bannedUsernames: bannedUsernames,
        ttsEngine: document.getElementById('bot-tts-engine').value,
        cloudVoiceName: document.getElementById('bot-cloud-voice').value,
        geminiModel: document.getElementById('bot-gemini-model').value,
        geminiLanguage: document.getElementById('bot-gemini-language').value,
        geminiVoiceName: document.getElementById('bot-gemini-voice').value,
        geminiStyleInstructions: document.getElementById('bot-gemini-style').value.trim(),
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
        themeName: (chatbotConfig && chatbotConfig.themeName) || 'neutral',
        visualStyle: document.getElementById('setup-visual-style') ? document.getElementById('setup-visual-style').value : 'glassmorphism',

        geminiApiKey: (document.getElementById('bot-gemini-api-key-shortcut') && document.getElementById('bot-gemini-api-key-shortcut').value.trim()) 
            ? document.getElementById('bot-gemini-api-key-shortcut').value.trim() 
            : (document.getElementById('ai-api-key') ? document.getElementById('ai-api-key').value.trim() : ''),
        spotifyClientId: document.getElementById('spotify-client-id') ? document.getElementById('spotify-client-id').value.trim() : '',
        spotifyClientSecret: document.getElementById('spotify-client-secret') ? document.getElementById('spotify-client-secret').value.trim() : '',
        spotifyEnabled: document.getElementById('spotify-active') ? document.getElementById('spotify-active').checked : false,
        spotifyTheme: document.getElementById('spotify-theme') ? document.getElementById('spotify-theme').value : 'apple-music',
        spotifyPosition: document.getElementById('spotify-position') ? document.getElementById('spotify-position').value : 'bottom-left',
        spotifyNeonColor: document.getElementById('spotify-neon-color') ? document.getElementById('spotify-neon-color').value : 'cyan',
        songlistColor: document.getElementById('songlist-color') ? document.getElementById('songlist-color').value : 'cyan',
        ttsWaveColor: document.getElementById('tts-wave-color') ? document.getElementById('tts-wave-color').value : 'cyan',
        spotifyVinylDesign: document.getElementById('spotify-vinyl-design') ? document.getElementById('spotify-vinyl-design').value : 'classic',
        spotifyVinylSpeed: document.getElementById('spotify-vinyl-speed') ? document.getElementById('spotify-vinyl-speed').value : 'normal',
        
        // Spotify interactive settings
        spotifyVolume: document.getElementById('spotify-volume-slider') ? parseInt(document.getElementById('spotify-volume-slider').value) || 80 : 80,
        spotifyChatQueueEnabled: document.getElementById('spotify-chat-queue-enabled') ? document.getElementById('spotify-chat-queue-enabled').checked : true,
        spotifyExplicitAllowed: document.getElementById('spotify-explicit-allowed') ? document.getElementById('spotify-explicit-allowed').checked : false,
        spotifyPermission: document.getElementById('spotify-permission') ? document.getElementById('spotify-permission').value : 'all',
        spotifyCommandPrefix: document.getElementById('spotify-command-prefix') ? document.getElementById('spotify-command-prefix').value.trim() : '!song',
        spotifyVoteSkipLimit: document.getElementById('spotify-voteskip-limit') ? parseInt(document.getElementById('spotify-voteskip-limit').value) || 3 : 3,
        spotifySkipAllowedUsers: document.getElementById('spotify-skip-allowed-users') ? document.getElementById('spotify-skip-allowed-users').value.trim() : '',
        
        // Music Request Monetization settings
        spotifyMonetizationEnabled: document.getElementById('spotify-monetization-active').checked,
        spotifyMinCoins: parseInt(document.getElementById('spotify-monetization-coins').value) || 5,
        
        // Sound alerts setting
        soundAlertsEnabled: document.getElementById('sound-alerts-active').checked,
        
        // Custom events / formatting
        filterEmojisFromNames: document.getElementById('bot-filter-emojis-names').checked,
        thankYouSharePhrase: document.getElementById('bot-thank-share-phrase').value,
        thankYouFollowPhrase: document.getElementById('bot-thank-follow-phrase').value,
        thankYouGiftPhrase: document.getElementById('bot-thank-gift-phrase').value,
        thankYouLikePhrase: document.getElementById('bot-thank-like-phrase') ? document.getElementById('bot-thank-like-phrase').value : '',

        // Event Alert Actions & Sounds
        shareAction: document.getElementById('bot-share-action') ? document.getElementById('bot-share-action').value : 'read',
        shareSound: document.getElementById('bot-share-sound') ? document.getElementById('bot-share-sound').value : '',
        followAction: document.getElementById('bot-follow-action') ? document.getElementById('bot-follow-action').value : 'read',
        followSound: document.getElementById('bot-follow-sound') ? document.getElementById('bot-follow-sound').value : '',
        giftAction: document.getElementById('bot-gift-action') ? document.getElementById('bot-gift-action').value : 'read',
        giftSound: document.getElementById('bot-gift-sound') ? document.getElementById('bot-gift-sound').value : '',
        likeAction: document.getElementById('bot-like-action') ? document.getElementById('bot-like-action').value : 'read',
        likeSound: document.getElementById('bot-like-sound') ? document.getElementById('bot-like-sound').value : '',

        bannerSlide1: (() => {
            const inputs = document.querySelectorAll('#banner-slides-container .banner-slide-text-input');
            return inputs[0] ? inputs[0].value.trim() : "Ejemplo de texto";
        })(),
        bannerSlide2: (() => {
            const inputs = document.querySelectorAll('#banner-slides-container .banner-slide-text-input');
            return inputs[1] ? inputs[1].value.trim() : "¡Pide tu canción en el chat usando !song 🎵";
        })(),
        bannerSlide3: (() => {
            const inputs = document.querySelectorAll('#banner-slides-container .banner-slide-text-input');
            return inputs[2] ? inputs[2].value.trim() : "Meta de Regalos Activa (Calculada automáticamente)";
        })(),
        bannerSettings: {
            width: document.getElementById('banner-width-input') ? document.getElementById('banner-width-input').value.trim() : '100%',
            height: document.getElementById('banner-height-input') ? document.getElementById('banner-height-input').value.trim() : '80px',
            borderStyle: document.getElementById('banner-border-style') ? document.getElementById('banner-border-style').value : 'solid',
            borderColor: document.getElementById('banner-border-color') ? document.getElementById('banner-border-color').value : '#ff0077',
            borderWidth: document.getElementById('banner-border-width') ? document.getElementById('banner-border-width').value + 'px' : '2px',
            borderRadius: document.getElementById('banner-border-radius') ? document.getElementById('banner-border-radius').value + 'px' : '25px',
            backgroundColor: document.getElementById('banner-bg-color') ? document.getElementById('banner-bg-color').value : '#140a0f',
            backgroundOpacity: document.getElementById('banner-bg-opacity') ? parseInt(document.getElementById('banner-bg-opacity').value) : 45,
            fontFamily: document.getElementById('banner-font-family') ? document.getElementById('banner-font-family').value : 'Outfit',
            fontSize: document.getElementById('banner-font-size') ? document.getElementById('banner-font-size').value + 'px' : '24px',
            fontColor: document.getElementById('banner-font-color') ? document.getElementById('banner-font-color').value : '#ffffff',
            rotationSpeed: document.getElementById('banner-rotation-speed') ? parseInt(document.getElementById('banner-rotation-speed').value) : 8,
            slides: (() => {
                const slidesList = [];
                document.querySelectorAll('#banner-slides-container .banner-slide-text-input').forEach(input => {
                    const txt = input.value.trim();
                    if (txt) slidesList.push(txt);
                });
                return slidesList.length > 0 ? slidesList : ["Ejemplo de mensaje"];
            })()
        },

        // Metas, Ruleta, Overlays
        goals: chatbotConfig.goals || [],
        wheelEnabled: document.getElementById('wheel-enabled').checked,
        wheelTriggerGift: document.getElementById('wheel-trigger-gift').value,
        wheelTriggerCoins: parseInt(document.getElementById('wheel-trigger-coins').value) || 10,
        overlayMusicQueueEnabled: document.getElementById('overlay-music-enabled').checked,
        overlayChatEnabled: document.getElementById('overlay-chat-enabled').checked,
        overlayChatFilterPremium: document.getElementById('overlay-chat-premium').checked,
        ttsEffectsEnabled: document.getElementById('tts-effects-enabled').checked,
        recipeGoalColor: document.getElementById('recipe-goal-color-input') ? document.getElementById('recipe-goal-color-input').value : '#ff477e',

        // Rotador de Redes Sociales
        socials: (() => {
            const list = [];
            document.querySelectorAll('#socials-table-body tr').forEach(row => {
                const platformEl = row.querySelector('.social-platform-select');
                const usernameEl = row.querySelector('.social-username-input');
                if (platformEl && usernameEl) {
                    const platform = platformEl.value;
                    const username = usernameEl.value.trim();
                    if (username) {
                        list.push({ platform, username });
                    }
                }
            });
            return list;
        })(),
        socialsSettings: {
            enabled: document.getElementById('social-rotator-enabled') ? document.getElementById('social-rotator-enabled').checked : false,
            displayTime: document.getElementById('social-display-time') ? (parseInt(document.getElementById('social-display-time').value) || 10) : 10,
            pauseTime: document.getElementById('social-pause-time') ? (parseInt(document.getElementById('social-pause-time').value) !== undefined ? parseInt(document.getElementById('social-pause-time').value) : 2) : 2
        },
        
        // AI Gemini configuration
        ai: (() => {
            const themeName = (chatbotConfig && chatbotConfig.themeName) || 'neutral';
            const aiProfile = themeName === 'majo' ? 'majo' : 'naya';
            
            const aiBotActive = document.getElementById('ai-bot-active') ? document.getElementById('ai-bot-active').checked : false;
            const aiMonetizationActive = document.getElementById('ai-monetization-active') ? document.getElementById('ai-monetization-active').checked : false;
            const aiMinCoins = document.getElementById('ai-min-coins') ? (parseInt(document.getElementById('ai-min-coins').value) || 5) : 5;
            const aiMaxChars = document.getElementById('ai-max-chars') ? (parseInt(document.getElementById('ai-max-chars').value) || 150) : 150;
            const aiCooldown = document.getElementById('ai-cooldown') ? (parseInt(document.getElementById('ai-cooldown').value) || 10) : 10;
            const aiReadUsername = document.getElementById('ai-read-username') ? document.getElementById('ai-read-username').checked : true;
            const aiVoiceName = document.getElementById('ai-voice-name') ? document.getElementById('ai-voice-name').value : "default";
            const aiVoiceStyle = document.getElementById('ai-voice-style') ? document.getElementById('ai-voice-style').value.trim() : "";
            const aiPromptPersonality = document.getElementById('ai-prompt-personality') ? document.getElementById('ai-prompt-personality').value : "";
            const aiCommandPrefix = document.getElementById('ai-command-prefix') ? document.getElementById('ai-command-prefix').value.trim() || "!ia" : "!ia";
            const aiGiftAuto = document.getElementById('ai-gift-auto-respond') ? document.getElementById('ai-gift-auto-respond').checked : false;
            const aiGiftMinCoins = document.getElementById('ai-gift-min-coins') ? parseInt(document.getElementById('ai-gift-min-coins').value) || 100 : 100;
            
            return {
                [aiProfile]: {
                    ai_bot_active: aiBotActive,
                    ai_monetization_active: aiMonetizationActive,
                    ai_min_coins: aiMinCoins,
                    ai_max_chars: aiMaxChars,
                    ai_cooldown: aiCooldown,
                    ai_read_username: aiReadUsername,
                    ai_voice_name: aiVoiceName,
                    ai_voice_style: aiVoiceStyle,
                    ai_prompt_personality: aiPromptPersonality,
                    ai_command_prefix: aiCommandPrefix,
                    ai_gift_auto: aiGiftAuto,
                    ai_gift_min_coins: aiGiftMinCoins
                }
            };
        })()
    };
    
    socket.emit('update_chatbot_settings', updated);
}

// Event Listeners for inputs changing
const inputsToWatch = [
    'bot-active', 'bot-play-location', 'bot-read-username', 'bot-filter-emojis-names',
    'bot-prefix-required', 'bot-permission', 'bot-block-rare-languages', 
    'bot-banned-action', 'bot-default-voice', 'bot-tts-engine', 'bot-cloud-voice',
    'bot-gemini-model', 'bot-gemini-language', 'bot-gemini-voice', 'bot-gemini-style', 'bot-gemini-api-key-shortcut',
    'bot-exclusive-enabled',
    'bot-read-follows', 'bot-read-shares', 'bot-read-gifts', 'bot-read-likes',
    'bot-share-action', 'bot-share-sound',
    'bot-follow-action', 'bot-follow-sound',
    'bot-gift-action', 'bot-gift-sound',
    'bot-like-action', 'bot-like-sound',
    'setup-auto-connect', 'setup-visual-style', 'spotify-active', 'spotify-theme', 'spotify-position',
    'spotify-chat-queue-enabled', 'spotify-explicit-allowed', 'spotify-permission',
    'spotify-neon-color', 'spotify-vinyl-design', 'spotify-vinyl-speed',
    'spotify-monetization-active',
    'sound-alerts-active',
    'wheel-enabled', 'overlay-music-enabled', 'overlay-chat-enabled', 'overlay-chat-premium', 'tts-effects-enabled',
    'recipe-goal-color-input',
    'social-rotator-enabled', 'social-display-time', 'social-pause-time'
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
                    document.getElementById('container-gemini-model').style.display = 'none';
                    document.getElementById('container-gemini-language').style.display = 'none';
                    document.getElementById('container-gemini-voice').style.display = 'none';
                    document.getElementById('container-gemini-style').style.display = 'none';
                    if (document.getElementById('container-gemini-key-warning')) document.getElementById('container-gemini-key-warning').style.display = 'none';
                } else if (engine === 'gemini') {
                    document.getElementById('container-cloud-voice').style.display = 'none';
                    document.getElementById('container-local-voice').style.display = 'none';
                    document.getElementById('container-gemini-model').style.display = 'block';
                    document.getElementById('container-gemini-language').style.display = 'block';
                    document.getElementById('container-gemini-voice').style.display = 'block';
                    document.getElementById('container-gemini-style').style.display = 'block';
                    if (document.getElementById('container-gemini-key-warning')) document.getElementById('container-gemini-key-warning').style.display = 'block';
                } else {
                    document.getElementById('container-cloud-voice').style.display = 'none';
                    document.getElementById('container-local-voice').style.display = 'block';
                    document.getElementById('container-gemini-model').style.display = 'none';
                    document.getElementById('container-gemini-language').style.display = 'none';
                    document.getElementById('container-gemini-voice').style.display = 'none';
                    document.getElementById('container-gemini-style').style.display = 'none';
                    if (document.getElementById('container-gemini-key-warning')) document.getElementById('container-gemini-key-warning').style.display = 'none';
                }
            }
            if (id === 'spotify-theme') {
                updateMockupThemeClass(el.value);
            }
            if (id === 'spotify-monetization-active') {
                const group = document.getElementById('spotify-monetization-coins-group');
                if (group) group.style.display = el.checked ? 'block' : 'none';
            }
            // Apply visual style and native acrylic in real-time
            if (id === 'setup-visual-style') {
                const newStyle = el.value;
                document.body.setAttribute('data-visual-style', newStyle);
                if (window.electronBridge) {
                    if (newStyle === 'liquidglass') {
                        document.documentElement.style.background = 'transparent';
                        document.documentElement.style.backgroundColor = 'transparent';
                        window.electronBridge.setBackgroundMaterial('acrylic');
                    } else {
                        document.documentElement.style.background = '';
                        document.documentElement.style.backgroundColor = '';
                        window.electronBridge.setBackgroundMaterial('none');
                    }
                }
            }
            sendUpdatedSettings();
        });

    }
});

// For text inputs and textareas, update on 'blur' to avoid socket spam on typing
const textInputsToWatch = [
    'bot-prefixes', 'bot-max-characters', 'bot-banned-words', 'bot-ignored-users', 'bot-banned-username-words',
    'bot-exclusive-user', 'bot-likes-milestone',
    'bot-thank-share-phrase', 'bot-thank-follow-phrase', 'bot-thank-gift-phrase', 'bot-thank-like-phrase',
    'setup-tiktok-username', 'spotify-client-id', 'spotify-client-secret',
    'spotify-command-prefix', 'spotify-voteskip-limit', 'spotify-skip-allowed-users',
    'spotify-monetization-coins',
    'wheel-trigger-gift', 'wheel-trigger-coins',
    'banner-slide1-input', 'banner-slide2-input', 'banner-slide3-input'
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
        } else if (engine === 'gemini') {
            const voiceName = document.getElementById('bot-gemini-voice').value;
            socket.emit('test_cloud_tts', { text, voiceName, pitch, rate });
        } else {
            const voiceName = document.getElementById('bot-default-voice').value;
            speakText(text, voiceName, volume, pitch, rate);
        }
    });
}

// Simulated Alerts (QA Validation Triggers)
const btnSimulateMvp = document.getElementById('btn-simulate-mvp');
if (btnSimulateMvp) {
    btnSimulateMvp.addEventListener('click', () => {
        socket.emit('manual_control', {
            action: 'test_trigger',
            event: 'trigger_mvp',
            nickname: 'NayaMVP'
        });
    });
}

const btnSimulateJoin = document.getElementById('btn-simulate-join');
if (btnSimulateJoin) {
    btnSimulateJoin.addEventListener('click', () => {
        socket.emit('manual_control', {
            action: 'test_trigger',
            event: 'trigger_join',
            nickname: 'FansDeNaya'
        });
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
        const style = (document.getElementById('rule-style') ? document.getElementById('rule-style').value.trim() : '');
        
        if (!chatbotConfig) return;
        
        const rules = [...(chatbotConfig.userVoices || [])];
        
        // Check if rule already exists for user
        const existingIndex = rules.findIndex(r => r.username.toLowerCase() === username);
        if (existingIndex > -1) {
            rules[existingIndex] = { username, voice, volume, pitch, rate, style };
        } else {
            rules.push({ username, voice, volume, pitch, rate, style });
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
let ttsWatchdogTimeout = null;

let audioCtx = null;
let analyserNode = null;
let audioSourceNode = null;
let visualizerInterval = null;

function clearTtsWatchdog() {
    if (ttsWatchdogTimeout) {
        clearTimeout(ttsWatchdogTimeout);
        ttsWatchdogTimeout = null;
    }
}

function startVisualizerAnimation(audioEl) {
    try {
        const visualizerContainer = document.getElementById('tts-audio-visualizer');
        if (visualizerContainer) {
            visualizerContainer.style.display = 'flex';
        }
        
        // Local SpeechSynthesis cannot be analyzed via Web Audio API, fallback to CSS bounce
        if (!audioEl) {
            fallbackVisualizerAnimation();
            return;
        }

        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 64; // Low resolution = extremely light-weight (32 bars)
        
        audioSourceNode = audioCtx.createMediaElementSource(audioEl);
        audioSourceNode.connect(analyserNode);
        analyserNode.connect(audioCtx.destination);
        
        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const bars = document.querySelectorAll('.tts-vis-bar');
        
        if (visualizerInterval) clearInterval(visualizerInterval);
        
        // 30 FPS = very laptop friendly
        visualizerInterval = setInterval(() => {
            if (!isPlayingTts || !currentAudioTts) {
                stopVisualizerAnimation();
                return;
            }
            
            analyserNode.getByteFrequencyData(dataArray);
            
            for (let i = 0; i < bars.length; i++) {
                // Map the frequency value (0-255) to a height percent (5% to 100%)
                const val = dataArray[i * 2] || 0;
                const percent = Math.min(100, Math.max(5, Math.round((val / 255) * 100)));
                bars[i].style.height = `${percent}%`;
            }
        }, 33);
        
    } catch (e) {
        console.warn('[Visualizer] Web Audio analyser blocked or failed. Using CSS fallback animation.', e);
        fallbackVisualizerAnimation();
    }
}

function fallbackVisualizerAnimation() {
    const visualizerContainer = document.getElementById('tts-audio-visualizer');
    if (visualizerContainer) {
        visualizerContainer.style.display = 'flex';
    }
    const bars = document.querySelectorAll('.tts-vis-bar');
    if (visualizerInterval) clearInterval(visualizerInterval);
    
    visualizerInterval = setInterval(() => {
        if (!isPlayingTts) {
            stopVisualizerAnimation();
            return;
        }
        bars.forEach(bar => {
            const rand = Math.floor(Math.random() * 85) + 15; // 15% to 100%
            bar.style.height = `${rand}%`;
        });
    }, 80);
}

function stopVisualizerAnimation() {
    if (visualizerInterval) {
        clearInterval(visualizerInterval);
        visualizerInterval = null;
    }
    
    // Clean up AudioContext nodes to prevent memory leaks on element recreation
    if (audioSourceNode) {
        try { audioSourceNode.disconnect(); } catch(e) {}
        audioSourceNode = null;
    }
    if (analyserNode) {
        try { analyserNode.disconnect(); } catch(e) {}
        analyserNode = null;
    }

    const visualizerContainer = document.getElementById('tts-audio-visualizer');
    if (visualizerContainer) {
        visualizerContainer.style.display = 'none';
    }
    const bars = document.querySelectorAll('.tts-vis-bar');
    bars.forEach(bar => {
        bar.style.height = '5%';
    });
}

function startTtsWatchdog() {
    clearTtsWatchdog();
    ttsWatchdogTimeout = setTimeout(() => {
        console.warn('[TTS Watchdog] Audio playback or SpeechSynthesis timeout (>5s). Advancing queue.');
        stopVisualizerAnimation();
        if (currentAudioTts) {
            try {
                currentAudioTts.pause();
                currentAudioTts.src = "";
            } catch(e) {}
            currentAudioTts = null;
        }
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            try { window.speechSynthesis.cancel(); } catch(e) {}
        }
        isPlayingTts = false;
        setTimeout(processTtsQueue, 100);
    }, 5000); // 5 seconds strict safety timeout per audio event (v1.4.2)
}

function stopAllTTS() {
    clearTtsWatchdog();
    stopVisualizerAnimation();
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
    // Cap queue to max 15 waiting items to prevent memory leaks during stream spikes (v1.4.2)
    while (ttsQueue.length > 15) {
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
    // Cap queue to max 15 waiting items to prevent memory leaks during stream spikes (v1.4.2)
    while (ttsQueue.length > 15) {
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
            const mimeType = item.base64Audio.startsWith('UklGR') ? 'audio/wav' : 'audio/mp3';
            currentAudioTts = new Audio(`data:${mimeType};base64,` + item.base64Audio);
            
            if (rateMultiplier > 1.0) {
                currentAudioTts.playbackRate = rateMultiplier;
            }
            
            startTtsWatchdog(); // Start the 20-second safety watchdog
            
            currentAudioTts.onended = () => {
                clearTtsWatchdog();
                stopVisualizerAnimation();
                isPlayingTts = false;
                currentAudioTts = null;
                setTimeout(processTtsQueue, 400); // 400ms cooldown gap
            };
            
            currentAudioTts.onerror = (err) => {
                clearTtsWatchdog();
                stopVisualizerAnimation();
                console.error('Audio playback error:', err);
                isPlayingTts = false;
                currentAudioTts = null;
                setTimeout(processTtsQueue, 100);
            };
            
            currentAudioTts.play().then(() => {
                startVisualizerAnimation(currentAudioTts);
            }).catch(err => {
                clearTtsWatchdog();
                stopVisualizerAnimation();
                console.error('Audio play failed:', err);
                isPlayingTts = false;
                currentAudioTts = null;
                setTimeout(processTtsQueue, 100);
            });
        } catch (err) {
            clearTtsWatchdog();
            stopVisualizerAnimation();
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
        
        startTtsWatchdog(); // Start the 20-second safety watchdog
        
        utterance.onend = () => {
            clearTtsWatchdog();
            stopVisualizerAnimation();
            isPlayingTts = false;
            setTimeout(processTtsQueue, 400);
        };
        
        utterance.onerror = (err) => {
            clearTtsWatchdog();
            stopVisualizerAnimation();
            console.error('SpeechSynthesis error:', err);
            isPlayingTts = false;
            setTimeout(processTtsQueue, 100);
        };
        
        startVisualizerAnimation(null);
        window.speechSynthesis.speak(utterance);
    }
}

// Handle playing Cloud TTS audio sent from the server
socket.on('play_tts_audio', (data) => {
    const { base64Audio, playLocation } = data;
    
    // Play on panel to guarantee native Electron playback
    const isPanel = window.location.pathname === '/' || !window.location.pathname.includes('overlay');
    if (isPanel) {
        queueCloudTTS(base64Audio, playLocation);
    } else if (playLocation === 'overlay' || playLocation === 'both') {
        queueCloudTTS(base64Audio, playLocation);
    }
});

// Handle TTS error notifications from the server
socket.on('test_tts_error', (data) => {
    showToast(data.message || 'Error al generar la voz.', 'error');
});

// Handle playing sound alerts
socket.on('play_sound_alert', (data) => {
    const { soundUrl, volume } = data;
    
    // Sound alerts always play in the panel regardless of TTS playLocation setting
    if (!soundUrl) return;
    
    const audio = new Audio(soundUrl);
    audio.volume = (volume !== undefined ? volume : 100) / 100;
    audio.play()
        .then(() => {
            audio.onended = () => {
                audio.src = '';
                audio.load();
            };
        })
        .catch(err => {
            console.error('Failed to play sound alert in panel:', err);
        });
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
    
    // Check play location: guarantee native Electron playback in panel
    const isPanel = window.location.pathname === '/' || !window.location.pathname.includes('overlay');
    if (!isPanel && chatbotConfig.playLocation === 'panel') return;
    
    const nickname = data.nickname || data.uniqueId || 'Usuario';
    let comment = data.comment || '';
    
    // 1. Blacklist check
    const blacklist = (chatbotConfig.ignoreUserList || []).map(u => u.toLowerCase().trim());
    if (blacklist.includes(uniqueId)) return;
    
    // 2. Permission check
    const userRole = chatbotConfig.permission || 'all';
    
    // Ignore all chat comment readings if permission is set to none (No leer a ninguno / Solo alertas)
    if (userRole === 'none') return;
    
    const isAnchor = (data.userIdentity && typeof data.userIdentity.isAnchor !== 'undefined')
        ? data.userIdentity.isAnchor
        : (chatbotConfig.tiktokUsername && uniqueId === chatbotConfig.tiktokUsername.toLowerCase());
        
    const isModerator = isAnchor || ((data.userIdentity && typeof data.userIdentity.isModeratorOfAnchor !== 'undefined')
        ? data.userIdentity.isModeratorOfAnchor
        : !!data.isModerator);
        
    const isSubscriber = isAnchor || ((data.userIdentity && typeof data.userIdentity.isSubscriberOfAnchor !== 'undefined')
        ? data.userIdentity.isSubscriberOfAnchor
        : !!data.isSubscriber);
        
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
                const originalHTML = setupCopyUrlBtn.innerHTML;
                setupCopyUrlBtn.innerHTML = '<span style="font-size: 11px; font-weight: bold; color: #00ffcc;">✓</span>';
                setTimeout(() => {
                    setupCopyUrlBtn.innerHTML = originalHTML;
                    if (window.lucide) window.lucide.createIcons();
                }, 1500);
            });
        }
    });
}

const copyObsAnimationsBtn = document.getElementById('btn-copy-obs-animations');
if (copyObsAnimationsBtn) {
    copyObsAnimationsBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-animations-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsAnimationsBtn.textContent;
                copyObsAnimationsBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsAnimationsBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsDinamicasBtn = document.getElementById('btn-copy-obs-dinamicas');
if (copyObsDinamicasBtn) {
    copyObsDinamicasBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-dinamicas-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsDinamicasBtn.textContent;
                copyObsDinamicasBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsDinamicasBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsRecetasBtn = document.getElementById('btn-copy-obs-recetas');
if (copyObsRecetasBtn) {
    copyObsRecetasBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-recetas-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsRecetasBtn.textContent;
                copyObsRecetasBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsRecetasBtn.textContent = originalText, 1500);
            });
        }
    });
}

const copyObsAlertsBtn = document.getElementById('btn-copy-obs-alerts');
if (copyObsAlertsBtn) {
    copyObsAlertsBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-alerts-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalHTML = copyObsAlertsBtn.innerHTML;
                copyObsAlertsBtn.innerHTML = '<span style="font-size: 11px; font-weight: bold; color: #00ffcc;">✓</span>';
                setTimeout(() => {
                    copyObsAlertsBtn.innerHTML = originalHTML;
                    if (window.lucide) window.lucide.createIcons();
                }, 1500);
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
                const originalHTML = copyObsMusicBtn.innerHTML;
                copyObsMusicBtn.innerHTML = '<span style="font-size: 11px; font-weight: bold; color: #00ffcc;">✓</span>';
                setTimeout(() => {
                    copyObsMusicBtn.innerHTML = originalHTML;
                    if (window.lucide) window.lucide.createIcons();
                }, 1500);
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
                const originalHTML = copyObsMusicHorizontalBtn.innerHTML;
                copyObsMusicHorizontalBtn.innerHTML = '<span style="font-size: 11px; font-weight: bold; color: #00ffcc;">✓</span>';
                setTimeout(() => {
                    copyObsMusicHorizontalBtn.innerHTML = originalHTML;
                    if (window.lucide) window.lucide.createIcons();
                }, 1500);
            });
        }
    });
}

const copyObsSonglistBtn = document.getElementById('btn-copy-obs-songlist');
if (copyObsSonglistBtn) {
    copyObsSonglistBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-songlist-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalHTML = copyObsSonglistBtn.innerHTML;
                copyObsSonglistBtn.innerHTML = '<span style="font-size: 11px; font-weight: bold; color: #00ffcc;">✓</span>';
                setTimeout(() => {
                    copyObsSonglistBtn.innerHTML = originalHTML;
                    if (window.lucide) window.lucide.createIcons();
                }, 1500);
            });
        }
    });
}



const copyObsBannerBtn = document.getElementById('btn-copy-obs-banner');
if (copyObsBannerBtn) {
    copyObsBannerBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-banner-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalHTML = copyObsBannerBtn.innerHTML;
                copyObsBannerBtn.innerHTML = '<span style="font-size: 11px; font-weight: bold; color: #00ffcc;">✓</span>';
                setTimeout(() => {
                    copyObsBannerBtn.innerHTML = originalHTML;
                    if (window.lucide) window.lucide.createIcons();
                }, 1500);
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
const copyObsSocialRotatorBtn = document.getElementById('btn-copy-obs-social-rotator');
if (copyObsSocialRotatorBtn) {
    copyObsSocialRotatorBtn.addEventListener('click', () => {
        const input = document.getElementById('obs-social-rotator-url');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => {
                const originalText = copyObsSocialRotatorBtn.textContent;
                copyObsSocialRotatorBtn.textContent = '¡Copiado!';
                setTimeout(() => copyObsSocialRotatorBtn.textContent = originalText, 1500);
            });
        }
    });
}


// Automatically update OBS overlay URLs to match current window location origin (using 127.0.0.1 instead of localhost)
const urlInputsToUpdate = [
    'obs-overlay-url',
    'obs-widgets-url',
    'obs-animations-url',
    'obs-dinamicas-url',
    'obs-recetas-url',
    'obs-alerts-url',
    'obs-banner-url',
    'obs-music-url',
    'obs-music-horizontal-url',
    'obs-songlist-url',

    'obs-donors-url',
    'obs-taps-url',
    'obs-mvp-url',
    'obs-social-rotator-url',
    'obs-custom-animations-url',
    'obs-tts-url'
];
urlInputsToUpdate.forEach(id => {
    const input = document.getElementById(id);
    if (input && input.value) {
        try {
            const url = new URL(input.value);
            const origin = window.location.origin.replace('localhost', '127.0.0.1');
            let pathname = url.pathname;
            if (!pathname.endsWith('.html')) {
                pathname += '.html';
            }
            input.value = origin + pathname + url.search;
        } catch (e) {
            // Ignore malformed URLs or other errors
        }
    }
});

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
            const serverPort = window.location.port || '3000';
            imgEl.src = `http://127.0.0.1:${serverPort}/streamer-assets/naya-logo.png`;
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

    updateRankingTable('users-ranking-gifts-body', rankings.gifts, 'monedas');
    updateRankingTable('users-ranking-likes-body', rankings.likes, 'likes');
    updateRankingTable('users-ranking-mvp-body', rankings.mvp, 'puntos');
});

function updateRankingTable(elementId, dataList, unitLabel) {
    const body = document.getElementById(elementId);
    if (!body) return;
    
    if (!dataList || dataList.length === 0) {
        body.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--text-muted); padding: 20px; font-size: 13px;">Esperando datos de la transmisión...</td></tr>`;
        return;
    }
    
    body.innerHTML = '';
    dataList.forEach((user, index) => {
        const row = document.createElement('tr');
        
        let positionBadge = `${index + 1}`;
        
        const initials = (user.nickname || user.username || 'US').substring(0, 2).toUpperCase();
        const hasAvatar = user.profilePictureUrl && user.profilePictureUrl.trim().length > 0;
        const avatarImg = hasAvatar 
            ? `<img src="${escapeHtml(user.profilePictureUrl)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`
            : '';
        const fallbackStyle = hasAvatar ? 'style="display: none;"' : 'style="display: flex; width: 100%; height: 100%; justify-content: center; align-items: center;"';
        
        row.innerHTML = `
            <td class="rank-pos">${positionBadge}</td>
            <td class="rank-user">
                <div class="rank-avatar" style="position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                    ${avatarImg}
                    <span class="rank-avatar-fallback" ${fallbackStyle}>${initials}</span>
                </div>
                <div class="rank-info">
                    <span class="rank-nickname">${escapeHtml(user.nickname || user.username)}</span>
                    <span class="rank-username">@${escapeHtml(user.username)}</span>
                </div>
            </td>
            <td class="rank-val text-right">${user.count.toLocaleString()}</td>
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
        
        const spotifyPlayBtn = document.getElementById('mockup-btn-play');
        if (spotifyPlayBtn) {
            spotifyPlayBtn.innerHTML = `<i data-lucide="${track.isPlaying ? 'pause' : 'play'}"></i>`;
        }
        if (track.isPlaying) {
            if (playerEl) playerEl.classList.add('is-playing');
        } else {
            if (playerEl) playerEl.classList.remove('is-playing');
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
socket.on('ai_queue_updated', (queue) => {
    const tbody = document.getElementById('ai-queue-body');
    if (!tbody) return;
    
    if (!queue || queue.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px 15px;">La cola de inteligencia artificial está vacía.</td></tr>`;
        return;
    }
    
    let html = '';
    queue.forEach((item) => {
        html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 10px;">
                    <div style="font-weight: bold; color: var(--text-main); font-size: 13px;">${item.nickname}</div>
                </td>
                <td style="padding: 10px; color: var(--text-muted); font-size: 12px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${item.prompt || item.comment || 'Petición'}
                </td>
                <td class="text-right" style="padding: 10px;">
                    <button class="btn secondary small" onclick="removeAiQueueItem('${item.id}')" style="padding: 4px 8px; font-size: 11px;" title="Eliminar">❌</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
});

window.removeAiQueueItem = function(id) {
    socket.emit('remove_ai_queue_item', id);
};

const btnClearAiQueue = document.getElementById('btn-clear-ai-queue');
if (btnClearAiQueue) {
    btnClearAiQueue.addEventListener('click', () => {
        if(confirm('¿Seguro que deseas vaciar toda la cola de la IA?')) {
            socket.emit('clear_ai_queue');
        }
    });
}

socket.on('spotify_queue_updated', (queue) => {
    renderSpotifyQueue(queue);
});

socket.on('spotify_monetized_users_updated', (users) => {
    renderSpotifyMonetizedUsers(users);
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
                        <span class="track-title">${escapeHtml(track.title)}</span>
                        <span class="track-artist">${escapeHtml(track.artist)}</span>
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

function renderSpotifyMonetizedUsers(users) {
    const tbody = document.getElementById('spotify-monetized-users-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!users || users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 15px 15px; font-size: 12px;">
                    Sin usuarios premium en esta sesión.
                </td>
            </tr>
        `;
        return;
    }
    
    users.forEach((user, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <span class="requester-badge">@${user.userId}</span>
            </td>
            <td>
                <span style="font-weight: 500; color: var(--accent-color);">💰 ${user.totalCoins}</span>
            </td>
            <td class="text-right">
                <span style="font-size: 12px; color: var(--text-muted);">${user.creditsAvailable} crédito${user.creditsAvailable !== 1 ? 's' : ''}</span>
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

// Bind clear spotify monetized users button
const btnClearSpotifyMonetized = document.getElementById('btn-clear-spotify-monetized');
if (btnClearSpotifyMonetized) {
    btnClearSpotifyMonetized.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que deseas limpiar los créditos y monedas acumulados de todos los usuarios en esta sesión?')) {
            socket.emit('clear_monetized_users');
        }
    });
}

// Developer Settings Panel Authentication Lock
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
                    e.preventDefault();
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
    if (!devPasswordInput || !devPasswordModal) return;
    const password = devPasswordInput.value.trim();
    if (password === 'tavo_dev' || password === 'naya_dev') {
        isDeveloperAuthenticated = true;
        if (devDetails) devDetails.open = true;
        devPasswordModal.style.display = 'none';
        
        // Redirect to pending view if exists
        if (pendingNavigationTarget) {
            const pendingItem = document.querySelector(`.menu-item[data-target="${pendingNavigationTarget}"]`);
            if (pendingItem) {
                switchToTab(pendingItem, pendingNavigationTarget);
            }
            pendingNavigationTarget = null;
        }
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
        const obsUrl = `${window.location.origin}/custom-animations.html?animation=${anim.id}`;
        const ext = anim.filename ? anim.filename.split('.').pop().toUpperCase() : 'MEDIA';
        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(anim.name)}</td>
                <td><span class="badge" style="background: rgba(0,240,255,0.1); color: #00f0ff; font-weight: bold;">${ext}</span></td>
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
    if (!settings) return;
    const keys = ['trigger_glove', 'trigger_quiereme', 'trigger_x2'];
    keys.forEach(key => {
        const card = document.querySelector(`[data-event="${key}"]`);
        if (!card) return;
        
        // Remove existing custom badge if any
        const existingBadge = card.querySelector('.badge.custom-badge');
        if (existingBadge) existingBadge.remove();
        
        const hasCustom = settings?.masterAnimations && settings.masterAnimations[key] && settings.masterAnimations[key].filepath;
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

    // Borrar Caché / Restaurar de fábrica
    const btnClearCache = document.getElementById('btn-clear-cache');
    if (btnClearCache) {
        btnClearCache.addEventListener('click', () => {
            const confirmed = confirm("¡ADVERTENCIA CRÍTICA!\n\n¿Estás completamente seguro de que deseas borrar toda la caché del sistema y restaurar TavLive a sus valores de fábrica?\n\nEsta acción eliminará de forma permanente todos los perfiles de streamers, configuraciones de Spotify/YouTube, voces personalizadas y archivos multimedia subidos.\n\nEsta acción NO se puede deshacer.");
            if (confirmed) {
                socket.emit('clear_cache');
            }
        });
    }

    socket.on('cache_cleared', (result) => {
        if (result.success) {
            alert("¡Sistema restaurado de fábrica y caché eliminada con éxito! La aplicación se reiniciará ahora.");
            window.location.reload();
        } else {
            alert("Error al intentar borrar la caché: " + (result.error || "Desconocido"));
        }
    });
    


    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// Global Audio Preview State Variables
let currentlyPlayingIdx = null;
let localPreviewAudio = null;
let activeEditRowIndex = null;
let activeEditGiftId = null;
let modalPreviewAudio = null;
let modalPlayingUrl = null;
let SYSTEM_SOUNDS = [];

async function loadSystemSounds() {
    try {
        const response = await fetch('/api/system-sounds');
        const data = await response.json();
        if (Array.isArray(data)) {
            SYSTEM_SOUNDS = data;
        }
    } catch (e) {
        console.error("Failed to load system sounds dynamically, falling back to defaults", e);
        SYSTEM_SOUNDS = [
            { name: 'TavLive Bruh', url: '/sounds/bruh.mp3' },
            { name: 'TavLive Fart', url: '/sounds/fart.mp3' },
            { name: 'TavLive Vine Boom', url: '/sounds/vine-boom.mp3' },
            { name: 'TavLive Anime Wow', url: '/sounds/anime-wow.mp3' },
            { name: 'TavLive Roblox Oof', url: '/sounds/oof.mp3' },
            { name: 'TavLive Bonk', url: '/sounds/bonk.mp3' },
            { name: 'TavLive Taco Bell', url: '/sounds/taco-bell.mp3' },
            { name: 'TavLive Yeet', url: '/sounds/yeet.mp3' },
            { name: 'TavLive Nice Click', url: '/sounds/nice.mp3' },
            { name: 'TavLive Discord Notif', url: '/sounds/discord-notification.mp3' }
        ];
    }
}

// ============================================================================
// MULTIMEDIA SOUND ALERTS & MODALS SYSTEM
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {

    const widgetUrlInput = document.getElementById('dynamics-widget-url');
    const widgetPreviewIframe = document.getElementById('dynamics-widget-preview');
    if (widgetUrlInput && widgetPreviewIframe) {
        const serverPort = window.location.port || '3000';
        const dynamicsUrl = `http://127.0.0.1:${serverPort}/dinamicas`;
        widgetUrlInput.value = dynamicsUrl;
        widgetPreviewIframe.src = dynamicsUrl;
    }

    const btnCopyDynamics = document.getElementById('btn-copy-dynamics-url');
    if (btnCopyDynamics) {
        btnCopyDynamics.addEventListener('click', () => {
            const copyText = document.getElementById('dynamics-widget-url');
            if (copyText) {
                copyText.select();
                copyText.setSelectionRange(0, 99999);
                navigator.clipboard.writeText(copyText.value);
                alert('¡Enlace de widget copiado al portapapeles!');
            }
        });
    }

    // Populate selectors immediately: cerebro para Multimedia, espejo para Dinámicas
    // populateGiftSelectors se omite aquí porque cada módulo tiene su propio catálogo.
    // Dinámicas usa populateGoalsCatalogSelectors() al recibir initGoalsCatalog vía socket.

    // Dynamic Goals Table for Dinamicas Tab
    const dynamicsMetasTbody = document.getElementById('dynamics-metas-tbody');
    let dinamicasConfig = [];

    const dinamicasGoalTypeSelect = document.getElementById('goal-type-select');
    const dinamicasGoalGiftSelectContainer = document.getElementById('goal-gift-select-container');
    const dinamicasGoalGiftSelect = document.getElementById('goal-gift-select');
    const dinamicasGoalTitleInput = document.getElementById('goal-title-input');
    const dinamicasGoalTargetInput = document.getElementById('goal-target-input');
    const dinamicasBtnCreateGoal = document.getElementById('btn-create-dynamic-goal');
    const dinamicasBtnResetGoals = document.getElementById('btn-reset-dynamic-goals');

    // Reemplaza el bloque que maneja el cambio de 'Tipo de Meta' (panel.js)
if (dinamicasGoalTypeSelect) {
    dinamicasGoalTypeSelect.addEventListener('change', () => {
        if (dinamicasGoalTypeSelect.value === 'gift') {
            dinamicasGoalGiftSelectContainer.style.display = 'block';
            // Poblar desde el catálogo espejo de Dinámicas (goalsCatalog),
            // que está sincronizado con el cerebro pero es independiente de Multimedia.
            populateGoalsCatalogSelectors();
        } else {
            dinamicasGoalGiftSelectContainer.style.display = 'none';
        }
    });
}

    // Update gift image preview when a different gift is selected in Dinámicas
    if (dinamicasGoalGiftSelect) {
        dinamicasGoalGiftSelect.addEventListener('change', () => {
            const previewImg = document.getElementById('goal-gift-preview');
            if (!previewImg) return;
            const selectedOpt = dinamicasGoalGiftSelect.options[dinamicasGoalGiftSelect.selectedIndex];
            const imgSrc = selectedOpt ? selectedOpt.getAttribute('data-image') : '';
            if (imgSrc) {
                previewImg.src = imgSrc;
                previewImg.style.display = 'block';
                const serverPort = window.location.port || '3000';
                previewImg.onerror = () => { previewImg.src = `http://127.0.0.1:${serverPort}/app-assets/neutral-logo.jpg`; };
            } else {
                previewImg.style.display = 'none';
            }
            // Inject selected giftId and giftName into hidden inputs if present
            try {
                const hiddenId = document.getElementById('goal-gift-id');
                const hiddenName = document.getElementById('goal-gift-name');
                if (selectedOpt) {
                    const gid = selectedOpt.value || '';
                    const gname = selectedOpt.getAttribute('data-name') || (selectedOpt.textContent || '').replace(/ \(.*$/, '').trim();
                    if (hiddenId) hiddenId.value = gid;
                    if (hiddenName) hiddenName.value = gname;
                }
            } catch (e) {
                // silent
            }
        });
    }

    if (dinamicasBtnCreateGoal) {
        dinamicasBtnCreateGoal.addEventListener('click', () => {
            const type = dinamicasGoalTypeSelect.value;
            const title = dinamicasGoalTitleInput.value.trim() || (type === 'likes' ? 'Meta de Likes' : type === 'follows' ? 'Meta de Seguidores' : 'Meta de Regalo');
            const target = Number(dinamicasGoalTargetInput.value) || 100;
            
            const data = {
                type: type,
                title: title,
                target: target
            };

            if (type === 'gift') {
                // Prefer hidden inputs if present (injected from selector), otherwise read from select
                const hiddenIdEl = document.getElementById('goal-gift-id');
                const hiddenNameEl = document.getElementById('goal-gift-name');
                const giftId = (hiddenIdEl && hiddenIdEl.value) ? hiddenIdEl.value : (dinamicasGoalGiftSelect ? dinamicasGoalGiftSelect.value : '');
                if (!giftId) {
                    alert('Por favor selecciona un regalo del catálogo.');
                    return;
                }

                let giftName = '';
                if (hiddenNameEl && hiddenNameEl.value) {
                    giftName = hiddenNameEl.value;
                } else if (dinamicasGoalGiftSelect) {
                    const selectedOpt = dinamicasGoalGiftSelect.options[dinamicasGoalGiftSelect.selectedIndex];
                    if (selectedOpt) {
                        giftName = selectedOpt.getAttribute('data-name') || (selectedOpt.textContent || '').replace(/ \(.*$/, '').trim();
                    }
                }

                data.giftId = giftId;
                data.giftName = giftName;
            }

            socket.emit('add_dynamic_goal', data);
            
            // Clear inputs
            dinamicasGoalTitleInput.value = '';
            dinamicasGoalTargetInput.value = '100';
        });
    }

    if (dinamicasBtnResetGoals) {
        dinamicasBtnResetGoals.addEventListener('click', () => {
            if (confirm('¿Estás seguro de que deseas reiniciar el progreso de todas las metas activas?')) {
                socket.emit('reset_dynamic_goals');
            }
        });
    }

    socket.on('initDinamicas', (data) => {
        dinamicasConfig = data || [];
        renderDynamicsMetasTable();
    });

    socket.on('initReceta', (config) => {
        if (!config) return;
        
        const titleInput = document.getElementById('vs-title-input');
        if (titleInput && titleInput.value !== config.title) {
            titleInput.value = config.title || '';
        }
        
        const container = document.getElementById('ingredients-container');
        if (container) {
            const inputs = container.querySelectorAll('.vs-item-name-input');
            const items = config.items || [];
            if (inputs.length !== items.length || inputs.length === 0) {
                container.innerHTML = '';
                items.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'vs-control-row';
                    row.style = 'display: flex; gap: 10px; align-items: center; width: 100%; margin-bottom: 8px;';
                    row.innerHTML = `
                        <input type="text" class="vs-item-name-input" value="${item.name || ''}" placeholder="Ingrediente...">
                        <button type="button" class="btn-delete-ingredient" style="background: transparent; border: none; color: #ff3b30; cursor: pointer; padding: 4px; display: inline-flex; align-items: center; justify-content: center; transition: background-color 0.2s; border-radius: 4px; height: 38px; width: 38px; flex-shrink: 0;">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    `;

                    row.querySelector('.btn-delete-ingredient').addEventListener('click', () => {
                        row.remove();
                        const updatedItems = [];
                        document.querySelectorAll('.vs-item-name-input').forEach(input => {
                            if (input.value.trim() !== '') updatedItems.push({ name: input.value, count: 1 });
                        });
                        socket.emit('manual_control', {
                            action: 'vs_update',
                            title: titleInput ? titleInput.value : '',
                            items: updatedItems
                        });
                    });

                    row.querySelector('.vs-item-name-input').addEventListener('input', () => {
                        const updatedItems = [];
                        document.querySelectorAll('.vs-item-name-input').forEach(input => {
                            if (input.value.trim() !== '') updatedItems.push({ name: input.value, count: 1 });
                        });
                        socket.emit('manual_control', {
                            action: 'vs_update',
                            title: titleInput ? titleInput.value : '',
                            items: updatedItems
                        });
                    });

                    container.appendChild(row);
                });
                if (window.lucide) window.lucide.createIcons();
            }
        }
    });

    function renderDynamicsMetasTable() {
        if (!dynamicsMetasTbody) return;
        dynamicsMetasTbody.innerHTML = '';

        if (dinamicasConfig.length === 0) {
            dynamicsMetasTbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">
                        No hay metas activas en el widget. Configura una arriba.
                    </td>
                </tr>
            `;
            return;
        }

        const serverPort = window.location.port || '3000';

        dinamicasConfig.forEach(goal => {
            const tr = document.createElement('tr');
            
            let typeText = '';
            let iconSrc = '';
            
            if (goal.type === 'likes') {
                typeText = 'Meta de Likes';
                iconSrc = `http://127.0.0.1:${serverPort}/app-assets/neutral-logo.jpg`;
            } else if (goal.type === 'follows') {
                typeText = 'Meta de Seguidores';
                iconSrc = `http://127.0.0.1:${serverPort}/app-assets/neutral-logo.jpg`;
            } else if (goal.type === 'gift') {
                typeText = goal.giftName || 'Regalo';
                const giftImage = goal.image || `${(goal.giftName || '').toLowerCase().replace(/\s+/g, '_')}.png`;
                iconSrc = `http://127.0.0.1:${serverPort}/gift-assets/${giftImage}`;
            }

            const current = goal.current || 0;
            const target = goal.target || 100;
            const percent = Math.min(Math.round((current / target) * 100), 100);

            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${iconSrc}" style="width: 30px; height: 30px; object-fit: contain; border-radius: 4px;" onerror="this.src='http://127.0.0.1:${serverPort}/app-assets/neutral-logo.jpg'">
                        <span style="font-weight: 700; color: var(--text-main);">${typeText}</span>
                    </div>
                </td>
                <td>
                    <span style="font-weight: 500; color: var(--text-main);">${goal.title || ''}</span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px; min-width: 140px;">
                        <div style="flex: 1; height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden; position: relative;">
                            <div style="width: ${percent}%; height: 100%; background: #00ffcc; box-shadow: 0 0 8px rgba(0, 255, 204, 0.4); transition: width 0.3s ease;"></div>
                        </div>
                        <span style="font-size: 11px; font-weight: bold; color: var(--text-main); white-space: nowrap;">${current} / ${target}</span>
                    </div>
                </td>
                <td class="text-right">
                    <button class="btn-icon btn-delete-dynamics-meta" data-goal-id="${goal.id}" style="color: var(--accent-red); background: transparent; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Eliminar Meta">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </td>
            `;

            tr.querySelector('.btn-delete-dynamics-meta').addEventListener('click', () => {
                socket.emit('remove_dynamic_goal', { goalId: goal.id });
            });

            dynamicsMetasTbody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    const btnAddDynamicsMeta = document.getElementById('btn-add-dynamics-meta');
    if (btnAddDynamicsMeta) {
        btnAddDynamicsMeta.addEventListener('click', () => {
            openGiftModal();
        });
    }

    // 2. DOM Elements
    const tableBody = document.getElementById('sound-alerts-body');
    const alertsStatusText = document.getElementById('alerts-status-text');
    
    // Modals
    const giftsGrid = document.getElementById('gifts-grid-container');

    const systemSoundsList = document.getElementById('system-sounds-list');
    const customSoundsList = document.getElementById('custom-sounds-list');
    const dropzone = document.getElementById('sound-upload-dropzone');

    // 3. Render Table
    function renderSoundAlertsTable(mapping) {
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const searchQuery = (document.getElementById('search-alerts') ? document.getElementById('search-alerts').value.toLowerCase().trim() : '');
        const serverPort = window.location.port || '3000';

        const giftIds = Object.keys(mapping || {});
        const filteredIds = giftIds.filter(giftId => {
            const gift = mapping[giftId];
            if (!searchQuery) return true;
            const nameText = (gift.name || '').toLowerCase();
            const soundText = (gift.sound || '').toLowerCase();
            return nameText.includes(searchQuery) || soundText.includes(searchQuery);
        });

        // Update status text
        if (alertsStatusText) {
            const configuredCount = giftIds.filter(id => mapping[id].sound).length;
            alertsStatusText.textContent = `${giftIds.length} alertas configuradas (${configuredCount} con sonido)`;
        }

        if (filteredIds.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
                        No se encontraron alertas configuradas. Haz clic en "+ Crear alerta sonora" para empezar.
                    </td>
                </tr>
            `;
            return;
        }

        // Sort by coins value ascending
        const sortedIds = filteredIds.sort((a, b) => (mapping[a].coins || 0) - (mapping[b].coins || 0));

        sortedIds.forEach(giftId => {
            const gift = mapping[giftId];
            const tr = document.createElement('tr');
            
            // Play icon
            const isPlaying = (currentlyPlayingIdx === giftId);
            const playIcon = isPlaying ? 'square' : 'play';
            
            // Gift icon url
            const giftImage = gift.image || `${(gift.name || '').toLowerCase().replace(/\s+/g, '_')}.png`;
            const iconSrc = `http://127.0.0.1:${serverPort}/gift-assets/${giftImage}`;

            // Generate row HTML
            tr.innerHTML = `
                <td>
                    <button class="btn-icon btn-test-sound" data-gift-id="${giftId}" style="color: ${isPlaying ? 'var(--accent-pink)' : 'var(--text-main)'}; background: transparent; border: none; cursor: pointer;">
                        <i data-lucide="${playIcon}" style="width: 18px; height: 18px;"></i>
                    </button>
                </td>
                <td>
                    <img src="${iconSrc}" style="width: 30px; height: 30px; object-fit: contain; border-radius: 4px;" onerror="this.src='http://127.0.0.1:${serverPort}/app-assets/neutral-logo.jpg'">
                </td>
                <td>
                    <span style="font-weight: 700; color: var(--text-main);">${gift.name || 'Desconocido'}</span>
                </td>
                <td>
                    <span style="font-weight: 700; color: #ffd700;">${gift.coins || 1} ●</span>
                </td>
                <td>
                    <button class="btn-sound-select" data-gift-id="${giftId}" style="padding: 6px 12px; border-radius: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-main); display: flex; align-items: center; gap: 8px; cursor: pointer; width: 100%; justify-content: space-between;">
                        <span>${gift.sound || 'Seleccionar sonido...'}</span>
                        <i data-lucide="chevron-down" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
                    </button>
                </td>
                <td>
                    <button class="btn-icon btn-clear-sound" data-gift-id="${giftId}" style="color: var(--accent-red); background: transparent; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;" title="Quitar Alerta">
                        <i data-lucide="x-circle" style="width: 16px; height: 16px;"></i>
                        <span>Quitar</span>
                    </button>
                </td>
            `;

            tableBody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Attach listeners
        attachRowListeners();
    }
    // Expose on window for external callers (e.g. initSoundsConfig socket listener)
    window.renderSoundAlertsTable = renderSoundAlertsTable;

    function attachRowListeners() {
        // Play/Preview
        document.querySelectorAll('.btn-test-sound').forEach(btn => {
            btn.addEventListener('click', () => {
                const giftId = btn.getAttribute('data-gift-id');
                const gift = soundsConfig[giftId];
                if (!gift || !gift.sound) return;

                if (currentlyPlayingIdx === giftId) {
                    stopSoundPreview();
                } else {
                    const serverPort = window.location.port || '3000';
                    const soundUrl = `http://127.0.0.1:${serverPort}/sound-assets/${gift.sound}`;
                    playSoundPreview(soundUrl, 100, giftId);
                }
            });
        });

        // Sound Select Button Click
        document.querySelectorAll('.btn-sound-select').forEach(btn => {
            btn.addEventListener('click', () => {
                activeEditGiftId = btn.getAttribute('data-gift-id');
                openSoundModal();
            });
        });

        // Clear sound (Quitar)
        document.querySelectorAll('.btn-clear-sound').forEach(btn => {
            btn.addEventListener('click', () => {
                const giftId = btn.getAttribute('data-gift-id');
                if (soundsConfig[giftId]) {
                    socket.emit('remove_sound_alert', { giftId: giftId });
                }
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
        
        renderSoundAlertsTable(soundsConfig);

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
        renderSoundAlertsTable(soundsConfig);
    }

    // 6. Gift Selector Modal Operations
    // Reemplaza la función openGiftModal (panel.js)
async function openGiftModal() {
    const giftModal = document.getElementById('gift-selector-modal');
    if (!giftModal) return;
    giftModal.style.display = 'flex';
    // Immediately clear container so UI stays responsive
    if (giftsGrid) giftsGrid.innerHTML = '';

    // If we already have mapping from initMetas, render immediately
    if (Object.keys(giftsMapping || {}).length > 0) {
        renderGiftsGrid('');
        return;
    }

    // Show loading state while fetching
    if (giftsGrid) giftsGrid.innerHTML = `<div style="grid-column: span 4; text-align: center; color: var(--text-muted); padding: 30px;"><i data-lucide=\"loader\" style=\"width:24px;height:24px;animation:spin 1s linear infinite;\"></i><br>Cargando catálogo...</div>`;

    // Fetch catalog from API as fallback and then render
    await fetchGiftsCatalog();
    renderGiftsGrid('');
}

    function closeGiftModal() {
        const giftModal = document.getElementById('gift-selector-modal');
        if (giftModal) giftModal.style.display = 'none';
        activeEditRowIndex = null;
    }

    // Reemplaza la función renderGiftsGrid (panel.js)
function renderGiftsGrid(searchQuery) {
    if (!giftsGrid) return;
    giftsGrid.innerHTML = '';

    const query = (searchQuery || '').toLowerCase().trim();
    const list = Object.entries(giftsMapping || {}).map(([id, g]) => ({ id, ...g }));
    const sorted = list.sort((a, b) => (a.coins || 0) - (b.coins || 0));
    const filtered = sorted.filter(g => (g.name || '').toLowerCase().includes(query));

    if (filtered.length === 0) {
        giftsGrid.innerHTML = `<div style="grid-column: span 4; text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron regalos.</div>`;
        return;
    }

    filtered.forEach(gift => {
        const item = document.createElement('div');
        item.className = 'gift-item';
        const serverPort = window.location.port || '3000';
        const giftImage = gift.image || `${(gift.name || '').toLowerCase().replace(/\s+/g, '_')}.png`;
        const iconSrc = `http://127.0.0.1:${serverPort}/gift-assets/${giftImage}`;

        item.innerHTML = `
            <img src="${iconSrc}" alt="${gift.name}" onerror="this.src='http://127.0.0.1:${serverPort}/app-assets/neutral-logo.jpg'">
            <div style="display:flex;flex-direction:column;flex:1;">
                <span class="gift-name">${gift.name}</span>
                <span class="gift-coins">${gift.coins} <span style="color: #ffd700;">●</span></span>
            </div>
            <button class="btn-select-gift" style="margin-left:8px;padding:6px 10px;border-radius:6px;">Seleccionar</button>
        `;

        // Manual selection button
        const selectBtnHandler = (e) => {
            e.stopPropagation();
            socket.emit('add_sound_alert', {
                giftId: gift.id,
                name: gift.name,
                coins: gift.coins,
                image: giftImage
            });
            closeGiftModal();
        };

        // Click anywhere on the item or on the button selects the gift
        item.addEventListener('click', selectBtnHandler);
        giftsGrid.appendChild(item);
        const btn = item.querySelector('.btn-select-gift');
        if (btn) btn.addEventListener('click', selectBtnHandler);
    });
}

    // 7. Sound Selector Modal Operations
    function openSoundModal() {
        const soundModal = document.getElementById('sound-selector-modal');
        if (!soundModal) return;
        soundModal.style.display = 'flex';
        loadSystemSounds().then(() => {
            renderSoundsList('');
        });
    }

    function closeSoundModal() {
        const soundModal = document.getElementById('sound-selector-modal');
        if (soundModal) soundModal.style.display = 'none';
        activeEditRowIndex = null;
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
        systemSoundsList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">Los archivos físicos detectados se listan a continuación.</div>`;
        customSoundsList.innerHTML = '';

        const query = searchQuery.toLowerCase().trim();

        // Render physically scanned sounds from SYSTEM_SOUNDS inside MIS SONIDOS SUBIDOS (customSoundsList)
        const filtered = SYSTEM_SOUNDS.filter(s => {
            const displayName = s.filename || s.name;
            return displayName.toLowerCase().includes(query);
        });

        if (filtered.length === 0) {
            customSoundsList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">No se encontraron archivos de sonido en la carpeta public/sounds.</div>`;
        } else {
            filtered.forEach(sound => {
                const item = document.createElement('div');
                item.className = 'sound-list-item';
                
                const displayName = sound.filename || sound.name;
                const serverPort = window.location.port || '3000';
                const soundUrl = `http://127.0.0.1:${serverPort}/sound-assets/${sound.filename}`;

                item.innerHTML = `
                    <div class="sound-info">
                        <i data-lucide="volume-2" style="width: 14px; height: 14px;"></i>
                        <span>${displayName}</span>
                    </div>
                    <div class="sound-actions">
                        <button class="btn-modal-preview-sound btn secondary small" data-url="${soundUrl}" style="padding: 6px 10px;">
                            <i data-lucide="play" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn-modal-select-sound btn primary small" data-url="${soundUrl}" data-name="${displayName}" style="padding: 6px 12px; font-size: 11px;">
                            Seleccionar
                        </button>
                    </div>
                `;

                // Add preview listener
                const previewBtn = item.querySelector('.btn-modal-preview-sound');
                previewBtn.addEventListener('click', () => {
                    playModalSoundPreview(soundUrl, previewBtn);
                });

                // Add select listener
                const selectBtn = item.querySelector('.btn-modal-select-sound');
                selectBtn.addEventListener('click', () => {
                    if (activeEditGiftId !== null && soundsConfig[activeEditGiftId]) {
                        const filename = sound.filename || displayName;
                        soundsConfig[activeEditGiftId].sound = filename;
                        socket.emit('update_gift_sound', { giftId: activeEditGiftId, sound: filename });
                    }
                    if (modalPreviewAudio) modalPreviewAudio.pause();
                    closeSoundModal();
                });

                customSoundsList.appendChild(item);
            });
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // 8. Custom Sound Upload Actions
    function uploadSoundFile(file) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = function() {
            const base64Data = reader.result;
            const btnTriggerUpload = document.getElementById('btn-trigger-upload-sound');
            
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
                    // Reload sounds dynamically to scan the physical file
                    loadSystemSounds().then(() => {
                        renderSoundsList(document.getElementById('search-sounds-input') ? document.getElementById('search-sounds-input').value : '');
                    });
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
                renderSoundsList(document.getElementById('search-sounds-input') ? document.getElementById('search-sounds-input').value : '');
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
    // Note: renderGoalsList and renderWheelOptionsList have been moved to the global scope at the end of this file to prevent ReferenceErrors during early socket setup.

    window.addEventListener('ui:deleteGoal', (e) => {
        const id = e.detail.id;
        if (!id) return;
        if (!confirm('¿Estás seguro de eliminar esta meta?')) return;
        
        fetch(`/api/goals/${id}`, {
            method: 'DELETE'
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                console.log('Goal deleted successfully.');
                chatbotConfig.goals = data.goals || [];
                renderGoalsList(chatbotConfig.goals);
            } else {
                alert('Error al borrar la meta: ' + (data.error || 'Desconocido'));
            }
        })
        .catch(err => {
            console.error('Error deleting goal:', err);
            alert('Error en conexión al intentar borrar la meta.');
        });
    });

    window.addEventListener('ui:deleteWheelOption', (e) => {
        const index = e.detail.index;
        if (index === undefined || index === null) return;
        if (!chatbotConfig || !chatbotConfig.wheelOptions) return;
        if (chatbotConfig.wheelOptions.length <= 3) {
            alert('La ruleta debe tener al menos 3 opciones.');
            return;
        }
        chatbotConfig.wheelOptions.splice(index, 1);
        renderWheelOptionsList(chatbotConfig.wheelOptions);
        sendUpdatedSettings();
    });

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
            const gNameEl = document.getElementById('goal-gift-name');
            if (gNameEl) {
                if (gNameEl.tagName === 'SELECT') {
                    gNameEl.selectedIndex = 0;
                } else {
                    gNameEl.value = '';
                }
            }
            const gSelectEl = document.getElementById('goal-gift-select');
            if (gSelectEl) {
                gSelectEl.selectedIndex = 0;
                gSelectEl.dispatchEvent(new Event('change'));
            }
        });
    }

    // Sync active goal from fast config inputs
    const activeGoalGiftNameEl = document.getElementById('meta-gift-select');
    const activeGoalTargetEl = document.getElementById('meta-limit-input');

    function syncActiveGoalFromInputs() {
        if (!chatbotConfig) return;
        if (!chatbotConfig.goals) chatbotConfig.goals = [];

        const giftName = activeGoalGiftNameEl.value.trim();
        const target = parseInt(activeGoalTargetEl.value, 10) || 100;

        let giftGoal = chatbotConfig.goals.find(g => g.type === 'gift' && g.enabled);
        if (giftGoal) {
            giftGoal.giftName = giftName;
            giftGoal.title = `Regalo: ${giftName}`;
            giftGoal.target = target;
        } else {
            // Create a default one if it doesn't exist
            giftGoal = {
                id: 'goal_' + Date.now(),
                type: 'gift',
                giftName: giftName,
                title: `Regalo: ${giftName}`,
                target: target,
                current: 0,
                enabled: true
            };
            chatbotConfig.goals.push(giftGoal);
        }
        renderGoalsList(chatbotConfig.goals);
        sendUpdatedSettings();
    }

    if (activeGoalGiftNameEl) {
        activeGoalGiftNameEl.addEventListener('change', syncActiveGoalFromInputs);
    }
    if (activeGoalTargetEl) {
        activeGoalTargetEl.addEventListener('change', syncActiveGoalFromInputs);
        activeGoalTargetEl.addEventListener('input', syncActiveGoalFromInputs);
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

    // =========================================================================
    // MULTIMEDIA EVENT LISTENERS
    // =========================================================================
    const btnCreateAlert = document.getElementById('btn-create-sound-alert');
    if (btnCreateAlert) {
        btnCreateAlert.addEventListener('click', () => {
            openGiftModal();
        });
    }

    const searchAlertsInput = document.getElementById('search-alerts');
    if (searchAlertsInput) {
        searchAlertsInput.addEventListener('input', () => {
            renderSoundAlertsTable(soundsConfig);
        });
    }

    const btnCloseGiftModal = document.getElementById('btn-close-gift-modal');
    if (btnCloseGiftModal) btnCloseGiftModal.addEventListener('click', closeGiftModal);

    const giftModal = document.getElementById('gift-selector-modal');
    if (giftModal) {
        giftModal.addEventListener('click', (e) => {
            if (e.target === giftModal) closeGiftModal();
        });
    }

    const searchGiftsInput = document.getElementById('search-gifts-input');
    if (searchGiftsInput) {
        searchGiftsInput.addEventListener('input', (e) => {
            renderGiftsGrid(e.target.value);
        });
    }

    const btnCloseSoundModal = document.getElementById('btn-close-sound-modal');
    if (btnCloseSoundModal) btnCloseSoundModal.addEventListener('click', closeSoundModal);

    const soundModal = document.getElementById('sound-selector-modal');
    if (soundModal) {
        soundModal.addEventListener('click', (e) => {
            if (e.target === soundModal) closeSoundModal();
        });
    }

    const searchSoundsInput = document.getElementById('search-sounds-input');
    if (searchSoundsInput) {
        searchSoundsInput.addEventListener('input', (e) => {
            renderSoundsList(e.target.value);
        });
    }

    const btnTriggerUpload = document.getElementById('btn-trigger-upload-sound');
    const soundFileInput = document.getElementById('sound-file-input');
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

    // Drag and drop dropzone (already declared at line 4205)
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

    // Cerebro → Multimedia: cargar giftsMapping desde la API del cerebro al iniciar el panel
    fetch('/api/gifts')
        .then(response => response.json())
        .then(data => {
            giftsMapping = data || {};
            console.log('[Multimedia] Catálogo cerebro cargado:', Object.keys(giftsMapping).length, 'regalos');
            if (typeof renderCatalogGiftsGrid === 'function') renderCatalogGiftsGrid();
            if (typeof updateCatalogCountBadge === 'function') updateCatalogCountBadge();
        })
        .catch(err => console.error('[Multimedia] Error al cargar catálogo cerebro:', err));

    // Espejo → Dinámicas: cargar goalsCatalog desde el catálogo espejo al iniciar el panel
    fetch('/api/goals-catalog')
        .then(response => response.json())
        .then(data => {
            goalsCatalog = data || {};
            console.log('[Dinámicas] Catálogo espejo cargado:', Object.keys(goalsCatalog).length, 'regalos');
            populateGoalsCatalogSelectors();
            if (typeof populateApuestasGiftDropdowns === 'function') populateApuestasGiftDropdowns();
        })
        .catch(err => console.error('[Dinámicas] Error al cargar catálogo espejo:', err));

    // Catálogo Cerebro Search Input
    const searchCatalogInput = document.getElementById('search-catalog-gifts');
    if (searchCatalogInput) {
        searchCatalogInput.addEventListener('input', () => {
            renderCatalogGiftsGrid();
        });
    }

    // Reset Session Rankings Button
    const btnResetSessionRankings = document.getElementById('btn-reset-session-rankings');
    if (btnResetSessionRankings) {
        btnResetSessionRankings.addEventListener('click', () => {
            if (confirm('¿Estás seguro de reiniciar todos los rankings de la sesión?')) {
                socket.emit('reset_session_rankings');
            }
        });
    }
});

// =========================================================================
// GLOBAL FUNCTIONS (HOISTED)
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
                <button class="btn-delete" onclick="window.deleteGoal('${goal.id}')" style="background: transparent; border: none; color: #ff3366; cursor: pointer; padding: 5px;">
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

function renderCatalogGiftsGrid() {
    const grid = document.getElementById('catalog-gifts-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const searchInput = document.getElementById('search-catalog-gifts');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const list = Object.entries(giftsMapping || {}).map(([id, g]) => ({ id, ...g }));
    const sorted = list.sort((a, b) => (a.coins || 0) - (b.coins || 0));
    const filtered = sorted.filter(g => (g.name || '').toLowerCase().includes(query));

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px; font-size: 13px;">No se encontraron regalos en el catálogo.</div>';
        return;
    }

    filtered.forEach(gift => {
        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; align-items: center; gap: 12px; transition: background 0.2s;';
        
        const giftImage = gift.image || `${(gift.name || '').toLowerCase().replace(/\s+/g, '_')}.png`;
        const iconSrc = `${window.location.origin}/gift-assets/${giftImage}`;
        const neutralSrc = `${window.location.origin}/app-assets/neutral-logo.jpg`;

        card.innerHTML = `
            <img src="${iconSrc}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px;" onerror="this.src='${neutralSrc}'">
            <div style="display: flex; flex-direction: column; min-width: 0; flex-grow: 1;">
                <span style="font-size: 13px; font-weight: 700; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${gift.name}</span>
                <span style="font-size: 11px; color: #ffd700; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                    <i data-lucide="gem" style="width: 10px; height: 10px; color: #ffd700;"></i> ${gift.coins}
                </span>
            </div>
        `;
        grid.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

// ──────────────────────────────────────────
// Refresh Catalog Button
// ──────────────────────────────────────────
function updateCatalogCountBadge() {
    const countEl = document.getElementById('catalog-gift-count');
    if (!countEl) return;
    const total = Object.keys(giftsMapping || {}).length;

    // Count how many gifts have an image that could be resolved
    const withImage = Object.values(giftsMapping || {}).filter(g => g.image && g.image.trim() !== '').length;

    countEl.textContent = `${total} regalos · ${withImage} con imagen`;
    countEl.style.display = 'inline';
}

document.addEventListener('DOMContentLoaded', () => {
    const btnRefresh = document.getElementById('btn-refresh-catalog');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            // Spin animation
            const icon = btnRefresh.querySelector('i');
            if (icon) {
                icon.style.transition = 'transform 0.6s ease';
                icon.style.transform = 'rotate(360deg)';
                setTimeout(() => {
                    icon.style.transition = '';
                    icon.style.transform = '';
                }, 650);
            }
            btnRefresh.disabled = true;
            btnRefresh.style.opacity = '0.6';

            fetch('/api/gifts')
                .then(r => r.json())
                .then(data => {
                    giftsMapping = data || {};
                    console.log('[Catálogo] Actualizado:', Object.keys(giftsMapping).length, 'regalos');
                    if (typeof renderCatalogGiftsGrid === 'function') renderCatalogGiftsGrid();
                    updateCatalogCountBadge();
                    showToast(`✅ Catálogo actualizado: ${Object.keys(giftsMapping).length} regalos encontrados`, 'success');
                })
                .catch(err => {
                    console.error('[Catálogo] Error al actualizar:', err);
                    showToast('❌ Error al actualizar el catálogo', 'error');
                })
                .finally(() => {
                    btnRefresh.disabled = false;
                    btnRefresh.style.opacity = '1';
                });
        });
    }
});

// Bind Simulator events
document.addEventListener('DOMContentLoaded', () => {
    const btnSimulateGift = document.getElementById('btn-simulate-gift');
    if (btnSimulateGift) {
        btnSimulateGift.addEventListener('click', () => {
            if (btnSimulateGift.disabled) return;
            btnSimulateGift.disabled = true;
            btnSimulateGift.style.opacity = '0.5';
            setTimeout(() => {
                btnSimulateGift.disabled = false;
                btnSimulateGift.style.opacity = '1';
            }, 500);

            const selectedVal = document.getElementById('sim-gift-select').value;
            const parts = selectedVal.split('|');
            const giftId = parseInt(parts[0]);
            const giftName = parts[1];
            const diamondCount = parseInt(parts[2]);
            const repeatCount = parseInt(document.getElementById('sim-gift-count').value) || 1;
            const uniqueId = document.getElementById('sim-gift-username').value.trim() || 'usuario_test';

            const msgId = 'sim_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);

            socket.emit('simulate_tiktok_event', {
                eventType: 'gift',
                eventData: {
                    uniqueId: uniqueId,
                    nickname: uniqueId.charAt(0).toUpperCase() + uniqueId.slice(1),
                    giftId: giftId,
                    giftName: giftName,
                    diamondCount: diamondCount,
                    repeatCount: repeatCount,
                    repeatEnd: 1,
                    msgId: msgId
                }
            });
            showToast(`Simulando envío de regalo: ${repeatCount}x ${giftName} por @${uniqueId}`, 'info');
        });
    }

    const btnSimulateChat = document.getElementById('btn-simulate-chat');
    if (btnSimulateChat) {
        btnSimulateChat.addEventListener('click', () => {
            if (btnSimulateChat.disabled) return;
            btnSimulateChat.disabled = true;
            btnSimulateChat.style.opacity = '0.5';
            setTimeout(() => {
                btnSimulateChat.disabled = false;
                btnSimulateChat.style.opacity = '1';
            }, 500);

            const uniqueId = document.getElementById('sim-chat-username').value.trim() || 'usuario_test';
            const comment = document.getElementById('sim-chat-message').value.trim();
            if (!comment) return;

            socket.emit('simulate_tiktok_event', {
                eventType: 'chat',
                eventData: {
                    uniqueId: uniqueId,
                    nickname: uniqueId.charAt(0).toUpperCase() + uniqueId.slice(1),
                    comment: comment,
                    isSubscriber: false,
                    isModerator: false,
                    isAnchor: false
                }
            });
            showToast(`Simulando mensaje de chat de @${uniqueId}: "${comment}"`, 'info');
        });
    }
});

// Render socials table
function renderSocialsTable(socials) {
    const tbody = document.getElementById('socials-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!socials || socials.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-socials-row">
                <td colspan="3" style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 15px;">
                    No hay redes sociales configuradas. Haz clic en "Agregar Red" para comenzar.
                </td>
            </tr>
        `;
        return;
    }

    socials.forEach((social, index) => {
        addSocialRow(social.platform, social.username);
    });
}

function addSocialRow(platform = 'instagram', username = '') {
    const tbody = document.getElementById('socials-table-body');
    if (!tbody) return;

    // Remove empty row if exists
    const emptyRow = tbody.querySelector('.empty-socials-row');
    if (emptyRow) {
        tbody.removeChild(emptyRow);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="padding: 8px;">
            <select class="social-platform-select" style="width: 100%; background: rgba(0,0,0,0.2); color: var(--text-main); border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 13px;">
                <option value="instagram" ${platform === 'instagram' ? 'selected' : ''}>Instagram</option>
                <option value="tiktok" ${platform === 'tiktok' ? 'selected' : ''}>TikTok</option>
                <option value="facebook" ${platform === 'facebook' ? 'selected' : ''}>Facebook</option>
                <option value="youtube" ${platform === 'youtube' ? 'selected' : ''}>YouTube</option>
                <option value="twitter" ${platform === 'twitter' ? 'selected' : ''}>Twitter / X</option>
                <option value="discord" ${platform === 'discord' ? 'selected' : ''}>Discord</option>
                <option value="custom" ${platform === 'custom' ? 'selected' : ''}>Personalizado</option>
            </select>
        </td>
        <td style="padding: 8px;">
            <input type="text" class="social-username-input" value="${username}" placeholder="ej: @nombre_usuario o url" style="width: 100%; background: rgba(0,0,0,0.2); color: var(--text-main); border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 13px;">
        </td>
        <td style="padding: 8px; text-align: center; white-space: nowrap;">
            <button class="btn secondary small test-social-row-btn" style="padding: 6px 10px; border-radius: 4px; background: rgba(0,255,204,0.1); color: #00ffcc; border: 1px solid rgba(0,255,204,0.2); cursor: pointer; margin-right: 5px;">
                Probar
            </button>
            <button class="btn secondary small delete-social-row-btn" style="padding: 6px 10px; border-radius: 4px; background: rgba(255,51,102,0.1); color: #ff3366; border: 1px solid rgba(255,51,102,0.2); cursor: pointer;">
                Eliminar
            </button>
        </td>
    `;

    // Bind test event
    tr.querySelector('.test-social-row-btn').addEventListener('click', () => {
        const platform = tr.querySelector('.social-platform-select').value;
        const username = tr.querySelector('.social-username-input').value.trim();
        if (!username) {
            showToast('Por favor, introduce un nombre de usuario o enlace para probar', 'warning');
            return;
        }
        
        socket.emit('test_social_rotator', { platform, username });
        showToast(`Probando red social: ${platform} - ${username}`, 'info');
    });

    // Bind delete event
    tr.querySelector('.delete-social-row-btn').addEventListener('click', () => {
        tr.remove();
        // If table is now empty, render empty row
        if (tbody.querySelectorAll('tr').length === 0) {
            renderSocialsTable([]);
        }
        showSaveSettingsFloating();
    });

    // Mark changes when editing fields
    tr.querySelector('.social-platform-select').addEventListener('change', showSaveSettingsFloating);
    tr.querySelector('.social-username-input').addEventListener('input', showSaveSettingsFloating);

    tbody.appendChild(tr);
}

function renderBannerSlides(slides) {
    const container = document.getElementById('banner-slides-container');
    if (!container) return;
    container.innerHTML = '';

    if (!slides || slides.length === 0) {
        slides = ["Ejemplo de texto"];
    }

    slides.forEach((slideText, index) => {
        const div = document.createElement('div');
        div.className = 'banner-slide-row';
        div.style.display = 'flex';
        div.style.gap = '10px';
        div.style.alignItems = 'center';

        div.innerHTML = `
            <span style="color: rgba(255,255,255,0.4); font-size: 11px; width: 25px; font-family: monospace;">#${index + 1}</span>
            <input type="text" class="input banner-slide-text-input" style="flex: 1; padding: 6px 10px; font-size: 13px;" value="${escapeHtml(slideText)}" />
            <button class="btn danger small btn-delete-banner-slide" style="padding: 6px 10px; font-size: 12px; margin-bottom: 0;">
                Eliminar
            </button>
        `;

        div.querySelector('.banner-slide-text-input').addEventListener('input', showSaveSettingsFloating);
        div.querySelector('.btn-delete-banner-slide').addEventListener('click', () => {
            div.remove();
            showSaveSettingsFloating();
            reindexBannerSlides();
        });

        container.appendChild(div);
    });
}

function reindexBannerSlides() {
    const rows = document.querySelectorAll('#banner-slides-container .banner-slide-row');
    rows.forEach((row, index) => {
        const label = row.querySelector('span');
        if (label) label.textContent = `#${index + 1}`;
    });
}

// Bind banner settings inputs
document.addEventListener('DOMContentLoaded', () => {
    const sliderIds = [
        { id: 'banner-border-width', valId: 'val-banner-border-width', suffix: 'px' },
        { id: 'banner-border-radius', valId: 'val-banner-border-radius', suffix: 'px' },
        { id: 'banner-bg-opacity', valId: 'val-banner-bg-opacity', suffix: '%' },
        { id: 'banner-font-size', valId: 'val-banner-font-size', suffix: 'px' },
        { id: 'banner-rotation-speed', valId: 'val-banner-rotation-speed', suffix: 's' }
    ];

    sliderIds.forEach(item => {
        const el = document.getElementById(item.id);
        const valEl = document.getElementById(item.valId);
        if (el && valEl) {
            el.addEventListener('input', () => {
                valEl.textContent = el.value + item.suffix;
                showSaveSettingsFloating();
            });
        }
    });

    const otherInputs = [
        'banner-width-input',
        'banner-height-input',
        'banner-border-style',
        'banner-border-color',
        'banner-bg-color',
        'banner-font-family',
        'banner-font-color'
    ];

    otherInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(eventName, showSaveSettingsFloating);
        }
    });

    const btnAddSlide = document.getElementById('btn-add-banner-slide');
    if (btnAddSlide) {
        btnAddSlide.addEventListener('click', () => {
            const container = document.getElementById('banner-slides-container');
            if (!container) return;
            
            const index = container.querySelectorAll('.banner-slide-row').length;
            const div = document.createElement('div');
            div.className = 'banner-slide-row';
            div.style.display = 'flex';
            div.style.gap = '10px';
            div.style.alignItems = 'center';

            div.innerHTML = `
                <span style="color: rgba(255,255,255,0.4); font-size: 11px; width: 25px; font-family: monospace;">#${index + 1}</span>
                <input type="text" class="input banner-slide-text-input" style="flex: 1; padding: 6px 10px; font-size: 13px;" placeholder="Escribe tu mensaje aquí..." />
                <button class="btn danger small btn-delete-banner-slide" style="padding: 6px 10px; font-size: 12px; margin-bottom: 0;">
                    Eliminar
                </button>
            `;

            div.querySelector('.banner-slide-text-input').addEventListener('input', showSaveSettingsFloating);
            div.querySelector('.btn-delete-banner-slide').addEventListener('click', () => {
                div.remove();
                showSaveSettingsFloating();
                reindexBannerSlides();
            });

            container.appendChild(div);
            showSaveSettingsFloating();
            
            // Scroll to bottom of container
            container.scrollTop = container.scrollHeight;
        });
    }
});

// Bind button clicks in DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const btnAddSocial = document.getElementById('btn-add-social-row');
    if (btnAddSocial) {
        btnAddSocial.addEventListener('click', () => {
            addSocialRow();
            showSaveSettingsFloating();
        });
    }

    const btnSaveSocials = document.getElementById('btn-save-socials');
    if (btnSaveSocials) {
        btnSaveSocials.addEventListener('click', () => {
            sendUpdatedSettings();
            showToast('¡Redes sociales y configuración guardadas con éxito!', 'success');
            const originalText = btnSaveSocials.innerHTML;
            btnSaveSocials.innerHTML = '¡Guardado!';
            btnSaveSocials.style.background = 'var(--accent-green, #10b981)';
            setTimeout(() => {
                btnSaveSocials.innerHTML = originalText;
                btnSaveSocials.style.background = '';
            }, 1500);
        });
    }

    const btnSaveBannerSettings = document.getElementById('btn-save-banner-settings');
    if (btnSaveBannerSettings) {
        btnSaveBannerSettings.addEventListener('click', () => {
            sendUpdatedSettings();
            showToast('¡Configuración de banner guardada con éxito!', 'success');
            const originalText = btnSaveBannerSettings.innerHTML;
            btnSaveBannerSettings.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i> ¡Guardado!';
            btnSaveBannerSettings.style.background = 'var(--accent-green, #10b981)';
            if (window.lucide) window.lucide.createIcons();
            setTimeout(() => {
                btnSaveBannerSettings.innerHTML = originalText;
                btnSaveBannerSettings.style.background = '';
                if (window.lucide) window.lucide.createIcons();
            }, 1500);
        });
    }

    const btnToggleBannerDesign = document.getElementById('btn-toggle-banner-design');
    const bannerCollapsePanel = document.getElementById('banner-settings-collapse-panel');
    if (btnToggleBannerDesign && bannerCollapsePanel) {
        btnToggleBannerDesign.addEventListener('click', () => {
            const isExpanded = bannerCollapsePanel.classList.toggle('expanded');
            btnToggleBannerDesign.classList.toggle('active', isExpanded);
            const spanText = btnToggleBannerDesign.querySelector('span');
            if (spanText) {
                spanText.textContent = isExpanded ? 'Cerrar Ajustes' : 'Ajustes de Diseño';
            }
        });
    }
});

// Helper to show floating save button if available
function showSaveSettingsFloating() {
    const floatingSaveBtn = document.getElementById('floating-save-btn');
    if (floatingSaveBtn) {
        floatingSaveBtn.classList.add('visible');
    }
}

// Function to populate all event sound selects
function populateEventSoundDropdowns() {
    const selects = document.querySelectorAll('.bot-event-sound-select');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Sin sonido</option>';
        SYSTEM_SOUNDS.forEach(sound => {
            const option = document.createElement('option');
            option.value = sound.url; // e.g. /sounds/bruh.mp3
            option.textContent = sound.name; // e.g. TavLive Bruh
            select.appendChild(option);
        });
        select.value = currentValue;
    });
}

// Initial system sounds load & quick preview for live event sounds
document.addEventListener('DOMContentLoaded', () => {
    loadSystemSounds().then(() => {
        populateEventSoundDropdowns();
        if (typeof chatbotConfig !== 'undefined' && chatbotConfig) {
            updateUIWithConfig(chatbotConfig);
        }
    });

    let eventPreviewAudio = null;
    let eventPreviewPlayingUrl = null;

    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-preview-event-sound');
        if (!btn) return;
        
        const selectId = btn.getAttribute('data-select-id');
        const selectEl = document.getElementById(selectId);
        if (!selectEl) return;
        const url = selectEl.value;
        if (!url) {
            showToast('Selecciona un sonido para reproducir la previsualización.', 'info');
            return;
        }

        if (eventPreviewAudio && eventPreviewPlayingUrl === url) {
            eventPreviewAudio.pause();
            eventPreviewAudio = null;
            eventPreviewPlayingUrl = null;
            btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px;"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Reset all preview buttons icon
        document.querySelectorAll('.btn-preview-event-sound').forEach(b => {
            b.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px;"></i>';
        });

        if (eventPreviewAudio) {
            eventPreviewAudio.pause();
        }

        eventPreviewAudio = new Audio(url);
        eventPreviewPlayingUrl = url;
        btn.innerHTML = '<i data-lucide="square" style="width: 14px; height: 14px;"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        eventPreviewAudio.play().catch(err => {
            console.error(err);
            btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px;"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            eventPreviewAudio = null;
            eventPreviewPlayingUrl = null;
        });

        eventPreviewAudio.addEventListener('ended', () => {
            btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px;"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            eventPreviewAudio = null;
            eventPreviewPlayingUrl = null;
        });
    });
});

// =====================================================================
// LÓGICA DEL JUEGO DE APUESTAS (DINÁMICAS)
// =====================================================================

function populateApuestasGiftDropdowns() {
    const selects = [
        document.getElementById('apuestas-p1-gift'),
        document.getElementById('apuestas-p2-gift'),
        document.getElementById('apuestas-p3-gift'),
        document.getElementById('apuestas-p4-gift')
    ];
    
    // Sort gifts alphabetically
    const sortedGifts = Object.entries(goalsCatalog || {}).map(([id, info]) => {
        return { id, name: info.name, coins: info.coins };
    }).sort((a, b) => a.name.localeCompare(b.name));
    
    selects.forEach((select, idx) => {
        if (!select) return;
        
        const prevVal = select.value;
        select.innerHTML = '';
        
        if (sortedGifts.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Cargando regalos...';
            select.appendChild(opt);
            return;
        }
        
        sortedGifts.forEach(gift => {
            const opt = document.createElement('option');
            opt.value = gift.id;
            opt.textContent = `${gift.name} (${gift.coins} mo.)`;
            select.appendChild(opt);
        });
        
        // Restore previous value or apply intelligent defaults
        if (prevVal && Array.from(select.options).some(o => o.value === prevVal)) {
            select.value = prevVal;
        } else {
            const defaultGifts = ['8913', '9947', '45', '46']; // Rosa, BFF Necklace, Heart, Confetti
            if (defaultGifts[idx] && Array.from(select.options).some(o => o.value === defaultGifts[idx])) {
                select.value = defaultGifts[idx];
            } else if (select.options.length > idx) {
                select.selectedIndex = idx;
            }
        }
    });
}

function toggleApuestasParticipantRows(count) {
    const countVal = parseInt(count) || 4;
    const p3Row = document.getElementById('apuestas-p3-row');
    const p4Row = document.getElementById('apuestas-p4-row');
    
    if (p3Row) p3Row.style.display = countVal >= 3 ? 'flex' : 'none';
    if (p4Row) p4Row.style.display = countVal >= 4 ? 'flex' : 'none';
}

function renderApuestasVotersSummary(apuestas) {
    const container = document.getElementById('apuestas-voters-summary');
    if (!container) return;
    
    const count = parseInt(apuestas.count) || 4;
    let html = '';
    let totalVotes = 0;
    
    for (let i = 1; i <= count; i++) {
        const pKey = 'p' + i;
        const participant = apuestas[pKey];
        if (participant) {
            totalVotes += participant.votes || 0;
            const votersList = (participant.voters || []).map(v => `@${v.username} (${v.count})`).join(', ');
            html += `
                <div style="margin-bottom: 8px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 5px;">
                    <strong style="color: var(--text-main);">${participant.name}</strong> (${participant.giftName}): 
                    <span style="color: #ff00ff; font-weight: bold;">${participant.votes} votos</span>
                    <div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">
                        Votantes: ${votersList || 'Ninguno'}
                    </div>
                </div>
            `;
        }
    }
    
    if (totalVotes === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 10px 0;">Ningún voto registrado aún.</div>`;
    } else {
        container.innerHTML = html;
    }
}

// Bind Apuestas event listeners
document.addEventListener('DOMContentLoaded', () => {
    const apCountEl = document.getElementById('apuestas-count');
    const btnSaveApuestas = document.getElementById('btn-save-apuestas');
    const btnResetApuestas = document.getElementById('btn-reset-apuestas');
    
    if (apCountEl) {
        apCountEl.addEventListener('change', (e) => {
            toggleApuestasParticipantRows(e.target.value);
        });
    }
    
    if (btnSaveApuestas) {
        btnSaveApuestas.addEventListener('click', () => {
            const enabled = document.getElementById('apuestas-enabled').checked;
            const title = document.getElementById('apuestas-title').value.trim();
            const count = parseInt(document.getElementById('apuestas-count').value) || 4;
            
            const currentApuestas = (chatbotConfig && chatbotConfig.apuestas) || {};
            const apuestas = {
                enabled: enabled,
                title: title,
                count: count
            };
            
            for (let i = 1; i <= 4; i++) {
                const pKey = 'p' + i;
                const nameInput = document.getElementById(`apuestas-${pKey}-name`);
                const giftSelect = document.getElementById(`apuestas-${pKey}-gift`);
                
                const name = (nameInput ? nameInput.value.trim() : '') || `Participante ${i}`;
                const giftId = giftSelect ? giftSelect.value : '';
                const giftName = (goalsCatalog[giftId] ? goalsCatalog[giftId].name : '') || 'Regalo';
                
                const existing = currentApuestas[pKey] || {};
                let votes = existing.votes || 0;
                let voters = existing.voters || [];
                
                // If gift changed, reset counts for this participant
                if (existing.giftId !== giftId) {
                    votes = 0;
                    voters = [];
                }
                
                apuestas[pKey] = {
                    name: name,
                    giftId: giftId,
                    giftName: giftName,
                    votes: votes,
                    voters: voters
                };
            }
            
            socket.emit('update_chatbot_settings', { apuestas: apuestas });
            showToast('Juego de apuestas actualizado con éxito.', 'success');
        });
    }
    
    if (btnResetApuestas) {
        btnResetApuestas.addEventListener('click', () => {
            if (!chatbotConfig || !chatbotConfig.apuestas) return;
            
            if (confirm('¿Estás seguro de que deseas reiniciar todos los votos del juego de apuestas a 0?')) {
                const apuestas = JSON.parse(JSON.stringify(chatbotConfig.apuestas));
                ['p1', 'p2', 'p3', 'p4'].forEach(pKey => {
                    if (apuestas[pKey]) {
                        apuestas[pKey].votes = 0;
                        apuestas[pKey].voters = [];
                    }
                });
                
                socket.emit('update_chatbot_settings', { apuestas: apuestas });
                showToast('Marcadores del juego de apuestas reiniciados.', 'success');
            }
        });
    }

    // Sync Gemini API Key inputs (main and shortcut)
    const shortcutKeyEl = document.getElementById('bot-gemini-api-key-shortcut');
    const primaryKeyEl = document.getElementById('ai-api-key');
    if (shortcutKeyEl && primaryKeyEl) {
        shortcutKeyEl.addEventListener('input', () => {
            primaryKeyEl.value = shortcutKeyEl.value;
        });
        primaryKeyEl.addEventListener('input', () => {
            shortcutKeyEl.value = primaryKeyEl.value;
        });
    }

    // Password lock/unlock logic for API keys
    const btnUnlockGemini = document.getElementById('btn-unlock-gemini-key');
    const pwdUnlockGemini = document.getElementById('gemini-key-lock-password');
    const lockScreenGemini = document.getElementById('gemini-key-lock-screen');
    const unlockScreenGemini = document.getElementById('gemini-key-unlocked-screen');

    const btnUnlockAi = document.getElementById('btn-unlock-ai-key');
    const pwdUnlockAi = document.getElementById('ai-key-lock-password');
    const lockScreenAi = document.getElementById('ai-key-lock-screen');
    const unlockScreenAi = document.getElementById('ai-key-unlocked-screen');

    const tryUnlockKey = (pwdInput, lockDiv, unlockDiv) => {
        if (pwdInput.value === 'tavo_dev') {
            lockDiv.style.display = 'none';
            unlockDiv.style.display = 'block';
            showToast('🔓 API Key desbloqueada con éxito.', 'success');
        } else {
            showToast('❌ Contraseña incorrecta.', 'error');
        }
    };

    if (btnUnlockGemini && pwdUnlockGemini && lockScreenGemini && unlockScreenGemini) {
        btnUnlockGemini.addEventListener('click', () => tryUnlockKey(pwdUnlockGemini, lockScreenGemini, unlockScreenGemini));
        pwdUnlockGemini.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') tryUnlockKey(pwdUnlockGemini, lockScreenGemini, unlockScreenGemini);
        });
    }

    if (btnUnlockAi && pwdUnlockAi && lockScreenAi && unlockScreenAi) {
        btnUnlockAi.addEventListener('click', () => tryUnlockKey(pwdUnlockAi, lockScreenAi, unlockScreenAi));
        pwdUnlockAi.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') tryUnlockKey(pwdUnlockAi, lockScreenAi, unlockScreenAi);
        });
    }

    // =========================================================================
    // REGISTRO DE ESPECTADORES EN TIEMPO REAL
    // =========================================================================
    let currentViewerLog = [];
    const viewersTableBody = document.getElementById('viewers-log-table-body');
    const viewersCountEl = document.getElementById('viewer-log-count');
    const searchViewersInput = document.getElementById('search-viewers');
    const btnExportViewers = document.getElementById('btn-export-viewers');

    function renderViewersTable(viewers) {
        if (!viewersTableBody) return;
        
        const filterQuery = searchViewersInput ? searchViewersInput.value.toLowerCase().trim() : '';
        const filtered = viewers.filter(v => {
            return v.uniqueId.toLowerCase().includes(filterQuery) || 
                   v.nickname.toLowerCase().includes(filterQuery);
        });

        if (viewersCountEl) {
            viewersCountEl.textContent = `${filtered.length} espectadores ${filterQuery ? 'filtrados' : 'detectados'}`;
        }

        if (filtered.length === 0) {
            viewersTableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center" style="color: var(--text-muted); padding: 30px; font-size: 13px; text-align: center;">
                        ${filterQuery ? 'No se encontraron espectadores con ese nombre.' : 'Esperando datos de espectadores...'}
                    </td>
                </tr>
            `;
            return;
        }

        viewersTableBody.innerHTML = filtered.map(v => {
            const avatarHtml = v.avatar 
                ? `<img src="${v.avatar}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.15); float: left; margin-right: 8px;">`
                : `<div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; float: left; margin-right: 8px; color: var(--text-muted);">@</div>`;

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); transition: background-color 0.2s;">
                    <td style="padding: 10px; font-size: 13px; font-weight: 600; white-space: nowrap;">
                        ${avatarHtml}
                        <div style="display: inline-block; vertical-align: middle;">
                            <span style="color: var(--text-main); font-weight: 800;">${v.nickname}</span><br>
                            <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">@${v.uniqueId}</span>
                        </div>
                    </td>
                    <td style="padding: 10px; font-size: 12px; color: var(--text-muted); vertical-align: middle;">${v.firstSeen}</td>
                    <td style="padding: 10px; font-size: 12px; color: var(--text-muted); vertical-align: middle;">${v.lastSeen}</td>
                    <td style="padding: 10px; font-size: 13px; font-weight: 800; color: #38bdf8; text-align: center; vertical-align: middle;">${v.chats}</td>
                    <td style="padding: 10px; font-size: 13px; font-weight: 800; color: #ff3b30; text-align: center; vertical-align: middle;">${v.likes}</td>
                    <td style="padding: 10px; font-size: 13px; font-weight: 800; color: #ffd700; text-align: center; vertical-align: middle;">${v.gifts}</td>
                    <td style="padding: 10px; text-align: center; vertical-align: middle;">
                        ${v.followed ? '<span style="color: #4caf50; font-weight: 800; font-size: 11px; background: rgba(76,175,80,0.15); padding: 2px 6px; border-radius: 4px;">SÍ</span>' : '<span style="color: rgba(255,255,255,0.2); font-size: 11px;">NO</span>'}
                    </td>
                    <td style="padding: 10px; text-align: center; vertical-align: middle;">
                        ${v.shared ? '<span style="color: #00e5ff; font-weight: 800; font-size: 11px; background: rgba(0,229,255,0.15); padding: 2px 6px; border-radius: 4px;">SÍ</span>' : '<span style="color: rgba(255,255,255,0.2); font-size: 11px;">NO</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (searchViewersInput) {
        searchViewersInput.addEventListener('input', () => {
            renderViewersTable(currentViewerLog);
        });
    }

    if (btnExportViewers) {
        btnExportViewers.addEventListener('click', () => {
            if (currentViewerLog.length === 0) {
                showToast('❌ No hay datos de espectadores para exportar.', 'error');
                return;
            }

            try {
                let csvContent = '\uFEFF'; // BOM to support accents in Excel
                csvContent += 'Usuario,Apodo,Hora Entrada,Ultima Actividad,Chats,Likes,Regalos,Seguidor,Compartio\n';
                
                currentViewerLog.forEach(v => {
                    const row = [
                        `"${v.uniqueId.replace(/"/g, '""')}"`,
                        `"${v.nickname.replace(/"/g, '""')}"`,
                        `"${v.firstSeen}"`,
                        `"${v.lastSeen}"`,
                        v.chats,
                        v.likes,
                        v.gifts,
                        v.followed ? 'SI' : 'NO',
                        v.shared ? 'SI' : 'NO'
                    ].join(',');
                    csvContent += row + '\n';
                });

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `espectadores_TavLive_${new Date().toISOString().split('T')[0]}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast('💾 Reporte de espectadores exportado con éxito.', 'success');
            } catch (err) {
                showToast('❌ Error al exportar CSV.', 'error');
            }
        });
    }

    // Listen to real-time socket events
    socket.on('viewer_log_updated', (viewers) => {
        currentViewerLog = viewers || [];
        renderViewersTable(currentViewerLog);
    });

    // Request initial list on connection
    socket.emit('get_viewer_log');
});




