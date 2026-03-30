require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import routes
const youtubeProcessingRoutes = require('./api/youtube-processing');
const videoProcessorRoutes = require('./api/video-processor');
const highlightDetectionRoutes = require('./api/highlight-detection');
const socialSharingRoutes = require('./api/social-sharing');
const analyticsRoutes = require('./api/analytics');

// Note: highlightDetectionRoutes exports both a router and podcastRouter
const highlightRouter = highlightDetectionRoutes.router || highlightDetectionRoutes;
const podcastRouter = highlightDetectionRoutes.podcastRouter;

// Initialize app
const app = express();
const PORT = 5001; // Hardcoded port to avoid environment issues

// Trust proxy for rate limiting (behind load balancer/proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting disabled for development
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs
//   validate: false // Disable header validation
// });
// app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the React app build
app.use(express.static(path.join(__dirname, '../client/build')));

// Serve output directory for video playback (with download support)
app.use('/output', express.static(path.join(__dirname, '../output'), {
  setHeaders: function (res, path, stat) {
    res.set('Content-Disposition', 'inline');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// Serve temp directory for thumbnails
app.use('/temp', express.static(path.join(__dirname, '../temp'), {
  setHeaders: function (res, path, stat) {
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// Download endpoint - forces download with proper headers and no-cache
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../output', req.params.filename);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.download(filePath);
});

// API Routes
app.use('/api/youtube', youtubeProcessingRoutes);
app.use('/api/video', videoProcessorRoutes);
app.use('/api/highlights', highlightRouter);
app.use('/api/podcast', podcastRouter); // Separate router for podcast-specific routes
app.use('/api/social', socialSharingRoutes);
app.use('/api/analytics', analyticsRoutes);

// Serve the React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;