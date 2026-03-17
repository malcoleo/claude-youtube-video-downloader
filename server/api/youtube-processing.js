// server/api/youtube-processing.js
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const VideoProcessor = require('../utils/video-processor');
const { PLATFORM_SETTINGS } = require('../config/platforms');

const videoProcessor = new VideoProcessor();

// Helper function to format seconds to HH:MM:SS
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to run yt-dlp commands
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    // Quote arguments that contain special characters
    const quotedArgs = args.map(arg => {
      // Quote arguments with brackets or special chars
      if (arg.includes('[') || arg.includes(']') || arg.includes(' ')) {
        return `"${arg}"`;
      }
      return arg;
    });
    const command = `yt-dlp ${quotedArgs.join(' ')}`;
    exec(command, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large video info
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      try {
        resolve(stdout);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Validate YouTube URL
function isValidYouTubeUrl(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11;
}

// Route to get video info from YouTube URL
router.post('/info', async (req, res) => {
  try {
    const { youtubeUrl } = req.body;

    if (!youtubeUrl) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // Validate YouTube URL
    if (!isValidYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Get video info using yt-dlp
    const result = await runYtDlp([
      '-J', // Dump JSON
      '--no-warnings',
      `"${youtubeUrl}"`
    ]);

    const info = JSON.parse(result);

    // Filter video formats
    const videoFormats = info.formats?.filter(f => f.vcodec && f.acodec && f.vcodec !== 'none' && f.acodec !== 'none') || [];

    res.json({
      title: info.title,
      description: info.description || '',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      formats: videoFormats.map(format => ({
        quality: format.format_note || format.resolution || 'unknown',
        container: format.ext,
        size: format.filesize,
        bitrate: format.tbr
      })),
      suggestedFormat: videoFormats[0] ? {
        quality: videoFormats[0].format_note || videoFormats[0].resolution,
        container: videoFormats[0].ext,
        size: videoFormats[0].filesize,
        bitrate: videoFormats[0].tbr
      } : null
    });
  } catch (error) {
    console.error('Error getting YouTube video info:', error);
    res.status(500).json({
      error: `Failed to get YouTube video info: ${error.message}`
    });
  }
});

// Route to download and process YouTube video
router.post('/download', async (req, res) => {
  try {
    const { youtubeUrl, start, end, platform, quality } = req.body;

    if (!youtubeUrl) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    if (!isValidYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    console.log(`[DOWNLOAD] Starting download for: ${youtubeUrl}`);
    console.log(`[DOWNLOAD] Quality: ${quality || 'best'}, Platform: ${platform || 'none'}`);

    // Get video info first to get duration
    console.log('[DOWNLOAD] Fetching video info...');
    const infoResult = await runYtDlp([
      '-J',
      '--no-warnings',
      `"${youtubeUrl}"`
    ]);
    const info = JSON.parse(infoResult);
    console.log(`[DOWNLOAD] Video: ${info.title.substring(0, 50)}... Duration: ${info.duration}s`);

    const filename = videoProcessor.generateUniqueFilename('mp4');
    const tempFilePath = path.join(videoProcessor.tempDir, filename.replace('.mp4', ''));

    // Determine download quality format
    let formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    if (quality === '4k') {
      formatSelector = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]/best';
    } else if (quality === 'hd') {
      formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best';
    }

    console.log(`[DOWNLOAD] Format selector: ${formatSelector}`);
    console.log('[DOWNLOAD] Starting yt-dlp download from YouTube... (this takes 30-60 seconds for HD videos)');

    // Determine download options
    let downloadArgs = [
      '-f', formatSelector,
      '--merge-output-format', 'mp4',
      '--output', `"${tempFilePath}.%(ext)s"`,
      '--no-warnings',
    ];

    // Add time range if specified
    if (start !== undefined || end !== undefined) {
      const startTime = start || 0;
      const endTime = end || info.duration;
      // Format time as HH:MM:SS or MM:SS for yt-dlp
      const startFormatted = formatTime(startTime);
      const endFormatted = formatTime(endTime);
      downloadArgs.push('--download-sections', `*${startFormatted}-${endFormatted}`);
    }

    downloadArgs.push(`"${youtubeUrl}"`);

    // Download video
    console.log('[DOWNLOAD] Running yt-dlp...');
    await runYtDlp(downloadArgs);
    console.log('[DOWNLOAD] yt-dlp download complete!');

    // Find the downloaded file
    const downloadedFile = tempFilePath + '.mp4';

    if (!fs.existsSync(downloadedFile)) {
      throw new Error('Download failed - file not found');
    }
    console.log(`[DOWNLOAD] File downloaded: ${downloadedFile}`);

    // Determine video segment duration
    let duration = end ? (end - (start || 0)) : info.duration;
    if (duration > 60) duration = 60;

    // Process video based on platform requirements
    let outputFilePath;

    if (platform) {
      const platformSettings = PLATFORM_SETTINGS[platform];
      if (!platformSettings) {
        return res.status(400).json({ error: 'Invalid platform specified' });
      }

      const platformFilename = videoProcessor.generateUniqueFilename('mp4');
      outputFilePath = await videoProcessor.convertToPlatformFormat(
        downloadedFile,
        platformSettings,
        platformFilename
      );
    } else {
      const cutFilename = videoProcessor.generateUniqueFilename('mp4');
      outputFilePath = path.join(videoProcessor.outputDir, cutFilename);

      if (start || end) {
        console.log(`[DOWNLOAD] Cutting video segment: ${start || 0}s to ${duration}s`);
        await videoProcessor.cutVideoSegment(
          downloadedFile,
          outputFilePath,
          start || 0,
          duration
        );
      } else {
        console.log('[DOWNLOAD] Copying downloaded file to output directory...');
        await fs.promises.copyFile(downloadedFile, outputFilePath);
      }
    }

    console.log(`[DOWNLOAD] Output file: ${outputFilePath}`);

    // Generate a thumbnail
    const thumbnailFilename = videoProcessor.generateUniqueFilename('jpg');
    console.log('[DOWNLOAD] Generating thumbnail...');
    const thumbnailPath = await videoProcessor.generateThumbnail(
      outputFilePath,
      Math.min(5, duration / 2),
      thumbnailFilename
    );

    // Get final video info
    console.log('[DOWNLOAD] Getting video info...');
    const videoInfo = await videoProcessor.getVideoInfo(outputFilePath);

    // Clean up temp file
    try {
      await fs.promises.unlink(downloadedFile);
      console.log('[DOWNLOAD] Cleaned up temp file');
    } catch (e) {
      console.error('Error cleaning up temp file:', e);
    }

    // Convert local paths to URLs accessible by the frontend
    const videoUrl = `/output/${path.basename(outputFilePath)}`;
    const thumbnailUrl = `/temp/${path.basename(thumbnailPath)}`;

    console.log(`[DOWNLOAD] Complete! Video URL: ${videoUrl}`);

    res.json({
      success: true,
      videoPath: videoUrl,
      thumbnailPath: thumbnailUrl,
      videoInfo: videoInfo,
      message: 'Video processed successfully'
    });

  } catch (error) {
    console.error('Error in YouTube download route:', error);
    res.status(500).json({
      error: `Failed to download YouTube video: ${error.message}`
    });
  }
});

// Route to get available platforms
router.get('/platforms', (req, res) => {
  res.json({
    platforms: Object.keys(PLATFORM_SETTINGS).map(key => ({
      id: key,
      name: PLATFORM_SETTINGS[key].name,
      dimensions: PLATFORM_SETTINGS[key].dimensions,
      duration: PLATFORM_SETTINGS[key].duration
    }))
  });
});

module.exports = router;