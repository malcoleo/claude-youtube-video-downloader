// server/social/social-poster.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');

class SocialPoster {
  constructor(config = {}) {
    this.config = config;
  }

  // Post to TikTok (simulated - actual implementation would require TikTok's business API)
  async postToTikTok(videoPath, caption, accessToken) {
    // NOTE: TikTok's public API doesn't allow direct posting
    // This is a simulated function that would work with their business API
    console.log(`Simulated TikTok post: ${videoPath}`);

    return {
      success: true,
      postId: `tiktok-${Date.now()}`,
      url: `https://www.tiktok.com/@user/video/${Date.now()}`,
      message: 'Video posted to TikTok successfully (simulated)'
    };
  }

  // Post to Instagram (requires Facebook Graph API)
  async postToInstagram(videoPath, caption, accessToken) {
    // This is a simulated function since Instagram requires complex OAuth flow
    // Real implementation would need Facebook App setup
    console.log(`Simulated Instagram post: ${videoPath}`);

    return {
      success: true,
      postId: `ig-${Date.now()}`,
      url: `https://www.instagram.com/p/${Date.now()}`,
      message: 'Video posted to Instagram successfully (simulated)'
    };
  }

  // Post to YouTube Shorts
  async postToYouTubeShorts(videoPath, title, description, accessToken) {
    // This is a simulated function since YouTube requires OAuth setup
    console.log(`Simulated YouTube Shorts post: ${videoPath}`);

    return {
      success: true,
      postId: `yt-${Date.now()}`,
      url: `https://www.youtube.com/shorts/${Date.now()}`,
      message: 'Video posted to YouTube Shorts successfully (simulated)'
    };
  }

  // Generic post function that routes to appropriate platform
  async postToPlatform(platform, videoPath, postData, accessToken) {
    switch (platform.toLowerCase()) {
      case 'tiktok':
        return this.postToTikTok(videoPath, postData.caption, accessToken);
      case 'instagram':
      case 'instagram_reels':
        return this.postToInstagram(videoPath, postData.caption, accessToken);
      case 'youtube_shorts':
        return this.postToYouTubeShorts(
          videoPath,
          postData.title || postData.caption,
          postData.description || postData.caption,
          accessToken
        );
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  // Get supported platforms
  getSupportedPlatforms() {
    return [
      {
        id: 'tiktok',
        name: 'TikTok',
        requiresAuth: true,
        maxDuration: 60,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        aspectRatios: ['9:16']
      },
      {
        id: 'instagram',
        name: 'Instagram Reels',
        requiresAuth: true,
        maxDuration: 90,
        maxFileSize: 500 * 1024 * 1024, // 500MB
        aspectRatios: ['9:16', '1:1']
      },
      {
        id: 'youtube_shorts',
        name: 'YouTube Shorts',
        requiresAuth: true,
        maxDuration: 60,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        aspectRatios: ['9:16']
      }
    ];
  }

  // Check if a video meets platform requirements
  async validateForPlatform(videoPath, platformId) {
    const platforms = this.getSupportedPlatforms();
    const platform = platforms.find(p => p.id === platformId);

    if (!platform) {
      throw new Error(`Platform not supported: ${platformId}`);
    }

    const stats = await fs.stat(videoPath);
    const fileInfo = await this.getVideoInfo(videoPath);

    const errors = [];

    if (stats.size > platform.maxFileSize) {
      errors.push(`File size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds platform limit (${platform.maxFileSize / 1024 / 1024}MB)`);
    }

    if (fileInfo.duration > platform.maxDuration) {
      errors.push(`Duration (${fileInfo.duration}s) exceeds platform limit (${platform.maxDuration}s)`);
    }

    // Check aspect ratio (simplified)
    if (fileInfo.width && fileInfo.height) {
      const ratio = fileInfo.width / fileInfo.height;
      const validRatios = platform.aspectRatios.map(ar => {
        const [w, h] = ar.split(':').map(Number);
        return w / h;
      });

      if (!validRatios.some(validRatio => Math.abs(ratio - validRatio) < 0.01)) {
        errors.push(`Aspect ratio ${fileInfo.width}:${fileInfo.height} is not supported. Supported: ${platform.aspectRatios.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Get basic video info
  async getVideoInfo(videoPath) {
    // This is a simplified version - in reality, you'd use ffprobe or similar
    // For now, we'll simulate by reading file stats and returning dummy video info
    const stats = await fs.stat(videoPath);

    // In a real implementation, you would call ffprobe here:
    // ffmpeg.ffprobe(videoPath, (err, metadata) => { ... })

    // For simulation, return dummy values based on file size
    return {
      width: 1080,
      height: 1920,
      duration: Math.min(60, Math.floor(stats.size / 1024 / 1024)), // Simulate duration based on size
      size: stats.size
    };
  }
}

module.exports = SocialPoster;