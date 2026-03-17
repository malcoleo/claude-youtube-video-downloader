// server/api/highlight-detection.js
const express = require('express');
const router = express.Router();
const VideoProcessor = require('../utils/video-processor');
const multer = require('multer');
const path = require('path');

const videoProcessor = new VideoProcessor();

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

module.exports = router;