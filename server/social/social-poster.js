// server/social/social-poster.js
const { google } = require('googleapis');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const OAuthManager = require('./oauth-manager');

class SocialPoster {
  constructor(config = {}) {
    this.config = config;
    this.oauthManager = new OAuthManager();

    this.apiEndpoints = {
      tiktok: {
        baseUrl: 'https://open-api.tiktok.com',
        uploadEndpoint: '/platform/api/v1/video/post',
        publishEndpoint: '/platform/api/v1/video/publish'
      },
      instagram: {
        baseUrl: 'https://graph.facebook.com/v18.0',
        mediaEndpoint: '/me/media',
        publishEndpoint: '/me/media_publish'
      },
      youtube: {
        baseUrl: 'https://www.googleapis.com/upload/youtube/v3',
        uploadEndpoint: '/videos'
      },
      facebook: {
        baseUrl: 'https://graph.facebook.com/v18.0',
        videoUploadEndpoint: '/me/videos',
        reelsEndpoint: '/me/reels'
      },
      linkedin: {
        baseUrl: 'https://api.linkedin.com/v2',
        uploadEndpoint: '/videos/upload',
        postEndpoint: '/shares'
      },
      twitter: {
        baseUrl: 'https://upload.twitter.com/1.1',
        uploadEndpoint: '/media/upload.json',
        tweetEndpoint: 'https://api.twitter.com/2/tweets'
      }
    };

    this.platformSettings = {
      tiktok: {
        maxDuration: 180,
        maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
        aspectRatios: ['9:16', '16:9', '1:1'],
        videoCodecs: ['h264', 'hevc'],
        audioCodecs: ['aac', 'mp3']
      },
      instagram_reels: {
        maxDuration: 90,
        maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
        aspectRatios: ['9:16'],
        videoCodecs: ['h264'],
        audioCodecs: ['aac']
      },
      youtube_shorts: {
        maxDuration: 60,
        maxFileSize: 256 * 1024 * 1024, // 256MB
        aspectRatios: ['9:16', '16:9'],
        videoCodecs: ['h264', 'vp9', 'av1'],
        audioCodecs: ['aac', 'mp3']
      },
      facebook_reels: {
        maxDuration: 90,
        maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
        aspectRatios: ['9:16', '16:9', '1:1'],
        videoCodecs: ['h264'],
        audioCodecs: ['aac']
      },
      linkedin_video: {
        maxDuration: 600,
        maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
        aspectRatios: ['16:9', '1:1', '9:16'],
        videoCodecs: ['h264'],
        audioCodecs: ['aac']
      },
      twitter_video: {
        maxDuration: 140,
        maxFileSize: 512 * 1024 * 1024, // 512MB
        aspectRatios: ['16:9', '1:1', '9:16'],
        videoCodecs: ['h264'],
        audioCodecs: ['aac']
      }
    };
  }

  // ============ YOUTUBE SHORTS - REAL API ============
  async postToYouTubeShorts(videoPath, postData, accessToken, userId) {
    try {
      // Get stored token if userId provided
      let token = accessToken;
      if (userId && !accessToken) {
        const storedToken = await this.oauthManager.getToken(userId, 'youtube');
        token = storedToken?.accessToken;
      }

      if (!token) {
        throw new Error('YouTube access token required');
      }

      // Initialize YouTube API client
      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI
      );

      oauth2Client.setCredentials({ access_token: token });
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      // Prepare video metadata for Shorts
      const videoMetadata = {
        snippet: {
          title: postData.title || 'New Short Video',
          description: this.generateYouTubeDescription(postData),
          tags: postData.hashtags || this.generateHashtags(postData.caption),
          categoryId: postData.categoryId || '22', // People & Blogs
          defaultLanguage: postData.language || 'en'
        },
        status: {
          privacyStatus: postData.privacyStatus || 'public',
          license: 'youtube',
          selfDeclaredMadeForKids: postData.madeForKids || false,
          embeddable: postData.embeddable !== false,
          publicStatsViewable: postData.publicStats !== false
        }
      };

      console.log(`Uploading to YouTube Shorts: ${videoPath}`);
      console.log(`Metadata: ${JSON.stringify(videoMetadata.snippet, null, 2)}`);

      // Read video file
      const videoData = await fs.readFile(videoPath);

      // Upload video using resumable upload
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: videoMetadata,
        media: {
          body: videoData
        }
      });

      const videoUrl = `https://www.youtube.com/shorts/${response.data.id}`;

      return {
        success: true,
        postId: response.data.id,
        url: videoUrl,
        platformId: 'youtube_shorts',
        videoId: response.data.id,
        title: response.data.snippet.title,
        publishedAt: response.data.snippet.publishedAt,
        message: 'Video posted to YouTube Shorts successfully'
      };
    } catch (error) {
      console.error('Error posting to YouTube Shorts:', error.response?.data || error.message);
      throw new Error(`Failed to post to YouTube Shorts: ${error.message}`);
    }
  }

  generateYouTubeDescription(postData) {
    let description = postData.description || postData.caption || '';

    // Add hashtags
    if (postData.hashtags && postData.hashtags.length > 0) {
      description += '\n\n' + postData.hashtags.join(' ');
    }

    // Add CTA
    if (postData.cta) {
      description += '\n\n' + postData.cta;
    }

    // Add credits
    if (postData.credits) {
      description += '\n\n' + postData.credits;
    }

    return description;
  }

  // ============ INSTAGRAM REELS - REAL API ============
  async postToInstagram(videoPath, postData, accessToken, userId) {
    try {
      // Get stored token if userId provided
      let token = accessToken;
      if (userId && !accessToken) {
        const storedToken = await this.oauthManager.getToken(userId, 'instagram');
        token = storedToken?.accessToken;
      }

      if (!token) {
        throw new Error('Instagram access token required');
      }

      // The video needs to be publicly accessible for Instagram
      // We need to upload to a temporary public URL first
      const publicVideoUrl = await this.getPublicVideoUrl(videoPath);

      // Step 1: Create media container
      const containerResponse = await axios.post(
        `${this.apiEndpoints.instagram.baseUrl}/me/media`,
        {
          media_type: 'REELS',
          video_url: publicVideoUrl,
          caption: this.generateInstagramCaption(postData),
          share_to_feed: postData.shareToFeed || true,
          thumb_url: postData.coverImage
        },
        {
          params: { access_token: token }
        }
      );

      const containerId = containerResponse.data.id;
      console.log(`Instagram container created: ${containerId}`);

      // Step 2: Poll for processing completion
      await this.pollInstagramMediaStatus(containerId, token);

      // Step 3: Publish the media
      const publishResponse = await axios.post(
        `${this.apiEndpoints.instagram.baseUrl}/me/media_publish`,
        {
          creation_id: containerId
        },
        {
          params: { access_token: token }
        }
      );

      const postId = publishResponse.data.id;
      const postUrl = `https://www.instagram.com/reel/${postId}`;

      return {
        success: true,
        postId,
        url: postUrl,
        platformId: 'instagram_reels',
        message: 'Video posted to Instagram Reels successfully'
      };
    } catch (error) {
      console.error('Error posting to Instagram:', error.response?.data || error.message);
      throw new Error(`Failed to post to Instagram: ${error.message}`);
    }
  }

  async pollInstagramMediaStatus(containerId, token, maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await axios.get(
        `${this.apiEndpoints.instagram.baseUrl}/${containerId}`,
        {
          params: {
            access_token: token,
            fields: 'status_code,status'
          }
        }
      );

      const statusCode = response.data.status_code;

      if (statusCode === 'FINISHED') {
        return true;
      } else if (statusCode === 'ERROR') {
        throw new Error('Instagram media processing failed');
      }

      // Wait 3 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    throw new Error('Instagram media processing timeout');
  }

  generateInstagramCaption(postData) {
    let caption = postData.caption || '';

    // Add hashtags (Instagram supports up to 30)
    if (postData.hashtags && postData.hashtags.length > 0) {
      const tags = postData.hashtags.slice(0, 30).join(' ');
      caption += '\n\n' + tags;
    }

    // Add mentions
    if (postData.mentions && postData.mentions.length > 0) {
      caption += '\n\n' + postData.mentions.map(m => `@${m}`).join(' ');
    }

    return caption;
  }

  // ============ TIKTOK - REAL API ============
  async postToTikTok(videoPath, postData, accessToken, userId) {
    try {
      // Get stored token if userId provided
      let token = accessToken;
      if (userId && !accessToken) {
        const storedToken = await this.oauthManager.getToken(userId, 'tiktok');
        token = storedToken?.accessToken;
      }

      if (!token) {
        throw new Error('TikTok access token required');
      }

      // Step 1: Initialize upload
      const initResponse = await axios.post(
        `${this.apiEndpoints.tiktok.baseUrl}/platform/api/v1/video/post`,
        {
          post_info: {
            title: postData.title || postData.caption || '',
            privacy_level: postData.privacyLevel || 'PUBLIC_TO_EVERYONE',
            disable_comment: postData.disableComments || false,
            disable_duet: postData.disableDuet || false,
            disable_stitch: postData.disableStitch || false,
            brand_content_toggle: postData.brandContent || false,
            brand_organic_toggle: postData.brandOrganic || true
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: (await fs.stat(videoPath)).size,
            video_mime_type: 'video/mp4',
            video_id: crypto.randomUUID()
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const uploadId = initResponse.data.upload_id;
      const uploadUrl = initResponse.data.upload_url;
      console.log(`TikTok upload initialized: ${uploadId}`);

      // Step 2: Upload video file
      const videoData = await fs.readFile(videoPath);
      await axios.put(uploadUrl, videoData, {
        headers: {
          'Content-Type': 'video/mp4'
        }
      });

      // Step 3: Create publish task
      const publishResponse = await axios.post(
        `${this.apiEndpoints.tiktok.baseUrl}/platform/api/v1/video/publish`,
        {
          upload_id: uploadId
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const publishId = publishResponse.data.publish_id;

      // Step 4: Poll for completion
      const publishStatus = await this.pollTikTokPublishStatus(publishId, token);

      if (publishStatus.status === 'PUBLISH_COMPLETE') {
        return {
          success: true,
          postId: publishId,
          url: publishStatus.share_url,
          platformId: 'tiktok',
          message: 'Video posted to TikTok successfully'
        };
      }

      throw new Error('TikTok publish failed');
    } catch (error) {
      console.error('Error posting to TikTok:', error.response?.data || error.message);
      throw new Error(`Failed to post to TikTok: ${error.message}`);
    }
  }

  async pollTikTokPublishStatus(publishId, token, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await axios.get(
        `${this.apiEndpoints.tiktok.baseUrl}/platform/api/v1/video/publish/status`,
        {
          params: { publish_id: publishId },
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const status = response.data.status;

      if (status === 'PUBLISH_COMPLETE') {
        return response.data;
      } else if (status === 'PUBLISH_FAILED') {
        throw new Error(`TikTok publish failed: ${response.data.fail_reason}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('TikTok publish timeout');
  }

  // ============ FACEBOOK REELS - REAL API ============
  async postToFacebookReels(videoPath, postData, accessToken, userId) {
    try {
      let token = accessToken;
      if (userId && !accessToken) {
        const storedToken = await this.oauthManager.getToken(userId, 'facebook');
        token = storedToken?.accessToken;
      }

      if (!token) {
        throw new Error('Facebook access token required');
      }

      const publicVideoUrl = await this.getPublicVideoUrl(videoPath);

      // Upload video to Facebook
      const response = await axios.post(
        `${this.apiEndpoints.facebook.baseUrl}/me/reels`,
        {
          video_url: publicVideoUrl,
          description: postData.caption || '',
          title: postData.title || 'New Reel',
          privacy: postData.privacy || '{value: "EVERYONE"}'
        },
        {
          params: { access_token: token }
        }
      );

      return {
        success: true,
        postId: response.data.id,
        url: `https://www.facebook.com/reel/${response.data.id}`,
        platformId: 'facebook_reels',
        message: 'Video posted to Facebook Reels successfully'
      };
    } catch (error) {
      console.error('Error posting to Facebook Reels:', error.response?.data || error.message);
      throw new Error(`Failed to post to Facebook Reels: ${error.message}`);
    }
  }

  // ============ LINKEDIN VIDEO - REAL API ============
  async postToLinkedIn(videoPath, postData, accessToken, userId) {
    try {
      let token = accessToken;
      if (userId && !accessToken) {
        const storedToken = await this.oauthManager.getToken(userId, 'linkedin');
        token = storedToken?.accessToken;
      }

      if (!token) {
        throw new Error('LinkedIn access token required');
      }

      // Step 1: Initialize upload
      const personUrn = await this.getLinkedInPersonUrn(token);
      const fileSize = (await fs.stat(videoPath)).size;

      const initResponse = await axios.post(
        `${this.apiEndpoints.linkedin.baseUrl}/videos/upload`,
        {
          actions: {
            initializeUpload: {
              owner: personUrn,
              fileSizeBytes: fileSize
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      const uploadUrl = initResponse.data.value.uploadUrl;
      const videoUrn = initResponse.data.value.video;

      // Step 2: Upload video in chunks
      await this.uploadToLinkedIn(uploadUrl, videoPath);

      // Step 3: Finalize upload
      await axios.post(
        `${this.apiEndpoints.linkedin.baseUrl}/videos/upload`,
        {
          actions: {
            finalizeUpload: {
              video: videoUrn
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      // Step 4: Create post
      await axios.post(
        `${this.apiEndpoints.linkedin.baseUrl}/shares`,
        {
          owner: personUrn,
          subject: postData.title || 'New Video',
          text: { text: postData.caption || '' },
          content: {
            contentEntities: [{
              entityLocation: `urn:li:video:${videoUrn}`
            }]
          },
          visibility: 'PUBLIC'
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      return {
        success: true,
        postId: videoUrn,
        url: `https://www.linkedin.com/feed/update/${videoUrn}`,
        platformId: 'linkedin_video',
        message: 'Video posted to LinkedIn successfully'
      };
    } catch (error) {
      console.error('Error posting to LinkedIn:', error.response?.data || error.message);
      throw new Error(`Failed to post to LinkedIn: ${error.message}`);
    }
  }

  async getLinkedInPersonUrn(token) {
    const response = await axios.get(
      `${this.apiEndpoints.linkedin.baseUrl}/me`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    return `urn:li:person:${response.data.id}`;
  }

  async uploadToLinkedIn(uploadUrl, videoPath) {
    const videoData = await fs.readFile(videoPath);
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks

    for (let i = 0; i < videoData.length; i += chunkSize) {
      const chunk = videoData.slice(i, i + chunkSize);

      await axios.put(uploadUrl, chunk, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${i}-${Math.min(i + chunkSize - 1, videoData.length - 1)}/${videoData.length}`
        }
      });
    }
  }

  // ============ HELPER FUNCTIONS ============
  async getPublicVideoUrl(videoPath) {
    // For production, this would upload to a CDN or cloud storage
    // For now, we create a temporary publicly accessible URL
    // This is a placeholder - in production you'd use S3, Cloudinary, etc.

    const tempPublicDir = path.join(__dirname, '../../temp/public');
    await fs.mkdir(tempPublicDir, { recursive: true });

    const fileName = `temp_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.mp4`;
    const publicPath = path.join(tempPublicDir, fileName);

    await fs.copyFile(videoPath, publicPath);

    // Return the public URL (configure your server to serve /temp/public)
    return `${process.env.PUBLIC_URL || 'http://localhost:5001'}/temp/public/${fileName}`;
  }

  generateHashtags(text, maxTags = 10) {
    if (!text) return ['#shorts', '#video'];

    // Extract keywords from text
    const keywords = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !['this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their'].includes(word));

    // Generate hashtags
    const hashtags = keywords.slice(0, maxTags).map(word => `#${word}`);

    // Always add #shorts for YouTube
    if (!hashtags.includes('#shorts')) {
      hashtags.unshift('#shorts');
    }

    return hashtags;
  }

  // ============ PLATFORM ROUTING ============
  async postToPlatform(platform, videoPath, postData, accessToken, userId) {
    switch (platform.toLowerCase()) {
      case 'youtube_shorts':
      case 'youtube':
        return this.postToYouTubeShorts(videoPath, postData, accessToken, userId);
      case 'instagram':
      case 'instagram_reels':
        return this.postToInstagram(videoPath, postData, accessToken, userId);
      case 'tiktok':
        return this.postToTikTok(videoPath, postData, accessToken, userId);
      case 'facebook':
      case 'facebook_reels':
        return this.postToFacebookReels(videoPath, postData, accessToken, userId);
      case 'linkedin':
      case 'linkedin_video':
        return this.postToLinkedIn(videoPath, postData, accessToken, userId);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  getSupportedPlatforms() {
    return [
      {
        id: 'youtube_shorts',
        name: 'YouTube Shorts',
        requiresAuth: true,
        maxDuration: this.platformSettings.youtube_shorts.maxDuration,
        maxFileSize: this.platformSettings.youtube_shorts.maxFileSize,
        aspectRatios: this.platformSettings.youtube_shorts.aspectRatios,
        oauthScopes: ['https://www.googleapis.com/auth/youtube.upload']
      },
      {
        id: 'instagram_reels',
        name: 'Instagram Reels',
        requiresAuth: true,
        maxDuration: this.platformSettings.instagram_reels.maxDuration,
        maxFileSize: this.platformSettings.instagram_reels.maxFileSize,
        aspectRatios: this.platformSettings.instagram_reels.aspectRatios,
        oauthScopes: ['instagram_basic', 'instagram_content_publish']
      },
      {
        id: 'tiktok',
        name: 'TikTok',
        requiresAuth: true,
        maxDuration: this.platformSettings.tiktok.maxDuration,
        maxFileSize: this.platformSettings.tiktok.maxFileSize,
        aspectRatios: this.platformSettings.tiktok.aspectRatios,
        oauthScopes: ['video.upload', 'video.publish']
      },
      {
        id: 'facebook_reels',
        name: 'Facebook Reels',
        requiresAuth: true,
        maxDuration: this.platformSettings.facebook_reels.maxDuration,
        maxFileSize: this.platformSettings.facebook_reels.maxFileSize,
        aspectRatios: this.platformSettings.facebook_reels.aspectRatios,
        oauthScopes: ['pages_manage_posts', 'pages_read_engagement', 'publish_video']
      },
      {
        id: 'linkedin_video',
        name: 'LinkedIn Video',
        requiresAuth: true,
        maxDuration: this.platformSettings.linkedin_video.maxDuration,
        maxFileSize: this.platformSettings.linkedin_video.maxFileSize,
        aspectRatios: this.platformSettings.linkedin_video.aspectRatios,
        oauthScopes: ['w_member_social', 'w_video_social']
      }
    ];
  }

  async validateForPlatform(videoPath, platformId) {
    const platform = this.platformSettings[platformId];

    if (!platform) {
      throw new Error(`Platform not supported: ${platformId}`);
    }

    const stats = await fs.stat(videoPath);
    const fileInfo = await this.getVideoInfo(videoPath);
    const errors = [];

    if (stats.size > platform.maxFileSize) {
      errors.push(`File size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds platform limit (${(platform.maxFileSize / 1024 / 1024).toFixed(0)}MB)`);
    }

    if (fileInfo.duration > platform.maxDuration) {
      errors.push(`Duration (${fileInfo.duration}s) exceeds platform limit (${platform.maxDuration}s)`);
    }

    if (fileInfo.width && fileInfo.height) {
      const ratio = fileInfo.width / fileInfo.height;
      const validRatios = platform.aspectRatios.map(ar => {
        const [w, h] = ar.split(':').map(Number);
        return w / h;
      });

      if (!validRatios.some(validRatio => Math.abs(ratio - validRatio) < 0.1)) {
        errors.push(`Aspect ratio ${fileInfo.width}:${fileInfo.height} is not supported. Supported: ${platform.aspectRatios.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      fileInfo
    };
  }

  async getVideoInfo(videoPath) {
    try {
      const ffmpeg = require('fluent-ffmpeg');
      return await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
          if (err) reject(err);

          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          resolve({
            width: videoStream?.width || 1080,
            height: videoStream?.height || 1920,
            duration: parseFloat(metadata.format.duration) || 0,
            size: parseInt(metadata.format.size) || 0,
            bitrate: metadata.format.bit_rate || 0
          });
        });
      });
    } catch (error) {
      return { width: 1080, height: 1920, duration: 0, size: 0, bitrate: 0 };
    }
  }
}

module.exports = SocialPoster;
