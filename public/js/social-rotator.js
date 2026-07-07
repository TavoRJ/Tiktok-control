// SVG Brand Icons
const BRAND_ICONS = {
    instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-instagram"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
    tiktok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-music"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`, // We can use Lucide music note or custom SVG note. Let's use clean TikTok note.
    facebook: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-facebook"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-youtube"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17z"/><path d="m10 15 5-3-5-3z"/></svg>`,
    twitter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-twitter"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>`,
    discord: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    custom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`
};

// Official brand names
const BRAND_NAMES = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    youtube: 'YouTube',
    twitter: 'Twitter / X',
    discord: 'Discord',
    custom: 'Enlaces'
};

// Specific SVG note path for TikTok (to make it look authentic and premium)
BRAND_ICONS.tiktok = `
<svg viewBox="0 0 24 24">
    <path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.01 1.63 4.15 1.01.95 2.37 1.51 3.77 1.58v3.9c-1.39-.06-2.77-.52-3.92-1.35-.15-.1-.29-.21-.43-.32v7.12c.02 1.61-.41 3.21-1.28 4.54-1.23 1.94-3.37 3.27-5.69 3.5-2.02.26-4.1-.28-5.74-1.52-2.1-1.54-3.19-4.22-2.72-6.78.36-2.07 1.54-3.96 3.32-5.06 1.49-.94 3.27-1.34 5.02-1.12v4.02c-1.2-.24-2.48.08-3.41.87-.9.73-1.4 1.86-1.33 3.02.04 1.48 1.12 2.76 2.59 2.99 1.15.2 2.37-.18 3.12-1.07.57-.65.86-1.51.83-2.37V0c-.01.01-.01.02-.02.02z"/>
</svg>`;

// Custom SVG path for standard Discord mask
BRAND_ICONS.discord = `
<svg viewBox="0 0 24 24">
    <path fill="currentColor" d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.094 13.094 0 01-1.873-.894.077.077 0 01-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 01.077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 01.078.009c.12.099.246.195.373.289a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z"/>
</svg>`;

// Variables to hold state
let socialsList = [];
let socialsSettings = { enabled: false, displayTime: 10, pauseTime: 2 };
let currentSocialIndex = 0;
let rotatorTimer = null;
let pauseTimer = null;
let progressInterval = null;
let isTesting = false;

// DOM Elements
const widgetEl = document.getElementById('social-widget');
const iconWrapperEl = document.getElementById('social-icon-wrapper');
const platformLabelEl = document.getElementById('social-platform-label');
const usernameTextEl = document.getElementById('social-username-text');
const progressBarEl = document.getElementById('progress-bar');

// Connect Socket.io
const socket = io();

// Listen for settings update
socket.on('chatbot_settings_updated', (config) => {
    console.log('Received updated chatbot settings:', config);
    if (config) {
        socialsList = config.socials || [];
        socialsSettings = config.socialsSettings || { enabled: false, displayTime: 10, pauseTime: 2 };
        
        // Sync theme class to body
        if (config.themeName) {
            document.body.className = 'theme-' + config.themeName;
        }
        
        if (!isTesting) {
            startOrStopRotator();
        }

        if (config.widgets && config.widgets.socials) {
            applyWidgetState(config.widgets.socials);
        }
    }
});

// Request initial settings on load
socket.on('connect', () => {
    console.log('Socket connected, requesting initial settings...');
    socket.emit('get_chatbot_settings');
});

// Socket event to simulate test of a specific social media row
socket.on('test_social_rotator', (data) => {
    console.log('Received test social rotator request:', data);
    if (!data || !data.platform || !data.username) return;
    
    // Set testing flag to pause regular rotation
    isTesting = true;
    clearAllTimers();
    
    // Show the test social network
    displaySocialNetwork(data.platform, data.username);
    
    // Set a timer to resume regular rotator after the display time
    setTimeout(() => {
        isTesting = false;
        startOrStopRotator();
    }, (socialsSettings.displayTime || 10) * 1000);
});

function startOrStopRotator() {
    clearAllTimers();
    
    if (!socialsSettings.enabled || socialsList.length === 0) {
        hideWidget();
        return;
    }
    
    currentSocialIndex = 0;
    runRotationStep();
}

function runRotationStep() {
    clearAllTimers();
    
    if (socialsList.length === 0) return;
    
    // Wrap around index
    if (currentSocialIndex >= socialsList.length) {
        currentSocialIndex = 0;
    }
    
    const currentSocial = socialsList[currentSocialIndex];
    displaySocialNetwork(currentSocial.platform, currentSocial.username);
    
    // Timer to slide out after displayTime
    const displayTimeMs = (socialsSettings.displayTime || 10) * 1000;
    rotatorTimer = setTimeout(() => {
        // Slide out
        widgetEl.classList.remove('slide-in');
        widgetEl.classList.add('slide-out');
        
        // Timer to wait for pauseTime before showing the next one
        const pauseTimeMs = (socialsSettings.pauseTime !== undefined ? socialsSettings.pauseTime : 2) * 1000;
        pauseTimer = setTimeout(() => {
            currentSocialIndex++;
            runRotationStep();
        }, pauseTimeMs + 500); // add 500ms for slide-out animation to complete
        
    }, displayTimeMs);
}

function displaySocialNetwork(platform, username) {
    // Set brand color and background shadows dynamically
    document.documentElement.style.setProperty('--brand-color', `var(--color-${platform}, #a100ff)`);
    document.documentElement.style.setProperty('--brand-shadow', `rgba(${getRGBValuesForPlatform(platform)}, 0.45)`);
    
    // Insert SVG icon
    iconWrapperEl.innerHTML = BRAND_ICONS[platform] || BRAND_ICONS.custom;
    
    // Set labels
    platformLabelEl.textContent = BRAND_NAMES[platform] || 'SÍGUEME';
    usernameTextEl.textContent = username;
    
    // Reset classes and trigger slide-in
    widgetEl.classList.remove('hidden', 'slide-out');
    widgetEl.classList.add('slide-in');
    
    // Animate progress bar
    animateProgressBar((socialsSettings.displayTime || 10) * 1000);
}

function hideWidget() {
    widgetEl.classList.remove('slide-in');
    widgetEl.classList.add('slide-out');
    setTimeout(() => {
        if (!socialsSettings.enabled || socialsList.length === 0) {
            widgetEl.classList.add('hidden');
        }
    }, 600);
}

function clearAllTimers() {
    if (rotatorTimer) clearTimeout(rotatorTimer);
    if (pauseTimer) clearTimeout(pauseTimer);
    if (progressInterval) clearInterval(progressInterval);
    rotatorTimer = null;
    pauseTimer = null;
    progressInterval = null;
}

function animateProgressBar(durationMs) {
    progressBarEl.style.transition = 'none';
    progressBarEl.style.transform = 'scaleX(1)';
    
    // Small timeout to let browser register transition reset
    setTimeout(() => {
        progressBarEl.style.transition = `transform ${durationMs}ms linear`;
        progressBarEl.style.transform = 'scaleX(0)';
    }, 50);
}

// Helper to get RGB values for custom neon glow colors
function getRGBValuesForPlatform(platform) {
    switch (platform) {
        case 'instagram':
            return '225, 48, 108'; // #e1306c
        case 'tiktok':
            return '0, 242, 254'; // #00f2fe
        case 'facebook':
            return '24, 119, 242'; // #1877f2
        case 'youtube':
            return '255, 0, 0'; // #ff0000
        case 'twitter':
            return '29, 161, 242'; // #1da1f2
        case 'discord':
            return '88, 101, 242'; // #5865f2
        case 'custom':
        default:
            return '161, 0, 255'; // #a100ff
    }
}

const isIframe = window.self !== window.top;

// Widget Layout & Position Control
socket.on('widget_position_changed', (data) => {
    if (data && data.widget === 'socials') {
        if (!isIframe) {
            const container = document.getElementById('social-widget');
            if (container) {
                container.style.position = 'absolute';
                container.style.left = data.x + '%';
                container.style.top  = data.y + '%';
                if (data.width !== undefined) container.style.width = data.width + '%';
                if (data.height !== undefined) container.style.height = data.height + '%';
            }
        }
    }
});

socket.on('widget_status_changed', (data) => {
    if (data && data.widget === 'socials') {
        if (isIframe) {
            document.body.style.display = data.active ? 'flex' : 'none';
        } else {
            document.body.style.display = data.active ? '' : 'none';
        }
    }
});

function applyWidgetState(cfg) {
    if (!cfg) return;
    const container = document.getElementById('social-widget');
    if (!container) return;
    
    if (isIframe) {
        document.body.style.width = '100%';
        document.body.style.height = '100%';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.display = cfg.active ? 'flex' : 'none';
        document.body.style.justifyContent = 'center';
        document.body.style.alignItems = 'center';
        
        container.style.position = 'relative';
        container.style.left = '0';
        container.style.top = '0';
        container.style.margin = '0';
    } else {
        container.style.position = 'absolute';
        container.style.left = cfg.x + '%';
        container.style.top  = cfg.y + '%';
        if (cfg.width) container.style.width = cfg.width + '%';
        if (cfg.height) container.style.height = cfg.height + '%';
        document.body.style.display = 'block';
        document.body.style.position = 'relative';
        document.body.style.display = cfg.active ? '' : 'none';
    }
}
