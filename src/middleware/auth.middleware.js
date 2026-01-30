const jwt = require('jsonwebtoken');
const { TokenService } = require('../services/token.service');

const authenticateToken = async (req, res, next) => {
  // First, try to get token from Authorization header
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // If no token in header, try to get from session
  if (!token && req.session && req.session.authData && req.session.authData.accessToken) {
    token = req.session.authData.accessToken;
  }

  // If still no token, check if user is in passport session
  if (!token && req.user) {
    // User is authenticated via passport session
    req.user = {
      userId: req.user.google_id,
      email: req.user.email,
      name: req.user.name,
      avatar: req.user.avatar
    };
    return next();
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
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authenticateToken }; 