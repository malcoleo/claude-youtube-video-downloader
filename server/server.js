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
const cmsIntegrationRoutes = require('./api/cms-integration');
const publicApiRoutes = require('./api/public-api');
const userPreferencesRoutes = require('./api/user-preferences');
const presetsRoutes = require('./api/presets');

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

// Enhanced CORS configuration to support Safari and other browsers
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In development, allow common localhost ports for React dev server
    if (process.env.NODE_ENV === 'development') {
      const allowedOrigins = [
        'http://localhost:3000',  // React development server
        'http://localhost:5001',  // Our server
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5001',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'chrome-extension://',     // For Chrome extensions
        'safari-web-extension://' // For Safari extensions
      ];

      // Check if origin is in the allowed list
      const isAllowed = allowedOrigins.some(allowedOrigin =>
        origin === allowedOrigin || origin.startsWith(allowedOrigin.split(':')[0])
      );

      callback(null, isAllowed);
    } else {
      // Production - restrict to specific origins
      const allowedOrigins = [
        'https://yourdomain.com',
        'https://www.yourdomain.com'
      ];

      const isAllowed = allowedOrigins.includes(origin);
      callback(null, isAllowed);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

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

// API Routes
app.use('/api/youtube', youtubeProcessingRoutes);
app.use('/api/video', videoProcessorRoutes);
app.use('/api/highlights', highlightRouter);
app.use('/api/podcast', podcastRouter); // Separate router for podcast-specific routes
app.use('/api/social', socialSharingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/cms', cmsIntegrationRoutes);
app.use('/api/preferences', userPreferencesRoutes);
app.use('/api/presets', presetsRoutes);
app.use('/api', publicApiRoutes);

// Serve static files from the React app build (should come AFTER API routes)
app.use(express.static(path.join(__dirname, '../client/build'), {
  setHeaders: (res, filepath) => {
    // Set appropriate MIME types to avoid issues with Safari
    if (filepath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    } else if (filepath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    } else if (filepath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    }

    // Add security headers that Safari may be stricter about
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
  }
}));

// Serve output directory for video playback (with download support)
app.use('/output', express.static(path.join(__dirname, '../output'), {
  setHeaders: function (res, path, stat) {
    res.set('Content-Disposition', 'inline');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'video/mp4'); // Explicitly set for video files
    res.set('X-Content-Type-Options', 'nosniff');
    // Safari-specific headers
    res.set('Cache-Control', 'public, max-age=3600');
  }
}));

// Serve temp directory for thumbnails
app.use('/temp', express.static(path.join(__dirname, '../temp'), {
  setHeaders: function (res, path, stat) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Content-Type-Options', 'nosniff');
    // Ensure proper content type for different file types
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.set('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.png')) {
      res.set('Content-Type', 'image/png');
    } else if (path.endsWith('.gif')) {
      res.set('Content-Type', 'image/gif');
    } else if (path.endsWith('.mp4')) {
      res.set('Content-Type', 'video/mp4');
    }
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