// server/api/analytics.js
const express = require('express');
const router = express.Router();
const AnalyticsTracker = require('../analytics/tracking');

const analyticsTracker = new AnalyticsTracker();

// Track video creation
router.post('/track-video-creation', async (req, res) => {
  try {
    const { userId, videoInfo, platform } = req.body;

    if (!userId || !videoInfo) {
      return res.status(400).json({
        success: false,
        error: 'userId and videoInfo are required'
      });
    }

    const eventId = await analyticsTracker.trackVideoCreation(userId, videoInfo, platform);

    res.json({
      success: true,
      eventId,
      message: 'Video creation tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking video creation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track video creation: ' + error.message
    });
  }
});

// Track social post
router.post('/track-social-post', async (req, res) => {
  try {
    const { userId, videoId, platform, postId } = req.body;

    if (!userId || !videoId || !platform || !postId) {
      return res.status(400).json({
        success: false,
        error: 'userId, videoId, platform, and postId are required'
      });
    }

    const eventId = await analyticsTracker.trackSocialPost(userId, videoId, platform, postId);

    res.json({
      success: true,
      eventId,
      message: 'Social post tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking social post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track social post: ' + error.message
    });
  }
});

// Track engagement
router.post('/track-engagement', async (req, res) => {
  try {
    const { postId, engagementType, value } = req.body;

    if (!postId || !engagementType) {
      return res.status(400).json({
        success: false,
        error: 'postId and engagementType are required'
      });
    }

    const eventId = await analyticsTracker.trackEngagement(postId, engagementType, value);

    res.json({
      success: true,
      eventId,
      message: 'Engagement tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking engagement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track engagement: ' + error.message
    });
  }
});

// Track CMS upload
router.post('/track-cms-upload', async (req, res) => {
  try {
    const { userId, videoId, cmsPlatform, cmsItemId } = req.body;

    if (!userId || !videoId || !cmsPlatform || !cmsItemId) {
      return res.status(400).json({
        success: false,
        error: 'userId, videoId, cmsPlatform, and cmsItemId are required'
      });
    }

    const eventId = await analyticsTracker.trackCMSUpload(userId, videoId, cmsPlatform, cmsItemId);

    res.json({
      success: true,
      eventId,
      message: 'CMS upload tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking CMS upload:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track CMS upload: ' + error.message
    });
  }
});

// Track content published
router.post('/track-content-published', async (req, res) => {
  try {
    const { userId, cmsPlatform, cmsItemId, contentUrl } = req.body;

    if (!userId || !cmsPlatform || !cmsItemId || !contentUrl) {
      return res.status(400).json({
        success: false,
        error: 'userId, cmsPlatform, cmsItemId, and contentUrl are required'
      });
    }

    const eventId = await analyticsTracker.trackContentPublished(userId, cmsPlatform, cmsItemId, contentUrl);

    res.json({
      success: true,
      eventId,
      message: 'Content publication tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking content published:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track content publication: ' + error.message
    });
  }
});

// Get user analytics
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;

    const analytics = await analyticsTracker.getUserAnalytics(userId, parseInt(days));

    res.json({
      success: true,
      userId,
      analytics,
      days: parseInt(days)
    });
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user analytics: ' + error.message
    });
  }
});

// Get overall analytics
router.get('/overall', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const analytics = await analyticsTracker.getOverallAnalytics(parseInt(days));

    res.json({
      success: true,
      analytics,
      days: parseInt(days)
    });
  } catch (error) {
    console.error('Error getting overall analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get overall analytics: ' + error.message
    });
  }
});

// Get CMS analytics
router.get('/cms/:cmsPlatform', async (req, res) => {
  try {
    const { cmsPlatform } = req.params;
    const { days = 30 } = req.query;

    const analytics = await analyticsTracker.getCMSAnalytics(cmsPlatform, parseInt(days));

    res.json({
      success: true,
      cmsPlatform,
      analytics,
      days: parseInt(days)
    });
  } catch (error) {
    console.error('Error getting CMS analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get CMS analytics: ' + error.message
    });
  }
});

// Get external analytics service status
router.get('/external-services', (req, res) => {
  try {
    const status = analyticsTracker.getExternalServiceStatus();

    res.json({
      success: true,
      externalServices: status
    });
  } catch (error) {
    console.error('Error getting external service status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get external service status: ' + error.message
    });
  }
});

// Get trends
router.get('/trends', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const events = await analyticsTracker.getRecentEvents(parseInt(days));

    // Calculate platform trends
    const platformCounts = {};
    const cmsCounts = {};
    const dailyCounts = {};

    events.forEach(event => {
      if (event.eventType === 'video_created' && event.platform) {
        platformCounts[event.platform] = (platformCounts[event.platform] || 0) + 1;

        const date = event.timestamp.split('T')[0];
        if (!dailyCounts[date]) dailyCounts[date] = {};

        dailyCounts[date][event.platform] = (dailyCounts[date][event.platform] || 0) + 1;
      }

      if (event.eventType === 'cms_uploaded' && event.cmsPlatform) {
        cmsCounts[event.cmsPlatform] = (cmsCounts[event.cmsPlatform] || 0) + 1;
      }
    });

    // Convert daily counts to time series
    const timeSeries = Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, platforms]) => ({
        date,
        ...platforms
      }));

    res.json({
      success: true,
      trends: {
        platformPopularity: Object.entries(platformCounts)
          .sort(([,a], [,b]) => b - a)
          .map(([platform, count]) => ({ platform, count })),
        cmsPopularity: Object.entries(cmsCounts)
          .sort(([,a], [,b]) => b - a)
          .map(([cms, count]) => ({ cms, count })),
        timeSeries
      }
    });
  } catch (error) {
    console.error('Error getting trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trends: ' + error.message
    });
  }
});

module.exports = router;