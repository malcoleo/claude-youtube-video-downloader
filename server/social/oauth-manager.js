// server/social/oauth-manager.js
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────
// Atomic Secret File Write (owner-only permissions)
// Inspired by rushindrasinha/youtube-shorts-pipeline config.py
// ─────────────────────────────────────────────────────
/**
 * Write a file with 0600 permissions (owner read/write only).
 * Uses fs.open() with explicit mode to avoid TOCTOU race where file
 * briefly exists with default (world-readable) permissions.
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 */
function writeSecretFile(filePath, content) {
  const dir = path.dirname(filePath);
  // Ensure directory exists with restrictive permissions
  try {
    fsSync.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (e) {
    // Ignore if already exists
  }

  // Open with owner-only read/write permissions (0600)
  const fd = fsSync.openSync(filePath, 'w', 0o600);
  try {
    fsSync.writeSync(fd, content);
  } finally {
    fsSync.closeSync(fd);
  }
}

class OAuthManager {
  constructor() {
    this.tokensDir = path.join(__dirname, '../../data/oauth-tokens');
    this.ensureTokensDir();

    // YouTube OAuth config
    this.youtubeOAuth = {
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5001/api/auth/youtube/callback',
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube']
    };

    // Instagram/Facebook OAuth config
    this.instagramOAuth = {
      clientId: process.env.INSTAGRAM_CLIENT_ID,
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
      redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:5001/api/auth/instagram/callback',
      scopes: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement']
    };

    // TikTok OAuth config
    this.tiktokOAuth = {
      clientId: process.env.TIKTOK_CLIENT_ID,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
      redirectUri: process.env.TIKTOK_REDIRECT_URI || 'http://localhost:5001/api/auth/tiktok/callback',
      scopes: ['video.upload', 'video.publish']
    };
  }

  async ensureTokensDir() {
    try {
      await fs.mkdir(this.tokensDir, { recursive: true });
    } catch (error) {
      console.error('Error creating tokens directory:', error);
    }
  }

  // Encrypt token for secure storage
  encryptToken(token) {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required for token storage');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);

    let encrypted = cipher.update(JSON.stringify(token), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag
    };
  }

  // Decrypt token from storage
  decryptToken(encryptedData) {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required for token decryption');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'hex'),
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  // Store OAuth token for a user
  async storeToken(userId, platform, tokenData) {
    const tokenPath = path.join(this.tokensDir, `${userId}_${platform}.json`);

    const encryptedToken = this.encryptToken({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiryDate: tokenData.expiry_date,
      scope: tokenData.scope
    });

    // Use atomic write with 0600 permissions for security
    writeSecretFile(tokenPath, JSON.stringify({
      platform,
      userId,
      token: encryptedToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, null, 2));

    return true;
  }

  // Get stored token for a user
  async getToken(userId, platform) {
    const tokenPath = path.join(this.tokensDir, `${userId}_${platform}.json`);

    try {
      const tokenData = await fs.readFile(tokenPath, 'utf8');
      const parsed = JSON.parse(tokenData);
      const decrypted = this.decryptToken(parsed.token);

      // Check if token is expired
      if (decrypted.expiryDate && new Date(decrypted.expiryDate) < new Date()) {
        // Token expired, try to refresh
        const refreshed = await this.refreshToken(userId, platform, decrypted.refreshToken);
        return refreshed;
      }

      return {
        platform,
        accessToken: decrypted.accessToken,
        refreshToken: decrypted.refreshToken,
        expiryDate: decrypted.expiryDate,
        scope: decrypted.scope
      };
    } catch (error) {
      console.error('Error reading token:', error);
      return null;
    }
  }

  // Refresh expired token
  async refreshToken(userId, platform, refreshToken) {
    try {
      let newTokenData;

      if (platform === 'youtube') {
        const oauth2Client = new google.auth.OAuth2(
          this.youtubeOAuth.clientId,
          this.youtubeOAuth.clientSecret,
          this.youtubeOAuth.redirectUri
        );

        const { credentials } = await oauth2Client.refreshToken(refreshToken);
        newTokenData = credentials;
      } else if (platform === 'instagram') {
        const response = await axios.post('https://graph.facebook.com/oauth/access_token', null, {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: this.instagramOAuth.clientId,
            client_secret: this.instagramOAuth.clientSecret,
            fb_exchange_token: refreshToken
          }
        });
        newTokenData = response.data;
      } else if (platform === 'tiktok') {
        const response = await axios.post('https://open-api.tiktok.com/oauth/refresh_token/', null, {
          params: {
            client_key: this.tiktokOAuth.clientId,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          }
        });
        newTokenData = response.data;
      }

      if (newTokenData) {
        await this.storeToken(userId, platform, {
          access_token: newTokenData.access_token,
          refresh_token: newTokenData.refresh_token || refreshToken,
          expiry_date: newTokenData.expires_in
            ? new Date(Date.now() + newTokenData.expires_in * 1000).toISOString()
            : null,
          scope: newTokenData.scope
        });

        return {
          platform,
          accessToken: newTokenData.access_token,
          refreshToken: newTokenData.refresh_token || refreshToken,
          expiryDate: newTokenData.expires_in
            ? new Date(Date.now() + newTokenData.expires_in * 1000).toISOString()
            : null
        };
      }
    } catch (error) {
      console.error('Error refreshing token:', error.response?.data || error.message);
      throw new Error(`Failed to refresh ${platform} token`);
    }
  }

  // Disconnect platform (delete token)
  async disconnectPlatform(userId, platform) {
    const tokenPath = path.join(this.tokensDir, `${userId}_${platform}.json`);

    try {
      await fs.unlink(tokenPath);
      return true;
    } catch (error) {
      console.error('Error disconnecting platform:', error);
      return false;
    }
  }

  // Get all connected platforms for a user
  async getConnectedPlatforms(userId) {
    try {
      const files = await fs.readdir(this.tokensDir);
      const platforms = [];

      for (const file of files) {
        if (file.startsWith(`${userId}_`) && file.endsWith('.json')) {
          const platform = file.replace(`${userId}_`, '').replace('.json', '');
          const tokenData = await this.getToken(userId, platform);

          if (tokenData) {
            platforms.push({
              platform,
              connectedAt: tokenData.createdAt,
              scopes: tokenData.scope?.split(' ') || []
            });
          }
        }
      }

      return platforms;
    } catch (error) {
      console.error('Error getting connected platforms:', error);
      return [];
    }
  }

  // Get YouTube OAuth URL
  getYouTubeAuthUrl() {
    const oauth2Client = new google.auth.OAuth2(
      this.youtubeOAuth.clientId,
      this.youtubeOAuth.clientSecret,
      this.youtubeOAuth.redirectUri
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: this.youtubeOAuth.scopes
    });
  }

  // Get Instagram OAuth URL
  getInstagramAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: this.instagramOAuth.clientId,
      redirect_uri: this.instagramOAuth.redirectUri,
      scope: this.instagramOAuth.scopes.join(','),
      response_type: 'code',
      state
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  // Get TikTok OAuth URL
  getTikTokAuthUrl(state) {
    const params = new URLSearchParams({
      client_key: this.tiktokOAuth.clientId,
      redirect_uri: this.tiktokOAuth.redirectUri,
      scope: this.tiktokOAuth.scopes.join(','),
      response_type: 'code',
      state
    });

    return `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`;
  }

  // Exchange code for YouTube token
  async exchangeYouTubeCode(code) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        this.youtubeOAuth.clientId,
        this.youtubeOAuth.clientSecret,
        this.youtubeOAuth.redirectUri
      );

      const { tokens } = await oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      console.error('Error exchanging YouTube code:', error.response?.data || error.message);
      throw new Error('Failed to get YouTube access token');
    }
  }

  // Exchange code for Instagram token
  async exchangeInstagramCode(code) {
    try {
      const response = await axios.post('https://graph.facebook.com/v18.0/oauth/access_token', null, {
        params: {
          client_id: this.instagramOAuth.clientId,
          redirect_uri: this.instagramOAuth.redirectUri,
          client_secret: this.instagramOAuth.clientSecret,
          code
        }
      });

      // Get long-lived token
      const longLivedResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.instagramOAuth.clientId,
          client_secret: this.instagramOAuth.clientSecret,
          fb_exchange_token: response.data.access_token
        }
      });

      return longLivedResponse.data;
    } catch (error) {
      console.error('Error exchanging Instagram code:', error.response?.data || error.message);
      throw new Error('Failed to get Instagram access token');
    }
  }

  // Exchange code for TikTok token
  async exchangeTikTokCode(code) {
    try {
      const response = await axios.post('https://open-api.tiktok.com/oauth/access_token/', null, {
        params: {
          client_key: this.tiktokOAuth.clientId,
          client_secret: this.tiktokOAuth.clientSecret,
          code,
          grant_type: 'authorization_code'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error exchanging TikTok code:', error.response?.data || error.message);
      throw new Error('Failed to get TikTok access token');
    }
  }
}

module.exports = OAuthManager;
