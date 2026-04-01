// server/api/auth.js
const express = require('express');
const router = express.Router();
const OAuthManager = require('../social/oauth-manager');
const crypto = require('crypto');

const oauthManager = new OAuthManager();

// Store pending connections (state -> { userId, platform, timestamp })
const pendingConnections = new Map();

// ============ INITIATE OAUTH CONNECTION ============

// Get YouTube OAuth URL
router.get('/youtube/connect', (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const state = crypto.randomBytes(16).toString('hex');

    pendingConnections.set(state, {
      userId,
      platform: 'youtube',
      timestamp: Date.now()
    });

    const authUrl = oauthManager.getYouTubeAuthUrl(state);
    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('Error getting YouTube auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate YouTube connection'
    });
  }
});

// Get Instagram OAuth URL
router.get('/instagram/connect', (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const state = crypto.randomBytes(16).toString('hex');

    pendingConnections.set(state, {
      userId,
      platform: 'instagram',
      timestamp: Date.now()
    });

    const authUrl = oauthManager.getInstagramAuthUrl(state);
    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('Error getting Instagram auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Instagram connection'
    });
  }
});

// Get TikTok OAuth URL
router.get('/tiktok/connect', (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const state = crypto.randomBytes(16).toString('hex');

    pendingConnections.set(state, {
      userId,
      platform: 'tiktok',
      timestamp: Date.now()
    });

    const authUrl = oauthManager.getTikTokAuthUrl(state);
    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('Error getting TikTok auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate TikTok connection'
    });
  }
});

// ============ OAUTH CALLBACKS ============

// YouTube OAuth Callback
router.get('/youtube/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).json({
        success: false,
        error: `Authorization denied: ${error}`
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code not provided'
      });
    }

    // Exchange code for token
    const tokens = await oauthManager.exchangeYouTubeCode(code);

    // Store token
    const connectionData = pendingConnections.get(state);
    const userId = connectionData?.userId || 'default';

    await oauthManager.storeToken(userId, 'youtube', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope
    });

    // Clean up pending connection
    pendingConnections.delete(state);

    // Redirect to success page or frontend
    res.redirect('/auth-success?platform=youtube');
  } catch (error) {
    console.error('YouTube OAuth callback error:', error);
    res.redirect('/auth-error?platform=youtube&message=' + encodeURIComponent(error.message));
  }
});

// Instagram OAuth Callback
router.get('/instagram/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).json({
        success: false,
        error: `Authorization denied: ${error}`
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code not provided'
      });
    }

    // Exchange code for token
    const tokens = await oauthManager.exchangeInstagramCode(code);

    // Store token
    const connectionData = pendingConnections.get(state);
    const userId = connectionData?.userId || 'default';

    await oauthManager.storeToken(userId, 'instagram', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || tokens.access_token,
      expiry_date: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      scope: tokens.scope
    });

    pendingConnections.delete(state);
    res.redirect('/auth-success?platform=instagram');
  } catch (error) {
    console.error('Instagram OAuth callback error:', error);
    res.redirect('/auth-error?platform=instagram&message=' + encodeURIComponent(error.message));
  }
});

// TikTok OAuth Callback
router.get('/tiktok/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).json({
        success: false,
        error: `Authorization denied: ${error}`
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code not provided'
      });
    }

    // Exchange code for token
    const tokens = await oauthManager.exchangeTikTokCode(code);

    // Store token
    const connectionData = pendingConnections.get(state);
    const userId = connectionData?.userId || 'default';

    await oauthManager.storeToken(userId, 'tiktok', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      scope: tokens.scope
    });

    pendingConnections.delete(state);
    res.redirect('/auth-success?platform=tiktok');
  } catch (error) {
    console.error('TikTok OAuth callback error:', error);
    res.redirect('/auth-error?platform=tiktok&message=' + encodeURIComponent(error.message));
  }
});

// ============ MANAGE CONNECTIONS ============

// Get connected platforms for a user
router.get('/platforms/connected', async (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const platforms = await oauthManager.getConnectedPlatforms(userId);

    res.json({
      success: true,
      platforms
    });
  } catch (error) {
    console.error('Error getting connected platforms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connected platforms'
    });
  }
});

// Disconnect a platform
router.post('/:platform/disconnect', async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.body.userId || 'default';

    const success = await oauthManager.disconnectPlatform(userId, platform);

    if (success) {
      res.json({
        success: true,
        message: `${platform} disconnected successfully`
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to disconnect platform'
      });
    }
  } catch (error) {
    console.error('Error disconnecting platform:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect platform'
    });
  }
});

// Clean up expired pending connections (run every hour)
setInterval(() => {
  const now = Date.now();
  const expiryTime = 10 * 60 * 1000; // 10 minutes

  for (const [state, data] of pendingConnections.entries()) {
    if (now - data.timestamp > expiryTime) {
      pendingConnections.delete(state);
    }
  }
}, 60 * 60 * 1000);

module.exports = router;
