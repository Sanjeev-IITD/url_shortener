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
router.get('/logout', async (req, res) => {
  try {
    // Try to get the token from Authorization header or session
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // If no token in header, try session
    if (!token && req.session && req.session.authData && req.session.authData.accessToken) {
      token = req.session.authData.accessToken;
    }

    // Only blacklist if we have a token and a user ID
    const userId = req.user?.userId ||
      req.session?.authData?.user?.id ||
      (req.user?.google_id);

    if (token && userId) {
      try {
        await TokenService.blacklistToken(token, userId);
      } catch (blacklistError) {
        // Log but don't fail the logout if token blacklisting fails
        logger.warn('Could not blacklist token:', { error: blacklistError.message });
      }
    }

    // Clear the session - this is the most important part for session-based auth
    if (req.session) {
      // Clear session data first
      req.session.authData = null;
      req.session.passport = null;

      // Then destroy the session
      req.session.destroy((err) => {
        if (err) {
          logger.error('Error destroying session:', err);
        }
      });
    }

    // Clear the session cookie
    res.clearCookie('connect.sid', { path: '/' });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', {
      error: error.message,
      stack: error.stack
    });

    // Still try to clear session on error
    if (req.session) {
      req.session.destroy(() => { });
    }
    res.clearCookie('connect.sid', { path: '/' });

    // Return success anyway - user should be logged out
    res.json({ message: 'Logged out' });
  }
});

module.exports = router; 