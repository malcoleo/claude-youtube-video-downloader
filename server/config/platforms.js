// server/config/platforms.js
// Platform-specific settings for social media shorts

const PLATFORM_SETTINGS = {
  tiktok: {
    name: 'TikTok',
    dimensions: {
      width: 1080,
      height: 1920,
      aspectRatio: '9:16'
    },
    duration: {
      min: 3, // seconds
      max: 60 // seconds
    },
    format: 'mp4',
    codec: 'h264',
    fps: 30,
    bitrate: '5M',
    watermark: {
      position: 'bottom-right',
      opacity: 0.7
    }
  },
  instagram_reels: {
    name: 'Instagram Reels',
    dimensions: {
      width: 1080,
      height: 1920,
      aspectRatio: '9:16'
    },
    duration: {
      min: 3,
      max: 90
    },
    format: 'mp4',
    codec: 'h264',
    fps: 30,
    bitrate: '8M',
    watermark: {
      position: 'top-left',
      opacity: 0.7
    }
  },
  youtube_shorts: {
    name: 'YouTube Shorts',
    dimensions: {
      width: 1080,
      height: 1920,
      aspectRatio: '9:16'
    },
    duration: {
      min: 15,
      max: 60
    },
    format: 'mp4',
    codec: 'h264',
    fps: 30,
    bitrate: '10M',
    watermark: {
      position: 'center-bottom',
      opacity: 0.5
    }
  },
  instagram_square: {
    name: 'Instagram Square',
    dimensions: {
      width: 1080,
      height: 1080,
      aspectRatio: '1:1'
    },
    duration: {
      min: 3,
      max: 60
    },
    format: 'mp4',
    codec: 'h264',
    fps: 30,
    bitrate: '8M',
    watermark: {
      position: 'top-center',
      opacity: 0.7
    }
  },
  youtube_regular: {
    name: 'YouTube Regular',
    dimensions: {
      width: 1920,
      height: 1080,
      aspectRatio: '16:9'
    },
    duration: {
      min: 3,
      max: 60
    },
    format: 'mp4',
    codec: 'h264',
    fps: 30,
    bitrate: '10M',
    watermark: {
      position: 'bottom-right',
      opacity: 0.7
    }
  }
};

// Helper function to get platform by name
const getPlatformSettings = (platformName) => {
  return PLATFORM_SETTINGS[platformName.toLowerCase()];
};

// Helper function to validate video settings against platform requirements
const validateVideoSettings = (platformName, videoSettings) => {
  const platform = getPlatformSettings(platformName);
  if (!platform) {
    throw new Error(`Invalid platform: ${platformName}`);
  }

  // Validate dimensions
  if (videoSettings.width && videoSettings.height) {
    const expectedRatio = platform.dimensions.aspectRatio.split(':');
    const expectedWidthHeightRatio = parseInt(expectedRatio[0]) / parseInt(expectedRatio[1]);
    const actualWidthHeightRatio = videoSettings.width / videoSettings.height;

    // Allow slight tolerance for aspect ratio
    const ratioDiff = Math.abs(expectedWidthHeightRatio - actualWidthHeightRatio);
    if (ratioDiff > 0.01) {
      return {
        isValid: false,
        errors: [`Video aspect ratio (${videoSettings.width}:${videoSettings.height}) does not match platform requirement (${platform.dimensions.aspectRatio})`]
      };
    }
  }

  // Validate duration
  if (videoSettings.duration) {
    if (videoSettings.duration < platform.duration.min) {
      return {
        isValid: false,
        errors: [`Video duration (${videoSettings.duration}s) is shorter than platform minimum (${platform.duration.min}s)`]
      };
    }
    if (videoSettings.duration > platform.duration.max) {
      return {
        isValid: false,
        errors: [`Video duration (${videoSettings.duration}s) exceeds platform maximum (${platform.duration.max}s)`]
      };
    }
  }

  return { isValid: true, errors: [] };
};

module.exports = {
  PLATFORM_SETTINGS,
  getPlatformSettings,
  validateVideoSettings
};