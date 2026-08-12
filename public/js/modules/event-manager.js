/**
 * TavLive Event Manager - V1.3.19
 * Centralized priority queue, interrupt handler, cooldowns and event batching.
 */

export const EVENT_PRIORITIES = {
    top_donor: 100,
    donors: 100,
    gift: 90,
    follow: 60,
    share: 40,
    comment: 30,
    taps: 10,
    default: 20
};

export class EventManager {
    constructor(dispatcherCallback, options = {}) {
        this.dispatch = dispatcherCallback;
        this.queue = [];
        this.activeEvent = null;
        this.cooldowns = {};
        this.tapBuffer = { count: 0, user: '', timer: null };

        this.batchWindowMs = options.batchWindowMs || 800; // 800ms window for grouping taps/likes
    }

    /**
     * Submit an incoming event to the Event Manager
     */
    emitEvent(eventType, payload) {
        if (!payload) return;

        const priority = EVENT_PRIORITIES[eventType] || EVENT_PRIORITIES[payload.type] || EVENT_PRIORITIES.default;
        payload._priority = priority;
        payload._timestamp = Date.now();

        // 1. Grouping / Cooldown Strategy for Repetitive Events (Tap Tap / Likes)
        if (eventType === 'taps' || payload.type === 'taps' || eventType === 'like') {
            this.handleTapBatching(payload);
            return;
        }

        // 2. High Priority Interruption & Queueing Strategy
        this.enqueueAndProcess(eventType, payload);
    }

    /**
     * Group repetitive tap/like events in a short window
     */
    handleTapBatching(payload) {
        const tapIncrement = payload.likeCount || payload.count || 1;
        this.tapBuffer.count += tapIncrement;
        if (payload.nickname || payload.username) {
            this.tapBuffer.user = payload.nickname || payload.username;
        }

        if (this.tapBuffer.timer) {
            clearTimeout(this.tapBuffer.timer);
        }

        this.tapBuffer.timer = setTimeout(() => {
            const batchedPayload = {
                type: 'taps',
                count: this.tapBuffer.count,
                nickname: this.tapBuffer.user,
                totalLikeCount: payload.totalLikeCount || 0,
                _priority: EVENT_PRIORITIES.taps,
                _timestamp: Date.now()
            };

            this.tapBuffer.count = 0;
            this.tapBuffer.user = '';
            this.tapBuffer.timer = null;

            this.enqueueAndProcess('taps', batchedPayload);
        }, this.batchWindowMs);
    }

    /**
     * Enqueue payload and trigger dispatch with priority sorting
     */
    enqueueAndProcess(eventType, payload) {
        // If an active event is running and has lower priority, check if we should interrupt
        if (this.activeEvent && payload._priority > this.activeEvent._priority) {
            // High priority event interrupts low priority
            this.queue.unshift(payload);
            this.processNextEvent();
            return;
        }

        // Insert into priority queue (highest priority first)
        this.queue.push(payload);
        this.queue.sort((a, b) => b._priority - a._priority || a._timestamp - b._timestamp);

        if (!this.activeEvent) {
            this.processNextEvent();
        }
    }

    /**
     * Process next event in priority queue
     */
    processNextEvent() {
        if (this.queue.length === 0) {
            this.activeEvent = null;
            return;
        }

        const nextEvent = this.queue.shift();
        this.activeEvent = nextEvent;

        if (typeof this.dispatch === 'function') {
            this.dispatch(nextEvent.type || 'donors', nextEvent, () => {
                // On event finish callback
                this.activeEvent = null;
                this.processNextEvent();
            });
        }
    }

    /**
     * Clear all queues and cooldowns
     */
    reset() {
        this.queue = [];
        this.activeEvent = null;
        if (this.tapBuffer.timer) clearTimeout(this.tapBuffer.timer);
        this.tapBuffer = { count: 0, user: '', timer: null };
    }
}
