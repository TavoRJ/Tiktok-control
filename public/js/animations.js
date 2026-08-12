const socket = io();

const layerFront = document.getElementById('layer-front');
const layerBack = document.getElementById('layer-back');

const serverPort = window.location.port || '3000';
function resolveAppAsset(filename) {
    return `http://127.0.0.1:${serverPort}/app-assets/${filename}`;
}

// Mapeo de IDs reales conocidos
const KNOWN_GIFTS = {
    '7934': 'quiereme', // Heart Me
};

let chatbotConfig = null;

// Sincronizar configuraciones para los temas y animaciones personalizadas subidas por el panel
socket.on('chatbot_settings_updated', (config) => {
    chatbotConfig = config;
    if (config && config.themeName) {
        document.body.className = 'theme-' + config.themeName;
    }
});

// Detectar eventos para Level Up desde eventos raw
socket.on('tiktok_event_raw', (payload) => {
    const { eventType, data } = payload;
    
    if (eventType === 'member' || eventType === 'chat' || eventType === 'social') {
        const text = (data.comment || data.label || '').toLowerCase();
        if (text.includes('nivel') && (text.includes('donador') || text.includes('club'))) {
            triggerMasterAnimation('trigger_levelup', 'back', 'levelup-anim', resolveAppAsset('levelup.png'), 'LEVEL UP!');
        }
    }
});

// Detectar triggers de regalos y eventos
socket.on('overlay_trigger', (data) => {
    if (data.type === 'gift') {
        const giftId = data.giftId.toString();
        const giftName = (data.giftName || '').toLowerCase();
        
        // 1. Quiéreme
        if (KNOWN_GIFTS[giftId] === 'quiereme' || giftName.includes('quiéreme') || giftName.includes('quiereme') || giftName.includes('heart me')) {
            triggerMasterAnimation('trigger_quiereme', 'front', 'quiereme-anim', resolveAppAsset('quiereme.png'), 'QUIÉREME!', data.sender);
        }
        // 2. Guante
        else if (KNOWN_GIFTS[giftId] === 'glove' || giftName.includes('glove') || giftName.includes('guante')) {
            triggerMasterAnimation('trigger_glove', 'front', 'glove-anim', resolveAppAsset('glove.png'), `${data.sender} ENVIÓ UN GUANTE!`, data.sender);
        }
        // 3. Level Up
        else if (KNOWN_GIFTS[giftId] === 'levelup' || giftName.includes('level up') || giftName.includes('subió de nivel')) {
            triggerMasterAnimation('trigger_levelup', 'back', 'levelup-anim', resolveAppAsset('levelup.png'), 'LEVEL UP!', data.sender);
        }
    } else if (data.type === 'battle_event') {
        // En batalla, si se recibe evento de batalla duplicada/especial que activa x2
        if (data.action === 'x2' || (data.data && data.data.battleType === 'x2')) {
            triggerMasterAnimation('trigger_x2', 'front', 'x2-anim', resolveAppAsset('x2.png'), 'MODO BATALLA X2!');
        }
    }
});

// Escuchar comandos manuales y de pruebas desde el Panel de Control
socket.on('overlay_command', (data) => {
    if (data.action === 'stop_all') {
        layerFront.innerHTML = '';
        layerBack.innerHTML = '';
    } else if (data.action === 'stop_front') {
        layerFront.innerHTML = '';
    } else if (data.action === 'stop_back') {
        layerBack.innerHTML = '';
    } else if (data.action === 'test_trigger') {
        const displayName = data.nickname ? `¡@${data.nickname} entró!` : 'TEST';
        
        switch(data.event) {
            case 'trigger_glove':
                triggerMasterAnimation('trigger_glove', 'front', 'glove-anim', resolveAppAsset('glove.png'), data.nickname ? `${displayName}\nENVIÓ UN GUANTE!` : 'TEST: GUANTE!', data.nickname);
                break;
            case 'trigger_levelup':
                triggerMasterAnimation('trigger_levelup', 'back', 'levelup-anim', resolveAppAsset('levelup.png'), data.nickname ? `${displayName}\nSUBIÓ DE NIVEL!` : 'TEST: LEVEL UP!', data.nickname);
                break;
            case 'trigger_quiereme':
                triggerMasterAnimation('trigger_quiereme', 'front', 'quiereme-anim', resolveAppAsset('quiereme.png'), data.nickname ? `${displayName}\nENVIÓ QUIÉREME!` : 'TEST: QUIÉREME!', data.nickname);
                break;
            case 'trigger_x2':
                triggerMasterAnimation('trigger_x2', 'front', 'x2-anim', resolveAppAsset('x2.png'), data.nickname ? `${displayName}\nMODO BATALLA X2!` : 'TEST: X2 BATTLE!', data.nickname);
                break;
        }
    } else if (data.action === 'play_custom_animation') {
        // Permitir reproducir cualquier animación personalizada que venga del backend
        playCustomAnimation(
            data.animation.layer,
            data.animation.filepath,
            data.animation.text,
            data.animation.duration,
            data.nickname
        );
    }
});

function triggerMasterAnimation(key, defaultLayer, defaultClass, defaultImg, defaultText, nickname) {
    const override = chatbotConfig && chatbotConfig.masterAnimations && chatbotConfig.masterAnimations[key];
    if (override && override.filepath) {
        playCustomAnimation(
            defaultLayer,
            override.filepath,
            defaultText,
            null, // null para auto-detectar duración en videos
            nickname
        );
    } else {
        playAnimation(defaultLayer, defaultClass, defaultImg, defaultText);
    }
}

function playAnimation(layerType, customClass, imgSrc, text) {
    const layer = layerType === 'front' ? layerFront : layerBack;
    
    const container = document.createElement('div');
    container.className = `anim-container ${customClass}`;
    
    const img = document.createElement('img');
    img.src = imgSrc;
    img.onerror = function() {
        const fallbackText = text.split(':')[0].replace('TEST', '').trim() || 'ASSET';
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#222"/><text x="50%" y="50%" fill="#fff" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="40">${fallbackText}</text></svg>`;
        this.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    };
    
    container.appendChild(img);
    layer.appendChild(container);
    
    setTimeout(() => {
        if (container.parentElement) {
            container.remove();
        }
    }, 5000);
}

function playCustomAnimation(layerType, fileUrl, textTemplate, durationMs, nickname) {
    const layer = layerType === 'front' ? layerFront : layerBack;
    const container = document.createElement('div');
    container.className = `anim-container custom-uploaded-anim`;
    
    let resolvedDuration = durationMs || 5000;
    
    if (durationMs) {
        const durSec = durationMs / 1000;
        container.style.animation = `popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, fadeOut 0.5s ease-in forwards`;
        container.style.animationDelay = `0s, ${Math.max(0, durSec - 0.5)}s`;
    } else {
        container.style.animation = `popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, fadeOut 0.5s ease-in forwards`;
        container.style.animationDelay = `0s, 4.5s`;
    }
    
    const fileExt = fileUrl.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov', 'web', 'ogg', 'avi'].includes(fileExt);
    const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(fileExt);
    
    if (isVideo) {
        const video = document.createElement('video');
        video.src = fileUrl;
        video.autoplay = true;
        video.muted = true;
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.playsInline = true;
        video.style.maxWidth = '85%';
        video.style.maxHeight = '70vh';
        container.appendChild(video);
        video.play().catch(err => console.warn('Animations video play caught:', err));
        
        if (!durationMs) {
            video.onloadedmetadata = function() {
                const videoDurMs = Math.ceil(video.duration * 1000) + 500;
                const durSec = videoDurMs / 1000;
                container.style.animationDelay = `0s, ${Math.max(0, durSec - 0.5)}s`;
                
                setTimeout(() => {
                    if (container.parentElement) {
                        container.remove();
                    }
                }, videoDurMs);
            };
            
            setTimeout(() => {
                if (container.parentElement) {
                    container.remove();
                }
            }, 15000);
        }
    } else if (!isAudio) {
        const img = document.createElement('img');
        img.src = fileUrl;
        img.style.maxWidth = '85%';
        img.style.maxHeight = '70vh';
        img.onerror = function() {
            this.style.display = 'none';
        };
        container.appendChild(img);
    }
    
    if (!isAudio) {
        layer.appendChild(container);
        if (durationMs) {
            setTimeout(() => {
                if (container.parentElement) {
                    container.remove();
                }
            }, durationMs);
        }
    }
}
