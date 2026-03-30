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

// Helper function to run yt-dlp commands with progress tracking
function runYtDlp(args, onProgress) {
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

    let progress = { percent: 0, eta: null, speed: null };

    const child = exec(command, {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024 // 100MB buffer for large downloads
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      try {
        resolve({ stdout, progress });
      } catch (e) {
        reject(e);
      }
    });

    // Capture progress from stderr if onProgress callback provided
    if (onProgress && child.stderr) {
      child.stderr.on('data', (data) => {
        // Parse progress percentage: [download]  45.2% of ~150.00MiB
        const percentMatch = data.match(/(\d+\.?\d*)%/);
        if (percentMatch) {
          const percent = parseFloat(percentMatch[1]);
          // Also capture eta and speed if available
          const etaMatch = data.match(/ETA\s+([0-9:]+)/);
          const speedMatch = data.match(/(\d+\.?\d*)\s*(MB|KB|GB)/i);

          let eta = null;
          let speed = null;

          if (etaMatch) eta = etaMatch[1];
          if (speedMatch) speed = `${speedMatch[1]} ${speedMatch[2]}`;

          progress = {
            percent: Math.min(percent, 100),
            eta: eta,
            speed: speed
          };

          onProgress(progress);
        }
        // Also capture lines like "[download] 100% of 150.00MiB"
        if (data.includes('100%')) {
          progress = { percent: 100, eta: '00:00', speed: null };
          onProgress(progress);
        }
      });
    }
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

    const info = JSON.parse(result.stdout);

    // Extract chapters info
    const chaptersInfo = getChaptersInfo(info);

    // Filter video formats
    const videoFormats = info.formats?.filter(f => f.vcodec && f.acodec && f.vcodec !== 'none' && f.acodec !== 'none') || [];

    res.json({
      title: info.title,
      description: info.description || '',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      chapters: chaptersInfo,
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
    const { youtubeUrl, start, end, platform, quality, withEffects = false } = req.body;

    if (!youtubeUrl) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    if (!isValidYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    console.log(`[DOWNLOAD] Starting download for: ${youtubeUrl}`);
    console.log(`[DOWNLOAD] Quality: ${quality || 'best'}, Platform: ${platform || 'none'}`);
    console.log(`[DOWNLOAD] Effects: ${withEffects}`);

    // Get video info first to get duration
    console.log('[DOWNLOAD] Fetching video info...');
    const infoResultData = await runYtDlp([
      '-J',
      '--no-warnings',
      `"${youtubeUrl}"`
    ]);
    const info = JSON.parse(infoResultData.stdout);
    console.log(`[DOWNLOAD] Video: ${info.title.substring(0, 50)}... Duration: ${info.duration}s`);

    const filename = videoProcessor.generateUniqueFilename('mp4');
    const tempFilePath = path.join(videoProcessor.tempDir, filename.replace('.mp4', ''));
    const downloadedFilePath = tempFilePath + '.mp4';

    // Determine download quality format
    let formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    if (quality === '4k') {
      formatSelector = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]/best';
    } else if (quality === 'hd') {
      formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best';
    } else if (quality === 'sd') {
      formatSelector = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best';
    }

    console.log(`[DOWNLOAD] Format selector: ${formatSelector}`);
    console.log('[DOWNLOAD] Starting yt-dlp download from YouTube...');

    // Determine download options with progress
    let downloadArgs = [
      '-f', formatSelector,
      '--merge-output-format', 'mp4',
      '--output', `"${tempFilePath}.%(ext)s"`,
      '--no-warnings',
      '--progress'
    ];

    // Add time range if specified
    if (start !== undefined || end !== undefined) {
      const startTime = start || 0;
      const endTime = end || info.duration;
      const startFormatted = formatTime(startTime);
      const endFormatted = formatTime(endTime);
      downloadArgs.push('--download-sections', `*${startFormatted}-${endFormatted}`);
    }

    downloadArgs.push(`"${youtubeUrl}"`);

    // Generate download ID for progress polling
    const downloadId = req.body.id || 'dl-' + Date.now();
    const progressCallback = (progress) => {
      console.log(`[DOWNLOAD] Progress: ${progress.percent.toFixed(1)}%`);
      downloadProgressMap[downloadId] = progress;
    };

    // Get final progress after download completes
    const downloadResult = await runYtDlp(downloadArgs, progressCallback);
    const finalProgress = downloadResult.progress;
    console.log(`[DOWNLOAD] Final progress: ${finalProgress.percent}%`);

    // Clean up progress tracking
    delete downloadProgressMap[downloadId];

    // Determine video segment duration
    let duration = end ? (end - (start || 0)) : info.duration;
    if (duration > 60) duration = 60;

    // Process video based on platform requirements
    let outputFilePath;
    let thumbnailPath;

    if (platform) {
      const platformSettings = PLATFORM_SETTINGS[platform];
      if (!platformSettings) {
        return res.status(400).json({ error: 'Invalid platform specified' });
      }

      console.log(`[DOWNLOAD] Converting to ${platform} format...`);
      const platformFilename = videoProcessor.generateUniqueFilename('mp4');
      outputFilePath = await videoProcessor.convertToPlatformFormat(
        downloadedFilePath,
        platformSettings,
        platformFilename,
        withEffects
      );
    } else {
      const cutFilename = videoProcessor.generateUniqueFilename('mp4');
      outputFilePath = path.join(videoProcessor.outputDir, cutFilename);

      if (start || end) {
        console.log(`[DOWNLOAD] Cutting video segment: ${start || 0}s to ${duration}s`);
        await videoProcessor.cutVideoSegment(
          downloadedFilePath,
          outputFilePath,
          start || 0,
          duration,
          withEffects
        );
      } else {
        console.log('[DOWNLOAD] Copying downloaded file to output directory...');
        await fs.promises.copyFile(downloadedFilePath, outputFilePath);
      }
    }

    console.log(`[DOWNLOAD] Output file: ${outputFilePath}`);

    // Generate a thumbnail
    const thumbnailFilename = videoProcessor.generateUniqueFilename('jpg');
    console.log('[DOWNLOAD] Generating thumbnail...');
    thumbnailPath = await videoProcessor.generateThumbnail(
      outputFilePath,
      Math.min(5, duration / 2),
      thumbnailFilename
    );

    // Get final video info
    console.log('[DOWNLOAD] Getting video info...');
    const videoInfo = await videoProcessor.getVideoInfo(outputFilePath);

    // Clean up temp file
    try {
      await fs.promises.unlink(downloadedFilePath);
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
    const infoResultData = await runYtDlp([
      '-J',
      '--no-warnings',
      `"${youtubeUrl}"`
    ]);
    const info = JSON.parse(infoResultData.stdout);
    console.log(`[Q&A] Video: ${info.title.substring(0, 50)}... Duration: ${info.duration}s`);

    // Generate download ID for progress polling
    const downloadId = req.body.id || 'qa-' + Date.now();
    const progressCallback = (progress) => {
      console.log(`[Q&A] Progress: ${progress.percent.toFixed(1)}%`);
      downloadProgressMap[downloadId] = progress;
    };

    // Download video to temp location
    const tempFilePath = path.join(videoProcessor.tempDir, `youtube-${Date.now()}`);

    console.log('[Q&A] Downloading video...');
    const downloadResult = await runYtDlp([
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--output', `"${tempFilePath}.%(ext)s"`,
      '--no-warnings',
      '--progress',
      `"${youtubeUrl}"`
    ], progressCallback);

    // Clean up progress tracking
    delete downloadProgressMap[downloadId];

    const downloadedFile = tempFilePath + '.mp4';

    if (!fs.existsSync(downloadedFile)) {
      throw new Error('Download failed - file not found');
    }
    console.log(`[Q&A] File downloaded: ${downloadedFile}`);

    // Step 2: Check if YouTube chapters exist and should be used
    const chapters = extractChaptersFromInfo(info);
    console.log(`[Q&A] Found ${chapters.length} chapters`);

    let finalQaPairs = [];

    if (chapters.length > 0) {
      // Use YouTube chapters as primary clip sources
      console.log('[Q&A] Using YouTube chapters as clip boundaries');

      // Break down long chapters into smaller clips
      const optimizedChapters = breakDownLongChapters(chapters, 120, 90);
      console.log(`[Q&A] Breaking down chapters: ${chapters.length} -> ${optimizedChapters.length} clips`);

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

      // Run Q&A detection to fine-tune chapters
      console.log('[Q&A] Running whisper transcription...');
      const fullTranscript = await pythonAI.transcribeAndDetectQA(audioPath);
      console.log(`[Q&A] Full transcript has ${fullTranscript.stats?.totalSegments || 0} segments`);

      // Process each chapter - either use as-is or fine-tune if too long
      const chapterQaPairs = optimizedChapters.map((chapter, idx) => {
        const duration = chapter.end - chapter.start;

        if (duration <= 120) {
          // Chapter is short enough (<= 2 mins), use it as a single Q&A pair
          // Use chapter title as question, first 2 mins as answer
          return {
            id: `chapter-${idx}`,
            questionStart: chapter.start,
            questionEnd: chapter.start + 2, // Short intro
            answerStart: chapter.start + 2,
            answerEnd: Math.min(chapter.end, chapter.start + 118),
            duration: Math.min(duration, 118),
            questionText: chapter.title || `Chapter ${idx + 1}`,
            answerText: `From ${chapter.title || `Chapter ${idx + 1}`} (${formatTime(chapter.start)}-${formatTime(chapter.end)})`,
            questionSpeaker: 'SPEAKER_00',
            answerSpeaker: 'SPEAKER_00',
            score: 95, // High confidence for curated chapters
            priority: 'high',
            reasons: ['youtube-chapter', 'creator-curated'],
            labels: {
              question: 'Chapter',
              answer: 'Content'
            },
            source: 'youtube-chapter',
            chapterTitle: chapter.title
          };
        } else {
          // Chapter is too long (>90s), fine-tune with Q&A detection within the chapter
          console.log(`[Q&A] Chapter ${idx + 1} (${chapter.title || idx + 1}) is ${duration.toFixed(0)}s, fine-tuning with Q&A detection...`);

          // Filter transcript segments that fall within this chapter
          const chapterSegments = fullTranscript.qaPairs.filter(seg =>
            seg.questionStart >= chapter.start && seg.questionStart < chapter.end
          );

          if (chapterSegments.length > 0) {
            // Use fine-tuned Q&A pairs from within the chapter
            return chapterSegments.map((seg, subIdx) => ({
              ...seg,
              id: `chapter-${idx}-qa-${subIdx}`,
              score: Math.min(seg.score + 10, 100), // Bonus for being within a chapter
              priority: seg.priority === 'high' ? 'high' : 'medium',
              reasons: [...seg.reasons, 'youtube-chapter-fine-tuned'],
              labels: {
                question: seg.labels?.question || 'Speaker A',
                answer: seg.labels?.answer || 'Speaker B'
              },
              source: 'youtube-chapter-fine-tuned',
              chapterTitle: chapter.title
            }));
          } else {
            // No fine-grained Q&A found, use simplified chapter segment
            // Breaking down chapters longer than 2 mins into ~90s chunks
            const chunkDuration = 90;
            const numChunks = Math.ceil(duration / chunkDuration);
            const chunks = [];

            for (let i = 0; i < numChunks; i++) {
              const chunkStart = chapter.start + (i * chunkDuration);
              const chunkEnd = Math.min(chapter.start + ((i + 1) * chunkDuration), chapter.end);

              chunks.push({
                id: `chapter-${idx}-chunk-${i}`,
                questionStart: chunkStart,
                questionEnd: chunkStart + 1,
                answerStart: chunkStart + 1,
                answerEnd: chunkEnd,
                duration: chunkEnd - chunkStart,
                questionText: `${chapter.title || `Chapter ${idx + 1}`} - Part ${i + 1}`,
                answerText: `Content from ${chapter.title || `Chapter ${idx + 1}`} (${formatTime(chunkStart)}-${formatTime(chunkEnd)})`,
                questionSpeaker: 'SPEAKER_00',
                answerSpeaker: 'SPEAKER_00',
                score: 85,
                priority: 'medium',
                reasons: ['youtube-chapter-chunk', 'chapter-too-long'],
                labels: {
                  question: 'Chapter',
                  answer: 'Content'
                },
                source: 'youtube-chapter-chunk',
                chapterTitle: chapter.title
              });
            }

            return chunks;
          }
        }
      }).flat();

      finalQaPairs = chapterQaPairs;
      console.log(`[Q&A] Generated ${finalQaPairs.length} clips from chapters`);
    } else {
      // No chapters found - fallback to full Q&A detection
      console.log('[Q&A] No chapters found, using full Q&A detection');

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

      finalQaPairs = qaResult.qaPairs.map((pair, idx) => ({
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
        },
        source: 'ai-detection'
      }));

      console.log(`[Q&A] Generated ${finalQaPairs.length} clips from AI detection`);
    }

    // Sort by score descending
    finalQaPairs.sort((a, b) => b.score - a.score);

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

    // Copy downloaded file to output directory for export
    const outputFilename = videoProcessor.generateUniqueFilename('mp4');
    const outputPath = path.join(videoProcessor.outputDir, outputFilename);
    await fs.promises.copyFile(downloadedFile, outputPath);

    // Clean up temp files (keep output file)
    try {
      await fs.promises.unlink(downloadedFile);
      const audioPath = tempFilePath + '.wav';
      if (fs.existsSync(audioPath)) {
        await fs.promises.unlink(audioPath);
      }
      // Keep preview file for streaming
      const previewUrl = `/temp/${path.basename(previewPath)}`;

      res.json({
        success: true,
        qaPairs: finalQaPairs,
        stats: {
          totalSegments: finalQaPairs.length,
          qaPairsFound: finalQaPairs.length,
          chaptersUsed: chapters.length > 0,
          chapterCount: chapters.length
        },
        videoPath: outputPath,
        videoPathForExport: outputPath,
        previewUrl: previewUrl,
        videoInfo: {
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail
        },
        message: chapters.length > 0
          ? `Found ${finalQaPairs.length} clips using YouTube chapters`
          : `Found ${finalQaPairs.length} Q&A pairs using AI detection`
      });
    } catch (err) {
      console.error('Error cleaning up temp files:', err);
      // Still return success even if cleanup fails
      const previewUrl = `/temp/${path.basename(previewPath)}`;

      res.json({
        success: true,
        qaPairs: finalQaPairs,
        stats: {
          totalSegments: finalQaPairs.length,
          qaPairsFound: finalQaPairs.length,
          chaptersUsed: chapters.length > 0,
          chapterCount: chapters.length
        },
        videoPath: outputPath,
        videoPathForExport: outputPath,
        previewUrl: previewUrl,
        videoInfo: {
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail
        },
        message: chapters.length > 0
          ? `Found ${finalQaPairs.length} clips using YouTube chapters`
          : `Found ${finalQaPairs.length} Q&A pairs using AI detection`
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


// Track download progress for polling
let downloadProgressMap = {};

// Route to get download progress by ID
router.get('/progress', (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Progress ID is required' });
  }
  const progress = downloadProgressMap[id] || { percent: 0, eta: null, speed: null };
  res.json(progress);
});

// Route to clear cache and temp files
router.post('/clear-cache', (req, res) => {
  try {
    const tempDir = path.join(__dirname, '../../temp');
    const outputDir = path.join(__dirname, '../../output');

    // Function to delete files in a directory
    const clearDirectory = (dirPath) => {
      if (!fs.existsSync(dirPath)) return;

      fs.readdirSync(dirPath).forEach((file) => {
        const filePath = path.join(dirPath, file);
        try {
          if (fs.statSync(filePath).isDirectory()) {
            clearDirectory(filePath);
          } else {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.error(`Error deleting ${filePath}:`, err);
        }
      });
    };

    // Clear temp and output directories
    clearDirectory(tempDir);
    clearDirectory(outputDir);

    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache: ' + error.message
    });
  }
});

module.exports = router;

// Helper function to extract YouTube chapters from video info
function extractChaptersFromInfo(info) {
  // YouTube chapters come from the 'chapters' array in video info
  if (!info.chapters || !Array.isArray(info.chapters) || info.chapters.length === 0) {
    return [];
  }

  return info.chapters.map((chapter, index) => ({
    id: `chapter-${index}`,
    title: chapter.title || `Chapter ${index + 1}`,
    start: chapter.start_time,
    end: chapter.end_time,
    duration: chapter.end_time - chapter.start_time,
    source: 'youtube-chapter',
    // YouTube chapters are curated by creators, so they get high confidence
    confidence: 'high'
  }));
}

// Helper function to break down long chapters into smaller clips
function breakDownLongChapters(chapters, maxDuration = 120, chunkDuration = 90) {
  const result = [];

  for (const chapter of chapters) {
    const duration = chapter.end - chapter.start;

    if (duration <= maxDuration) {
      // Chapter is within limit, use as-is (add duration property)
      result.push({ ...chapter, duration });
    } else {
      // Chapter is too long, break into chunks
      const numChunks = Math.ceil(duration / chunkDuration);

      for (let i = 0; i < numChunks; i++) {
        const chunkStart = chapter.start + (i * chunkDuration);
        const chunkEnd = Math.min(chapter.start + ((i + 1) * chunkDuration), chapter.end);

        result.push({
          ...chapter,
          id: `${chapter.id}-chunk-${i}`,
          start: chunkStart,
          end: chunkEnd,
          duration: chunkEnd - chunkStart,
          title: `${chapter.title} - Part ${i + 1}`,
          source: `${chapter.source}-chunk`
        });
      }
    }
  }

  return result;
}

// Extract chapters info for API response
function getChaptersInfo(info) {
  if (!info.chapters || !Array.isArray(info.chapters) || info.chapters.length === 0) {
    return null;
  }
  return {
    count: info.chapters.length,
    chapters: info.chapters.map((c) => ({
      title: c.title,
      start: c.start_time,
      end: c.end_time
    }))
  };
}

// Export helper functions for testing/use
module.exports = router;
module.exports.breakDownLongChapters = breakDownLongChapters;
