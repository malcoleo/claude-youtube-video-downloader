// server/api/user-preferences.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Directory for storing user preferences and history
const DATA_DIR = path.join(__dirname, '../../data');
const USER_PREFS_DIR = path.join(DATA_DIR, 'user-preferences');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

// Simple in-memory rate limiter (max 100 requests per minute per user)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window

function checkRateLimit(userId) {
  const now = Date.now();
  const userKey = userId;

  if (!rateLimitMap.has(userKey)) {
    rateLimitMap.set(userKey, { count: 1, windowStart: now });
    return true;
  }

  const userData = rateLimitMap.get(userKey);
  if (now - userData.windowStart > RATE_LIMIT_WINDOW) {
    // Window expired, reset
    rateLimitMap.set(userKey, { count: 1, windowStart: now });
    return true;
  }

  if (userData.count >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }

  userData.count++;
  return true;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now - value.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Sanitize object to prevent prototype pollution.
 * Removes dangerous keys that could modify Object.prototype.
 * @param {object} obj - Object to sanitize
 * @returns {object} - Sanitized object
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  const result = Array.isArray(obj) ? [] : {};

  for (const key of Object.keys(obj)) {
    if (dangerousKeys.includes(key)) continue;

    const value = obj[key];
    result[key] = typeof value === 'object' && value !== null ? sanitizeObject(value) : value;
  }

  return result;
}

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(USER_PREFS_DIR, { recursive: true });
  await fs.mkdir(HISTORY_DIR, { recursive: true });
}

ensureDirectories();

// Get user preferences
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }

  try {
    const { userId } = req.params;
    const prefPath = path.join(USER_PREFS_DIR, `${userId}.json`);

    try {
      const prefs = await fs.readFile(prefPath, 'utf8');
      res.json(JSON.parse(prefs));
    } catch (error) {
      // If no preferences exist, return default preferences
      const defaultPrefs = {
        userId,
        keyboardShortcuts: {
          'toggle-editor': 'ctrl+e',
          'process-video': 'ctrl+p',
          'export-clip': 'ctrl+s',
          'undo': 'ctrl+z',
          'redo': 'ctrl+y',
          'zoom-in': '+',
          'zoom-out': '-'
        },
        uiSettings: {
          theme: 'dark',
          fontSize: 'medium',
          sidebarCollapsed: false,
          autoSave: true,
          showTooltips: true
        },
        lastUsedSettings: {
          preset: 'default',
          exportFormat: 'mp4',
          resolution: '1080p',
          captionStyle: 'hormozi'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save default preferences
      await fs.writeFile(prefPath, JSON.stringify(defaultPrefs, null, 2));
      res.json(defaultPrefs);
    }
  } catch (error) {
    console.error('Error getting user preferences:', error);
    res.status(500).json({ error: 'Failed to get user preferences' });
  }
});

// Update user preferences
router.put('/:userId', async (req, res) => {
  const { userId } = req.params;

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }

  try {
    const { userId } = req.params;
    const updates = req.body;

    const prefPath = path.join(USER_PREFS_DIR, `${userId}.json`);

    let existingPrefs = {};
    try {
      const existing = await fs.readFile(prefPath, 'utf8');
      existingPrefs = JSON.parse(existing);
    } catch (error) {
      // If no existing preferences, start with empty object
    }

    // Update preferences with prototype pollution protection
    const sanitizedUpdates = sanitizeObject(updates);
    const updatedPrefs = {
      ...existingPrefs,
      ...sanitizedUpdates,
      userId,
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(prefPath, JSON.stringify(updatedPrefs, null, 2));
    res.json(updatedPrefs);
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Failed to update user preferences' });
  }
});

// Get user history
router.get('/history/:userId', async (req, res) => {
  const { userId } = req.params;

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }

  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type || 'all'; // all, processing, posting, export

    const historyPath = path.join(HISTORY_DIR, `${userId}.json`);

    try {
      const history = await fs.readFile(historyPath, 'utf8');
      let historyEntries = JSON.parse(history);

      // Filter by type if specified
      if (type !== 'all') {
        historyEntries = historyEntries.filter(entry => entry.type === type);
      }

      // Sort by timestamp (most recent first) and limit
      historyEntries = historyEntries
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      res.json({ success: true, history: historyEntries });
    } catch (error) {
      // If no history exists, return empty array
      res.json({ success: true, history: [] });
    }
  } catch (error) {
    console.error('Error getting user history:', error);
    res.status(500).json({ error: 'Failed to get user history' });
  }
});

// Add entry to user history
router.post('/history/:userId', async (req, res) => {
  const { userId } = req.params;

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }

  try {
    const { userId } = req.params;
    const { action, targetType, targetId, details } = req.body;

    const historyPath = path.join(HISTORY_DIR, `${userId}.json`);

    let historyEntries = [];
    try {
      const existing = await fs.readFile(historyPath, 'utf8');
      historyEntries = JSON.parse(existing);
    } catch (error) {
      // If no existing history, start with empty array
    }

    const newEntry = {
      id: uuidv4(),
      action,
      targetType,
      targetId,
      details: sanitizeObject(details), // Sanitize details to prevent prototype pollution
      timestamp: new Date().toISOString(),
      userId
    };

    // Add new entry to the beginning of the array
    historyEntries.unshift(newEntry);

    // Limit to 1000 entries to prevent file from growing too large
    if (historyEntries.length > 1000) {
      historyEntries = historyEntries.slice(0, 1000);
    }

    await fs.writeFile(historyPath, JSON.stringify(historyEntries, null, 2));
    res.json({ success: true, entry: newEntry });
  } catch (error) {
    console.error('Error adding to user history:', error);
    res.status(500).json({ error: 'Failed to add to user history' });
  }
});

// Clear user history
router.delete('/history/:userId', async (req, res) => {
  const { userId } = req.params;

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }

  try {
    const { userId } = req.params;
    const { type } = req.query;

    const historyPath = path.join(HISTORY_DIR, `${userId}.json`);

    try {
      if (type) {
        // Clear specific type of history
        const existing = await fs.readFile(historyPath, 'utf8');
        let historyEntries = JSON.parse(existing);

        historyEntries = historyEntries.filter(entry => entry.type !== type);
        await fs.writeFile(historyPath, JSON.stringify(historyEntries, null, 2));
      } else {
        // Clear all history
        await fs.unlink(historyPath);
      }

      res.json({ success: true, message: 'History cleared successfully' });
    } catch (error) {
      // If file doesn't exist, that's fine
      res.json({ success: true, message: 'History cleared successfully' });
    }
  } catch (error) {
    console.error('Error clearing user history:', error);
    res.status(500).json({ error: 'Failed to clear user history' });
  }
});

// Get user presets
router.get('/presets/:userId', async (req, res) => {
  const { userId } = req.params;

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }

  try {
    const { userId } = req.params;

    const prefPath = path.join(USER_PREFS_DIR, `${userId}.json`);
    const prefs = await fs.readFile(prefPath, 'utf8');
    const userPrefs = JSON.parse(prefs);

    // Return the last used settings as presets
    const presets = {
      default: userPrefs.lastUsedSettings || {},
      savedPresets: userPrefs.savedPresets || {}
    };

    res.json({ success: true, presets });
  } catch (error) {
    console.error('Error getting user presets:', error);
    res.status(500).json({ error: 'Failed to get user presets' });
  }
});

// Save a new preset
router.post('/presets/:userId', async (req, res) => {
  const { userId } = req.params;

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }

  try {
    const { userId } = req.params;
    const { presetName, settings } = req.body;

    const prefPath = path.join(USER_PREFS_DIR, `${userId}.json`);
    const prefs = await fs.readFile(prefPath, 'utf8');
    const userPrefs = JSON.parse(prefs);

    if (!userPrefs.savedPresets) {
      userPrefs.savedPresets = {};
    }

    userPrefs.savedPresets[presetName] = {
      ...settings,
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(prefPath, JSON.stringify(userPrefs, null, 2));

    res.json({ success: true, message: 'Preset saved successfully', presetName });
  } catch (error) {
    console.error('Error saving preset:', error);
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

module.exports = router;