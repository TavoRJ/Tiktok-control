const socket = io();
let chatbotConfig = null;

const dynamicWidgets = {
    spotify: { url: '/music-widget.html' },
    banner: { url: '/banner-cocina.html' },
    donors: { url: '/donors-overlay.html' },
    taps: { url: '/taps-overlay.html' },
    mvp: { url: '/mvp-overlay.html' },
    songlist: { url: '/songlist-widget.html' },
    recetas: { url: '/recetas.html' },
    dinamicas: { url: '/dinamicas.html' },
    ruleta: { url: '/ruleta-widget.html' },
    socials: { url: '/social-rotator.html' },
    tts: { url: '/tts-widget.html' }
};

function updateWidgetScale(key, wConfig) {
    const iframe = document.getElementById('iframe-' + key);
    if (!iframe || !wConfig) return;

    let designWidth = 320;
    let designHeight = 400;

    if (key === 'spotify') {
        if (wConfig.width > wConfig.height) {
            designWidth = 440;
            designHeight = 100;
        } else {
            designWidth = 350;
            designHeight = 430;
        }
    } else if (key === 'banner') {
        designWidth = 1080;
        designHeight = 80;
    } else if (key === 'donors' || key === 'taps' || key === 'mvp') {
        designWidth = 320;
        designHeight = 400;
    } else if (key === 'songlist' || key === 'recetas') {
        designWidth = 320;
        designHeight = 400;
    } else if (key === 'dinamicas') {
        designWidth = 320;
        designHeight = 250;
    } else if (key === 'ruleta') {
        designWidth = 400;
        designHeight = 500;
    } else if (key === 'socials') {
        designWidth = 360;
        designHeight = 80;
    } else if (key === 'tts') {
        designWidth = 340;
        designHeight = 140;
    }

    // Get container dimensions in pixels relative to 1080x1920
    const containerWidthPx = (wConfig.width / 100) * 1080;
    const containerHeightPx = (wConfig.height / 100) * 1920;

    // Calculate scale factor to fit both width and height inside the container box
    const scaleX = containerWidthPx / designWidth;
    const scaleY = containerHeightPx / designHeight;
    
    // Use the minimum of scaleX and scaleY to maintain aspect ratio and prevent cropping
    let scale = Math.min(scaleX, scaleY);
    
    // Incorporate the manual zoom slider setting if present
    const zoom = wConfig.zoom || 100;
    scale = scale * (zoom / 100);

    // Apply the design dimension and the transform scale to the iframe
    iframe.style.width = designWidth + 'px';
    iframe.style.height = designHeight + 'px';
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top left';

    // Center the scaled iframe inside the container box
    const leftoverX = containerWidthPx - (designWidth * scale);
    const leftoverY = containerHeightPx - (designHeight * scale);
    iframe.style.position = 'absolute';
    iframe.style.left = (leftoverX / 2) + 'px';
    iframe.style.top = (leftoverY / 2) + 'px';
}

socket.on('chatbot_settings_updated', (config) => {
    chatbotConfig = config;
    
    // Set theme variables on body
    const theme = config.themeName || 'neutral';
    document.body.className = `theme-${theme}`;

    if (!config.widgets) return;

    for (const [key, info] of Object.entries(dynamicWidgets)) {
        const wConfig = config.widgets[key] || { active: false, x: 0, y: 0, width: 90, height: 10, zoom: 100 };
        
        let container = document.getElementById('container-' + key);
        
        if (wConfig.active) {
            // Determine if horizontal layout is appropriate based on aspect ratio
            let finalUrl = info.url;
            if (key === 'spotify') {
                if (wConfig.width > wConfig.height) {
                    finalUrl += '?layout=horizontal';
                }
            }

            if (!container) {
                container = document.createElement('div');
                container.id = 'container-' + key;
                container.className = 'overlay-widget-container';
                
                const iframe = document.createElement('iframe');
                iframe.id = 'iframe-' + key;
                iframe.src = finalUrl;
                container.appendChild(iframe);
                document.getElementById('widgets-container').appendChild(container);
            } else {
                const iframe = document.getElementById('iframe-' + key);
                if (iframe) {
                    // Update iframe src only if the horizontal/vertical layout param changed
                    const currentUrl = new URL(iframe.src, window.location.origin);
                    const targetUrl = new URL(finalUrl, window.location.origin);
                    if (currentUrl.searchParams.get('layout') !== targetUrl.searchParams.get('layout')) {
                        iframe.src = finalUrl;
                    }
                }
            }

            // Set container size & coordinates (relative to 1080x1920)
            container.style.left = wConfig.x + '%';
            container.style.top = wConfig.y + '%';
            container.style.width = wConfig.width + '%';
            container.style.height = wConfig.height + '%';
            container.style.display = 'block';

            // Apply scaling/zoom to the iframe contents
            updateWidgetScale(key, wConfig);
        } else {
            // Hide container if widget is inactive
            if (container) {
                container.style.display = 'none';
            }
        }
    }
});

socket.on('widget_position_changed', (data) => {
    const key = data.widget;
    if (chatbotConfig && chatbotConfig.widgets && chatbotConfig.widgets[key]) {
        chatbotConfig.widgets[key].x = data.x;
        chatbotConfig.widgets[key].y = data.y;
        if (data.width !== undefined) chatbotConfig.widgets[key].width = data.width;
        if (data.height !== undefined) chatbotConfig.widgets[key].height = data.height;
    }
    const container = document.getElementById('container-' + key);
    if (container) {
        container.style.left = data.x + '%';
        container.style.top = data.y + '%';
        if (data.width !== undefined) container.style.width = data.width + '%';
        if (data.height !== undefined) container.style.height = data.height + '%';
        
        updateWidgetScale(key, chatbotConfig.widgets[key]);
    }
});

socket.on('widget_status_changed', (data) => {
    const key = data.widget;
    if (chatbotConfig && chatbotConfig.widgets && chatbotConfig.widgets[key]) {
        chatbotConfig.widgets[key].active = data.active;
    }
    const container = document.getElementById('container-' + key);
    if (container) {
        container.style.display = data.active ? 'block' : 'none';
    }
});

// Request initial settings on load
socket.emit('get_chatbot_settings');
