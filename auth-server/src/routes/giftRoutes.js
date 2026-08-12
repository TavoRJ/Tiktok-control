const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const giftsFilePath = path.join(__dirname, '..', 'data', 'tiktok_gifts.json');

/**
 * GET /api/gifts
 * Public endpoint to fetch centralized TikTok Gifts catalog.
 * Header: Cache-Control: public, max-age=86400 (24h caching)
 */
router.get('/', (req, res) => {
    try {
        const rawData = fs.readFileSync(giftsFilePath, 'utf8');
        const giftsList = JSON.parse(rawData);

        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.json({
            success: true,
            total: giftsList.length,
            gifts: giftsList
        });
    } catch (err) {
        console.error('Error reading tiktok_gifts.json:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve TikTok gifts catalog.'
        });
    }
});

module.exports = router;
