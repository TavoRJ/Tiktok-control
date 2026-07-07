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

    if (data.type === 'animation_event') {
        switch (data.action) {
            case 'glove':
                triggerMasterAnimation('trigger_glove', 'back', 'glove-anim', `http://127.0.0.1:${serverPort}/gift-assets/Guante.png`, `🥊 ¡@${data.nickname} activó el Guante Multiplicador! 🥊`, data.nickname);
                break;
            case 'quiereme':
                triggerMasterAnimation('trigger_quiereme', 'back', 'quiereme-anim', `http://127.0.0.1:${serverPort}/gift-assets/Quiereme.png`, `💖 ¡@${data.nickname} activó el Quiéreme! 💖`, data.nickname);
                break;
            case 'levelup':
                triggerMasterAnimation('trigger_levelup', 'front', 'levelup-anim', `http://127.0.0.1:${serverPort}/gift-assets/LevelUp.png`, `⚡ ¡Subimos de nivel! ⚡`, data.nickname);
                break;
            case 'x2':
                triggerMasterAnimation('trigger_x2', 'front', 'x2-anim', `http://127.0.0.1:${serverPort}/gift-assets/X2.png`, `⚔️ ¡Modo Batalla X2 Activado! ⚔️`, data.nickname);
                break;
            case 'join':
                triggerMasterAnimation('trigger_join', 'front', 'join-anim', `http://127.0.0.1:${serverPort}/gift-assets/Confeti.png`, `✨ ¡@${data.nickname} se unió al Live! ✨`, data.nickname);
                break;
        }
    } else if (data.action === 'play_custom_animation') {
        playCustomAnimation(
            data.animation.layer,
            data.animation.filepath,
            data.animation.text,
            data.animation.duration,
            data.nickname
        );
    }
});

socket.on('overlay_command', (data) => {
    if (data.command === 'clear_overlay') {
        if (layerFront) layerFront.innerHTML = '';
        if (layerBack) layerBack.innerHTML = '';
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
        video.style.maxWidth = '400px';
        video.style.maxHeight = '400px';
        container.appendChild(video);
        
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
