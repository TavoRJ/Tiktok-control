const socket = io();

// Parse query params to allow isolated animation browser sources
const urlParams = new URLSearchParams(window.location.search);
const filterAnimationId = urlParams.get('animation');

const layerFront = document.getElementById('layer-front');
const layerBack = document.getElementById('layer-back');

// Mapeo de IDs reales descubiertos
const KNOWN_GIFTS = {
    '7934': 'quiereme', // Heart Me
    // Agrega el ID real del Guante aquí cuando lo descubras
    // 'ID_DEL_GUANTE': 'glove',
    // Agrega el ID real del Level Up aquí cuando lo descubras
    // 'ID_DEL_LEVELUP': 'levelup'
};

let currentHost = 'TU USUARIO';
const vsContainer = document.getElementById('versus-container');
const vsHostName = document.getElementById('vs-host-name');
const vsOpponentName = document.getElementById('vs-opponent-name');

// Get host name from system connection messages
socket.on('system', (data) => {
    if (data.type === 'connected') {
        // message format is "Conectado a @username"
        const matches = data.message.match(/@(.+)/);
        if (matches && matches[1]) {
            currentHost = matches[1];
            vsHostName.innerText = currentHost;
        }
    }
});

// Detect generic events that might be level ups or club joins
socket.on('tiktok_event_raw', (payload) => {
    const { eventType, data } = payload;
    
    // Detect Level Up or Fan Club join
    // In tiktok-live-connector, this often comes as a chat or member event with specific details
    if (eventType === 'member' || eventType === 'chat' || eventType === 'social') {
        const text = (data.comment || data.label || '').toLowerCase();
        
        if (text.includes('nivel') && (text.includes('donador') || text.includes('club'))) {
            triggerMasterAnimation('trigger_levelup', 'back', 'levelup-anim', 'assets/levelup.png', 'LEVEL UP!');
        }
    }
});

// Listen to overlay triggers directly
socket.on('overlay_trigger', (data) => {
    // If this overlay is filtered for a specific animation only, ignore generic gift/battle alerts
    if (filterAnimationId) return;

    if (data.type === 'gift') {
        const giftId = data.giftId.toString();
        const giftName = (data.giftName || '').toLowerCase();
        
        let handledAsBigAnimation = false;

        // 1. Quiereme
        if (KNOWN_GIFTS[giftId] === 'quiereme' || giftName.includes('quiéreme') || giftName.includes('quiereme') || giftName.includes('heart me')) {
            triggerMasterAnimation('trigger_quiereme', 'front', 'quiereme-anim', 'assets/quiereme.png', 'QUIÉREME!', data.sender);
            handledAsBigAnimation = true;
        } 
        // 3. Regalos más de Mil monedas
        else if (data.diamondCount && (data.diamondCount * data.repeatCount) >= 1000) {
            playAnimation('front', 'epic-anim', 'assets/bomb.png', `WOW! ${data.sender} ENVIÓ UN REGALO ÉPICO!`);
            handledAsBigAnimation = true;
        }
        // Others (like glove or specific levelup gifts)
        else if (KNOWN_GIFTS[giftId] === 'glove') {
            triggerMasterAnimation('trigger_glove', 'front', 'glove-anim', 'assets/glove.png', `${data.sender} ENVIÓ UN GUANTE!`, data.sender);
            handledAsBigAnimation = true;
        } else if (KNOWN_GIFTS[giftId] === 'levelup') {
            triggerMasterAnimation('trigger_levelup', 'back', 'levelup-anim', 'assets/levelup.png', 'LEVEL UP!', data.sender);
            handledAsBigAnimation = true;
        }

        // Si es un regalo pequeño (ej. 1 moneda) y no disparó animación grande
        if (!handledAsBigAnimation) {
            showMiniAlert(data);
        }
    } else if (data.type === 'battle_event') {
        console.log("Battle Event:", data);
        
        // Extract opponent from battle event (linkMicBattle usually has battleUsers)
        if (data.data && data.data.battleUsers && Array.isArray(data.data.battleUsers)) {
            // Get nicknames, excluding the current host if possible
            let opponents = data.data.battleUsers
                .map(user => user.nickname)
                .filter(nick => nick && nick.toLowerCase() !== currentHost.toLowerCase());
                
            if (opponents.length === 0 && data.data.battleUsers.length > 0) {
                // Fallback: just pick the last one if filter cleared all or host wasn't matched
                opponents = [data.data.battleUsers[data.data.battleUsers.length - 1].nickname];
            }
            
            if (opponents.length > 0) {
                const versusText = opponents.join(' & ');
                
                // Show the permanent VS table
                vsOpponentName.innerText = versusText;
                vsContainer.classList.remove('hidden');
                
                // Still show the pop-up animation
                playAnimation('front', 'battle-anim', 'assets/snipe.png', `⚔️ ¡NUEVA BATALLA!\n${versusText}`);
            }
        } else {
            // Generic fallback if battleUsers format is slightly different
            playAnimation('front', 'battle-anim', 'assets/snipe.png', `⚔️ ¡BATALLA INICIADA!`);
        }
    }
});

// Listen to manual commands from Panel
socket.on('overlay_command', (data) => {
    if (data.action === 'stop_all') {
        layerFront.innerHTML = '';
        layerBack.innerHTML = '';
    } else if (data.action === 'stop_front') {
        layerFront.innerHTML = '';
    } else if (data.action === 'stop_back') {
        layerBack.innerHTML = '';
    } else if (data.action === 'vs_show') {
        if (filterAnimationId) return;
        vsContainer.classList.remove('hidden');
    } else if (data.action === 'vs_hide') {
        if (filterAnimationId) return;
        vsContainer.classList.add('hidden');
    } else if (data.action === 'vs_reset') {
        if (filterAnimationId) return;
        vsOpponentName.innerText = 'Esperando...';
    } else if (data.action === 'test_trigger') {
        // If filtered, only run if the event matches the filter
        if (filterAnimationId && filterAnimationId !== data.event) return;

        const displayName = data.nickname ? `¡@${data.nickname} entró!` : 'TEST';
        
        switch(data.event) {
            case 'trigger_glove':
                triggerMasterAnimation('trigger_glove', 'front', 'glove-anim', 'assets/glove.png', data.nickname ? `${displayName}\nENVIÓ UN GUANTE!` : 'TEST: GUANTE!', data.nickname);
                break;
            case 'trigger_levelup':
                triggerMasterAnimation('trigger_levelup', 'back', 'levelup-anim', 'assets/levelup.png', data.nickname ? `${displayName}\nSUBIÓ DE NIVEL!` : 'TEST: LEVEL UP!', data.nickname);
                break;
            case 'trigger_quiereme':
                triggerMasterAnimation('trigger_quiereme', 'front', 'quiereme-anim', 'assets/quiereme.png', data.nickname ? `${displayName}\nENVIÓ QUIÉREME!` : 'TEST: QUIÉREME!', data.nickname);
                break;
            case 'trigger_x2':
                triggerMasterAnimation('trigger_x2', 'front', 'x2-anim', 'assets/x2.png', data.nickname ? `${displayName}\nMODO BATALLA X2!` : 'TEST: X2 BATTLE!', data.nickname);
                break;
        }
    } else if (data.action === 'play_custom_animation') {
        // If filtered, only run if the custom animation ID matches the filter
        if (filterAnimationId && filterAnimationId !== data.animation.id) return;
        
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
    
    // Create image with SVG fallback
    const img = document.createElement('img');
    img.src = imgSrc;
    img.onerror = function() {
        const fallbackText = text.split(':')[0].replace('TEST', '').trim() || 'ASSET';
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#222"/><text x="50%" y="50%" fill="#fff" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="40">${fallbackText}</text></svg>`;
        this.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    };
    
    const label = document.createElement('div');
    label.className = 'anim-text';
    label.innerText = text;
    
    container.appendChild(img);
    // Commented out to only show the graphic/video animation on overlay, no text label
    // container.appendChild(label);
    
    layer.appendChild(container);
    
    // Auto remove after animation completes (5s)
    setTimeout(() => {
        if (container.parentElement) {
            container.remove();
        }
    }, 5000);
}

// Function to handle small/spammy gifts with a mini stacked alert
function showMiniAlert(data) {
    const container = document.getElementById('mini-alerts-container');
    const safeSender = data.sender.replace(/[^a-zA-Z0-9]/g, ''); // Para usar en IDs seguros
    const alertId = `mini-${safeSender}-${data.giftId}`;
    
    let alertEl = document.getElementById(alertId);
    
    if (!alertEl) {
        // Crear nueva alerta
        alertEl = document.createElement('div');
        alertEl.id = alertId;
        alertEl.className = 'mini-alert slide-in';
        container.appendChild(alertEl);
    }
    
    // Obtener la imagen o usar placeholder si no viene
    const imgUrl = data.giftPictureUrl || `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="100%" height="100%" fill="#d900ff"/><text x="50%" y="50%" fill="#fff" dominant-baseline="middle" text-anchor="middle" font-size="20">🎁</text></svg>')}`;

    // Actualizar contenido
    alertEl.innerHTML = `
        <img src="${imgUrl}" onerror="this.style.display='none'">
        <div class="mini-alert-text">
            <strong>${data.sender}</strong> envió ${data.giftName} 
            <span class="combo-count">x${data.repeatCount || 1}</span>
        </div>
    `;
    
    // Reiniciar el contador de autodestrucción
    if (alertEl.timeoutId) clearTimeout(alertEl.timeoutId);
    
    alertEl.timeoutId = setTimeout(() => {
        if (alertEl.parentElement) {
            alertEl.classList.replace('slide-in', 'slide-out');
            setTimeout(() => {
                if (alertEl.parentElement) alertEl.remove();
            }, 400); // Esperar a que termine la animación de salida
        }
    }, 3000); // 3 segundos después del último regalo de este tipo
}

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
    
    // Auto speed-up if queue is overloaded (more than 4 items)
    let rateMultiplier = 1.0;
    if (ttsQueue.length >= 4) {
        rateMultiplier = 1.3;
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

let chatbotConfig = null;

// Keep settings in sync
socket.on('chatbot_settings_updated', (config) => {
    chatbotConfig = config;
    if (config) {
        if (!config.active) {
            stopAllTTS();
        }
        if (config.themeName) {
            document.body.className = 'theme-' + config.themeName;
        }
    }
});

// Handle playing Cloud TTS audio sent from the server
socket.on('play_tts_audio', (data) => {
    const { base64Audio, playLocation } = data;
    
    // Check play location (Overlay is not panel)
    if (playLocation !== 'overlay' && playLocation !== 'both') return;
    
    queueCloudTTS(base64Audio, playLocation);
});

// Process and speak comments in the Overlay
socket.on('tiktok_event_raw', (payload) => {
    const { eventType, data } = payload;
    if (eventType === 'chat') {
        processAndSpeak(data);
    }
});

function processAndSpeak(data) {
    if (!chatbotConfig || !chatbotConfig.active) return;
    if (chatbotConfig.ttsEngine === 'cloud') return; // Handled by server and play_tts_audio
    
    // Check play location
    if (chatbotConfig.playLocation !== 'overlay' && chatbotConfig.playLocation !== 'both') return;
    
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

// Function to handle playing custom uploaded animations (video, audio, or images)
function playCustomAnimation(layerType, fileUrl, textTemplate, durationMs, nickname) {
    const layer = layerType === 'front' ? layerFront : layerBack;
    const container = document.createElement('div');
    container.className = `anim-container custom-uploaded-anim`;
    
    // Default duration is 5000ms if not specified
    let resolvedDuration = durationMs || 5000;
    
    // Override the CSS animation values dynamically based on durationMs (if specified)
    if (durationMs) {
        const durSec = durationMs / 1000;
        container.style.animation = `popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, fadeOut 0.5s ease-in forwards`;
        container.style.animationDelay = `0s, ${Math.max(0, durSec - 0.5)}s`;
    } else {
        // Temporary default style, will be overridden for video loadedmetadata
        container.style.animation = `popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards, fadeOut 0.5s ease-in forwards`;
        container.style.animationDelay = `0s, 4.5s`;
    }
    
    // Format text templates if applicable
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
        video.muted = false; // allow volume
        video.style.maxWidth = '400px';
        video.style.maxHeight = '400px';
        container.appendChild(video);
        
        if (!durationMs) {
            isDynamicVideo = true;
            video.onloadedmetadata = function() {
                // Determine video length in ms
                const videoDurMs = Math.ceil(video.duration * 1000) + 500; // 500ms safety
                const durSec = videoDurMs / 1000;
                
                // Adjust animation delays dynamically
                container.style.animationDelay = `0s, ${Math.max(0, durSec - 0.5)}s`;
                
                // Schedule removal
                setTimeout(() => {
                    if (container.parentElement) {
                        container.remove();
                    }
                }, videoDurMs);
            };
            
            // Safety timeout (15s max) in case metadata doesn't load
            setTimeout(() => {
                if (container.parentElement) {
                    container.remove();
                }
            }, 15000);
        }
    } else if (isAudio) {
        const audio = new Audio(fileUrl);
        audio.play().catch(err => console.error("Audio playback failed:", err));
    } else {
        // Image asset
        const img = document.createElement('img');
        img.src = fileUrl;
        img.style.maxWidth = '400px';
        img.style.maxHeight = '400px';
        container.appendChild(img);
    }
    
    if (displayText) {
        const label = document.createElement('div');
        label.className = 'anim-text';
        label.innerText = displayText;
        // Commented out to only show the graphic/video animation on overlay, no text label
        // container.appendChild(label);
    }
    
    if (!isAudio) {
        layer.appendChild(container);
        
        // Only run standard timeout if this is NOT a dynamic video duration setup
        if (!isDynamicVideo) {
            setTimeout(() => {
                if (container.parentElement) {
                    container.remove();
                }
            }, resolvedDuration);
        }
    }
}
