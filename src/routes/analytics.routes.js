const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
// Replace UrlService with AnalyticsService
const AnalyticsService = require('../services/analytics.service');

// Import our Token Bucket rate limiter middleware
const { apiRateLimiter } = require('../middleware/rate-limit.middleware');

// Use the Token Bucket rate limiter for analytics
const analyticsLimiter = apiRateLimiter;

// Get overall analytics - This must come before /:alias route
// Note: Put authenticateToken before the rate limiter so user ID is available
router.get('/overall', authenticateToken, analyticsLimiter, async (req, res, next) => {
  try {
    const analytics = await AnalyticsService.getOverallAnalytics(req.user.userId);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
});

// Get topic-based analytics - This must come before /:alias route
// Note: Put authenticateToken before the rate limiter so user ID is available
router.get('/topic/:topic', authenticateToken, analyticsLimiter, async (req, res, next) => {
  try {
    const { topic } = req.params;
    const analytics = await AnalyticsService.getTopicAnalytics(topic);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
});

// Get URL analytics
// Note: Put authenticateToken before the rate limiter so user ID is available
router.get('/:alias', authenticateToken, analyticsLimiter, async (req, res, next) => {
  try {
    const { alias } = req.params;
    const analytics = await AnalyticsService.getUrlAnalytics(alias);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
});

module.exports = router; 