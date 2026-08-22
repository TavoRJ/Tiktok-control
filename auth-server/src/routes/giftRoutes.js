const express = require('express');
const router = express.Router();

const SUPABASE_CATALOG_URL = 'https://ggoivnqsvztcbzayzxds.supabase.co/storage/v1/object/public/tiktok-gifts/gifts_catalog.json';
let cachedGifts = null;
let lastGiftsFetch = 0;

async function getOrFetchCatalog() {
    const now = Date.now();
    // Reutilizar de memoria RAM si pasaron menos de 60 minutos
    if (cachedGifts && (now - lastGiftsFetch < 3600000)) {
        return cachedGifts;
    }

    const response = await fetch(SUPABASE_CATALOG_URL);
    if (!response.ok) throw new Error('No se pudo descargar el catálogo desde Supabase');

    cachedGifts = await response.json();
    lastGiftsFetch = now;
    return cachedGifts;
}

// GET /api/gifts y GET /api/gifts/catalog
router.get(['/', '/catalog'], async (req, res) => {
    try {
        const gifts = await getOrFetchCatalog();
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.json({
            success: true,
            total: gifts.length,
            gifts: gifts
        });
    } catch (err) {
        console.error('[Error Catálogo Gifts]:', err.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve TikTok gifts catalog.'
        });
    }
});

module.exports = router;
