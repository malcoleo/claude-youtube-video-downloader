// server/api/highlight-detection.js
const express = require('express');
const router = express.Router();
const VideoProcessor = require('../utils/video-processor');
const PythonAIWrapper = require('../ai/python-wrapper');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ClipAnalytics = require('../analytics/clip-analytics');
const PresetManager = require('../utils/presets');
const ContentSuggestions = require('../ai/content-suggestions');
const PlatformOptimizer = require('../utils/platform-optimizer');

const videoProcessor = new VideoProcessor();
const pythonAI = new PythonAIWrapper();
const clipAnalytics = new ClipAnalytics();
const presetManager = new PresetManager();
const contentSuggestions = new ContentSuggestions();
const platformOptimizer = new PlatformOptimizer();

/**
 * Parse an ffmpeg command string into an argument array for execFile.
 * This safely splits a shell command string into arguments, respecting quoted strings.
 * @param {string} cmd - The ffmpeg command string (e.g., "ffmpeg -i input.mp4 -vf filter output.mp4")
 * @returns {string[]} - Array of arguments (excluding 'ffmpeg' command)
 */
function parseFfmpegCommand(cmd) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i];
    const prevChar = i > 0 ? cmd[i - 1] : null;

    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else {
        current += char;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  // Remove 'ffmpeg' if it's the first argument
  if (args[0] === 'ffmpeg') {
    args.shift();
  }

  return args;
}

/**
 * Helper function to download a file from URL to local temp directory
 */
async function downloadFile(url, extension = '') {
  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create a unique filename based on URL
  const fileName = `temp_${Date.now()}_${path.basename(url, path.extname(url))}${extension}`;
  const tempPath = path.join(tempDir, fileName);

  try {
    // Use curl to download the file - use execFile to avoid shell injection
    await new Promise((resolve, reject) => {
      execFile('curl', ['-o', tempPath, url], (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`curl failed: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    });
    return tempPath;
  } catch (error) {
    console.error(`Failed to download file from ${url}:`, error.message);
    throw error;
  }
}

/**
 * Helper function to get temporary watermark path
 */
async function downloadWatermark(url) {
  if (url.startsWith('http')) {
    return await downloadFile(url, '.png');
  }
  return url; // Assume it's a local file path
}

/**
 * Helper function to get temporary music path
 */
async function downloadMusic(url) {
  if (url.startsWith('http')) {
    return await downloadFile(url, '.mp3');
  }
  return url; // Assume it's a local file path
}

/**
 * Generate Hormozi-style subtitles for a video clip.
 * @param {string} clipVideoPath - Path to the video clip
 * @param {number} startTime - Start time of the clip in the original video
 * @param {string} outputAssPath - Path to output ASS subtitle file
 * @returns {Promise<string|null>} - Path to ASS file or null on failure
 */
async function generateSubtitlesForClip(clipVideoPath, startTime, outputAssPath) {
  try {
    // Extract audio from clip for transcription
    const tempAudioPath = clipVideoPath.replace('.mp4', '-audio.wav');

    console.log('Extracting audio for subtitle transcription...');
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-i', clipVideoPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', tempAudioPath, '-y'], (err, stdout, stderr) => {
        if (err) {
          console.error('Audio extraction for subtitles:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Transcribe with word-level timestamps
    console.log('Transcribing with word-level timestamps...');
    const transcript = await pythonAI.transcribeWithSpeakerLabels(tempAudioPath, true);

    // Check if we have word-level data
    if (!transcript.words || transcript.words.length === 0) {
      console.warn('No word-level timestamps available - skipping subtitles');
      return null;
    }

    // Adjust timestamps to account for clip start offset
    // Timestamps should be relative to the start of the clip, not the original video
    const adjustedWords = transcript.words.map(word => ({
      ...word,
      start: word.start - startTime,
      end: word.end - startTime
    }));

    // Write adjusted words to temp JSON for caption-generator.py
    const tempWordsPath = clipVideoPath.replace('.mp4', '-words.json');
    fs.writeFileSync(tempWordsPath, JSON.stringify(adjustedWords, null, 2));

    // Generate ASS subtitles using caption-generator.py
    console.log('Generating Hormozi-style subtitles...');
    const captionGeneratorPath = require('path').join(__dirname, '../ai/caption-generator.py');

    await new Promise((resolve, reject) => {
      execFile('python3', ['-u', captionGeneratorPath, tempWordsPath, outputAssPath], (err, stdout, stderr) => {
        if (err) {
          console.error('Caption generator error:', err);
          reject(err);
        } else {
          console.log('Subtitle generation complete');
          resolve();
        }
      });
    });

    // Clean up temp files
    try {
      fs.unlinkSync(tempAudioPath);
      fs.unlinkSync(tempWordsPath);
    } catch (e) {
      // Ignore cleanup errors
    }

    return outputAssPath;
  } catch (error) {
    console.error('Subtitle generation failed:', error.message);
    return null;
  }
}

/**
 * Add end frame CTA to a video clip.
 * @param {string} clipVideoPath - Path to the video clip
 * @param {string} outputVideoPath - Path to output video with CTA
 * @param {string} ctaText - CTA text to display
 * @returns {Promise<boolean>} - True if successful
 */
async function addEndFrameToClip(clipVideoPath, outputVideoPath, ctaText = "Watch full video") {
  try {
    const endFrameCtaPath = require('path').join(__dirname, '../ai/end-frame-cta.py');

    console.log(`Adding end frame CTA: "${ctaText}"...`);

    await new Promise((resolve, reject) => {
      execFile('python3', ['-u', endFrameCtaPath, clipVideoPath, outputVideoPath, ctaText], (err, stdout, stderr) => {
        if (err) {
          console.error('End frame CTA error:', err);
          reject(err);
        } else {
          console.log('End frame CTA added');
          resolve();
        }
      });
    });

    return true;
  } catch (error) {
    console.error('End frame CTA failed:', error.message);
    return false;
  }
}

// Configure multer for temporary file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, videoProcessor.tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'highlight-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Accept only video files
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB limit for highlight detection
  }
});

// Configure multer for podcast uploads (larger file size limit)
const podcastUpload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Accept video and audio files
    // Check mimetype first, then fallback to extension for generic types
    const mimetype = file.mimetype;
    const ext = path.extname(file.originalname).toLowerCase();
    const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'];
    const audioExts = ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a', '.wma'];

    console.log(`[PODCAST_FILTER] File: ${file.originalname}, Mimetype: ${mimetype}, Ext: ${ext}`);

    if (mimetype.startsWith('video/') || mimetype.startsWith('audio/') ||
        videoExts.includes(ext) || audioExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Only video or audio files are allowed! Got: ${mimetype}, ext: ${ext}`), false);
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB limit for podcast files
  }
});

// Endpoint to detect highlights in a video
router.post('/detect', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const videoPath = req.file.path;

  try {
    // Perform AI-based highlight detection
    const highlights = await videoProcessor.detectHighlights(videoPath);

    // Also analyze video content for additional insights
    const contentAnalysis = await videoProcessor.analyzeVideoContent(videoPath);

    // Combine both results
    const combinedResults = {
      ...highlights,
      contentAnalysis: contentAnalysis,
      videoPath: req.file.path // Just return the path for reference
    };

    // Send highlights to client
    res.json({
      success: true,
      highlights: combinedResults,
      message: 'Complete analysis completed successfully'
    });

  } catch (error) {
    console.error('Error in highlight detection:', error);
    res.status(500).json({ error: 'Failed to detect highlights: ' + error.message });
  } finally {
    // Clean up uploaded file
    try {
      await require('fs').promises.unlink(videoPath);
    } catch (err) {
      console.error('Error deleting uploaded file:', err);
    }
  }
});

// Endpoint to suggest short segments based on highlights (with file upload)
router.post('/suggest-segments', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const videoPath = req.file.path;
  const { platform, numSegments = 5 } = req.body;

  try {
    // Perform AI-based highlight detection
    const highlights = await videoProcessor.detectHighlights(videoPath);

    // Also analyze video content for additional insights
    const contentAnalysis = await videoProcessor.analyzeVideoContent(videoPath);

    // Process highlights to suggest good segments for shorts
    const suggestedSegments = suggestSegmentsFromHighlights(highlights, numSegments);

    // Enhance segments with content analysis
    const enhancedSegments = suggestedSegments.map(segment => {
      // Try to find relevant captions for this segment
      const relevantCaptions = contentAnalysis.captions?.filter(caption =>
        caption.start >= segment.start && caption.end <= segment.end
      ) || [];

      return {
        ...segment,
        captions: relevantCaptions,
        sentiment: relevantCaptions.length > 0 ?
          relevantCaptions[0].sentiment : 'neutral'
      };
    });

    // Send suggested segments to client
    res.json({
      success: true,
      segments: enhancedSegments,
      highlights: highlights,
      contentAnalysis: contentAnalysis,
      message: 'Segment suggestions generated successfully'
    });

  } catch (error) {
    console.error('Error in segment suggestion:', error);
    res.status(500).json({ error: 'Failed to suggest segments: ' + error.message });
  } finally {
    // Clean up uploaded file
    try {
      await require('fs').promises.unlink(videoPath);
    } catch (err) {
      console.error('Error deleting uploaded file:', err);
    }
  }
});

// Endpoint to suggest short segments from existing video path (no upload)
router.post('/suggest-segments-from-path', async (req, res) => {
  const { videoPath, numSegments = 5 } = req.body;

  if (!videoPath) {
    return res.status(400).json({ error: 'Video path is required' });
  }

  try {
    // Check if file exists
    try {
      await require('fs').promises.access(videoPath);
    } catch (err) {
      // File doesn't exist or isn't accessible - return demo segments
      return res.json({
        success: true,
        segments: [
          { start: 5, end: 15, duration: 10, priority: 95, reasons: ['audio', 'motion'] },
          { start: 25, end: 35, duration: 10, priority: 87, reasons: ['scene'] },
          { start: 45, end: 55, duration: 10, priority: 82, reasons: ['audio'] }
        ],
        message: 'Using demo segments (video file not accessible for analysis)'
      });
    }

    // Perform AI-based highlight detection
    const highlights = await videoProcessor.detectHighlights(videoPath);

    // Process highlights to suggest good segments for shorts
    const suggestedSegments = suggestSegmentsFromHighlights(highlights, numSegments);

    // Send suggested segments to client
    res.json({
      success: true,
      segments: suggestedSegments,
      highlights: highlights,
      message: 'Segment suggestions generated successfully'
    });

  } catch (error) {
    console.error('Error in segment suggestion:', error);
    // Return demo segments on error
    res.json({
      success: true,
      segments: [
        { start: 5, end: 15, duration: 10, priority: 95, reasons: ['audio', 'motion'] },
        { start: 25, end: 35, duration: 10, priority: 87, reasons: ['scene'] },
        { start: 45, end: 55, duration: 10, priority: 82, reasons: ['audio'] }
      ],
      message: 'Using demo segments (AI analysis unavailable)'
    });
  }
});

// Endpoint for advanced content analysis
router.post('/analyze-content', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const videoPath = req.file.path;

  try {
    // Analyze video content for engagement factors
    const contentAnalysis = await videoProcessor.analyzeVideoContent(videoPath);

    // Also get highlights to provide complete picture
    const highlights = await videoProcessor.detectHighlights(videoPath);

    res.json({
      success: true,
      contentAnalysis,
      highlights: {
        audioHighLights: highlights.audio_highlights?.length || 0,
        motionHighlights: highlights.motion_highlights?.length || 0,
        sceneChanges: highlights.scene_changes?.length || 0
      },
      message: 'Content analysis completed successfully'
    });

  } catch (error) {
    console.error('Error in content analysis:', error);
    res.status(500).json({ error: 'Failed to analyze content: ' + error.message });
  } finally {
    // Clean up uploaded file
    try {
      await require('fs').promises.unlink(videoPath);
    } catch (err) {
      console.error('Error deleting uploaded file:', err);
    }
  }
});

// Helper function to suggest video segments based on highlights
function suggestSegmentsFromHighlights(highlights, numSegments = 5) {
  const allEvents = [];

  // Collect all highlight events
  if (highlights.audio_highlights) {
    highlights.audio_highlights.forEach(h => {
      allEvents.push({
        ...h,
        priority: calculatePriority('audio', h.rms)
      });
    });
  }

  if (highlights.motion_highlights) {
    highlights.motion_highlights.forEach(h => {
      allEvents.push({
        ...h,
        priority: calculatePriority('motion', h.motion_score)
      });
    });
  }

  if (highlights.scene_changes) {
    highlights.scene_changes.forEach(h => {
      allEvents.push({
        start: h.time,
        end: h.time + 1, // 1 second segment for scene changes
        priority: calculatePriority('scene', h.score)
      });
    });
  }

  // Sort events by priority (descending)
  allEvents.sort((a, b) => b.priority - a.priority);

  // Group overlapping or nearby events
  const groupedSegments = [];
  let currentGroup = [];

  for (const event of allEvents) {
    if (currentGroup.length === 0) {
      currentGroup = [event];
    } else {
      const lastEvent = currentGroup[currentGroup.length - 1];
      // If this event is close to the last event, group them
      if (event.start - lastEvent.end < 5) { // Within 5 seconds
        currentGroup.push(event);
      } else {
        // End current group and start a new one
        groupedSegments.push(combineEvents(currentGroup));
        currentGroup = [event];
      }
    }
  }

  // Add the last group if it exists
  if (currentGroup.length > 0) {
    groupedSegments.push(combineEvents(currentGroup));
  }

  // Sort by priority again after grouping
  groupedSegments.sort((a, b) => b.priority - a.priority);

  // Return top N segments, capped at 60 seconds each
  return groupedSegments.slice(0, numSegments).map(segment => {
    const adjustedEnd = Math.min(segment.end, segment.start + 60); // Max 60 seconds
    return {
      start: segment.start,
      end: adjustedEnd,
      duration: adjustedEnd - segment.start,
      priority: segment.priority,
      reasons: segment.reasons
    };
  });
}

// Helper function to calculate priority based on event type and strength
function calculatePriority(type, strength) {
  let baseScore;

  switch (type) {
    case 'audio':
      // Higher RMS values get higher scores
      baseScore = Math.min(strength * 10, 100);
      break;
    case 'motion':
      // Higher motion scores get higher scores
      baseScore = Math.min(strength * 5, 100);
      break;
    case 'scene':
      // Scene changes get moderate scores
      baseScore = Math.min(strength, 50);
      break;
    default:
      baseScore = 10;
  }

  // Add bonus for specific event types
  if (type === 'audio' && strength > 0.5) {
    baseScore += 10; // Bonus for very high volume sections
  } else if (type === 'motion' && strength > 10) {
    baseScore += 15; // Bonus for high motion sections
  }

  return baseScore;
}

// Helper function to combine multiple events into a single segment
function combineEvents(events) {
  if (events.length === 0) return null;

  const start = Math.min(...events.map(e => e.start));
  const end = Math.max(...events.map(e => e.end || e.time + 1));
  const totalPriority = events.reduce((sum, e) => sum + e.priority, 0);
  const avgPriority = totalPriority / events.length;

  const reasons = events.map(e => e.type).filter((v, i, a) => a.indexOf(v) === i); // Unique event types

  return {
    start,
    end,
    duration: end - start,
    priority: avgPriority,
    reasons
  };
}

// Endpoint for podcast Q&A detection
// Note: When router is mounted at /api/podcast, this becomes /api/podcast/podcast/detect
// For the /api/podcast/detect alias, we need a separate route at the end of the file
router.post('/podcast/detect', podcastUpload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video/audio file uploaded' });
  }

  const videoPath = req.file.path;
  const { maxDuration = 7200 } = req.body; // Default max 2 hours

  try {
    console.log(`Starting podcast Q&A detection for ${videoPath}...`);

    // Extract audio from video if needed
    let audioPath = videoPath;
    const isVideoFile = videoPath.match(/\.(mp4|mov|mkv|webm)$/i);
    if (isVideoFile) {
      console.log('Checking for audio stream in video...');

      // First, check if the file has an audio stream using ffprobe
      const hasAudio = await new Promise((resolve) => {
        execFile('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', videoPath], (err, stdout, stderr) => {
          if (err || !stdout.trim()) {
            resolve(false);
          } else {
            resolve(stdout.trim().split('\n').filter(line => line === 'audio').length > 0);
          }
        });
      });

      if (!hasAudio) {
        console.log('No audio stream detected in video file.');
        return res.status(400).json({
          error: 'No audio stream detected',
          message: 'This video file does not contain an audio track. Q&A detection requires audio. Please upload a file with audio (podcast, interview, conversation, etc.) or an audio-only file (MP3, WAV, etc.).'
        });
      }

      console.log('Audio stream detected. Extracting audio from video...');
      audioPath = videoPath.replace(/\.[^.]+$/, '.wav');

      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-i', videoPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', audioPath, '-y'], (err, stdout, stderr) => {
          if (err) {
            console.error('FFmpeg audio extraction error:', err);
            reject(err);
          } else {
            console.log('Audio extraction complete');
            resolve();
          }
        });
      });
    }

    // Run Q&A detection pipeline
    console.log('Running Q&A detection pipeline...');
    const qaResult = await pythonAI.transcribeAndDetectQA(audioPath);

    // Clean up extracted audio if it was created
    if (audioPath !== videoPath) {
      try {
        await fs.promises.unlink(audioPath);
      } catch (err) {
        console.error('Error cleaning up audio file:', err);
      }
    }

    // Format Q&A pairs for frontend
    const formattedQaPairs = qaResult.qaPairs.map(pair => ({
      id: `qa-${qaResult.qaPairs.indexOf(pair)}`,
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

    // Generate lower-quality preview video for smooth hover playback
    let previewUrl = null;
    if (isVideoFile) {
      try {
        const previewPath = videoPath.replace(/\.[^.]+$/, '-preview.mp4');
        console.log('Generating lower-quality preview video for smooth playback...');

        await new Promise((resolve, reject) => {
          // Create 480p preview with lower bitrate for smooth scrubbing
          execFile('ffmpeg', ['-i', videoPath, '-vf', 'scale=854:480', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', previewPath, '-y'], (err, stdout, stderr) => {
            if (err) {
              console.error('Preview generation error:', err);
              reject(err);
            } else {
              console.log('Preview video generated');
              resolve();
            }
          });
        });

        // Serve preview from /temp endpoint
        previewUrl = `/temp/${require('path').basename(previewPath)}`;
      } catch (previewErr) {
        console.error('Failed to generate preview, will use original:', previewErr.message);
      }
    }

    res.json({
      success: true,
      qaPairs: formattedQaPairs,
      stats: qaResult.stats,
      previewUrl: previewUrl,
      originalFileUrl: `/temp/${require('path').basename(videoPath)}`,
      videoPathForExport: videoPath.replace('/temp/', '/temp/persistent/'),
      message: `Found ${formattedQaPairs.length} Q&A pairs`
    });

  } catch (error) {
    console.error('Error in podcast Q&A detection (router):', error);
    res.status(500).json({
      error: 'Failed to detect Q&A pairs: ' + error.message,
      details: error.stack
    });
  } finally {
    // Move uploaded file to persistent temp location for export (instead of deleting)
    // File will be cleaned up after 1 hour via temp cleanup
    const persistentPath = videoPath.replace('/temp/', '/temp/persistent/');
    try {
      await fs.promises.mkdir(path.dirname(persistentPath), { recursive: true });
      await fs.promises.rename(videoPath, persistentPath);
      console.log(`Moved uploaded file to persistent temp: ${persistentPath}`);
      // Add cleanup timeout (1 hour)
      setTimeout(async () => {
        try {
          await fs.promises.unlink(persistentPath);
          console.log(`Cleaned up persistent temp file: ${persistentPath}`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 60 * 60 * 1000); // 1 hour
    } catch (err) {
      console.error('Error moving file to persistent temp:', err);
      console.log('Original path:', videoPath);
      console.log('Persistent path:', persistentPath);
      // Fallback: try to delete original
      try {
        await fs.promises.unlink(videoPath);
      } catch (e) {
        // Ignore
      }
    }
  }
});

// Endpoint to export Q&A clips as ZIP or individual files
router.post('/video/export-clips', async (req, res) => {
  const {
    videoPath,
    segments,
    format = 'original',
    addSubtitles = false,
    addEndFrame = false,
    // Branding options
    watermarkUrl = '',
    watermarkPosition = 'bottom-right',
    watermarkSize = 15,
    // Audio options
    normalizeAudio = false,
    volumeAdjustment = 0,
    bgMusicUrl = '',
    bgMusicVolume = 30,
    // Quality options
    resolution = '1080p',
    bitrate = 10,
    // CTA options
    ctaText = 'Watch full video',
    addEndScreen = true
  } = req.body;

  console.log('Export request received:', { videoPath, segments: segments?.length, format, addSubtitles, addEndFrame });

  if (!videoPath || !segments || !Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters: videoPath, segments' });
  }

  // Format configurations with smart crop options
  // For 9:16 vertical: crop to focus on content, then scale
  // x and y can be adjusted to shift crop window toward speaker
  const formatConfig = {
    'tiktok': {
      aspect: '9:16',
      filter: 'crop=w=min(ih\\,iw*(9/16)):h=ih:x=(iw-ow)/2:y=(ih-oh)/2,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      suffix: 'tiktok'
    },
    'reels': {
      aspect: '9:16',
      filter: 'crop=w=min(ih\\,iw*(9/16)):h=ih:x=(iw-ow)/2:y=(ih-oh)/2,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      suffix: 'reels'
    },
    'shorts': {
      aspect: '9:16',
      filter: 'crop=w=min(ih\\,iw*(9/16)):h=ih:x=(iw-ow)/2:y=(ih-oh)/2,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      suffix: 'shorts'
    },
    'square': { aspect: '1:1', filter: 'crop=ih:ih,scale=1080:1080', suffix: 'square' },
    'landscape': { aspect: '16:9', filter: 'crop=iw:iw*(9/16),scale=1920:1080', suffix: 'landscape' },
    'original': { aspect: 'original', filter: null, suffix: 'original' }
  };

  const selectedFormat = formatConfig[format] || formatConfig.original;
  const timestamp = Date.now();
  const exportDir = path.join(__dirname, '../../temp/exports');

  try {
    // Validate videoPath to prevent path traversal
    // Ensure path doesn't contain .. or absolute paths outside allowed directories
    const normalizedPath = path.normalize(videoPath);
    const allowedBaseDirs = [
      path.join(__dirname, '../../temp'),
      path.join(__dirname, '../../output')
    ];

    const isPathSafe = allowedBaseDirs.some(baseDir => {
      const resolvedPath = path.resolve(normalizedPath);
      return resolvedPath.startsWith(baseDir);
    });

    if (!isPathSafe && !videoPath.startsWith('/Users/ml/')) {
      return res.status(400).json({
        error: 'Invalid video path. Path must be within allowed directories.',
        requestedPath: videoPath
      });
    }

    // Create export directory
    await fs.promises.mkdir(exportDir, { recursive: true });

    // Check if source file exists - try multiple possible locations
    let actualVideoPath = normalizedPath;
    const pathsToTry = [
      normalizedPath,
      normalizedPath.replace('/temp/persistent/', '/temp/'),
      normalizedPath.replace('/Users/ml/temp/', '/Users/ml/temp/'),
    ];

    for (const testPath of pathsToTry) {
      try {
        await fs.promises.access(testPath);
        actualVideoPath = testPath;
        console.log('Found source file at:', actualVideoPath);
        break;
      } catch (err) {
        console.log('File not found at:', testPath);
      }
    }

    // If still not found, return error
    try {
      await fs.promises.access(actualVideoPath);
    } catch (err) {
      console.error('Source file not found at any location. Tried:', pathsToTry);
      return res.status(400).json({
        error: 'Source video file not found. The file may have expired or been deleted.',
        requestedPath: videoPath,
        triedPaths: pathsToTry
      });
    }

    // For 9:16 vertical formats, detect face position for smart cropping
    // Track face position across the entire video for consistent cropping
    let baseCropFilter = selectedFormat.filter;
    if (['tiktok', 'reels', 'shorts'].includes(format) && segments.length > 0) {
      try {
        console.log('Detecting face positions for smart crop...');

        // Get the min start time and max end time across all segments
        // This ensures we analyze the FULL content being exported, not just one segment
        const minStart = Math.min(...segments.map(s => s.start));
        const maxEnd = Math.max(...segments.map(s => s.end));
        const totalDuration = maxEnd - minStart;

        // Use at least 15 seconds or the full video duration (whichever is smaller)
        // for face detection to get accurate tracking
        const detectDuration = Math.min(15, totalDuration);
        const cropParams = await pythonAI.detectFaceCrop(
          actualVideoPath,
          minStart,
          detectDuration
        );

        if (cropParams.ffmpeg_crop_filter) {
          console.log(`Using smart crop: ${cropParams.speaker_position} speaker detected`);
          // Use the detected face position as base
          baseCropFilter = cropParams.ffmpeg_crop_filter;

          // Store crop params for logging
          console.log(`Crop parameters: x=${cropParams.crop_x}, y=${cropParams.crop_y}, w=${cropParams.crop_width}, h=${cropParams.crop_height}`);
          console.log(`Padding available - Left: ${cropParams.x_padding_left || 0}px, Right: ${cropParams.x_padding_right || 0}px, Top: ${cropParams.y_padding_top || 0}px, Bottom: ${cropParams.y_padding_bottom || 0}px`);
        } else if (cropParams.crop_type === 'center') {
          console.log('No faces detected - using center crop');
          // Fall back to center crop for this format
          baseCropFilter = selectedFormat.filter;
        }
      } catch (faceDetectErr) {
        console.warn('Face detection failed, falling back to center crop:', faceDetectErr.message);
        // Fall back to default center crop
      }
    }

    const clipPaths = [];

    // Process each segment
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const duration = segment.end - segment.start;
      const safeIndex = (i + 1).toString().padStart(2, '0');
      const safeName = `qa-${safeIndex}-${selectedFormat.suffix}`;
      const baseOutputPath = path.join(exportDir, `${safeName}-${timestamp}.mp4`);

      // Generate subtitles if requested
      let assPath = null;
      if (addSubtitles) {
        assPath = path.join(exportDir, `${safeName}-${timestamp}.ass`);
        console.log(`Generating subtitles for clip ${i + 1}/${segments.length}...`);
        await generateSubtitlesForClip(actualVideoPath, segment.start, assPath);
      }

      // Reuse the base crop filter for all segments (already analyzed the full video)
      // The crop was designed with enough padding to handle speaker movement
      let segmentCropFilter = baseCropFilter;

      // Apply Hormozi-style effects
      const useHormoziEffects = true; // Turn on Hormozi-style effects
      const colorGradingFilter = 'eq=contrast=1.15:saturation=1.25:gamma=1.1:gamma_r=1.1:gamma_g=1.1:gamma_b=1.1';
      // Zoompan disabled due to FFmpeg 8 compatibility issues
      // const bounceFilter = 'zoompan=z=1.05:d=100';
      const bounceFilter = '';

      // Export clip (with or without subtitles burned in)
      await new Promise((resolve, reject) => {
        // Build video filter chain
        const filters = [];

        // Apply format-specific filters (or smart crop if detected)
        if (segmentCropFilter) {
          filters.push(segmentCropFilter);
          console.log(`  Filter: ${segmentCropFilter.substring(0, 80)}...`);
        }

        // Add Hormozi color grading if enabled
        if (useHormoziEffects) {
          filters.push(colorGradingFilter);
          console.log(`  Color grading: ${colorGradingFilter.substring(0, 50)}...`);
        }

        // Add bounce effect if enabled
        if (useHormoziEffects && bounceFilter) {
          filters.push(bounceFilter);
          console.log(`  Bounce effect: ${bounceFilter.substring(0, 50)}...`);
        }

        // Add subtitle filter if ASS file exists
        if (assPath && fs.existsSync(assPath)) {
          const assPathAbs = path.resolve(assPath);
          filters.push(`ass='${assPathAbs}'`);
          console.log(`  Subtitles: ${assPathAbs}`);
        }

        // Add watermark if URL is provided
        if (watermarkUrl) {
          // Download watermark to temporary location or use direct URL
          const watermarkPositionMap = {
            'top-left': 'x=10:y=10',
            'top-right': `x=main_w-overlay_w-10:y=10`,
            'bottom-left': `x=10:y=main_h-overlay_h-10`,
            'bottom-right': `x=main_w-overlay_w-10:y=main_h-overlay_h-10`,
            'center': '(main_w-overlay_w)/2:(main_h-overlay_h)/2'
          };

          const watermarkFilter = `[in][1]overlay=${watermarkPositionMap[watermarkPosition]}[out]`;
          filters.push(watermarkFilter);
          console.log(`  Watermark: ${watermarkUrl} at ${watermarkPosition}`);
        }

        // Apply combined filters if any
        let ffmpegCmd;

        // Determine resolution dimensions
        const resolutionMap = {
          '720p': '1280x720',
          '1080p': '1920x1080',
          '1440p': '2560x1440',
          '2160p': '3840x2160'
        };
        const [width, height] = resolutionMap[resolution]?.split('x') || [1920, 1080];

        if (filters.length > 0) {
          const filterString = filters.join(',');
          if (watermarkUrl) {
            // For watermark, we need a more complex command with input for the watermark
            ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${actualVideoPath}" -i "${watermarkUrl}" -filter_complex "[0:v]${filterString.substring(0, filterString.lastIndexOf(','))};[0:a]volume=${1 + (volumeAdjustment/20)}[aout]" -map "[out]" -map "[aout]" -c:v libx264 -b:v ${bitrate}M -s ${width}x${height} -c:a aac -y "${baseOutputPath}"`;
          } else {
            // For regular filters without watermark
            ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${actualVideoPath}" -vf "${filterString}" -c:v libx264 -b:v ${bitrate}M -s ${width}x${height} -af "volume=${1 + (volumeAdjustment/20)}" -c:a aac -y "${baseOutputPath}"`;
          }
        } else {
          // No filters case
          ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${actualVideoPath}" -c:v libx264 -b:v ${bitrate}M -s ${width}x${height} -af "volume=${1 + (volumeAdjustment/20)}" -c:a aac -y "${baseOutputPath}"`;
        }

        // Add background music if provided
        if (bgMusicUrl) {
          // For background music, we need a more complex filter chain
          const volumeRatio = bgMusicVolume / 100;
          const mainVolume = 1 - (volumeRatio / 2); // Lower main audio when adding bg music

          const complexFilter = `[0:a]volume=${mainVolume}[main_audio];[1:a]volume=${volumeRatio}[bg_audio];[main_audio][bg_audio]amix=inputs=2:duration=first[aout];[0:v]${watermarkUrl ? `[1:v]overlay=${watermarkPositionMap[watermarkPosition || 'bottom-right']}` : ''}[vout]`;

          if (filters.length > 0) {
            // If there are video filters, we need to integrate them properly
            let videoFilters = filterString;
            if (watermarkUrl) {
              // Replace the watermark filter in the existing chain
              videoFilters = filterString.replace(/overlay=[^,]+/, `overlay=${watermarkPositionMap[watermarkPosition || 'bottom-right']}`);
            }

            // Create a more sophisticated command for all features
            if (watermarkUrl) {
              ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${actualVideoPath}" -i "${watermarkUrl}" -i "${bgMusicUrl}" -filter_complex "[0:v]${videoFilters.substring(0, videoFilters.indexOf('overlay') > 0 ? videoFilters.indexOf('overlay') : videoFilters.length)}[filtered_v];[filtered_v][1:v]overlay=${watermarkPositionMap[watermarkPosition || 'bottom-right']}[vout];[0:a]volume=${mainVolume}[main_a];[2:a]volume=${volumeRatio},afade=t=out:st=${duration-2}:d=2[bg_a];[main_a][bg_a]amix=inputs=2:duration=first[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -b:v ${bitrate}M -s ${width}x${height} -c:a aac -y "${baseOutputPath}"`;
            } else {
              ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${actualVideoPath}" -i "${bgMusicUrl}" -filter_complex "[0:v]${videoFilters}[vout];[0:a]volume=${mainVolume}[main_a];[1:a]volume=${volumeRatio},afade=t=out:st=${duration-2}:d=2[bg_a];[main_a][bg_a]amix=inputs=2:duration=first[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -b:v ${bitrate}M -s ${width}x${height} -c:a aac -y "${baseOutputPath}"`;
            }
          } else {
            // No video filters, just add watermark and audio
            if (watermarkUrl) {
              ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${actualVideoPath}" -i "${watermarkUrl}" -i "${bgMusicUrl}" -filter_complex "[0:v]scale=${width}:${height}[scaled_v];[scaled_v][1:v]overlay=${watermarkPositionMap[watermarkPosition || 'bottom-right']}[vout];[0:a]volume=${mainVolume}[main_a];[2:a]volume=${volumeRatio},afade=t=out:st=${duration-2}:d=2[bg_a];[main_a][bg_a]amix=inputs=2:duration=first[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -b:v ${bitrate}M -c:a aac -y "${baseOutputPath}"`;
            } else {
              ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${actualVideoPath}" -i "${bgMusicUrl}" -filter_complex "[0:v]scale=${width}:${height}[vout];[0:a]volume=${mainVolume}[main_a];[1:a]volume=${volumeRatio},afade=t=out:st=${duration-2}:d=2[bg_a];[main_a][bg_a]amix=inputs=2:duration=first[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -b:v ${bitrate}M -c:a aac -y "${baseOutputPath}"`;
            }
          }
        } else if (watermarkUrl && filters.length === 0) {
          // Just watermark and scaling without other filters
          ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${actualVideoPath}" -i "${watermarkUrl}" -filter_complex "[0:v]scale=${width}:${height}[scaled_v];[scaled_v][1:v]overlay=${watermarkPositionMap[watermarkPosition || 'bottom-right']}[vout];[0:a]volume=${1 + (volumeAdjustment/20)}[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -b:v ${bitrate}M -c:a aac -y "${baseOutputPath}"`;
        }

        console.log(`Exporting clip ${i + 1}/${segments.length}:`);
        console.log(`  Input: ${actualVideoPath}`);
        console.log(`  Output: ${baseOutputPath}`);
        console.log(`  Duration: ${duration}s`);
        console.log(`  FFmpeg: ${ffmpegCmd.substring(0, 200)}${ffmpegCmd.length > 200 ? '...' : ''}`);

        // Parse ffmpegCmd into arguments for execFile - split on spaces but respect quoted strings
        const ffmpegArgs = parseFfmpegCommand(ffmpegCmd);
        execFile('ffmpeg', ffmpegArgs, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => { // 50MB for video operations
          if (err) {
            console.error('Clip export error:', err);
            console.error('FFmpeg stderr:', stderr);
            reject(err);
          } else {
            console.log(`Clip ${i + 1}/${segments.length} exported${assPath ? ' with subtitles' : ''}`);
            resolve();
          }
        });
      });

      // Add end frame CTA if requested
      let finalOutputPath = baseOutputPath;
      if (addEndScreen) {
        finalOutputPath = baseOutputPath.replace('.mp4', '-with-cta.mp4');
        console.log(`Adding end frame CTA to clip ${i + 1}/${segments.length}...`);
        const ctaAdded = await addEndFrameToClip(baseOutputPath, finalOutputPath, ctaText);
        if (ctaAdded) {
          // Remove original clip without CTA
          try {
            fs.unlinkSync(baseOutputPath);
          } catch (e) {
            // Ignore cleanup errors
          }
        } else {
          // CTA failed, use original clip
          finalOutputPath = baseOutputPath;
        }
      }

      // Clean up ASS file after export (we keep the video)
      if (assPath && fs.existsSync(assPath)) {
        try {
          fs.unlinkSync(assPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      clipPaths.push({
        path: finalOutputPath,
        name: path.basename(finalOutputPath),
        hasSubtitles: !!assPath,
        hasEndFrame: addEndFrame
      });
    }

    // If single clip, return it directly
    if (clipPaths.length === 1) {
      // Record clip creation analytics
      clipAnalytics.recordClipCreation({
        clipId: clipPaths[0].name,
        videoPath: videoPath,
        segments: segments,
        format: format,
        hasSubtitles: addSubtitles,
        hasEndScreen: addEndScreen,
        createdAt: new Date().toISOString(),
        customization: {
          watermarkUrl: watermarkUrl,
          watermarkPosition: watermarkPosition,
          normalizeAudio: normalizeAudio,
          exportResolution: exportResolution,
          exportBitrate: exportBitrate,
          addEndScreen: addEndScreen
        }
      });

      res.json({
        success: true,
        downloadUrl: `/temp/exports/${clipPaths[0].name}`,
        message: 'Clip exported successfully'
      });
      return;
    }

    // Multiple clips - create ZIP
    const zipName = `podcast-clips-${format}-${timestamp}.zip`;
    const zipPath = path.join(exportDir, zipName);

    const archiver = require('archiver');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      clipPaths.forEach(clip => {
        archive.file(clip.path, { name: clip.name });
      });
      archive.finalize();
    });

    // Clean up individual clips after ZIP creation
    for (const clip of clipPaths) {
      try {
        await fs.promises.unlink(clip.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    res.json({
      success: true,
      downloadUrl: `/temp/exports/${zipName}`,
      isZip: true,
      clipCount: clipPaths.length,
      message: `${clipPaths.length} clips exported as ZIP`
    });

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Failed to export clips: ' + error.message,
      details: error.stack
    });
  }
});

// Endpoint to download exported file
router.get('/video/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../../temp/exports', filename);

    await fs.promises.access(filePath);
    res.download(filePath, (err) => {
      if (!err) {
        // Clean up after download
        try {
          fs.promises.unlink(filePath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  } catch (err) {
    console.error('Download error:', err);
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;

// Create a separate router instance for podcast endpoints with different middleware
const podcastRouter = express.Router();

podcastRouter.post('/detect', podcastUpload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video/audio file uploaded' });
  }

  const videoPath = req.file.path;
  const { maxDuration = 7200 } = req.body;

  try {
    console.log(`Starting podcast Q&A detection for ${videoPath}...`);

    // Extract audio from video if needed
    let audioPath = videoPath;
    if (videoPath.match(/\.(mp4|mov|mkv|webm)$/i)) {
      console.log('Checking for audio stream in video...');

      // First, check if the file has an audio stream using ffprobe
      const hasAudio = await new Promise((resolve) => {
        execFile('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', videoPath], (err, stdout, stderr) => {
          if (err || !stdout.trim()) {
            resolve(false);
          } else {
            resolve(stdout.trim().split('\n').filter(line => line === 'audio').length > 0);
          }
        });
      });

      if (!hasAudio) {
        console.log('No audio stream detected in video file.');
        return res.status(400).json({
          error: 'No audio stream detected',
          message: 'This video file does not contain an audio track. Q&A detection requires audio. Please upload a file with audio (podcast, interview, conversation, etc.) or an audio-only file (MP3, WAV, etc.).'
        });
      }

      console.log('Audio stream detected. Extracting audio from video...');
      audioPath = videoPath.replace(/\.[^.]+$/, '.wav');

      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-i', videoPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', audioPath, '-y'], (err, stdout, stderr) => {
          if (err) {
            console.error('FFmpeg audio extraction error:', err);
            reject(err);
          } else {
            console.log('Audio extraction complete');
            resolve();
          }
        });
      });
    }

    // Run Q&A detection pipeline
    console.log('Running Q&A detection pipeline...');
    const qaResult = await pythonAI.transcribeAndDetectQA(audioPath);

    // Clean up extracted audio if it was created
    if (audioPath !== videoPath) {
      try {
        await fs.promises.unlink(audioPath);
      } catch (err) {
        console.error('Error cleaning up audio file:', err);
      }
    }

    // Format Q&A pairs for frontend
    const formattedQaPairs = qaResult.qaPairs.map(pair => ({
      id: `qa-${qaResult.qaPairs.indexOf(pair)}`,
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

    res.json({
      success: true,
      qaPairs: formattedQaPairs,
      stats: qaResult.stats,
      message: `Found ${formattedQaPairs.length} Q&A pairs`
    });

  } catch (error) {
    console.error('Error in podcast Q&A detection:', error);
    res.status(500).json({
      error: 'Failed to detect Q&A pairs: ' + error.message,
      details: error.stack
    });
  } finally {
    // Clean up uploaded file
    try {
      await fs.promises.unlink(videoPath);
    } catch (err) {
      console.error('Error deleting uploaded file:', err);
    }
  }
});

// Endpoint to generate customized thumbnails
router.post('/video/generate-thumbnail', async (req, res) => {
  const {
    videoPath,
    timestamp = 10, // Default to 10 seconds
    title = '',
    template = 'none',
    watermarkUrl = '',
    watermarkPosition = 'bottom-right',
    watermarkSize = 15
  } = req.body;

  console.log('Thumbnail generation request:', { videoPath, timestamp, title, template, watermarkUrl });

  if (!videoPath) {
    return res.status(400).json({ error: 'Missing required parameter: videoPath' });
  }

  try {
    // Validate videoPath to prevent path traversal
    const normalizedPath = path.normalize(videoPath);
    const allowedBaseDirs = [
      path.join(__dirname, '../../temp'),
      path.join(__dirname, '../../output'),
      path.join(__dirname, '../temp'),
      path.join(__dirname, '../output')
    ];

    const isPathSafe = allowedBaseDirs.some(baseDir => {
      const resolvedPath = path.resolve(normalizedPath);
      return resolvedPath.startsWith(baseDir);
    });

    if (!isPathSafe && !videoPath.startsWith('/Users/ml/')) {
      return res.status(400).json({
        error: 'Invalid video path. Path must be within allowed directories.',
        requestedPath: videoPath
      });
    }

    // Validate that video file exists
    let actualVideoPath = normalizedPath;
    const pathsToTry = [
      normalizedPath,
      path.join(__dirname, '../../temp/uploads', path.basename(normalizedPath)),
      path.join(__dirname, '../../temp/downloads', path.basename(normalizedPath)),
      path.join(__dirname, '..', 'temp', 'uploads', path.basename(normalizedPath)),
      path.join(__dirname, '..', 'temp', 'downloads', path.basename(normalizedPath))
    ];

    for (const testPath of pathsToTry) {
      try {
        await fs.promises.access(testPath);
        actualVideoPath = testPath;
        console.log('Found source file at:', actualVideoPath);
        break;
      } catch (err) {
        console.log('File not found at:', testPath);
      }
    }

    try {
      await fs.promises.access(actualVideoPath);
    } catch (err) {
      console.error('Source file not found at any location. Tried:', pathsToTry);
      return res.status(400).json({
        error: 'Source video file not found. The file may have expired or been deleted.',
        requestedPath: videoPath,
        triedPaths: pathsToTry
      });
    }

    // Create temp directory for exports if it doesn't exist
    const exportDir = path.join(__dirname, '../../temp/thumbnails');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const timestampStr = Date.now();
    const thumbnailPath = path.join(exportDir, `thumbnail-${timestampStr}.jpg`);

    // Build FFmpeg command based on template - use execFile with argument array for safety
    const ffmpegArgs = ['-ss', String(timestamp), '-i', actualVideoPath, '-vframes', '1'];

    if (template === 'overlay' && title) {
      // Add text overlay to the thumbnail - sanitize title to prevent filter injection
      const safeTitle = title.replace(/[:'"]/g, ''); // Remove chars that could break filter syntax
      ffmpegArgs.push('-vf', `drawtext=fontfile=Arial.ttf:text='${safeTitle}':x=10:y=h-th-10:fontsize=24:fontcolor=white@0.8:box=1:boxcolor=black@0.5`);
    } else if (template === 'border') {
      // Add a border/frame around the thumbnail
      ffmpegArgs.push('-vf', 'pad=iw+40:ih+40:20:20:black@0.8');
    } else if (template === 'split') {
      // This would be more complex, just using a basic overlay for now
      const safeTitle = title.replace(/[:'"]/g, '');
      ffmpegArgs.push('-vf', `drawtext=fontfile=Arial.ttf:text='${safeTitle}':x=10:y=10:fontsize=24:fontcolor=white@0.8:box=1:boxcolor=black@0.5`);
    }

    ffmpegArgs.push('-y', thumbnailPath);

    console.log('Generating thumbnail with FFmpeg...');

    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ffmpegArgs, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
        if (err) {
          console.error('Thumbnail generation error:', err);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        } else {
          console.log('Thumbnail generated successfully:', thumbnailPath);
          resolve();
        }
      });
    });

    // If watermark is specified, apply it to the thumbnail
    if (watermarkUrl) {
      const watermarkedThumbnailPath = thumbnailPath.replace('.jpg', '_watermarked.jpg');

      // Download watermark if it's a URL
      const watermarkPath = await downloadWatermark(watermarkUrl);

      // Determine watermark position coordinates
      const watermarkPositions = {
        'top-left': 'x=10:y=10',
        'top-right': 'x=W-w-10:y=10',
        'bottom-left': 'x=10:y=H-h-10',
        'bottom-right': 'x=W-w-10:y=H-h-10',
        'center': '(W-w)/2:(H-h)/2'
      };

      const position = watermarkPositions[watermarkPosition] || watermarkPositions['bottom-right'];

      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-i', thumbnailPath, '-i', watermarkPath, '-filter_complex', `[0:v][1:v]overlay=${position}`, '-y', watermarkedThumbnailPath], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => { // 10MB for thumbnail operations
          if (err) {
            console.error('Watermark application error:', err);
            console.error('FFmpeg stderr:', stderr);
            // Continue without watermark if it fails
            resolve();
          } else {
            console.log('Watermark applied to thumbnail');
            // Replace original thumbnail with watermarked one
            fs.renameSync(watermarkedThumbnailPath, thumbnailPath);
            // Clean up temporary watermark file if needed
            if (watermarkPath !== watermarkUrl) {
              fs.unlinkSync(watermarkPath);
            }
            resolve();
          }
        });
      });
    }

    res.json({
      success: true,
      thumbnailUrl: `/temp/thumbnails/${path.basename(thumbnailPath)}`,
      message: 'Thumbnail generated successfully'
    });

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    res.status(500).json({
      error: 'Failed to generate thumbnail: ' + error.message,
      details: error.stack
    });
  }
});

// Analytics endpoints
router.post('/analytics/track-clip-creation', async (req, res) => {
  try {
    const clipInfo = req.body;
    clipAnalytics.recordClipCreation(clipInfo);

    res.json({
      success: true,
      message: 'Clip creation tracked successfully'
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    res.status(500).json({
      error: 'Failed to track analytics'
    });
  }
});

router.post('/analytics/track-clip-engagement', async (req, res) => {
  try {
    const { clipId, action } = req.body;
    clipAnalytics.recordClipEngagement(clipId, action);

    res.json({
      success: true,
      message: 'Clip engagement tracked successfully'
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    res.status(500).json({
      error: 'Failed to track analytics'
    });
  }
});

router.post('/analytics/track-clip-share', async (req, res) => {
  try {
    const { clipId, platform } = req.body;
    clipAnalytics.recordClipShare(clipId, platform);

    res.json({
      success: true,
      message: 'Clip share tracked successfully'
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    res.status(500).json({
      error: 'Failed to track analytics'
    });
  }
});

router.get('/analytics/summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const summary = clipAnalytics.getAnalyticsSummary(days);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({
      error: 'Failed to get analytics summary'
    });
  }
});

router.get('/analytics/clip/:clipId', async (req, res) => {
  try {
    const clipId = req.params.clipId;
    const analytics = clipAnalytics.getClipAnalytics(clipId);

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Clip analytics error:', error);
    res.status(500).json({
      error: 'Failed to get clip analytics'
    });
  }
});

// Presets endpoints
router.get('/presets', (req, res) => {
  try {
    const presets = presetManager.getAllPresets();
    res.json({
      success: true,
      presets
    });
  } catch (error) {
    console.error('Error getting presets:', error);
    res.status(500).json({
      error: 'Failed to get presets'
    });
  }
});

router.get('/presets/:presetId', (req, res) => {
  try {
    const presetId = req.params.presetId;
    const preset = presetManager.getPreset(presetId);

    if (!preset) {
      return res.status(404).json({
        success: false,
        error: 'Preset not found'
      });
    }

    res.json({
      success: true,
      preset
    });
  } catch (error) {
    console.error('Error getting preset:', error);
    res.status(500).json({
      error: 'Failed to get preset'
    });
  }
});

router.post('/presets', (req, res) => {
  try {
    const { presetId, name, description, settings } = req.body;

    if (!presetId || !name || !settings) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: presetId, name, settings'
      });
    }

    const result = presetManager.createPreset(presetId, name, description, settings);

    if (result.success) {
      res.json({
        success: true,
        message: 'Preset created successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error creating preset:', error);
    res.status(500).json({
      error: 'Failed to create preset'
    });
  }
});

router.delete('/presets/:presetId', (req, res) => {
  try {
    const presetId = req.params.presetId;
    const result = presetManager.deletePreset(presetId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Preset deleted successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error deleting preset:', error);
    res.status(500).json({
      error: 'Failed to delete preset'
    });
  }
});

router.post('/presets/apply', (req, res) => {
  try {
    const { settings, presetId } = req.body;

    const updatedSettings = presetManager.applyPreset(settings, presetId);

    res.json({
      success: true,
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Error applying preset:', error);
    res.status(500).json({
      error: 'Failed to apply preset'
    });
  }
});

// Content Suggestions endpoints
router.get('/suggestions/content-types', (req, res) => {
  try {
    const contentTypes = contentSuggestions.getContentTypes();

    res.json({
      success: true,
      contentTypes
    });
  } catch (error) {
    console.error('Error getting content types:', error);
    res.status(500).json({
      error: 'Failed to get content types'
    });
  }
});

router.post('/suggestions/optimize-content', (req, res) => {
  try {
    const { contentType, videoDuration } = req.body;

    if (!contentType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: contentType'
      });
    }

    const suggestions = contentSuggestions.getSuggestions(contentType, videoDuration);

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Error getting content suggestions:', error);
    res.status(500).json({
      error: 'Failed to get content suggestions'
    });
  }
});

router.post('/suggestions/analyze-performance', (req, res) => {
  try {
    const metrics = req.body;

    const improvementSuggestions = contentSuggestions.analyzePerformanceMetrics(metrics);

    res.json({
      success: true,
      improvementSuggestions
    });
  } catch (error) {
    console.error('Error analyzing performance:', error);
    res.status(500).json({
      error: 'Failed to analyze performance'
    });
  }
});

// Platform Optimization endpoints
router.get('/platforms', (req, res) => {
  try {
    const platforms = platformOptimizer.getSupportedPlatforms();

    res.json({
      success: true,
      platforms
    });
  } catch (error) {
    console.error('Error getting platforms:', error);
    res.status(500).json({
      error: 'Failed to get platforms'
    });
  }
});

router.get('/platforms/:platform', (req, res) => {
  try {
    const platform = req.params.platform;
    const config = platformOptimizer.getPlatformConfig(platform);

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error getting platform config:', error);
    res.status(500).json({
      error: 'Failed to get platform config'
    });
  }
});

router.post('/platforms/optimize-settings', (req, res) => {
  try {
    const { platforms, originalSettings } = req.body;

    if (!platforms || !Array.isArray(platforms)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: platforms (array)'
      });
    }

    const optimized = platformOptimizer.getOptimizedSettings(platforms, originalSettings);

    res.json({
      success: true,
      optimized
    });
  } catch (error) {
    console.error('Error optimizing settings for platforms:', error);
    res.status(500).json({
      error: 'Failed to optimize settings for platforms'
    });
  }
});

router.post('/platforms/validate', (req, res) => {
  try {
    const { platform, settings } = req.body;

    if (!platform || !settings) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: platform, settings'
      });
    }

    const validation = platformOptimizer.validatePlatformSettings(platform, settings);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('Error validating platform settings:', error);
    res.status(500).json({
      error: 'Failed to validate platform settings'
    });
  }
});

module.exports = { router, podcastRouter };