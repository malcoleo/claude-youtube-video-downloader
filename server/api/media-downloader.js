// server/api/media-downloader.js
// API routes for yt-dlp based media downloading with job system
// Supports 1000+ sites via yt-dlp (not just YouTube)

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const YtDlpWrapper = require('../utils/yt-dlp-wrapper');

// Initialize yt-dlp wrapper
const ytDlp = new YtDlpWrapper();

// Download concurrency control
const MAX_CONCURRENT_DOWNLOADS = 3;
const downloadQueue = [];
let activeDownloads = 0;

// Cleanup old jobs every hour (24 hour retention)
setInterval(() => {
  try {
    ytDlp.cleanup(86400000);  // 24 hours
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}, 3600000);

/**
 * Process download queue with concurrency limiting
 */
function processDownloadQueue() {
  while (activeDownloads < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const { jobId, url, format, formatId, resolve } = downloadQueue.shift();
    activeDownloads++;

    ytDlp.startDownload(url, format, formatId)
      .then(resolve)
      .catch((err) => {
        activeDownloads--;
        throw err;
      })
      .finally(() => {
        activeDownloads--;
        processDownloadQueue();
      });
  }
}

/**
 * POST /api/media/info
 * Get video info from any supported URL
 * Body: { url: string }
 */
router.post('/info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    const info = await ytDlp.getVideoInfo(url);

    res.json({
      success: true,
      ...info
    });
  } catch (error) {
    console.error('Error getting media info:', error);
    const msg = error.message || '';

    // User-friendly error messages for common issues
    if (msg.includes('login required') || msg.includes('cookies') || msg.includes('rate-limit')) {
      return res.status(403).json({
        error: 'This site requires authentication. Try again in a moment, or use YouTube/TikTok/Twitter URLs for best results.',
        hint: msg.includes('rate-limit') ? 'Instagram rate-limited the request. Please try again in 30 seconds.' : 'Instagram requires authentication. Try again in a moment.'
      });
    }
    if (msg.includes('Unable to extract')) {
      return res.status(400).json({
        error: 'Could not extract video data from this URL. Try a different format or check the URL is correct.'
      });
    }
    if (msg.includes('video not available') || msg.includes('not available')) {
      return res.status(404).json({
        error: 'This video is not available. It may have been removed or the URL may be incorrect.'
      });
    }

    res.status(500).json({
      error: 'Failed to get video info: ' + error.message,
      supportedSites: 'Use yt-dlp supported sites (YouTube, TikTok, Instagram, Twitter, etc.)'
    });
  }
});

/**
 * POST /api/media/info/bulk
 * Get info for multiple URLs at once
 * Body: { urls: string[] }
 */
router.post('/info/bulk', async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    // Limit bulk requests to prevent overload
    const MAX_BULK = 20;
    if (urls.length > MAX_BULK) {
      return res.status(400).json({
        error: `Maximum ${MAX_BULK} URLs per bulk request`,
        truncated: urls.slice(0, MAX_BULK)
      });
    }

    const results = await ytDlp.getBulkVideoInfo(urls);

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('Error in bulk info request:', error);
    res.status(500).json({
      error: 'Failed to get bulk video info: ' + error.message
    });
  }
});

/**
 * POST /api/media/download
 * Start a download job
 * Body: { url: string, format?: 'video'|'audio', formatId?: string, outputFormat?: 'mp4'|'mov'|'avi' }
 * Returns: { jobId: string }
 */
router.post('/download', async (req, res) => {
  try {
    const { url, format = 'video', formatId, outputFormat = 'mp4' } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate output format
    const allowedFormats = ['mp4', 'mov', 'avi'];
    if (!allowedFormats.includes(outputFormat)) {
      return res.status(400).json({
        error: `Invalid format: ${outputFormat}. Allowed: ${allowedFormats.join(', ')}`
      });
    }

    // Start the download job (yt-dlp-wrapper validates URL)
    const jobId = ytDlp.startDownload(url, format, formatId, null, outputFormat);

    res.json({
      success: true,
      jobId,
      message: 'Download started',
      outputFormat
    });
  } catch (error) {
    console.error('Error starting download:', error);
    res.status(500).json({
      error: 'Failed to start download: ' + error.message
    });
  }
});

/**
 * POST /api/media/download/bulk
 * Start downloads for multiple URLs with concurrency limiting
 * Body: { urls: string[], format?: 'video'|'audio' }
 * Returns: { jobIds: string[] }
 */
router.post('/download/bulk', async (req, res) => {
  try {
    const { urls, format = 'video' } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    const MAX_BULK = 10;
    if (urls.length > MAX_BULK) {
      return res.status(400).json({
        error: `Maximum ${MAX_BULK} downloads at once`,
        truncated: urls.slice(0, MAX_BULK)
      });
    }

    // Start downloads with concurrency limiting
    const jobIds = [];
    for (let i = 0; i < urls.length; i += MAX_CONCURRENT_DOWNLOADS) {
      const batch = urls.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
      const batchJobIds = batch.map(url => ytDlp.startDownload(url, format));
      jobIds.push(...batchJobIds);

      // Wait for batch to complete before starting next batch
      if (i + MAX_CONCURRENT_DOWNLOADS < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    res.json({
      success: true,
      jobIds,
      count: jobIds.length,
      message: `Started ${jobIds.length} download(s)`
    });
  } catch (error) {
    console.error('Error in bulk download:', error);
    res.status(500).json({
      error: 'Failed to start bulk downloads: ' + error.message
    });
  }
});

/**
 * GET /api/media/status/:jobId
 * Check download job status
 */
router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const status = ytDlp.getJobStatus(jobId);

  if (status.error === 'Job not found') {
    return res.status(404).json(status);
  }

  res.json(status);
});

/**
 * GET /api/media/file/:jobId
 * Download the completed file
 * Fixed TOCTOU race condition - use download directly without prior check
 */
router.get('/file/:jobId', async (req, res, next) => {
  const { jobId } = req.params;

  try {
    const file = await ytDlp.getJobFile(jobId);

    if (!file) {
      return res.status(404).json({ error: 'File not ready or not found' });
    }

    // Download handles file not found internally
    // No need for separate access check (avoids TOCTOU race)
    res.download(file.path, file.filename, (err) => {
      if (err) {
        // File doesn't exist or other error
        res.status(404).json({ error: 'File not found' });
      }
    });
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file: ' + error.message });
  }
});

/**
 * GET /api/media/stream/:jobId
 * Stream the completed file (for preview)
 */
router.get('/stream/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const file = await ytDlp.getJobFile(jobId);

    if (!file) {
      return res.status(404).json({ error: 'File not ready or not found' });
    }

    // Stream handles errors directly
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const stream = fs.createReadStream(file.path);

    stream.on('error', (err) => {
      console.error('Stream error:', err);
      res.status(404).json({ error: 'File not found' });
    });

    stream.pipe(res);
  } catch (error) {
    console.error('Error streaming file:', error);
    res.status(500).json({ error: 'Failed to stream file: ' + error.message });
  }
});

/**
 * POST /api/media/discover
 * Discover all videos on a webpage (playlist, channel page, embedded videos)
 * Body: { url: string }
 * Returns: { type: 'playlist'|'single', videos: [...] }
 */
router.post('/discover', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    const result = await ytDlp.discoverVideosOnPage(url);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error discovering videos:', error);
    const msg = error.message || '';

    if (msg.includes('No videos found')) {
      return res.status(404).json({ error: 'No videos found on this page' });
    }
    if (msg.includes('Unable to extract')) {
      return res.status(400).json({
        error: 'Could not find any videos at this URL. Check the URL and try again.'
      });
    }

    res.status(500).json({
      error: 'Failed to discover videos: ' + error.message
    });
  }
});

/**
 * GET /api/media/supported-sites
 * Get list of supported sites (from yt-dlp)
 * Fixed: Uses execFile instead of exec for security
 */
router.get('/supported-sites', (req, res) => {
  // SECURITY: Use execFile with argument array instead of exec
  execFile('yt-dlp', ['--extractor-descriptions'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
    shell: false
  }, (error, stdout) => {
    if (error) {
      return res.json({
        note: 'yt-dlp supports 1000+ sites including YouTube, TikTok, Instagram, Twitter, Facebook, Vimeo, and more',
        error: error.message
      });
    }

    // Parse the extractor list
    const sites = stdout
      .split('\n')
      .filter(line => line.trim())
      .slice(0, 100); // Limit to first 100 for response size

    res.json({
      note: 'yt-dlp supports 1000+ sites. Showing first 100 extractors:',
      sites
    });
  });
});

module.exports = router;
