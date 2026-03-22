// server/api/highlight-detection.js
const express = require('express');
const router = express.Router();
const VideoProcessor = require('../utils/video-processor');
const PythonAIWrapper = require('../ai/python-wrapper');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const videoProcessor = new VideoProcessor();
const pythonAI = new PythonAIWrapper();

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
        const { exec } = require('child_process');
        const ffprobeCmd = `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`;
        exec(ffprobeCmd, (err, stdout, stderr) => {
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
        const { exec } = require('child_process');
        const ffmpegCmd = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
        exec(ffmpegCmd, (err, stdout, stderr) => {
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
          const { exec } = require('child_process');
          // Create 480p preview with lower bitrate for smooth scrubbing
          const ffmpegCmd = `ffmpeg -i "${videoPath}" -vf "scale=854:480" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k -movflags +faststart "${previewPath}" -y`;
          exec(ffmpegCmd, (err, stdout, stderr) => {
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
    try {
      const persistentPath = videoPath.replace('/temp/', '/temp/persistent/');
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
  const { videoPath, segments, format = 'original' } = req.body;

  if (!videoPath || !segments || !Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters: videoPath, segments' });
  }

  // Format configurations
  const formatConfig = {
    'tiktok': { aspect: '9:16', filter: 'crop=ih*(9/16):ih,scale=1080:1920', suffix: 'tiktok' },
    'reels': { aspect: '9:16', filter: 'crop=ih*(9/16):ih,scale=1080:1920', suffix: 'reels' },
    'shorts': { aspect: '9:16', filter: 'crop=ih*(9/16):ih,scale=1080:1920', suffix: 'shorts' },
    'square': { aspect: '1:1', filter: 'crop=ih:ih,scale=1080:1080', suffix: 'square' },
    'landscape': { aspect: '16:9', filter: 'crop=iw:iw*(9/16),scale=1920:1080', suffix: 'landscape' },
    'original': { aspect: 'original', filter: null, suffix: 'original' }
  };

  const selectedFormat = formatConfig[format] || formatConfig.original;
  const timestamp = Date.now();
  const exportDir = path.join(__dirname, '../../temp/exports');

  try {
    // Create export directory
    await fs.promises.mkdir(exportDir, { recursive: true });

    // Check if source file exists
    try {
      await fs.promises.access(videoPath);
    } catch (err) {
      return res.status(400).json({ error: 'Source video file not found' });
    }

    const clipPaths = [];

    // Process each segment
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const duration = segment.end - segment.start;
      const safeIndex = (i + 1).toString().padStart(2, '0');
      const safeName = `qa-${safeIndex}-${selectedFormat.suffix}`;
      const outputPath = path.join(exportDir, `${safeName}-${timestamp}.mp4`);

      await new Promise((resolve, reject) => {
        const { exec } = require('child_process');
        let ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${videoPath}" -c:v libx264 -c:a aac -y`;

        // Apply format-specific filters
        if (selectedFormat.filter) {
          ffmpegCmd = `ffmpeg -ss ${segment.start} -t ${duration} -i "${videoPath}" -vf "${selectedFormat.filter}" -c:v libx264 -c:a aac -y "${outputPath}"`;
        } else {
          ffmpegCmd += ` "${outputPath}"`;
        }

        console.log('Exporting clip:', ffmpegCmd.substring(0, 200) + '...');
        exec(ffmpegCmd, (err, stdout, stderr) => {
          if (err) {
            console.error('Clip export error:', err);
            reject(err);
          } else {
            console.log(`Clip ${i + 1}/${segments.length} exported`);
            clipPaths.push({ path: outputPath, name: `${safeName}-${timestamp}.mp4` });
            resolve();
          }
        });
      });
    }

    // If single clip, return it directly
    if (clipPaths.length === 1) {
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
        const { exec } = require('child_process');
        const ffprobeCmd = `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`;
        exec(ffprobeCmd, (err, stdout, stderr) => {
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
        const { exec } = require('child_process');
        const ffmpegCmd = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
        exec(ffmpegCmd, (err, stdout, stderr) => {
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

module.exports = { router, podcastRouter };