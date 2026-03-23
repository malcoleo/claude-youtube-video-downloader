// server/api/youtube-processing.js
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const VideoProcessor = require('../utils/video-processor');
const { PLATFORM_SETTINGS } = require('../config/platforms');
const PythonAIWrapper = require('../ai/python-wrapper');

const videoProcessor = new VideoProcessor();
const pythonAI = new PythonAIWrapper();

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

// Route to download YouTube video and detect Q&A segments
router.post('/detect-qa', async (req, res) => {
  try {
    const { youtubeUrl } = req.body;

    if (!youtubeUrl) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // Validate YouTube URL
    if (!isValidYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    console.log(`[Q&A] Starting Q&A detection for: ${youtubeUrl}`);

    // Get video info first
    console.log('[Q&A] Fetching video info...');
    const infoResult = await runYtDlp([
      '-J',
      '--no-warnings',
      `"${youtubeUrl}"`
    ]);
    const info = JSON.parse(infoResult);
    console.log(`[Q&A] Video: ${info.title.substring(0, 50)}... Duration: ${info.duration}s`);

    // Download video to temp location
    const tempFilePath = path.join(videoProcessor.tempDir, `youtube-${Date.now()}`);

    console.log('[Q&A] Downloading video...');
    await runYtDlp([
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--output', `"${tempFilePath}.%(ext)s"`,
      '--no-warnings',
      `"${youtubeUrl}"`
    ]);

    const downloadedFile = tempFilePath + '.mp4';

    if (!fs.existsSync(downloadedFile)) {
      throw new Error('Download failed - file not found');
    }
    console.log(`[Q&A] File downloaded: ${downloadedFile}`);

    // Extract audio for whisper processing
    console.log('[Q&A] Extracting audio...');
    const audioPath = tempFilePath + '.wav';

    await new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      const ffmpegCmd = `ffmpeg -i "${downloadedFile}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
      exec(ffmpegCmd, (err, stdout, stderr) => {
        if (err) {
          console.error('FFmpeg audio extraction error:', err);
          reject(err);
        } else {
          console.log('[Q&A] Audio extraction complete');
          resolve();
        }
      });
    });

    // Run Q&A detection pipeline
    console.log('[Q&A] Running whisper transcription + Q&A detection...');
    const qaResult = await pythonAI.transcribeAndDetectQA(audioPath);
    console.log(`[Q&A] Found ${qaResult.qaPairs.length} Q&A pairs`);

    // Generate preview video (480p compressed for smooth hover playback)
    console.log('[Q&A] Generating preview video...');
    const previewPath = tempFilePath + '-preview.mp4';

    await new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      const ffmpegCmd = `ffmpeg -i "${downloadedFile}" -vf "scale=854:480" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k "${previewPath}" -y`;
      exec(ffmpegCmd, (err, stdout, stderr) => {
        if (err) {
          console.error('FFmpeg preview generation error:', err);
          reject(err);
        } else {
          console.log('[Q&A] Preview generation complete');
          resolve();
        }
      });
    });

    // Format Q&A pairs for frontend
    const formattedQaPairs = qaResult.qaPairs.map((pair, idx) => ({
      id: `qa-${idx}`,
      questionStart: pair.question_start,
      questionEnd: pair.question_end,
      answerStart: pair.answer_start,
      answerEnd: pair.answer_end,
      duration: pair.answer_end - pair.question_start,
      questionText: pair.question_text,
      answerText: pair.answer_text,
      questionSpeaker: pair.question_speaker,
      answerSpeaker: pair.answer_speaker,
      score: pair.score,
      priority: pair.priority,
      reasons: pair.reasons,
      labels: {
        question: pair.question_speaker === 'SPEAKER_00' ? 'Speaker A' : 'Speaker B',
        answer: pair.answer_speaker === 'SPEAKER_00' ? 'Speaker A' : 'Speaker B'
      }
    }));

    // Sort by score descending
    formattedQaPairs.sort((a, b) => b.score - a.score);

    // Copy downloaded file to output directory for export
    const outputFilename = videoProcessor.generateUniqueFilename('mp4');
    const outputPath = path.join(videoProcessor.outputDir, outputFilename);
    await fs.promises.copyFile(downloadedFile, outputPath);

    // Clean up temp files (keep output file)
    try {
      await fs.promises.unlink(downloadedFile);
      await fs.promises.unlink(audioPath);
      // Keep preview file for streaming
      const previewUrl = `/temp/${path.basename(previewPath)}`;

      res.json({
        success: true,
        qaPairs: formattedQaPairs,
        stats: qaResult.stats,
        videoPath: outputPath,
        videoPathForExport: outputPath,
        previewUrl: previewUrl,
        videoInfo: {
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail
        },
        message: `Found ${formattedQaPairs.length} Q&A pairs`
      });
    } catch (err) {
      console.error('Error cleaning up temp files:', err);
      // Still return success even if cleanup fails
      res.json({
        success: true,
        qaPairs: formattedQaPairs,
        stats: qaResult.stats,
        videoPath: outputPath,
        videoPathForExport: outputPath,
        videoInfo: {
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail
        },
        message: `Found ${formattedQaPairs.length} Q&A pairs`
      });
    }

  } catch (error) {
    console.error('Error in YouTube Q&A detection:', error);
    res.status(500).json({
      error: 'Failed to detect Q&A pairs: ' + error.message,
      details: error.stack
    });
  }
});


module.exports = router;