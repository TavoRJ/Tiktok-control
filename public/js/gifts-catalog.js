/**
 * gifts-catalog.js
 * Client module for fetching, caching, and querying the centralized TikTok gifts catalog from TavLive Remote Auth API.
 */
import { AUTH_SERVER_URL } from './auth/auth-client.js';

window.TAVLIVE_GIFTS_CATALOG = window.TAVLIVE_GIFTS_CATALOG || {};

export class GiftsCatalogService {
    /**
     * Synchronize TikTok Gifts Catalog from Remote Auth API.
     */
    static async fetchCatalog() {
        try {
            const url = `${AUTH_SERVER_URL}/api/gifts`;
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[GiftsCatalog] Remote fetch returned HTTP ${response.status}`);
                return window.TAVLIVE_GIFTS_CATALOG;
            }

            const data = await response.json();
            if (data && data.success && Array.isArray(data.gifts)) {
                const catalogMap = {};
                data.gifts.forEach(item => {
                    if (item.gift_id) {
                        catalogMap[String(item.gift_id)] = {
                            giftId: item.gift_id,
                            nameEn: item.name_en,
                            diamondCount: item.diamond_count || 1,
                            iconUrl: item.icon_url
                        };
                    }
                });
                window.TAVLIVE_GIFTS_CATALOG = catalogMap;
                console.info(`[GiftsCatalog] Synchronized ${data.gifts.length} official gifts from Remote Auth API.`);
            }
        } catch (err) {
            console.warn('[GiftsCatalog] Unable to sync remote gifts catalog (offline mode active):', err.message);
        }

        return window.TAVLIVE_GIFTS_CATALOG;
    }

    /**
     * Resolve incoming live gift event with catalog fallback.
     * @param {Object} giftEvent - Incoming gift event object
     * @returns {Object} { giftId, nameEn, diamondCount, iconUrl }
     */
    static resolveGift(giftEvent) {
        if (!giftEvent) return { nameEn: 'Gift', diamondCount: 1, iconUrl: '' };

        const idKey = String(giftEvent.giftId || giftEvent.gift_id || '');
        const catalog = window.TAVLIVE_GIFTS_CATALOG || {};

        if (idKey && catalog[idKey]) {
            const entry = catalog[idKey];
            return {
                giftId: entry.giftId,
                nameEn: entry.nameEn,
                diamondCount: giftEvent.diamondCount || entry.diamondCount || 1,
                iconUrl: entry.iconUrl || giftEvent.giftPictureUrl || giftEvent.iconUrl || ''
            };
        }

        // Graceful Fallback if unregistered
        return {
            giftId: giftEvent.giftId || 0,
            nameEn: giftEvent.giftName || giftEvent.name_en || 'TikTok Gift',
            diamondCount: giftEvent.diamondCount || giftEvent.repeatCount || 1,
            iconUrl: giftEvent.giftPictureUrl || giftEvent.icon_url || ''
        };
    }
}

// Auto-sync catalog on script load
GiftsCatalogService.fetchCatalog();
