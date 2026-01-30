const express = require('express');
const passport = require('passport');
const router = express.Router();
const { AuthService } = require('../services/auth.service');
const { logger } = require('../config/logger');
const { TokenService } = require('../services/token.service');
const { authenticateToken } = require('../middleware/auth.middleware');

// Google OAuth login route
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: Date.now().toString()
  })
);

// Google OAuth callback route
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=auth_failed' }),
  async (req, res) => {
    try {
      logger.info('Google callback received:', {
        user: req.user ? 'present' : 'missing',
        session: req.session ? 'present' : 'missing'
      });

      if (!req.user) {
        throw new Error('No user data received from Google authentication');
      }

      const { user, accessToken, refreshToken } = await AuthService.handleGoogleLogin(req.user);

      // Store auth data in session for later use
      req.session.authData = {
        authenticated: true,
        accessToken,
        refreshToken,
        user: {
          id: user.google_id,
          email: user.email,
          name: user.name,
          avatar: user.avatar
        }
      };

      // Redirect to frontend after successful login
      res.redirect('/');
    } catch (error) {
      logger.error('Authentication error:', {
        error: error.message,
        stack: error.stack,
        user: req.user
      });

      res.redirect('/?error=auth_failed');
    }
  }
);

// New endpoint to get stored auth data
router.get('/current-auth', (req, res) => {
  // Check session auth data first
  if (req.session && req.session.authData) {
    return res.json(req.session.authData);
  }

  // Check passport session (req.user)
  if (req.user) {
    return res.json({
      authenticated: true,
      user: {
        id: req.user.google_id,
        email: req.user.email,
        name: req.user.name,
        avatar: req.user.avatar
      }
    });
  }

  // Not authenticated
  res.json({
    authenticated: false,
    message: 'Please login first'
  });
});

// Logout route
router.get('/logout', authenticateToken, async (req, res) => {
  try {
    // Get the token from the authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Blacklist the current token
    await TokenService.blacklistToken(token, req.user.userId);

    // Clear the session if it exists
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Error destroying session:', err);
        }
      });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Logout Error',
      message: error.message || 'Failed to logout'
    });
  }
});

module.exports = router; 