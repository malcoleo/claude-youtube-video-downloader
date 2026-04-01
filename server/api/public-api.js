// server/api/public-api.js
const express = require('express');
const router = express.Router();

// Public API routes - health check and status

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

router.get('/status', (req, res) => {
  res.json({
    success: true,
    version: '1.0.0',
    features: {
      youtube: true,
      highlights: true,
      social: true,
      scheduling: true,
      analytics: true
    }
  });
});

module.exports = router;
