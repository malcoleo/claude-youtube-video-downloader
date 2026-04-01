// test/oauth-manager.test.js
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// Mock the dependencies before importing
const mockFs = {
  mkdir: async () => {},
  writeFile: async () => {},
  readFile: async () => '{}'
};

// Set up test environment
const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.YOUTUBE_CLIENT_ID = 'test_client_id';
process.env.YOUTUBE_CLIENT_SECRET = 'test_client_secret';
process.env.YOUTUBE_REDIRECT_URI = 'http://localhost:5001/api/auth/youtube/callback';

describe('OAuthManager', () => {
  let OAuthManager;
  let oauthManager;

  beforeEach(() => {
    // Fresh import for each test
    delete require.cache[require.resolve('../server/social/oauth-manager')];
    OAuthManager = require('../server/social/oauth-manager');
    oauthManager = new OAuthManager();
  });

  describe('encryptToken', () => {
    it('encrypts token successfully with valid ENCRYPTION_KEY', () => {
      const token = {
        accessToken: 'test_access_token',
        refreshToken: 'test_refresh_token',
        expiryDate: new Date().toISOString()
      };

      const encrypted = oauthManager.encryptToken(token);

      assert.ok(encrypted.encrypted, 'Should have encrypted data');
      assert.ok(encrypted.iv, 'Should have initialization vector');
      assert.ok(encrypted.authTag, 'Should have auth tag');
      assert.strictEqual(typeof encrypted.encrypted, 'string', 'Encrypted should be hex string');
      assert.strictEqual(typeof encrypted.iv, 'string', 'IV should be hex string');
      assert.strictEqual(typeof encrypted.authTag, 'string', 'AuthTag should be hex string');
    });

    it('throws error when ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;

      assert.throws(() => {
        oauthManager.encryptToken({ accessToken: 'test' });
      }, /ENCRYPTION_KEY environment variable is required/);

      // Restore for other tests
      process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    });
  });

  describe('decryptToken', () => {
    it('decrypts token successfully with valid ENCRYPTION_KEY', () => {
      const originalToken = {
        accessToken: 'test_access_token',
        refreshToken: 'test_refresh_token',
        expiryDate: new Date().toISOString(),
        scope: 'email profile'
      };

      const encrypted = oauthManager.encryptToken(originalToken);
      const decrypted = oauthManager.decryptToken(encrypted);

      assert.deepStrictEqual(decrypted, originalToken, 'Decrypted token should match original');
    });

    it('throws error when ENCRYPTION_KEY is missing', () => {
      const token = { accessToken: 'test' };
      const encrypted = oauthManager.encryptToken(token);
      delete process.env.ENCRYPTION_KEY;

      assert.throws(() => {
        oauthManager.decryptToken(encrypted);
      }, /ENCRYPTION_KEY environment variable is required/);

      // Restore for other tests
      process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    });

    it('round-trips complex token data', () => {
      const complexToken = {
        accessToken: 'ya29.a0AfH6SMBx...',
        refreshToken: '1//0gH...',
        expiryDate: new Date(Date.now() + 3600000).toISOString(),
        scope: 'https://www.googleapis.com/auth/youtube.upload'
      };

      const encrypted = oauthManager.encryptToken(complexToken);
      const decrypted = oauthManager.decryptToken(encrypted);

      assert.strictEqual(decrypted.accessToken, complexToken.accessToken);
      assert.strictEqual(decrypted.refreshToken, complexToken.refreshToken);
      assert.strictEqual(decrypted.expiryDate, complexToken.expiryDate);
      assert.strictEqual(decrypted.scope, complexToken.scope);
    });
  });

  describe('Token Security', () => {
    it('produces different encrypted output for same input (due to random IV)', () => {
      const token = { accessToken: 'test_token' };

      const encrypted1 = oauthManager.encryptToken(token);
      const encrypted2 = oauthManager.encryptToken(token);

      // Same token, different IVs = different ciphertext
      assert.notStrictEqual(encrypted1.encrypted, encrypted2.encrypted);
      assert.notStrictEqual(encrypted1.iv, encrypted2.iv);

      // But both decrypt to the same value
      const decrypted1 = oauthManager.decryptToken(encrypted1);
      const decrypted2 = oauthManager.decryptToken(encrypted2);

      assert.deepStrictEqual(decrypted1, decrypted2);
    });

    it('uses AES-256-GCM (authenticated encryption)', () => {
      const token = { accessToken: 'test' };
      const encrypted = oauthManager.encryptToken(token);

      // Tamper with the ciphertext
      const tampered = {
        ...encrypted,
        encrypted: encrypted.encrypted.substring(0, 10) + '0000' + encrypted.encrypted.substring(14)
      };

      // Should fail to decrypt due to auth tag mismatch
      assert.throws(() => {
        oauthManager.decryptToken(tampered);
      });
    });
  });
});
