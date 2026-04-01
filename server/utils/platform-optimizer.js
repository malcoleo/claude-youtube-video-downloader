// server/utils/platform-optimizer.js
class PlatformOptimizer {
  constructor() {
    this.platforms = {
      tiktok: { maxDuration: 60, aspectRatio: '9:16' },
      reels: { maxDuration: 90, aspectRatio: '9:16' },
      shorts: { maxDuration: 60, aspectRatio: '9:16' },
      square: { maxDuration: 60, aspectRatio: '1:1' },
      landscape: { maxDuration: 60, aspectRatio: '16:9' }
    };
  }

  getOptimalSettings(platform) {
    return this.platforms[platform] || this.platforms.shorts;
  }

  validateForPlatform(videoDuration, aspectRatio, platform) {
    const settings = this.getOptimalSettings(platform);
    return {
      isValid: videoDuration <= settings.maxDuration,
      errors: videoDuration > settings.maxDuration
        ? [`Video exceeds ${settings.maxDuration}s limit for ${platform}`]
        : []
    };
  }
}

module.exports = PlatformOptimizer;
