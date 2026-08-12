import { DynamicWidgetCore } from './modules/dynamic-widget-core.js';
import { EventManager } from './modules/event-manager.js';

const socket = io();
let chatbotConfig = null;
const widgetCores = {};

const DYNAMIC_WIDGET_KEYS = [
    'donors', 'gift', 'follow', 'share', 'comment',
    'taps', 'spotify', 'recetas', 'dinamicas', 'mvp', 'song-requests'
];

const eventManager = new EventManager((widgetKey, payload, onComplete) => {
    window.triggerDynamicWidgetEvent(widgetKey, payload, onComplete);
});

socket.on('chatbot_settings_updated', (config) => {
    chatbotConfig = config;
    if (!config || !config.widgets) return;

    const rootContainer = document.getElementById('overlay-root') || document.body;

    DYNAMIC_WIDGET_KEYS.forEach((key) => {
        const wConfig = config.widgets[key] || {
            active: true,
            x: 5,
            y: 5,
            width: 42.5,
            height: 10,
            duration: 4,
            opacity: 85,
            style: 'minimal',
            enterAnim: 'slide-up',
            exitAnim: 'fade'
        };

        let container = document.getElementById('container-' + key);

        if (wConfig.active !== false) {
            if (!container) {
                container = document.createElement('div');
                container.id = 'container-' + key;
                container.className = 'overlay-widget-container gr-dynamic-widget state-idle';
                rootContainer.appendChild(container);
            }

            container.style.display = 'block';
            container.style.position = 'absolute';
            container.style.left = wConfig.x + '%';
            container.style.top = wConfig.y + '%';
            container.style.width = 'max-content';
            container.style.height = 'max-content';

            if (!widgetCores[key]) {
                widgetCores[key] = new DynamicWidgetCore(key, container, wConfig);
            } else {
                widgetCores[key].applyConfig(wConfig);
            }
        } else {
            if (container) {
                container.style.display = 'none';
            }
            if (widgetCores[key]) {
                widgetCores[key].reset();
            }
        }
    });
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
    if (widgetCores[key]) {
        widgetCores[key].applyConfig({ active: data.active });
        if (!data.active) widgetCores[key].reset();
    }
});

socket.on('tiktok_event_raw', (payload) => {
    if (!payload || !payload.data) return;

    const eventType = payload.eventType;
    const data = payload.data;

    const userPayload = {
        uniqueId: data.uniqueId || data.userId,
        nickname: data.nickname || data.displayName || data.uniqueId || 'Usuario',
        avatarUrl: data.profilePictureUrl || data.userProfilePic || '',
        mode: 'showcase',
        rawData: data
    };

    if (eventType === 'gift') {
        userPayload.type = 'gift';
        userPayload.giftName = data.giftName || data.name || 'Regalo';
        userPayload.repeatCount = data.repeatCount || data.count || 1;
        userPayload.giftImage = data.giftDetails?.giftImage || data.giftPictureUrl || '';
        userPayload.diamonds = (parseInt(data.diamondCount) || 0) * userPayload.repeatCount;

        eventManager.emitEvent('gift', userPayload);
    } else if (eventType === 'follow') {
        userPayload.type = 'follow';
        eventManager.emitEvent('follow', userPayload);
    } else if (eventType === 'share') {
        userPayload.type = 'share';
        eventManager.emitEvent('share', userPayload);
    } else if (eventType === 'like') {
        userPayload.type = 'taps';
        userPayload.likeCount = parseInt(data.likeCount) || 1;
        userPayload.totalLikeCount = parseInt(data.totalLikeCount) || 0;
        eventManager.emitEvent('taps', userPayload);
    } else if (eventType === 'chat') {
        if (data.comment) {
            userPayload.type = 'comment';
            userPayload.comment = data.comment;
            eventManager.emitEvent('comment', userPayload);
        }
    } else if (eventType === 'roomUserSeq' || eventType === 'roomUser') {
        if (data.viewerCount !== undefined) {
            eventManager.emitEvent('viewers', {
                type: 'viewers',
                viewerCount: parseInt(data.viewerCount) || 0
            });
        }
    }
});

socket.on('spotify_track', (track) => {
    if (!track || track.isPlaying === false) return;
    window.triggerDynamicWidgetEvent('spotify', {
        type: 'spotify',
        title: track.title || track.name || 'Sin título',
        artist: track.artist || track.artists || 'Artista',
        cover: track.albumArt || track.cover || ''
    });
});

socket.on('spotify_queue_updated', (queue) => {
    window.triggerDynamicWidgetEvent('song-requests', {
        type: 'song-requests',
        queue: Array.isArray(queue) ? queue : []
    });
});

socket.on('updateMeta', (data) => {
    if (!data) return;
    window.triggerDynamicWidgetEvent('dinamicas', {
        type: 'goal',
        title: data.giftName || data.title || 'Meta de Regalos',
        current: data.current || 0,
        target: data.target || 100
    });
});

socket.on('rankings_updated', (rankings) => {
    if (Array.isArray(rankings) && rankings.length > 0) {
        const topDonor = rankings[0];
        const topPayload = {
            type: 'donors',
            mode: 'compact',
            nickname: topDonor.nickname || topDonor.uniqueId,
            uniqueId: topDonor.uniqueId,
            amount: topDonor.coins || topDonor.diamonds || topDonor.amount || 0,
            avatarUrl: topDonor.profilePictureUrl
        };
        window.triggerDynamicWidgetEvent('donors', topPayload);

        const lbItems = rankings.slice(0, 3).map((r, i) => ({
            rank: i + 1,
            name: r.nickname || r.uniqueId,
            value: (r.coins || r.diamonds || 0).toLocaleString()
        }));
        window.triggerDynamicWidgetEvent('mvp', {
            type: 'leaderboard',
            title: 'TOP DEL LIVE',
            items: lbItems
        });
    }
});

/**
 * Universal Event Dispatcher for Dynamic Widgets
 */
window.triggerDynamicWidgetEvent = function(widgetKey, payload, onComplete) {
    if (widgetCores[widgetKey]) {
        widgetCores[widgetKey].triggerEvent(payload, onComplete);
    } else {
        const container = document.getElementById('container-' + widgetKey);
        if (container) {
            const wConfig = (chatbotConfig && chatbotConfig.widgets && chatbotConfig.widgets[widgetKey]) || {
                active: true,
                duration: 4,
                opacity: 85,
                style: 'minimal',
                enterAnim: 'slide-up',
                exitAnim: 'fade'
            };
            widgetCores[widgetKey] = new DynamicWidgetCore(widgetKey, container, wConfig);
            widgetCores[widgetKey].triggerEvent(payload, onComplete);
        } else {
            if (typeof onComplete === 'function') onComplete();
        }
    }
};

socket.on('trigger_dynamic_widget_event', (data) => {
    if (data && data.widgetKey && data.payload) {
        window.triggerDynamicWidgetEvent(data.widgetKey, data.payload);
    }
});

// Request initial settings on load
socket.emit('get_chatbot_settings');
