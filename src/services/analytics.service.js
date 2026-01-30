const { pool } = require('../config/db');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const { logger } = require('../config/logger');

class AnalyticsService {
  static async trackVisitFromRequest(shortUrl, req) {
    try {
      const urlResult = await pool.query('SELECT id FROM urls WHERE short_url = $1', [shortUrl]);
      if (!urlResult.rows.length) {
        throw {
          type: 'validation',
          message: 'Short URL not found',
          details: 'Cannot track visit for non-existent URL'
        };
      }

      const urlId = urlResult.rows[0].id;
      const ua = UAParser(req.headers['user-agent'] || '');
      const ip = req.ip || '0.0.0.0';
      const geo = geoip.lookup(ip);

      // Store in PostgreSQL only
      await pool.query(
        `INSERT INTO analytics (
          url_id, visitor_ip, user_agent, device_type, os_type, browser, country, city
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          urlId,
          ip,
          req.headers['user-agent'] || '',
          ua?.device?.type || '',
          ua?.os?.name || '',
          ua?.browser?.name || '',
          geo?.country || '',
          geo?.city || ''
        ]
      );

      // Update last accessed timestamp
      await pool.query(
        'UPDATE urls SET last_accessed = CURRENT_TIMESTAMP WHERE id = $1',
        [urlId]
      );

    } catch (error) {
      logger.error('Error tracking visit:', {
        error: error.message || error,
        shortUrl
      });
      throw error;
    }
  }

  static async getUrlAnalytics(shortUrl) {
    try {
      const analytics = await this.getAnalyticsFromPostgres(shortUrl);
      return analytics;
    } catch (error) {
      if (error.type === 'validation') {
        return this.getEmptyAnalytics();
      }
      throw error;
    }
  }

  static async getEmptyAnalytics() {
    return {
      totalClicks: 0,
      uniqueUsers: 0,
      clicksByDate: [{
        date: new Date().toISOString().split('T')[0],
        clicks: 0
      }],
      osType: [{
        osName: 'unknown',
        uniqueClicks: 0,
        uniqueUsers: 0
      }],
      deviceType: [{
        deviceName: 'unknown',
        uniqueClicks: 0,
        uniqueUsers: 0
      }]
    };
  }

  static async getAnalyticsFromPostgres(shortUrl) {
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
    return this.getTopicAnalyticsFromPostgres(topic);
  }

  static async getTopicAnalyticsFromPostgres(topic) {
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
    return this.getOverallAnalyticsFromPostgres(userId);
  }

  static async getOverallAnalyticsFromPostgres(userId) {
    const urlsResult = await pool.query(
      'SELECT id, short_url, long_url, created_at FROM urls WHERE user_id = $1',
      [userId]
    );

    const urlIds = urlsResult.rows.map(row => row.id);

    if (!urlIds.length) {
      return {
        totalUrls: 0,
        totalClicks: 0,
        uniqueLocations: 0,
        clicksOverTime: [],
        deviceTypes: { desktop: 0, mobile: 0, tablet: 0, other: 0 },
        topUrls: []
      };
    }

    // Get total clicks
    const totalClicksResult = await pool.query(
      'SELECT COUNT(*) as total FROM analytics WHERE url_id = ANY($1)',
      [urlIds]
    );

    // Get unique locations (countries)
    const uniqueLocationsResult = await pool.query(
      'SELECT COUNT(DISTINCT country) as total FROM analytics WHERE url_id = ANY($1) AND country IS NOT NULL AND country != \'\'',
      [urlIds]
    );

    // Get clicks by date (formatted for frontend as clicksOverTime with count field)
    const clicksByDateResult = await pool.query(
      `SELECT 
        TO_CHAR(DATE(visited_at), 'Mon DD') as date,
        COUNT(*) as count
      FROM analytics 
      WHERE url_id = ANY($1)
        AND visited_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(visited_at)
      ORDER BY DATE(visited_at) ASC`,
      [urlIds]
    );

    // Get device type statistics and convert to object format
    const deviceStatsResult = await pool.query(
      `SELECT 
        LOWER(COALESCE(NULLIF(device_type, ''), 'desktop')) as device,
        COUNT(*) as count
      FROM analytics 
      WHERE url_id = ANY($1)
      GROUP BY LOWER(COALESCE(NULLIF(device_type, ''), 'desktop'))`,
      [urlIds]
    );

    // Convert device stats array to object
    const deviceTypes = { desktop: 0, mobile: 0, tablet: 0, other: 0 };
    deviceStatsResult.rows.forEach(row => {
      const device = row.device.toLowerCase();
      if (device === 'desktop' || device === '') {
        deviceTypes.desktop += parseInt(row.count);
      } else if (device === 'mobile') {
        deviceTypes.mobile += parseInt(row.count);
      } else if (device === 'tablet') {
        deviceTypes.tablet += parseInt(row.count);
      } else {
        deviceTypes.other += parseInt(row.count);
      }
    });

    // Get top 5 URLs with clicks count
    const topUrlsResult = await pool.query(
      `SELECT 
        u.short_url as alias,
        u.long_url as "originalUrl",
        u.created_at as "createdAt",
        COUNT(a.id) as clicks
      FROM urls u
      LEFT JOIN analytics a ON u.id = a.url_id
      WHERE u.user_id = $1
      GROUP BY u.id, u.short_url, u.long_url, u.created_at
      ORDER BY clicks DESC
      LIMIT 5`,
      [userId]
    );

    return {
      totalUrls: urlIds.length,
      totalClicks: parseInt(totalClicksResult.rows[0].total),
      uniqueLocations: parseInt(uniqueLocationsResult.rows[0].total) || 0,
      clicksOverTime: clicksByDateResult.rows.map(r => ({ date: r.date, count: parseInt(r.count) })),
      deviceTypes: deviceTypes,
      topUrls: topUrlsResult.rows.map(r => ({
        alias: r.alias,
        originalUrl: r.originalUrl,
        createdAt: r.createdAt,
        clicks: parseInt(r.clicks)
      }))
    };
  }
}

module.exports = AnalyticsService;
