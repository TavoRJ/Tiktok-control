const socket = io();

// Parse query params to allow isolated custom animation browser sources
const urlParams = new URLSearchParams(window.location.search);
const filterAnimationId = urlParams.get('animation');

const layerFront = document.getElementById('layer-front');
const layerBack = document.getElementById('layer-back');

const serverPort = window.location.port || '3000';

socket.on('overlay_command', (data) => {
    if (data.command === 'clear_overlay' || data.action === 'stop_all') {
        if (layerFront) layerFront.innerHTML = '';
        if (layerBack) layerBack.innerHTML = '';
    } else if (data.action === 'play_custom_animation') {
        if (data.animation) {
            if (filterAnimationId && filterAnimationId !== data.animation.id) return;
            playCustomAnimation(
                data.animation.layer || 'front',
                data.animation.filepath,
                data.animation.text,
                data.nickname
            );
        }
    }
});

socket.on('overlay_trigger', (data) => {
    if (data.action === 'play_custom_animation' && data.animation) {
        if (filterAnimationId && filterAnimationId !== data.animation.id) return;
        playCustomAnimation(
            data.animation.layer || 'front',
            data.animation.filepath,
            data.animation.text,
            data.nickname
        );
    }
});

function playCustomAnimation(layerType, fileUrl, textTemplate, nickname) {
    const layer = layerType === 'front' ? layerFront : layerBack;
    if (!layer) return;

    const container = document.createElement('div');
    container.className = 'custom-anim-container';
    
    let displayText = textTemplate || '';
    if (nickname) {
        displayText = displayText.replace(/{username}/g, nickname).replace(/{nickname}/g, nickname);
    }
    
    const fileExt = fileUrl.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov'].includes(fileExt);
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
        
        container.appendChild(video);
        
        if (displayText.trim()) {
            const label = document.createElement('div');
            label.className = 'custom-anim-text';
            label.innerText = displayText;
            container.appendChild(label);
        }
        
        layer.appendChild(container);
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => console.warn('Custom video autoplay catch:', err));
        }
        
        let removed = false;
        function finishVideo() {
            if (removed) return;
            removed = true;
            container.classList.add('fade-out-anim');
            setTimeout(() => {
                if (container.parentElement) {
                    container.remove();
                }
            }, 500);
        }

        video.onended = finishVideo;

        video.onloadedmetadata = function() {
            if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
                const durMs = Math.ceil(video.duration * 1000);
                setTimeout(finishVideo, durMs + 200);
            }
        };

        // Safety fallback timeout after 30 seconds
        setTimeout(finishVideo, 30000);

    } else if (!isAudio) {
        const img = document.createElement('img');
        img.src = fileUrl;
        container.appendChild(img);
        
        if (displayText.trim()) {
            const label = document.createElement('div');
            label.className = 'custom-anim-text';
            label.innerText = displayText;
            container.appendChild(label);
        }
        
        layer.appendChild(container);
        
        setTimeout(() => {
            container.classList.add('fade-out-anim');
            setTimeout(() => {
                if (container.parentElement) {
                    container.remove();
                }
            }, 500);
        }, 6000);
    }
}
