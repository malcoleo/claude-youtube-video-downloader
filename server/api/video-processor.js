// server/api/video-processor.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const VideoProcessor = require('../utils/video-processor');
const { PLATFORM_SETTINGS } = require('../config/platforms');

const videoProcessor = new VideoProcessor();

// Allowed MIME types and extensions for uploaded files
const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm',
  'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg'
];
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.wmv', '.mkv', '.webm', '.mp3', '.wav', '.ogg'];

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, videoProcessor.tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    // Validate extension server-side
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('Invalid file extension!'), false);
    }
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Accept video and audio files with validated MIME types
    const isValidMime = ALLOWED_MIME_TYPES.includes(file.mimetype) ||
                        (file.mimetype.startsWith('video/') && !file.mimetype.includes('stream')) ||
                        (file.mimetype.startsWith('audio/') && !file.mimetype.includes('stream'));

    if (isValidMime) {
      cb(null, true);
    } else {
      cb(new Error('Only video and audio files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit for large video files
  }
});

// Route to upload and process a local video file
router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const { start, end, platform } = req.body;

    const inputFile = req.file.path;

    // Determine video segment duration
    let startTime = start ? parseFloat(start) : 0;
    let endTime = end ? parseFloat(end) : null;

    // Get original video info to determine total duration
    const originalVideoInfo = await videoProcessor.getVideoInfo(inputFile);
    let duration = originalVideoInfo.duration;

    if (endTime) {
      duration = endTime - startTime;
    } else {
      duration = originalVideoInfo.duration - startTime;
    }

    // Cap duration at 60 seconds for social media
    if (duration > 60) {
      duration = 60;
      endTime = startTime + 60;
    }

    // Cut the video segment
    const cutFilename = videoProcessor.generateUniqueFilename('mp4');
    const cutFilePath = path.join(videoProcessor.outputDir, cutFilename);

    if (startTime > 0 || endTime) {
      await videoProcessor.cutVideoSegment(
        inputFile,
        cutFilePath,
        startTime,
        duration
      );
    } else {
      // If no cut needed, just copy the original
      await fs.copyFile(inputFile, cutFilePath);
    }

    // Process video based on platform requirements
    let finalOutputPath = cutFilePath;

    if (platform) {
      const platformSettings = PLATFORM_SETTINGS[platform];
      if (!platformSettings) {
        return res.status(400).json({ error: 'Invalid platform specified' });
      }

      // Generate platform-specific filename
      const platformFilename = videoProcessor.generateUniqueFilename('mp4');

      // Convert to platform format
      finalOutputPath = await videoProcessor.convertToPlatformFormat(
        cutFilePath,
        platformSettings,
        platformFilename
      );

      // Clean up intermediate cut file
      await fs.unlink(cutFilePath);
    }

    // Generate a thumbnail for preview
    const thumbnailFilename = videoProcessor.generateUniqueFilename('jpg');
    const thumbnailPath = await videoProcessor.generateThumbnail(
      finalOutputPath,
      Math.min(5, duration / 2), // Take thumbnail at 1/2 duration or 5s, whichever is smaller
      thumbnailFilename
    );

    // Get final video info
    const videoInfo = await videoProcessor.getVideoInfo(finalOutputPath);

    // Convert local paths to URLs accessible by the frontend
    const videoUrl = `/output/${path.basename(finalOutputPath)}`;
    const thumbnailUrl = `/temp/${path.basename(thumbnailPath)}`;

    res.json({
      success: true,
      videoPath: videoUrl,
      thumbnailPath: thumbnailUrl,
      videoInfo: videoInfo,
      message: 'Video processed successfully'
    });

    // Clean up original uploaded file after response
    setTimeout(async () => {
      try {
        await fs.unlink(inputFile);
      } catch (err) {
        console.error('Error deleting uploaded file:', err);
      }
    }, 5000); // Wait 5 seconds before cleanup to ensure client has downloaded

  } catch (error) {
    console.error('Error processing uploaded video:', error);

    // Clean up uploaded file if error occurred
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error('Error deleting uploaded file:', err);
      }
    }

    res.status(500).json({ error: 'Failed to process video: ' + error.message });
  }
});

// Route to apply effects to video
router.post('/apply-effects', async (req, res) => {
  try {
    const { videoPath, effects } = req.body;

    if (!videoPath || !effects) {
      return res.status(400).json({ error: 'Video path and effects are required' });
    }

    const outputFile = path.join(videoProcessor.outputDir, videoProcessor.generateUniqueFilename('mp4'));

    await videoProcessor.applyEffects(videoPath, outputFile, effects);

    // Generate a thumbnail for preview
    const thumbnailFilename = videoProcessor.generateUniqueFilename('jpg');
    const thumbnailPath = await videoProcessor.generateThumbnail(
      outputFile,
      1, // Take thumbnail at 1s
      thumbnailFilename
    );

    // Get final video info
    const videoInfo = await videoProcessor.getVideoInfo(outputFile);

    // Convert local paths to URLs accessible by the frontend
    const videoUrl = `/output/${path.basename(outputFile)}`;
    const thumbnailUrl = `/temp/${path.basename(thumbnailPath)}`;

    res.json({
      success: true,
      videoPath: videoUrl,
      thumbnailPath: thumbnailUrl,
      videoInfo: videoInfo,
      message: 'Effects applied successfully'
    });

  } catch (error) {
    console.error('Error applying effects:', error);
    res.status(500).json({ error: 'Failed to apply effects: ' + error.message });
  }
});

// Route to concatenate multiple video segments
router.post('/concatenate', async (req, res) => {
  try {
    const { videoPaths, platform } = req.body;

    if (!videoPaths || !Array.isArray(videoPaths) || videoPaths.length < 2) {
      return res.status(400).json({ error: 'At least two video paths are required for concatenation' });
    }

    const outputFile = path.join(videoProcessor.outputDir, videoProcessor.generateUniqueFilename('mp4'));

    await videoProcessor.concatenateVideos(videoPaths, outputFile);

    // Process video based on platform requirements
    let finalOutputPath = outputFile;

    if (platform) {
      const platformSettings = PLATFORM_SETTINGS[platform];
      if (!platformSettings) {
        return res.status(400).json({ error: 'Invalid platform specified' });
      }

      // Generate platform-specific filename
      const platformFilename = videoProcessor.generateUniqueFilename('mp4');

      // Convert to platform format
      finalOutputPath = await videoProcessor.convertToPlatformFormat(
        outputFile,
        platformSettings,
        platformFilename
      );

      // Clean up intermediate file
      await fs.unlink(outputFile);
    }

    // Generate a thumbnail for preview
    const thumbnailFilename = videoProcessor.generateUniqueFilename('jpg');
    const thumbnailPath = await videoProcessor.generateThumbnail(
      finalOutputPath,
      1, // Take thumbnail at 1s
      thumbnailFilename
    );

    // Get final video info
    const videoInfo = await videoProcessor.getVideoInfo(finalOutputPath);

    // Convert local paths to URLs accessible by the frontend
    const videoUrl = `/output/${path.basename(finalOutputPath)}`;
    const thumbnailUrl = `/temp/${path.basename(thumbnailPath)}`;

    res.json({
      success: true,
      videoPath: videoUrl,
      thumbnailPath: thumbnailUrl,
      videoInfo: videoInfo,
      message: 'Videos concatenated successfully'
    });

  } catch (error) {
    console.error('Error concatenating videos:', error);
    res.status(500).json({ error: 'Failed to concatenate videos: ' + error.message });
  }
});

module.exports = router;