/**
 * TavLive Dynamic Widget Custom Renderers - V1.3.19
 * Custom HTML generators for Top Donator, Gift Alert, Follow Alert, Share Alert, Featured Comment.
 */

export const WidgetRenderers = {
    /**
     * Top Donator Renderer: 👑 [avatar] @user · 💎 5.2K
     */
    donors: (payload) => {
        const name = payload.nickname || payload.uniqueId || payload.username || 'Top Donador';
        const amount = payload.amount || payload.coins || payload.diamonds || 0;
        const formattedAmount = typeof amount === 'number' ? (amount >= 1000 ? (amount/1000).toFixed(1) + 'K' : amount) : amount;
        const avatarUrl = payload.profilePictureUrl || payload.avatarUrl || '';

        return `
            <div class="gr-minimal-inline gr-minimal-donor">
                <span class="gr-badge-icon">👑</span>
                ${avatarUrl ? `<img class="gr-compact-avatar" src="${escapeHtml(avatarUrl)}" onerror="this.style.display='none'">` : ''}
                <span class="gr-inline-text">
                    <strong>@${escapeHtml(name)}</strong> <span class="gr-music-sep">·</span> 💎 ${formattedAmount}
                </span>
            </div>
        `;
    },

    /**
     * Gift Alert Renderer: 🎁 [avatar] @user · Rosa ×5
     */
    gift: (payload) => {
        const name = payload.nickname || payload.uniqueId || payload.username || 'Usuario';
        const giftName = payload.giftName || 'Regalo';
        const giftCount = payload.repeatCount || payload.count || 1;
        const avatarUrl = payload.profilePictureUrl || payload.avatarUrl || '';
        const giftImage = payload.giftImage || payload.giftPictureUrl || '';

        return `
            <div class="gr-minimal-inline gr-minimal-gift">
                ${giftImage ? `<img class="gr-gift-img-mini" src="${escapeHtml(giftImage)}" onerror="this.style.display='none'">` : '<span class="gr-badge-icon">🎁</span>'}
                ${avatarUrl ? `<img class="gr-compact-avatar" src="${escapeHtml(avatarUrl)}" onerror="this.style.display='none'">` : ''}
                <span class="gr-inline-text">
                    <strong>@${escapeHtml(name)}</strong> <span class="gr-music-sep">·</span> ${escapeHtml(giftName)} <strong>×${giftCount}</strong>
                </span>
            </div>
        `;
    },

    /**
     * Follow Alert Renderer: ♡ [avatar] @user empezó a seguir
     */
    follow: (payload) => {
        const name = payload.nickname || payload.uniqueId || payload.username || 'Usuario';
        const avatarUrl = payload.profilePictureUrl || payload.avatarUrl || '';

        return `
            <div class="gr-minimal-inline gr-minimal-follow">
                <span class="gr-compact-icon">♡</span>
                ${avatarUrl ? `<img class="gr-compact-avatar" src="${escapeHtml(avatarUrl)}" onerror="this.style.display='none'">` : ''}
                <span class="gr-inline-text"><strong>@${escapeHtml(name)}</strong> empezó a seguir</span>
            </div>
        `;
    },

    /**
     * Share Alert Renderer: ↗ [avatar] @user compartió el LIVE
     */
    share: (payload) => {
        const name = payload.nickname || payload.uniqueId || payload.username || 'Usuario';
        const avatarUrl = payload.profilePictureUrl || payload.avatarUrl || '';

        return `
            <div class="gr-minimal-inline gr-minimal-share">
                <span class="gr-compact-icon">↗</span>
                ${avatarUrl ? `<img class="gr-compact-avatar" src="${escapeHtml(avatarUrl)}" onerror="this.style.display='none'">` : ''}
                <span class="gr-inline-text"><strong>@${escapeHtml(name)}</strong> compartió el LIVE</span>
            </div>
        `;
    },

    /**
     * Featured Comment Renderer: 💬 [avatar] @user · "Hola bro"
     */
    comment: (payload) => {
        const name = payload.nickname || payload.uniqueId || payload.username || 'Usuario';
        const commentText = payload.comment || payload.text || payload.subtext || '';
        const avatarUrl = payload.profilePictureUrl || payload.avatarUrl || '';

        return `
            <div class="gr-minimal-inline gr-minimal-comment">
                <span class="gr-badge-icon">💬</span>
                ${avatarUrl ? `<img class="gr-compact-avatar" src="${escapeHtml(avatarUrl)}" onerror="this.style.display='none'">` : ''}
                <span class="gr-inline-text">
                    <strong>@${escapeHtml(name)}</strong> <span class="gr-music-sep">·</span> "${escapeHtml(commentText)}"
                </span>
            </div>
        `;
    },

    /**
     * Tap Tap Renderer: ❤️ [avatar] @user · ×127
     */
    taps: (payload) => {
        const name = payload.nickname || payload.uniqueId || payload.username || '';
        const avatarUrl = payload.profilePictureUrl || payload.avatarUrl || '';
        const tapCount = payload.likeCount || payload.count || payload.taps || 1;

        return `
            <div class="gr-minimal-inline gr-minimal-taps">
                <span class="gr-tap-heart-anim">❤️</span>
                ${avatarUrl ? `<img class="gr-compact-avatar" src="${escapeHtml(avatarUrl)}" onerror="this.style.display='none'">` : ''}
                <span class="gr-inline-text">
                    ${name ? `<strong>@${escapeHtml(name)}</strong> <span class="gr-music-sep">·</span> ` : ''}
                    <strong class="gr-tap-count">×${tapCount.toLocaleString()}</strong>
                </span>
            </div>
        `;
    },

    /**
     * Music Minimalist Renderer: ♪ Blinding Lights · The Weeknd
     */
    spotify: (payload) => {
        const title = payload.title || payload.trackName || 'Sin reproducción';
        const artist = payload.artist || payload.artistName || 'Spotify';
        const cover = payload.cover || payload.albumArt || '';

        return `
            <div class="gr-minimal-inline gr-minimal-music">
                <span class="gr-music-icon-anim">♪</span>
                ${cover ? `<img class="gr-music-cover-mini" src="${escapeHtml(cover)}" onerror="this.style.display='none'">` : ''}
                <span class="gr-inline-text">
                    <strong class="gr-music-title">${escapeHtml(title)}</strong>
                    <span class="gr-music-sep">·</span>
                    <span class="gr-music-artist">${escapeHtml(artist)}</span>
                </span>
            </div>
        `;
    },

    /**
     * Viewer Counter Renderer: 👁️ 1,420
     */
    viewers: (payload) => {
        const count = payload.viewerCount || payload.count || 0;
        const formatted = typeof count === 'number' ? count.toLocaleString() : count;

        return `
            <div class="gr-minimal-inline gr-minimal-viewers">
                <span class="gr-compact-icon">👁️</span>
                <span class="gr-inline-text"><strong>${formatted}</strong></span>
            </div>
        `;
    },

    /**
     * Goal / Progress Renderer: 🎯 Rosas · 750 / 1,000 · 75%
     */
    goal: (payload) => {
        const goalTitle = payload.title || payload.goalName || 'Meta del Live';
        const current = payload.current || payload.progress || 0;
        const target = payload.target || payload.goal || 100;
        const pct = Math.min(100, Math.round((current / Math.max(1, target)) * 100));

        return `
            <div class="gr-minimal-inline gr-minimal-goal">
                <span class="gr-compact-icon">🎯</span>
                <span class="gr-inline-text">
                    <strong>${escapeHtml(goalTitle)}</strong> <span class="gr-music-sep">·</span> ${current.toLocaleString()} / ${target.toLocaleString()} <span class="gr-music-sep">·</span> <strong>${pct}%</strong>
                </span>
            </div>
        `;
    },

    /**
     * Leaderboard Renderer: 🏆 1. @Juan · 💎 5.2K
     */
    leaderboard: (payload) => {
        const items = Array.isArray(payload.items) ? payload.items : [
            { rank: 1, name: payload.nickname || 'Juan', value: payload.amount || '5.2K' }
        ];

        return `
            <div class="gr-minimal-inline gr-minimal-leaderboard">
                <span class="gr-compact-icon">🏆</span>
                <span class="gr-inline-text">
                    ${items.slice(0, 3).map((item, idx) => `
                        <span>${idx === 0 ? '1.' : idx === 1 ? '2.' : '3.'} <strong>@${escapeHtml(item.name || item.username)}</strong> 💎 ${item.value || item.coins || 0}</span>
                    `).join(' <span class="gr-music-sep">·</span> ')}
                </span>
            </div>
        `;
    },

    /**
     * Song Requests List Renderer (Persistent Live Queue)
     */
    'song-requests': (payload, config = {}) => {
        const queue = Array.isArray(payload.queue) ? payload.queue : (Array.isArray(payload.items) ? payload.items : []);
        const maxSongs = parseInt(config.maxSongs) || parseInt(config.visibleCount) || 3;
        const visibleItems = queue.slice(0, maxSongs);

        if (visibleItems.length === 0) {
            return ``;
        }

        return `
            <div class="gr-song-requests-floating">
                ${visibleItems.map(item => {
                    const title = escapeHtml(item.title || item.trackName || 'Canción');
                    const artist = escapeHtml(item.artist || item.artistName || 'Artista');
                    const requester = item.requester ? escapeHtml(item.requester) : '';
                    const cover = item.albumArt || item.cover || item.coverUrl || item.artworkUrl || '';

                    return `
                        <div class="gr-song-request-row">
                            ${cover 
                                ? `<img class="gr-song-cover-mini" src="${escapeHtml(cover)}" alt="${title}">` 
                                : `<div class="gr-song-cover-placeholder">🎵</div>`
                            }
                            <div class="gr-song-request-details">
                                <div class="gr-song-request-title">${title}</div>
                                <div class="gr-song-request-subtext">
                                    <span class="gr-song-artist">${artist}</span>
                                    ${requester ? `<span class="gr-song-dot">·</span><span class="gr-song-requester">@${requester}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    // Aliases for editor & system widget key compatibility
    recetas: (payload, config) => WidgetRenderers.viewers(payload, config),
    dinamicas: (payload, config) => WidgetRenderers.goal(payload, config),
    mvp: (payload, config) => WidgetRenderers.leaderboard(payload, config)
};

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}
