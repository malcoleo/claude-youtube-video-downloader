// server/ai/content-suggestions.js
class ContentSuggestions {
  constructor() {
    this.suggestions = {
      contentTypes: ['podcast', 'interview', 'tutorial', 'vlog', 'gaming', 'music'],
      optimalLengths: {
        tiktok: { min: 15, max: 60, ideal: 30 },
        reels: { min: 15, max: 90, ideal: 45 },
        shorts: { min: 15, max: 60, ideal: 30 }
      }
    };
  }

  async getContentTypes() {
    return this.suggestions.contentTypes;
  }

  async getSuggestions(contentType, platform) {
    const optimalLength = this.suggestions.optimalLengths[platform] || { min: 15, max: 60, ideal: 30 };
    return {
      suggestedSettings: {
        exportResolution: '1080p',
        exportBitrate: 10,
        addSubtitles: true,
        ctaText: 'Watch full video'
      },
      clipLengthSuggestion: optimalLength
    };
  }
}

module.exports = ContentSuggestions;
