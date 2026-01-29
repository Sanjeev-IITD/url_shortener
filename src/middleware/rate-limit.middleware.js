const { RateLimiterRedis } = require('rate-limiter-flexible');
const { logger } = require('../config/logger');
const { redisClient } = require('../config/db');

/**
 * Token Bucket Rate Limiter using rate-limiter-flexible
 * 
 * Implements Token Bucket algorithm for rate limiting:
 * - 1,000 requests per minute per IP/user
 * - Allows bursts while maintaining average rate
 * - Redis-backed for distributed rate limiting
 * 
 * @param {Object} options - Rate limiter configuration options
 * @returns {Function} Express middleware function
 */
const createTokenBucketLimiter = (options = {}) => {
  const defaultOptions = {
    storeClient: redisClient,
    keyPrefix: 'ratelimit:tokenbucket',
    points: 1000, // Number of tokens (requests allowed)
    duration: 60, // Per 60 seconds (1 minute)
    blockDuration: 60, // Block for 60 seconds if exceeded
    execEvenly: false, // Allow bursts (don't spread requests evenly)
    execEvenlyMinDelayMs: 0
  };

  const limiterOptions = { ...defaultOptions, ...options };
  const rateLimiter = new RateLimiterRedis(limiterOptions);

  return async (req, res, next) => {
    try {
      // Use user ID if authenticated, otherwise use IP address
      const key = req.user?.userId ? `user:${req.user.userId}` : req.ip;

      // Consume 1 token for this request
      const rateLimiterRes = await rateLimiter.consume(key, 1);

      // Add rate limit headers for client awareness
      res.setHeader('X-RateLimit-Limit', limiterOptions.points);
      res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());

      next();

    } catch (rejRes) {
      // Handle rate limiter errors
      if (rejRes instanceof Error) {
        logger.error('Rate limiter error:', {
          error: rejRes.message,
          stack: rejRes.stack,
          key: req.user?.userId || req.ip
        });
        // Fail open: allow request on error to prevent service disruption
        return next();
      }

      // Rate limit exceeded
      logger.warn('Rate limit exceeded', {
        key: req.user?.userId || req.ip,
        path: req.path,
        method: req.method,
        remainingPoints: rejRes.remainingPoints,
        msBeforeNext: rejRes.msBeforeNext
      });

      // Set Retry-After header (in seconds)
      res.setHeader('Retry-After', Math.ceil(rejRes.msBeforeNext / 1000));
      res.setHeader('X-RateLimit-Limit', limiterOptions.points);
      res.setHeader('X-RateLimit-Remaining', 0);

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(rejRes.msBeforeNext / 1000)
      });
    }
  };
};

/**
 * Create a custom rate limiter with specific configuration
 * 
 * @param {number} points - Number of requests allowed
 * @param {number} duration - Time window in seconds
 * @param {number} blockDuration - How long to block after exceeding limit (seconds)
 * @returns {Function} Express middleware function
 */
const createCustomRateLimiter = (points, duration, blockDuration = duration) => {
  return createTokenBucketLimiter({
    points,
    duration,
    blockDuration
  });
};

/**
 * Predefined rate limiters for common use cases
 */

// Standard API rate limiter: 1,000 requests per minute
const apiRateLimiter = createTokenBucketLimiter({
  points: 1000,
  duration: 60,
  blockDuration: 60
});

// Strict rate limiter for sensitive endpoints: 100 requests per minute
const strictRateLimiter = createTokenBucketLimiter({
  points: 100,
  duration: 60,
  blockDuration: 120 // Block for 2 minutes
});

// Lenient rate limiter for public endpoints: 5,000 requests per minute
const lenientRateLimiter = createTokenBucketLimiter({
  points: 5000,
  duration: 60,
  blockDuration: 30
});

module.exports = {
  createTokenBucketLimiter,
  createCustomRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  lenientRateLimiter
};