const socket = io();

// Parse query params to allow isolated animation browser sources
const urlParams = new URLSearchParams(window.location.search);
const filterAnimationId = urlParams.get('animation');

const layerFront = document.getElementById('layer-front');
const layerBack = document.getElementById('layer-back');

const serverPort = window.location.port || '3000';
function resolveAppAsset(filename) {
    return `http://127.0.0.1:${serverPort}/app-assets/${filename}`;
}

let currentHost = 'TU USUARIO';
let chatbotConfig = null;

// Get host name from system connection messages
socket.on('system', (data) => {
    if (data.type === 'connected') {
        const matches = data.message.match(/@(.+)/);
        if (matches && matches[1]) {
            currentHost = matches[1];
        }
    }
});

// Listen to chatbot settings
socket.on('chatbot_settings_updated', (config) => {
    chatbotConfig = config;
    const theme = config.themeName || 'neutral';
    document.body.className = `theme-${theme}`;
});

// Listen to overlay triggers directly
socket.on('overlay_trigger', (data) => {
    if (filterAnimationId && data.action === 'play_custom_animation' && filterAnimationId !== data.animation.id) return;

    if (data.type === 'gift') {
        const giftId = (data.giftId || '').toString();
        const giftName = (data.giftName || '').toLowerCase();
        
        // 1. Quiéreme (Heart Me / Quiéreme / ID 7934)
        if (giftId === '7934' || giftName.includes('quiéreme') || giftName.includes('quiereme') || giftName.includes('heart me')) {
            triggerMasterAnimation('trigger_quiereme', 'front', 'quiereme-anim', `http://127.0.0.1:${serverPort}/assets/quiereme.png`, `💖 ¡@${data.sender || 'Usuario'} activó el Quiéreme! 💖`, data.sender);
        }
        // 2. Guante
        else if (giftName.includes('glove') || giftName.includes('guante')) {
            triggerMasterAnimation('trigger_glove', 'front', 'glove-anim', `http://127.0.0.1:${serverPort}/assets/glove.png`, `🥊 ¡@${data.sender || 'Usuario'} envió un Guante! 🥊`, data.sender);
        }
    } else if (data.type === 'battle_rewards_available') {
        showBattleRewardsAlert(data.message);
    } else if (data.type === 'glove_activated') {
        showGloveCountdownAlert(data.duration);
    } else if (data.type === 'animation_event') {
        switch (data.action) {
            case 'glove':
                triggerMasterAnimation('trigger_glove', 'front', 'glove-anim', `http://127.0.0.1:${serverPort}/assets/glove.png`, `🥊 ¡@${data.nickname || 'Usuario'} activó el Guante Multiplicador! 🥊`, data.nickname);
                break;
            case 'quiereme':
                triggerMasterAnimation('trigger_quiereme', 'front', 'quiereme-anim', `http://127.0.0.1:${serverPort}/assets/quiereme.png`, `💖 ¡@${data.nickname || 'Usuario'} activó el Quiéreme! 💖`, data.nickname);
                break;
            case 'x2':
                triggerMasterAnimation('trigger_x2', 'front', 'x2-anim', `http://127.0.0.1:${serverPort}/assets/x2.png`, `⚔️ ¡Modo Batalla X2 Activado! ⚔️`, data.nickname);
                break;
            case 'join':
                triggerMasterAnimation('trigger_join', 'front', 'join-anim', `http://127.0.0.1:${serverPort}/assets/neutral-logo.jpg`, `✨ ¡@${data.nickname} se unió al Live! ✨`, data.nickname);
                break;
        }
    } else if (data.action === 'play_custom_animation') {
        if (data.animation) {
            playCustomAnimation(
                data.animation.layer || 'front',
                data.animation.filepath,
                data.animation.text,
                data.animation.duration,
                data.nickname
            );
        }
    }
});

socket.on('overlay_command', (data) => {
    if (data.command === 'clear_overlay' || data.action === 'stop_all') {
        if (layerFront) layerFront.innerHTML = '';
        if (layerBack) layerBack.innerHTML = '';
    } else if (data.action === 'stop_front') {
        if (layerFront) layerFront.innerHTML = '';
    } else if (data.action === 'stop_back') {
        if (layerBack) layerBack.innerHTML = '';
    } else if (data.action === 'test_trigger') {
        const displayName = data.nickname ? `¡@${data.nickname} entró!` : 'TEST';
        switch (data.event) {
            case 'trigger_glove':
                triggerMasterAnimation('trigger_glove', 'front', 'glove-anim', `http://127.0.0.1:${serverPort}/assets/glove.png`, data.nickname ? `${displayName}\nENVIÓ UN GUANTE!` : 'TEST: GUANTE!', data.nickname);
                break;
            case 'trigger_quiereme':
                triggerMasterAnimation('trigger_quiereme', 'front', 'quiereme-anim', `http://127.0.0.1:${serverPort}/assets/quiereme.png`, data.nickname ? `${displayName}\nENVIÓ QUIÉREME!` : 'TEST: QUIÉREME!', data.nickname);
                break;
            case 'trigger_x2':
                triggerMasterAnimation('trigger_x2', 'front', 'x2-anim', `http://127.0.0.1:${serverPort}/assets/x2.png`, data.nickname ? `${displayName}\nMODO BATALLA X2!` : 'TEST: X2 BATTLE!', data.nickname);
                break;
        }
    } else if (data.action === 'play_custom_animation') {
        if (data.animation) {
            playCustomAnimation(
                data.animation.layer || 'front',
                data.animation.filepath,
                data.animation.text,
                data.animation.duration,
                data.nickname
            );
        }
    }
});

socket.on('play_tts_audio', (data) => {
    // Disabled in overlay to prevent double audio (only plays in panel/Electron)
    return;
});

// Handle playing sound alerts
socket.on('play_sound_alert', (data) => {
    const { soundUrl, volume } = data;
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
            console.error('Failed to play sound alert in overlay:', err);
        });
});

function triggerMasterAnimation(key, defaultLayer, defaultClass, defaultImg, defaultText, nickname) {
    const override = chatbotConfig && chatbotConfig.masterAnimations && chatbotConfig.masterAnimations[key];
    if (override && override.filepath) {
        playCustomAnimation(
            defaultLayer,
            override.filepath,
            defaultText,
            null, // null for auto duration
            nickname
        );
    } else {
        playAnimation(defaultLayer, defaultClass, defaultImg, defaultText);
    }
}

function playAnimation(layerType, customClass, imgSrc, text) {
    const layer = layerType === 'front' ? layerFront : layerBack;
    if (!layer) return;

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
    if (!layer) return;

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
    
    let displayText = textTemplate || '';
    if (nickname) {
        displayText = displayText.replace(/{username}/g, nickname).replace(/{nickname}/g, nickname);
        if (!displayText.trim()) {
            displayText = `¡@${nickname} entró al Live!`;
        }
    }
    
    const fileExt = fileUrl.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov'].includes(fileExt);
    const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(fileExt);
    
    let isDynamicVideo = false;
    
    if (isVideo) {
        const video = document.createElement('video');
        video.src = fileUrl;
        video.autoplay = true;
        video.muted = true;
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.playsInline = true;
        video.style.maxWidth = '400px';
        video.style.maxHeight = '400px';
        container.appendChild(video);
        video.play().catch(err => console.warn('Overlay video play caught:', err));
        
        if (!durationMs) {
            isDynamicVideo = true;
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
    } else if (isAudio) {
        console.log("Audio playback skipped in overlay:", fileUrl);
    } else {
        const img = document.createElement('img');
        img.src = fileUrl;
        img.style.maxWidth = '400px';
        img.style.maxHeight = '400px';
        img.onerror = function() {
            this.style.display = 'none';
            const fallbackLabel = document.createElement('div');
            fallbackLabel.className = 'anim-text';
            fallbackLabel.innerText = displayText || 'GIFT EVENT';
            container.appendChild(fallbackLabel);
        };
        container.appendChild(img);
    }
    
    if (!isAudio) {
        layer.appendChild(container);
        
        if (!isDynamicVideo) {
            setTimeout(() => {
                if (container.parentElement) {
                    container.remove();
                }
            }, resolvedDuration);
        }
    }
}

// Request initial settings on load
socket.emit('get_chatbot_settings');

function showBattleRewardsAlert(message) {
    const container = document.createElement('div');
    container.className = 'battle-rewards-alert';
    container.innerHTML = `
        <div class="rewards-icon-box">🎁</div>
        <div class="rewards-content">
            <div class="rewards-title">RECOMPENSAS ACTIVAS</div>
            <div class="rewards-subtitle">Habrá potenciadores al finalizar la batalla</div>
        </div>
    `;
    
    container.style.cssText = `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) scale(0.9);
        display: flex;
        align-items: center;
        gap: 15px;
        background: rgba(20, 20, 30, 0.85);
        backdrop-filter: blur(12px);
        border: 2px solid #ecc158;
        box-shadow: 0 0 25px rgba(236, 193, 88, 0.4);
        padding: 12px 25px;
        border-radius: 12px;
        color: #fff;
        font-family: 'Outfit', sans-serif;
        font-weight: 800;
        z-index: 99999;
        opacity: 0;
        animation: slideDownRewards 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, fadeOutRewards 0.5s ease-in forwards 8s;
    `;
    
    injectOverlayCSS();
    
    if (layerFront) {
        layerFront.appendChild(container);
    }
    setTimeout(() => {
        if (container.parentElement) container.remove();
    }, 9000);
}

function showGloveCountdownAlert(duration) {
    const container = document.createElement('div');
    container.className = 'glove-countdown-alert';
    container.innerHTML = `
        <div class="glove-spinning-box">
            <img src="gift-assets/Guante.png" style="width: 60px; height: 60px; animation: spinGlove 1.5s linear infinite;" onerror="this.src='gift-assets/glove.png';">
        </div>
        <div class="glove-timer-content">
            <div style="color: #ff3366; font-size: 13px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; font-family: 'Outfit', sans-serif;">¡GUANTE ACTIVO! (x2 PUNTOS)</div>
            <div class="glove-time-display" style="font-size: 28px; font-weight: 900; color: #fff; text-shadow: 0 0 10px #ff3366; font-family: 'Outfit', sans-serif; margin-top: 2px;">${duration}s</div>
        </div>
    `;
    
    container.style.cssText = `
        position: absolute;
        top: 100px;
        right: 40px;
        display: flex;
        align-items: center;
        gap: 15px;
        background: rgba(255, 20, 80, 0.15);
        backdrop-filter: blur(10px);
        border: 2px solid #ff3366;
        box-shadow: 0 0 30px rgba(255, 51, 102, 0.4);
        padding: 12px 20px;
        border-radius: 14px;
        z-index: 99999;
        opacity: 0;
        animation: slideInGlove 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    `;
    
    injectOverlayCSS();
    
    if (layerFront) {
        layerFront.appendChild(container);
    }
    
    let timeLeft = duration || 30;
    const timeDisplay = container.querySelector('.glove-time-display');
    const timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            container.style.animation = 'fadeOutGlove 0.5s ease-in forwards';
            setTimeout(() => {
                if (container.parentElement) container.remove();
            }, 500);
        } else {
            if (timeDisplay) timeDisplay.textContent = `${timeLeft}s`;
        }
    }, 1000);
}

let cssInjected = false;
function injectOverlayCSS() {
    if (cssInjected) return;
    cssInjected = true;
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes slideDownRewards {
            0% { transform: translate(-50%, -100px) scale(0.9); opacity: 0; }
            100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
        @keyframes fadeOutRewards {
            100% { opacity: 0; transform: translate(-50%, -30px) scale(0.95); }
        }
        @keyframes slideInGlove {
            0% { transform: translateX(120%) scale(0.8); opacity: 0; }
            100% { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes fadeOutGlove {
            100% { transform: translateX(120%) scale(0.8); opacity: 0; }
        }
        @keyframes spinGlove {
            0% { transform: rotate(0deg) scale(1); }
            50% { transform: rotate(15deg) scale(1.08); }
            100% { transform: rotate(0deg) scale(1); }
        }
        .rewards-icon-box {
            font-size: 28px;
            animation: bounceIcon 2s infinite ease-in-out;
        }
        @keyframes bounceIcon {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
        }
        .rewards-title {
            font-size: 14px;
            letter-spacing: 1px;
            color: #ecc158;
            text-shadow: 0 0 10px rgba(236, 193, 88, 0.4);
            font-family: 'Outfit', sans-serif;
            font-weight: 800;
        }
        .rewards-subtitle {
            font-size: 11px;
            font-weight: 600;
            color: #ccc;
            font-family: 'Outfit', sans-serif;
        }
    `;
    document.head.appendChild(style);
}
