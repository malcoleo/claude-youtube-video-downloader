// server/api/scheduler.js
const express = require('express');
const router = express.Router();
const PostScheduler = require('../social/post-scheduler');
const AnalyticsManager = require('../social/analytics-manager');
const AICaptionGenerator = require('../ai/caption-generator');

const postScheduler = new PostScheduler();
const analyticsManager = new AnalyticsManager();
const captionGenerator = new AICaptionGenerator();

// ============ SCHEDULE MANAGEMENT ============

// Create a new scheduled post
router.post('/schedule', async (req, res) => {
  try {
    const scheduleData = req.body;

    // Validate required fields
    if (!scheduleData.userId || !scheduleData.videoPath || !scheduleData.platforms) {
      return res.status(400).json({
        success: false,
        error: 'userId, videoPath, and platforms are required'
      });
    }

    // Validate scheduledAt is in the future
    if (scheduleData.scheduledAt) {
      const scheduledTime = new Date(scheduleData.scheduledAt);
      if (scheduledTime < new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Scheduled time must be in the future'
        });
      }
    }

    const result = await postScheduler.createSchedule(scheduleData);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create schedule: ' + error.message
    });
  }
});

// Get all schedules for a user
router.get('/schedules', async (req, res) => {
  try {
    const { userId, status } = req.query;

    const schedules = await postScheduler.getSchedules(userId, status);

    res.json({
      success: true,
      schedules
    });
  } catch (error) {
    console.error('Error getting schedules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get schedules'
    });
  }
});

// Get a specific schedule
router.get('/schedule/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await postScheduler.getSchedule(scheduleId);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }

    res.json({
      success: true,
      schedule
    });
  } catch (error) {
    console.error('Error getting schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get schedule'
    });
  }
});

// Cancel a schedule
router.post('/schedule/:scheduleId/cancel', async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const result = await postScheduler.cancelSchedule(scheduleId);

    res.json(result);
  } catch (error) {
    console.error('Error cancelling schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel schedule: ' + error.message
    });
  }
});

// Update a schedule
router.put('/schedule/:scheduleId', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const updates = req.body;

    const result = await postScheduler.updateSchedule(scheduleId, updates);

    res.json(result);
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update schedule: ' + error.message
    });
  }
});

// ============ OPTIMAL POSTING TIMES ============

// Get optimal posting times for a platform
router.get('/optimal-times/:platform', (req, res) => {
  try {
    const { platform } = req.params;
    const { timezone } = req.query;

    const optimalTimes = postScheduler.getOptimalPostingTimes(platform, timezone || 'UTC');

    res.json({
      success: true,
      optimalTimes
    });
  } catch (error) {
    console.error('Error getting optimal times:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get optimal posting times'
    });
  }
});

// Suggest best time to post in next 48 hours
router.post('/suggest-time', (req, res) => {
  try {
    const { platforms, timezone } = req.body;

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'platforms array is required'
      });
    }

    const suggestions = postScheduler.suggestBestTimeToPost(platforms, timezone || 'UTC');

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Error suggesting time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest posting time'
    });
  }
});

// ============ ANALYTICS ============

// Get analytics for a specific post
router.get('/analytics/:platform/:postId', async (req, res) => {
  try {
    const { platform, postId } = req.params;
    const { forceRefresh } = req.query;

    const analytics = await analyticsManager.getPostAnalytics(
      platform,
      postId,
      forceRefresh === 'true'
    );

    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: 'Analytics not found'
      });
    }

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics'
    });
  }
});

// Get summary analytics
router.get('/analytics/summary', async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'userId, startDate, and endDate are required'
      });
    }

    const summary = await analyticsManager.getSummaryAnalytics(userId, startDate, endDate);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Error getting summary analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get summary analytics'
    });
  }
});

// Get platform comparison
router.get('/analytics/platform-comparison', async (req, res) => {
  try {
    const { userId, days } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const comparison = await analyticsManager.getPlatformComparison(
      userId,
      days ? parseInt(days) : 30
    );

    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    console.error('Error getting platform comparison:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get platform comparison'
    });
  }
});

// Export analytics report
router.post('/analytics/export', async (req, res) => {
  try {
    const { userId, format, startDate, endDate } = req.body;

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'userId, startDate, and endDate are required'
      });
    }

    const report = await analyticsManager.exportReport(
      userId,
      format || 'json',
      startDate,
      endDate
    );

    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export report'
    });
  }
});

// ============ AI CAPTION GENERATION ============

// Generate captions from transcript
router.post('/captions/generate', async (req, res) => {
  try {
    const { transcript, options } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'transcript is required'
      });
    }

    const captions = await captionGenerator.generateCaptions(transcript, options || {});

    res.json({
      success: true,
      captions
    });
  } catch (error) {
    console.error('Error generating captions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate captions: ' + error.message
    });
  }
});

// Quick caption generation
router.post('/captions/quick', async (req, res) => {
  try {
    const { transcript, platform } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'transcript is required'
      });
    }

    const captions = await captionGenerator.quickGenerate(transcript, platform || 'multi');

    res.json({
      success: true,
      captions
    });
  } catch (error) {
    console.error('Error generating quick captions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate captions: ' + error.message
    });
  }
});

module.exports = router;
