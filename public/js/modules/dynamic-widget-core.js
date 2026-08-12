import { WidgetRenderers } from './dynamic-widget-renderers.js';

export class DynamicWidgetCore {
    constructor(widgetId, containerElement, options = {}) {
        this.widgetId = widgetId;
        this.container = containerElement;

        // Default Config
        this.config = {
            duration: options.duration || 4,      // seconds
            opacity: options.opacity || 85,        // percentage (0-100)
            scale: options.scale || 100,          // percentage
            style: options.style || 'minimal',    // minimal, glass, clean, neon, custom
            enterAnim: options.enterAnim || 'slide-up', // fade, slide-up, slide-down, slide-left, slide-right, pop, scale, bounce, none
            exitAnim: options.exitAnim || 'fade',
            active: options.active !== undefined ? options.active : true,
            ...options
        };

        this.state = 'IDLE'; // IDLE | ACTIVE | EXIT
        this.timer = null;
        this.queue = [];
        this.isProcessingQueue = false;

        this.applyConfig(this.config);
    }

    /**
     * Update widget configuration parameters
     */
    applyConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };

        if (!this.container) return;

        // Apply CSS custom variables
        const alpha = (this.config.opacity !== undefined ? parseFloat(this.config.opacity) : 85) / 100;
        const scaleVal = (this.config.scale !== undefined ? parseFloat(this.config.scale) : 100) / 100;

        this.container.style.setProperty('--widget-opacity', alpha);
        this.container.style.setProperty('--widget-scale', scaleVal);
        this.container.style.setProperty('--widget-duration', `${this.config.duration || 4}s`);

        if (this.config.textColor) {
            this.container.style.setProperty('--widget-text-color', this.config.textColor);
            this.container.style.color = this.config.textColor;
        }
        if (this.config.bgType === 'transparent') {
            this.container.style.setProperty('--widget-bg', 'transparent');
            this.container.style.backgroundColor = 'transparent';
            this.container.classList.add('bg-transparent');
        } else {
            this.container.classList.remove('bg-transparent');
            if (this.config.bgColor) {
                this.container.style.setProperty('--widget-bg', this.config.bgColor);
                this.container.style.backgroundColor = this.config.bgColor;
            }
        }
        // Handle borderStyle: 'none' | 'solid' | 'neon'
        const bStyle = this.config.borderStyle || 'none';
        if (bStyle === 'none') {
            this.container.style.border = 'none';
            this.container.style.boxShadow = 'none';
            this.container.style.outline = 'none';
            this.container.classList.add('border-none');
        } else {
            this.container.classList.remove('border-none');
            const color = this.config.borderColor || '#00f0ff';
            this.container.style.setProperty('--widget-border', color);
            this.container.style.borderColor = color;
            if (bStyle === 'neon') {
                this.container.style.boxShadow = `0 0 10px ${color}`;
            } else {
                this.container.style.boxShadow = 'none';
                this.container.style.border = `1px solid ${color}`;
            }
        }

        this.container.style.scale = `${scaleVal}`;
        this.container.style.transform = `scale(${scaleVal})`;
        this.container.style.transformOrigin = 'top left';

        // Apply style class
        const validStyles = ['minimal', 'glass', 'clean', 'neon', 'custom'];
        validStyles.forEach(st => this.container.classList.remove(`style-${st}`));
        const currentStyle = validStyles.includes(this.config.style) ? this.config.style : 'minimal';
        this.container.classList.add(`style-${currentStyle}`);
    }

    /**
     * Trigger event onto this widget payload:
     * payload = { title, subtext, avatarUrl, rawData }
     */
    triggerEvent(payload = {}, onComplete = null) {
        if (!this.config.active) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        // Deduplication check for Spotify or repetitive tracks
        if (this.widgetId === 'spotify') {
            const isSameTrack = payload.title === this.lastTrackTitle && payload.artist === this.lastTrackArtist;
            const now = Date.now();
            if (isSameTrack && (now - (this.lastTrackTime || 0)) < ((parseFloat(this.config.duration) || 4) * 1000 + 2000)) {
                if (typeof onComplete === 'function') onComplete();
                return;
            }
            this.lastTrackTitle = payload.title;
            this.lastTrackArtist = payload.artist;
            this.lastTrackTime = now;
        }

        // Persistent widgets like 'song-requests' update live queue immediately without freezing
        if (this.state === 'ACTIVE') {
            if (this.widgetId === 'song-requests') {
                this.executeEventFlow(payload, onComplete);
                return;
            }
            this.queue.push({ payload, onComplete });
            return;
        }

        this.executeEventFlow(payload, onComplete);
    }

    /**
     * Core Lifecycle Flow:
     * IDLE -> ENTER -> ACTIVE -> WAIT DURATION -> EXIT -> IDLE
     */
    executeEventFlow(payload, onComplete = null) {
        if (!this.container) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        // Clear existing timers
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        // Render content if custom renderer provided or default card structure
        this.renderPayloadContent(payload);

        // Remove previous animation classes
        this.clearAnimationClasses();

        // Persistent Widget Check: 'song-requests' stays visible while queue has items
        if (this.widgetId === 'song-requests') {
            const queue = Array.isArray(payload.queue) ? payload.queue : (Array.isArray(payload.items) ? payload.items : []);
            if (queue.length === 0) {
                this.startExitSequence(onComplete);
                return;
            }

            this.state = 'ACTIVE';
            this.container.classList.remove('state-idle', 'state-exit');
            this.container.classList.add('state-active');
            if (typeof onComplete === 'function') onComplete();
            return; // Persistent queue does not exit after duration
        }

        // Transition: IDLE -> ACTIVE (ENTER)
        this.state = 'ACTIVE';
        this.container.classList.remove('state-idle', 'state-exit');
        this.container.classList.add('state-active');

        // Apply entrance animation if specified
        if (this.config.enterAnim && this.config.enterAnim !== 'none') {
            this.container.classList.add(`anim-enter-${this.config.enterAnim}`);
        }

        // Schedule EXIT transition after duration (in ms)
        const durationMs = (parseFloat(this.config.duration) || 4) * 1000;

        this.timer = setTimeout(() => {
            this.startExitSequence(onComplete);
        }, durationMs);
    }

    /**
     * Execute EXIT animation and return to IDLE
     */
    startExitSequence(onComplete = null) {
        if (this.state !== 'ACTIVE') {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        this.state = 'EXIT';
        this.clearAnimationClasses();
        this.container.classList.remove('state-active');
        this.container.classList.add('state-exit');

        let exitDuration = 400; // default exit animation ms

        if (this.config.exitAnim && this.config.exitAnim !== 'none') {
            this.container.classList.add(`anim-exit-${this.config.exitAnim}`);
        } else {
            exitDuration = 100;
        }

        // After exit animation completes -> IDLE
        this.timer = setTimeout(() => {
            this.clearAnimationClasses();
            this.container.classList.remove('state-exit', 'state-active');
            this.container.classList.add('state-idle');
            this.state = 'IDLE';

            if (typeof onComplete === 'function') {
                onComplete();
            }

            // Process queued items if any
            if (this.queue.length > 0) {
                const nextItem = this.queue.shift();
                this.executeEventFlow(nextItem.payload, nextItem.onComplete);
            }
        }, exitDuration);
    }

    /**
     * Remove all entrance/exit animation helper classes
     */
    clearAnimationClasses() {
        if (!this.container) return;
        const animClasses = Array.from(this.container.classList).filter(c => c.startsWith('anim-'));
        animClasses.forEach(c => this.container.classList.remove(c));
    }

    /**
     * Dynamic card renderer for real user data payload
     */
    renderPayloadContent(payload) {
        if (!this.container) return;

        if (payload.customHtml) {
            this.container.innerHTML = payload.customHtml;
            return;
        }

        // Check if custom renderer exists in WidgetRenderers dictionary
        const rendererKey = payload.type || this.widgetId;
        if (WidgetRenderers[rendererKey]) {
            this.container.innerHTML = WidgetRenderers[rendererKey](payload, this.config);
            return;
        }

        // Default Fallback Card Structure
        const title = payload.title || payload.nickname || payload.uniqueId || payload.username || 'Usuario';
        const subtext = payload.subtext || payload.detail || payload.comment || '';
        const avatarUrl = payload.avatarUrl || payload.profilePictureUrl || 'https://p16-va-tiktok.ibyteimg.com/img/musically-maliva-obj/1665225872656390~c5_100x100.jpeg';

        this.container.innerHTML = `
            <div class="gr-widget-card">
                <img class="gr-widget-avatar" src="${this.escapeHtml(avatarUrl)}" alt="${this.escapeHtml(title)}" onerror="this.src='https://p16-va-tiktok.ibyteimg.com/img/musically-maliva-obj/1665225872656390~c5_100x100.jpeg'">
                <div class="gr-widget-info">
                    <div class="gr-widget-title">${this.escapeHtml(title)}</div>
                    ${subtext ? `<div class="gr-widget-subtext">${this.escapeHtml(subtext)}</div>` : ''}
                </div>
            </div>
        `;
    }

    escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, (m) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m]));
    }

    /**
     * Manually force reset to IDLE
     */
    reset() {
        if (this.timer) clearTimeout(this.timer);
        this.queue = [];
        this.state = 'IDLE';
        this.clearAnimationClasses();
        if (this.container) {
            this.container.classList.remove('state-active', 'state-exit');
            this.container.classList.add('state-idle');
        }
    }
}
