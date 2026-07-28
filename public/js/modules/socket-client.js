// public/js/modules/socket-client.js

let socket = null;
const eventListeners = {};

export const SocketClient = {
    init() {
        if (typeof io === 'undefined') {
            console.error('Socket.io library (io) is not loaded.');
            return null;
        }
        
        socket = io();
        
        socket.on('connect', () => {
            console.info('[SocketClient] Connected to server.');
            this.trigger('connect');
        });
        
        socket.on('disconnect', () => {
            console.warn('[SocketClient] Disconnected from server.');
            this.trigger('disconnect');
        });
        
        socket.on('connect_error', (error) => {
            console.error('[SocketClient] Connection error:', error);
            this.trigger('connect_error', error);
        });
        
        // Listen to arbitrary server updates and forward them
        const defaultEvents = [
            'chatbot_settings_updated',
            'system_sounds_updated',
            'goals_updated',

            'spotify_track',
            'spotify_queue_updated',
            'spotify_votes_updated',
            'tiktok_event_raw',
            'play_tts_audio',
            'system',
            'widget_status_changed',
            'widget_position_changed'
        ];
        
        defaultEvents.forEach(event => {
            socket.on(event, (data) => {
                this.trigger(event, data);
            });
        });
        
        return socket;
    },
    
    on(event, callback) {
        if (!eventListeners[event]) {
            eventListeners[event] = [];
        }
        eventListeners[event].push(callback);
    },
    
    off(event, callback) {
        if (!eventListeners[event]) return;
        eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
    },
    
    trigger(event, data) {
        if (!eventListeners[event]) return;
        eventListeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error(`[SocketClient] Error in listener for event "${event}":`, e);
            }
        });
    },
    
    emit(event, data) {
        if (!socket) {
            console.warn('[SocketClient] Attempted to emit before socket was initialized.');
            return;
        }
        socket.emit(event, data);
    },
    
    getRawSocket() {
        return socket;
    }
};
