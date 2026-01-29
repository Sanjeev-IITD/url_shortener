const base62 = require('./base62.helper');
const { pool, redisClient, connectRedis } = require('../config/db');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const { logger } = require('../config/logger');

class UrlService {
  /**
   * Create a short URL using Base62 bijective encoding
   * Implements Write-Through caching: PostgreSQL → Redis → Response
   * 
   * @param {string} userId - User's Google ID
   * @param {string} longUrl - Original long URL
   * @param {string} customAlias - Optional custom short URL alias
   * @param {string} topic - Optional topic/category
   * @returns {Object} Created URL object
   */
  static async createShortUrl(userId, longUrl, customAlias, topic) {
    try {
      // Ensure Redis is connected
      if (!redisClient.isReady) {
        await connectRedis();
      }

      let shortUrl;
      let urlId;
      let createdAt;

      if (customAlias) {
        // Check if custom alias already exists
        const existing = await pool.query(
          'SELECT id FROM urls WHERE short_url = $1',
          [customAlias]
        );

        if (existing.rows.length) {
          throw {
            type: 'validation',
            message: 'Custom alias already taken',
            details: 'Please choose a different custom alias'
          };
        }

        shortUrl = customAlias;

        // Insert with custom alias directly
        const result = await pool.query(
          'INSERT INTO urls (user_id, long_url, short_url, topic) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
          [userId, longUrl, shortUrl, topic]
        );

        urlId = result.rows[0].id;
        createdAt = result.rows[0].created_at;

      } else {
        // STEP A: Insert to PostgreSQL to get auto-incrementing ID
        const result = await pool.query(
          'INSERT INTO urls (user_id, long_url, topic) VALUES ($1, $2, $3) RETURNING id, created_at',
          [userId, longUrl, topic]
        );

        urlId = result.rows[0].id;
        createdAt = result.rows[0].created_at;

        // STEP B: Encode the numeric ID to Base62
        shortUrl = base62.encode(urlId);

        // STEP C: Update the record with the Base62 short_url
        await pool.query(
          'UPDATE urls SET short_url = $1 WHERE id = $2',
          [shortUrl, urlId]
        );
      }

      // WRITE-THROUGH: Write to Redis synchronously before returning
      const urlData = {
        longUrl,
        shortUrl,
        userId,
        topic: topic || '',
        createdAt: createdAt.getTime().toString(),
        status: 'active'
      };

      // Store in Redis with expiration
      await redisClient.hSet(`url:${shortUrl}`, urlData);
      await redisClient.expire(`url:${shortUrl}`, 24 * 60 * 60); // 24 hours TTL

      logger.info('URL created with write-through caching', {
        shortUrl,
        urlId,
        userId,
        encoding: customAlias ? 'custom' : 'base62'
      });

      return {
        id: urlId,
        shortUrl,
        longUrl,
        topic,
        createdAt
      };

    } catch (error) {
      if (error.type === 'validation') {
        throw error;
      }

      logger.error('Error in createShortUrl:', {
        error: error.message,
        stack: error.stack,
        userId,
        customAlias
      });

      throw {
        type: 'system',
        message: 'Failed to create short URL',
        details: 'An error occurred while creating the short URL'
      };
    }
  }


  static async syncUrlToPostgres(shortUrl) {
    const urlData = await redisClient.hGetAll(`url:${shortUrl}`);

    // Insert into PostgreSQL
    await pool.query(
      'INSERT INTO urls (user_id, long_url, short_url, topic, created_at) VALUES ($1, $2, $3, $4, $5)',
      [urlData.userId, urlData.longUrl, urlData.shortUrl, urlData.topic, new Date(parseInt(urlData.createdAt))]
    );

    // Update Redis status
    await redisClient.hSet(`url:${shortUrl}`, 'status', 'synced');
    await redisClient.sRem('pending_urls', shortUrl);
  }

  // static async getLongUrl(shortUrl) {
  //   // Try cache first
  //   let longUrl = await redisClient.get(`url:${shortUrl}`);

  //   if (!longUrl) {
  //     const result = await pool.query('SELECT long_url FROM urls WHERE short_url = $1', [shortUrl]);
  //     if (!result.rows.length) {
  //       throw { 
  //         type: 'validation', 
  //         message: 'Short URL not found',
  //         details: 'The specified short URL does not exist'
  //       };
  //     }
  //     longUrl = result.rows[0].long_url;

  //     // Cache the result
  //     await redisClient.set(`url:${shortUrl}`, longUrl, {
  //       EX: 24 * 60 * 60 // 24 hours
  //     });
  //   }

  //   return longUrl;
  // }

  static async getLongUrl(shortUrl) {
    try {
      // Ensure Redis is connected
      if (!redisClient.isReady) {
        await connectRedis();
      }

      // Try Redis hash first (new data structure)
      const urlData = await redisClient.hGetAll(`url:${shortUrl}`);
      if (urlData && urlData.longUrl) {
        // Update access timestamp
        await redisClient.hSet(`url:${shortUrl}`, 'lastAccessed', Date.now().toString());
        return urlData.longUrl;
      }

      // Try legacy Redis key (for backward compatibility)
      const legacyUrl = await redisClient.get(`url:${shortUrl}`);
      if (legacyUrl) {
        // Migrate to new data structure in background
        this.migrateToNewStructure(shortUrl, legacyUrl).catch(err =>
          logger.error('Failed to migrate URL to new structure:', {
            error: err,
            shortUrl
          })
        );
        return legacyUrl;
      }

      // If not in Redis, try PostgreSQL
      const result = await pool.query(
        'SELECT long_url, last_accessed FROM urls WHERE short_url = $1',
        [shortUrl]
      );

      if (!result.rows.length) {
        throw {
          type: 'validation',
          message: 'Short URL not found',
          details: 'The specified short URL does not exist'
        };
      }

      const { long_url, last_accessed } = result.rows[0];

      // Cache in Redis with full data structure
      const newUrlData = {
        longUrl: long_url,
        shortUrl,
        lastAccessed: Date.now().toString(),
        createdAt: last_accessed?.toISOString() || new Date().toISOString()
      };

      try {
        // Ensure Redis is connected
        if (!redisClient.isReady) {
          await connectRedis();
        }

        // Store in Redis with multi for transaction-like behavior
        const multi = redisClient.multi();
        // Convert object to individual field-value pairs
        for (const [field, value] of Object.entries(newUrlData)) {
          multi.hSet(`url:${shortUrl}`, field, value);
        }
        multi.expire(`url:${shortUrl}`, 24 * 60 * 60); // 24 hours TTL

        await multi.exec();
      } catch (redisError) {
        logger.warn('Failed to cache URL in Redis:', {
          error: redisError,
          shortUrl
        });
        // Continue since we still have the URL from PostgreSQL
      }

      return long_url;

    } catch (error) {
      if (error.type === 'validation') {
        throw error;
      }
      logger.error('Error in getLongUrl:', {
        error,
        shortUrl
      });
      throw {
        type: 'system',
        message: 'Failed to retrieve URL',
        details: 'An error occurred while retrieving the URL'
      };
    }
  }

  // Helper method to migrate from old to new Redis structure
  static async migrateToNewStructure(shortUrl, longUrl) {
    const urlData = {
      longUrl,
      shortUrl,
      lastAccessed: Date.now().toString(),
      createdAt: Date.now().toString()
    };

    const pipeline = redisClient.pipeline();
    pipeline.hSet(`url:${shortUrl}`, urlData);
    pipeline.expire(`url:${shortUrl}`, 24 * 60 * 60);
    pipeline.del(`url:${shortUrl}`); // Remove old key
    await pipeline.exec();
  }

  static async trackVisit(shortUrl, req) {
    const urlResult = await pool.query('SELECT id FROM urls WHERE short_url = $1', [shortUrl]);
    if (!urlResult.rows.length) {
      throw {
        type: 'validation',
        message: 'Short URL not found',
        details: 'Cannot track visit for non-existent URL'
      };
    }

    const urlId = urlResult.rows[0].id;
    const ua = UAParser(req.headers['user-agent']);
    const ip = req.ip;
    const geo = geoip.lookup(ip);

    await pool.query(
      `INSERT INTO analytics (
        url_id, visitor_ip, user_agent, device_type, os_type, browser, country, city
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        urlId,
        ip,
        req.headers['user-agent'],
        ua.device.type || 'desktop',
        ua.os.name,
        ua.browser.name,
        geo?.country,
        geo?.city
      ]
    );

    // Update last accessed timestamp
    await pool.query(
      'UPDATE urls SET last_accessed = CURRENT_TIMESTAMP WHERE id = $1',
      [urlId]
    );
  }

  static async getUrlAnalytics(shortUrl) {
    const urlResult = await pool.query('SELECT id FROM urls WHERE short_url = $1', [shortUrl]);
    if (!urlResult.rows.length) {
      throw {
        type: 'validation',
        message: 'URL not found',
        details: 'Cannot retrieve analytics for non-existent URL'
      };
    }

    const urlId = urlResult.rows[0].id;

    // Get total clicks
    const totalClicksResult = await pool.query(
      'SELECT COUNT(*) as total FROM analytics WHERE url_id = $1',
      [urlId]
    );

    // Get unique users (by IP)
    const uniqueUsersResult = await pool.query(
      'SELECT COUNT(DISTINCT visitor_ip) as total FROM analytics WHERE url_id = $1',
      [urlId]
    );

    // Get clicks by date (last 7 days)
    const clicksByDateResult = await pool.query(
      `SELECT 
        DATE(visited_at) as date,
        COUNT(*) as clicks
      FROM analytics 
      WHERE url_id = $1 
        AND visited_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(visited_at)
      ORDER BY date DESC`,
      [urlId]
    );

    // Get OS statistics
    const osStatsResult = await pool.query(
      `SELECT 
        os_type as "osName",
        COUNT(*) as "uniqueClicks",
        COUNT(DISTINCT visitor_ip) as "uniqueUsers"
      FROM analytics 
      WHERE url_id = $1 
      GROUP BY os_type`,
      [urlId]
    );

    // Get device type statistics
    const deviceStatsResult = await pool.query(
      `SELECT 
        device_type as "deviceName",
        COUNT(*) as "uniqueClicks",
        COUNT(DISTINCT visitor_ip) as "uniqueUsers"
      FROM analytics 
      WHERE url_id = $1 
      GROUP BY device_type`,
      [urlId]
    );

    return {
      totalClicks: parseInt(totalClicksResult.rows[0].total),
      uniqueUsers: parseInt(uniqueUsersResult.rows[0].total),
      clicksByDate: clicksByDateResult.rows,
      osType: osStatsResult.rows,
      deviceType: deviceStatsResult.rows
    };
  }

  static async getTopicAnalytics(topic) {
    if (!topic) {
      throw {
        type: 'validation',
        message: 'Topic is required',
        details: 'Please provide a valid topic to retrieve analytics'
      };
    }

    // Get all URLs for the topic
    const urlsResult = await pool.query(
      `SELECT id, short_url as "shortUrl"
      FROM urls 
      WHERE topic = $1`,
      [topic]
    );

    const urlIds = urlsResult.rows.map(row => row.id);

    if (!urlIds.length) {
      return {
        totalClicks: 0,
        uniqueUsers: 0,
        clicksByDate: [],
        urls: []
      };
    }

    // Get total clicks for the topic
    const totalClicksResult = await pool.query(
      'SELECT COUNT(*) as total FROM analytics WHERE url_id = ANY($1)',
      [urlIds]
    );

    // Get unique users for the topic
    const uniqueUsersResult = await pool.query(
      'SELECT COUNT(DISTINCT visitor_ip) as total FROM analytics WHERE url_id = ANY($1)',
      [urlIds]
    );

    // Get clicks by date for the topic
    const clicksByDateResult = await pool.query(
      `SELECT 
        DATE(visited_at) as date,
        COUNT(*) as clicks
      FROM analytics 
      WHERE url_id = ANY($1)
        AND visited_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(visited_at)
      ORDER BY date DESC`,
      [urlIds]
    );

    // Get per-URL statistics
    const urlStatsPromises = urlsResult.rows.map(async (url) => {
      const stats = await pool.query(
        `SELECT 
          COUNT(*) as "totalClicks",
          COUNT(DISTINCT visitor_ip) as "uniqueUsers"
        FROM analytics 
        WHERE url_id = $1`,
        [url.id]
      );
      return {
        shortUrl: url.shortUrl,
        totalClicks: parseInt(stats.rows[0].totalClicks),
        uniqueUsers: parseInt(stats.rows[0].uniqueUsers)
      };
    });

    const urlStats = await Promise.all(urlStatsPromises);

    return {
      totalClicks: parseInt(totalClicksResult.rows[0].total),
      uniqueUsers: parseInt(uniqueUsersResult.rows[0].total),
      clicksByDate: clicksByDateResult.rows,
      urls: urlStats
    };
  }

  static async getOverallAnalytics(userId) {
    // Get all URLs for the user using google_id directly
    const urlsResult = await pool.query(
      'SELECT id FROM urls WHERE user_id = $1',
      [userId]
    );

    const urlIds = urlsResult.rows.map(row => row.id);

    if (!urlIds.length) {
      return {
        totalUrls: 0,
        totalClicks: 0,
        uniqueUsers: 0,
        clicksByDate: [],
        osType: [],
        deviceType: []
      };
    }

    // Get total clicks
    const totalClicksResult = await pool.query(
      'SELECT COUNT(*) as total FROM analytics WHERE url_id = ANY($1)',
      [urlIds]
    );

    // Get unique users
    const uniqueUsersResult = await pool.query(
      'SELECT COUNT(DISTINCT visitor_ip) as total FROM analytics WHERE url_id = ANY($1)',
      [urlIds]
    );

    // Get clicks by date
    const clicksByDateResult = await pool.query(
      `SELECT 
        DATE(visited_at) as date,
        COUNT(*) as clicks
      FROM analytics 
      WHERE url_id = ANY($1)
        AND visited_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(visited_at)
      ORDER BY date DESC`,
      [urlIds]
    );

    // Get OS statistics
    const osStatsResult = await pool.query(
      `SELECT 
        os_type as "osName",
        COUNT(*) as "uniqueClicks",
        COUNT(DISTINCT visitor_ip) as "uniqueUsers"
      FROM analytics 
      WHERE url_id = ANY($1)
      GROUP BY os_type`,
      [urlIds]
    );

    // Get device type statistics
    const deviceStatsResult = await pool.query(
      `SELECT 
        device_type as "deviceName",
        COUNT(*) as "uniqueClicks",
        COUNT(DISTINCT visitor_ip) as "uniqueUsers"
      FROM analytics 
      WHERE url_id = ANY($1)
      GROUP BY device_type`,
      [urlIds]
    );

    return {
      totalUrls: urlIds.length,
      totalClicks: parseInt(totalClicksResult.rows[0].total),
      uniqueUsers: parseInt(uniqueUsersResult.rows[0].total),
      clicksByDate: clicksByDateResult.rows,
      osType: osStatsResult.rows,
      deviceType: deviceStatsResult.rows
    };
  }
}

module.exports = UrlService; 
