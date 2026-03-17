// server/api/social-sharing.js
const express = require('express');
const router = express.Router();
const SocialPoster = require('../social/social-poster');
const { PLATFORM_SETTINGS } = require('../config/platforms');

const socialPoster = new SocialPoster();

// Get supported platforms
router.get('/platforms', (req, res) => {
  try {
    const platforms = socialPoster.getSupportedPlatforms();
    res.json({
      success: true,
      platforms
    });
  } catch (error) {
    console.error('Error getting platforms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get supported platforms'
    });
  }
});

// Validate video for a specific platform
router.post('/validate', async (req, res) => {
  try {
    const { videoPath, platformId } = req.body;

    if (!videoPath || !platformId) {
      return res.status(400).json({
        success: false,
        error: 'videoPath and platformId are required'
      });
    }

    const validationResult = await socialPoster.validateForPlatform(videoPath, platformId);

    res.json({
      success: true,
      ...validationResult
    });
  } catch (error) {
    console.error('Error validating video:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate video: ' + error.message
    });
  }
});

// Post video to social media platform (simulated)
router.post('/post', async (req, res) => {
  try {
    const {
      platform,
      videoPath,
      caption,
      title,
      description,
      accessToken
    } = req.body;

    if (!platform || !videoPath) {
      return res.status(400).json({
        success: false,
        error: 'platform and videoPath are required'
      });
    }

    // Validate the video for the platform first
    const validation = await socialPoster.validateForPlatform(videoPath, platform);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Video does not meet platform requirements',
        validationErrors: validation.errors
      });
    }

    // Post to the platform
    const postData = {
      caption: caption || 'Check out this amazing short!',
      title: title,
      description: description
    };

    const result = await socialPoster.postToPlatform(platform, videoPath, postData, accessToken);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error posting to social media:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to post to social media: ' + error.message
    });
  }
});

// Batch post to multiple platforms
router.post('/batch-post', async (req, res) => {
  try {
    const { platforms, videoPath, caption, title, description, accessToken } = req.body;

    if (!Array.isArray(platforms) || platforms.length === 0 || !videoPath) {
      return res.status(400).json({
        success: false,
        error: 'platforms array and videoPath are required'
      });
    }

    const results = [];

    for (const platform of platforms) {
      try {
        // Validate video for this platform
        const validation = await socialPoster.validateForPlatform(videoPath, platform);

        if (!validation.isValid) {
          results.push({
            platform,
            success: false,
            error: 'Video does not meet platform requirements',
            validationErrors: validation.errors
          });
          continue;
        }

        // Post to platform
        const postData = {
          caption: caption || `Check out this amazing short on ${platform}!`,
          title: title,
          description: description
        };

        const result = await socialPoster.postToPlatform(platform, videoPath, postData, accessToken);
        results.push({
          platform,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          platform,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error in batch posting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to batch post to social media: ' + error.message
    });
  }
});

// Get platform-specific formatting options
router.get('/format-options/:platformId', (req, res) => {
  try {
    const { platformId } = req.params;

    const platform = PLATFORM_SETTINGS[platformId];
    if (!platform) {
      return res.status(404).json({
        success: false,
        error: 'Platform not found'
      });
    }

    res.json({
      success: true,
      platform: {
        id: platformId,
        name: platform.name,
        dimensions: platform.dimensions,
        duration: platform.duration,
        format: platform.format,
        tips: [
          `Ideal duration is between ${platform.duration.min}s and ${platform.duration.max}s`,
          `Use aspect ratio ${platform.dimensions.aspectRatio} for best display`,
          `Maximum bitrate: ${platform.bitrate}`
        ]
      }
    });
  } catch (error) {
    console.error('Error getting format options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get format options: ' + error.message
    });
  }
});

module.exports = router;