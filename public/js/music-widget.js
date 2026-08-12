const socket = io();

// DOM Elements
const songTitle = document.getElementById('song-title');
const songArtist = document.getElementById('song-artist');
const albumArt = document.getElementById('album-art');
const vinylDisc = document.getElementById('vinyl-disc');
const tonearmNeedle = document.getElementById('tonearm-needle');
const progressFill = document.getElementById('progress-fill');

// State Variables
let currentTrack = null;
let currentSettings = {};
let localProgressMs = 0;
let progressInterval = null;
const defaultCover = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%2523ff3377%22%2F%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2210%22%20fill%3D%22%2523111%22%2F%3E%3C%2Fsvg%3E";

function getFallbackCover() {
    if (currentSettings && currentSettings.themeName === 'naya') {
        const serverPort = window.location.port || '3000';
        return `http://127.0.0.1:${serverPort}/streamer-assets/naya-logo.png`;
    }
    return defaultCover;
}

const isIframe = window.self !== window.top;

// Listen to Spotify settings updates
socket.on('chatbot_settings_updated', (config) => {
    if (!config) return;
    currentSettings = config;
    
    // Apply real-time global styles if defined
    if (config.globalWidgetStyles) {
        applyGlobalStyles(config);
    }
    
    const wrapper = document.querySelector('.widget-wrapper');
    if (wrapper) {
        // Clear and rebuild class list
        wrapper.className = 'widget-wrapper';
        
        const theme  = config.spotifyTheme      || 'apple-music';
        const color  = config.spotifyNeonColor  || 'pink';
        const design = config.spotifyVinylDesign || 'classic';
        const speed  = config.spotifyVinylSpeed  || 'normal';
        
        wrapper.classList.add(`theme-${theme}`);
        wrapper.classList.add(`color-${color}`);
        wrapper.classList.add(`design-${design}`);
        wrapper.classList.add(`speed-${speed}`);
        
        // Add horizontal layout if requested via URL param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('layout') === 'horizontal' || urlParams.get('horizontal') === 'true') {
            wrapper.classList.add('layout-horizontal');
        }
        
        // Update glowing neon text dynamically based on the streamer theme profile
        const glowingText = wrapper.querySelector('.glowing-text');
        if (glowingText) {
            if (config.themeName === 'majo') {
                glowingText.textContent = 'Live de Majo';
            } else if (config.themeName === 'naya') {
                glowingText.textContent = 'Live de Naya';
            } else {
                glowingText.textContent = 'Música en Vivo';
            }
        }

        // Apply dynamic coordinates/visibility from the scene layout control
        if (config.widgets && config.widgets.spotify) {
            const spot = config.widgets.spotify;
            if (isIframe) {
                wrapper.style.display = spot.active ? 'flex' : 'none';
            } else {
                wrapper.style.position = 'absolute';
                wrapper.style.left     = `${spot.x}%`;
                wrapper.style.top      = `${spot.y}%`;
                if (spot.width) wrapper.style.width = `${spot.width}%`;
                if (spot.height) wrapper.style.height = `${spot.height}%`;
                wrapper.style.margin   = '0';
                wrapper.style.display  = spot.active ? 'flex' : 'none';
            }
        }
    }
    
    // Sync vinyl surface (e.g. Picture Disc)
    syncVinylDesign();
    
    // If offline, update the default cover to match the active theme fallback
    if (!currentTrack || !currentTrack.title) {
        albumArt.src = getFallbackCover();
    }
});

// Real-time position control from the scene designer
socket.on('widget_position_changed', (data) => {
    if (!data || data.widget !== 'spotify') return;
    if (isIframe) return;
    const wrapper = document.querySelector('.widget-wrapper');
    if (wrapper) {
        wrapper.style.position = 'absolute';
        wrapper.style.left     = data.x + '%';
        wrapper.style.top      = data.y + '%';
        if (data.width !== undefined) wrapper.style.width = data.width + '%';
        if (data.height !== undefined) wrapper.style.height = data.height + '%';
        wrapper.style.margin   = '0';
    }
});

// Real-time visibility control from the scene designer
socket.on('widget_status_changed', (data) => {
    if (!data || data.widget !== 'spotify') return;
    const wrapper = document.querySelector('.widget-wrapper');
    if (wrapper) {
        wrapper.style.display = data.active ? 'flex' : 'none';
    }
});

// Listen to Spotify track updates from backend
socket.on('spotify_track', (track) => {
    if (!track || !track.title) {
        setOfflineState();
        return;
    }
    
    currentTrack = track;
    
    // Update labels
    songTitle.textContent = track.title;
    songArtist.textContent = track.artist;
    
    // Update requester label
    const requesterEl = document.getElementById('song-requester');
    if (requesterEl) {
        if (track.requester) {
            requesterEl.textContent = `Pedido por: @${track.requester}`;
            requesterEl.style.display = 'block';
        } else {
            requesterEl.style.display = 'none';
        }
    }
    
    // Update album art
    if (track.albumArt) {
        if (albumArt.src !== track.albumArt) {
            albumArt.src = track.albumArt;
        }
    } else {
        albumArt.src = getFallbackCover();
    }
    
    // Sync vinyl surface in case of Picture Disc design
    syncVinylDesign();
    
    // Manage local progress timer & physical animations
    if (track.isPlaying) {
        vinylDisc.classList.add('spinning');
        tonearmNeedle.classList.add('active');
        
        // Sync progress
        localProgressMs = track.progressMs;
        startProgressTicker(track.durationMs);
    } else {
        // Paused
        vinylDisc.classList.remove('spinning');
        tonearmNeedle.classList.remove('active');
        stopProgressTicker();
        
        // Static progress display
        localProgressMs = track.progressMs;
        updateProgressUI(track.durationMs);
    }
});

function syncVinylDesign() {
    if (!vinylDisc) return;
    
    const wrapper = document.querySelector('.widget-wrapper');
    const isFullArt = wrapper && wrapper.classList.contains('design-full-art');
    
    if (isFullArt) {
        const artUrl = currentTrack && currentTrack.albumArt ? currentTrack.albumArt : getFallbackCover();
        vinylDisc.style.backgroundImage = `url('${artUrl}')`;
    } else {
        vinylDisc.style.backgroundImage = '';
    }
}

function setOfflineState() {
    songTitle.textContent = "Sin música sonando";
    songArtist.textContent = "Spotify en espera";
    albumArt.src = getFallbackCover();
    
    const requesterEl = document.getElementById('song-requester');
    if (requesterEl) requesterEl.style.display = 'none';
    
    vinylDisc.classList.remove('spinning');
    tonearmNeedle.classList.remove('active');
    
    stopProgressTicker();
    localProgressMs = 0;
    progressFill.style.width = '0%';
    currentTrack = null;
    
    syncVinylDesign();
}

function startProgressTicker(durationMs) {
    stopProgressTicker();
    
    updateProgressUI(durationMs);
    
    progressInterval = setInterval(() => {
        localProgressMs += 100;
        if (localProgressMs >= durationMs) {
            localProgressMs = durationMs;
            stopProgressTicker();
        }
        updateProgressUI(durationMs);
    }, 100);
}

function stopProgressTicker() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function updateProgressUI(durationMs) {
    if (!durationMs) return;
    const percent = Math.min(100, Math.max(0, (localProgressMs / durationMs) * 100));
    progressFill.style.width = `${percent}%`;
}

// Set initial offline state
setOfflineState();

// Check horizontal layout on load
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('layout') === 'horizontal' || urlParams.get('horizontal') === 'true') {
    document.querySelector('.widget-wrapper')?.classList.add('layout-horizontal');
}

// Real-time custom style application for the music widget
function applyGlobalStyles(config) {
    const styles = config.globalWidgetStyles;
    if (!styles) return;
    
    const root = document.documentElement;
    
    // 1. Font Family
    if (styles.fontFamily) {
        root.style.setProperty('--widget-font', `'${styles.fontFamily}', 'Outfit', sans-serif`);
    }
    
    // 2. Border Color
    if (styles.borderColor) {
        root.style.setProperty('--widget-border-color', styles.borderColor);
    }
    
    // 3. Background Color and Opacity
    if (styles.bgColor) {
        const bgHex = styles.bgColor;
        const opacity = styles.bgOpacity !== undefined ? styles.bgOpacity / 100 : 0.65;
        const rgba = hexToRgba(bgHex, opacity);
        root.style.setProperty('--widget-bg', rgba);
        
        // Adjust text colors based on background contrast for high legibility
        const brightness = getBrightness(bgHex);
        if (brightness > 130) {
            root.style.setProperty('--widget-text-main', '#111111');
            root.style.setProperty('--widget-text-muted', 'rgba(0, 0, 0, 0.6)');
        } else {
            root.style.setProperty('--widget-text-main', '#ffffff');
            root.style.setProperty('--widget-text-muted', 'rgba(255, 255, 255, 0.7)');
        }
    }
    
    // 4. Text / Zoom scale
    if (styles.textScale !== undefined) {
        root.style.setProperty('--widget-scale', styles.textScale / 100);
    }
}

// Helper to convert hex color to RGBA
function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Helper to calculate color brightness (for contrast checking)
function getBrightness(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
}
