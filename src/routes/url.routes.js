const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const UrlService = require('../services/url.service');
const AnalyticsService = require('../services/analytics.service');

// Import our Token Bucket rate limiter middleware
const { apiRateLimiter } = require('../middleware/rate-limit.middleware');

// Use the Token Bucket rate limiter for URL creation
const createUrlLimiter = apiRateLimiter;


// Create short URL
// Note: Put authenticateToken before the rate limiter so user ID is available
router.post('/', authenticateToken, createUrlLimiter, async (req, res, next) => {
  try {
    const { longUrl, customAlias, topic } = req.body;

    if (!longUrl) {
      return res.status(400).json({ error: 'Long URL is required' });
    }

    const url = await UrlService.createShortUrl(req.user.userId, longUrl, customAlias, topic);

    // Use PROD_URL if set, otherwise fall back to BASE_URL
    const baseUrl = process.env.PROD_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    res.json({
      shortUrl: `${baseUrl}/api/shorten/${url.shortUrl}`,
      createdAt: url.created_at
    });
  } catch (err) {
    next(err);
  }
});

// Redirect to long URL
router.get('/:shortUrl', async (req, res, next) => {
  try {
    const { shortUrl } = req.params;
    const longUrl = await UrlService.getLongUrl(shortUrl);

    // Track the visit using AnalyticsService instead of UrlService
    await AnalyticsService.trackVisitFromRequest(shortUrl, req);

    res.redirect(longUrl);
  } catch (err) {
    next(err);
  }
});

module.exports = router; 