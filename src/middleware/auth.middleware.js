const jwt = require('jsonwebtoken');
const { TokenService } = require('../services/token.service');
const { logger } = require('../config/logger');

const authenticateToken = async (req, res, next) => {
  // First, check if user is authenticated via Passport session (req.user)
  // This takes priority as it's the most reliable session-based auth
  if (req.user && req.user.google_id) {
    req.user = {
      userId: req.user.google_id,
      email: req.user.email,
      name: req.user.name,
      avatar: req.user.avatar
    };
    return next();
  }

  // Try to get token from Authorization header
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // If no token in header, try to get from session
  if (!token && req.session && req.session.authData && req.session.authData.accessToken) {
    token = req.session.authData.accessToken;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Check if token is blacklisted
    const isBlacklisted = await TokenService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Please login again' });
    }

    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      avatar: decoded.avatar
    };
    next();
  } catch (err) {
    // If JWT verification fails (expired or invalid), 
    // check if we have session authData with user info as fallback
    if (req.session && req.session.authData && req.session.authData.user) {
      logger.info('JWT expired, falling back to session user data');
      req.user = {
        userId: req.session.authData.user.id,
        email: req.session.authData.user.email,
        name: req.session.authData.user.name,
        avatar: req.session.authData.user.avatar
      };
      return next();
    }

    logger.warn('Token verification failed:', { error: err.message });
    return res.status(403).json({ error: 'Invalid or expired token. Please login again.' });
  }
};

module.exports = { authenticateToken }; 