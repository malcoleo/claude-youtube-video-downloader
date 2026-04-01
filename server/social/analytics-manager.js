// server/social/analytics-manager.js
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');

class AnalyticsManager {
  constructor() {
    this.analyticsDir = path.join(__dirname, '../../data/analytics');
    this.ensureDirs();
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
  }

  async ensureDirs() {
    try {
      await fs.mkdir(this.analyticsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating analytics directory:', error);
    }
  }

  // Record a new post for analytics tracking
  async recordPost(postData) {
    const {
      postId,
      platform,
      videoPath,
      caption,
      scheduledAt,
      publishedAt = new Date().toISOString()
    } = postData;

    const analyticsRecord = {
      postId,
      platform,
      videoPath,
      caption,
      metrics: {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        engagementRate: 0
      },
      milestones: [],
      scheduledAt,
      publishedAt,
      lastUpdated: publishedAt,
      history: []
    };

    const filePath = path.join(this.analyticsDir, `${platform}_${postId}.json`);
    await fs.writeFile(filePath, JSON.stringify(analyticsRecord, null, 2));

    return analyticsRecord;
  }

  // Update analytics for a post
  async updateAnalytics(platform, postId, metrics) {
    const filePath = path.join(this.analyticsDir, `${platform}_${postId}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const record = JSON.parse(content);

      // Calculate engagement rate
      const engagementRate = metrics.views > 0
        ? ((metrics.likes + metrics.comments + metrics.shares) / metrics.views * 100).toFixed(2)
        : 0;

      // Record history
      record.history.push({
        timestamp: new Date().toISOString(),
        metrics: { ...metrics, engagementRate }
      });

      // Check for milestones
      const newMilestones = this.checkMilestones(record.metrics.views, metrics.views);
      if (newMilestones.length > 0) {
        record.milestones.push(...newMilestones.map(m => ({
          type: 'views',
          value: m,
          reachedAt: new Date().toISOString()
        })));
      }

      record.metrics = { ...metrics, engagementRate };
      record.lastUpdated = new Date().toISOString();

      await fs.writeFile(filePath, JSON.stringify(record, null, 2));

      return record;
    } catch (error) {
      console.error('Error updating analytics:', error);
      return null;
    }
  }

  checkMilestones(oldViews, newViews) {
    const milestones = [100, 500, 1000, 5000, 10000, 50000, 100000];
    const reached = [];

    for (const milestone of milestones) {
      if (oldViews < milestone && newViews >= milestone) {
        reached.push(milestone);
      }
    }

    return reached;
  }

  // Fetch analytics from YouTube
  async fetchYouTubeAnalytics(postId, accessToken) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI
      );

      oauth2Client.setCredentials({ access_token: accessToken });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      const response = await youtube.videos.list({
        part: ['statistics', 'snippet'],
        id: postId
      });

      if (!response.data.items || response.data.items.length === 0) {
        return null;
      }

      const stats = response.data.items[0].statistics;

      const metrics = {
        views: parseInt(stats.viewCount) || 0,
        likes: parseInt(stats.likeCount) || 0,
        comments: parseInt(stats.commentCount) || 0,
        shares: 0, // YouTube doesn't provide share count directly
        watchTimeHours: 0,
        averageViewDuration: 0
      };

      await this.updateAnalytics('youtube_shorts', postId, metrics);

      return metrics;
    } catch (error) {
      console.error('Error fetching YouTube analytics:', error.message);
      return null;
    }
  }

  // Fetch analytics from Instagram
  async fetchInstagramAnalytics(postId, accessToken) {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${postId}`,
        {
          params: {
            access_token: accessToken,
            fields: 'insights.metric(plays,likes,comments,saves,shares)'
          }
        }
      );

      const insights = response.data.insights?.data || [];
      const metrics = {
        views: this.getInsightValue(insights, 'plays') || 0,
        likes: this.getInsightValue(insights, 'likes') || 0,
        comments: this.getInsightValue(insights, 'comments') || 0,
        shares: this.getInsightValue(insights, 'shares') || 0,
        saves: this.getInsightValue(insights, 'saves') || 0
      };

      await this.updateAnalytics('instagram_reels', postId, metrics);

      return metrics;
    } catch (error) {
      console.error('Error fetching Instagram analytics:', error.message);
      return null;
    }
  }

  getInsightValue(insights, metricName) {
    const metric = insights.find(m => m.name === metricName);
    return metric?.values?.[0]?.value || 0;
  }

  // Fetch analytics from TikTok
  async fetchTikTokAnalytics(postId, accessToken) {
    try {
      const response = await axios.get(
        `${process.env.TIKTOK_BASE_URL}/post/data/`,
        {
          params: {
            access_token: accessToken,
            post_id: postId,
            fields: 'play_count,like_count,comment_count,share_count'
          }
        }
      );

      const data = response.data.data || {};
      const metrics = {
        views: data.play_count || 0,
        likes: data.like_count || 0,
        comments: data.comment_count || 0,
        shares: data.share_count || 0
      };

      await this.updateAnalytics('tiktok', postId, metrics);

      return metrics;
    } catch (error) {
      console.error('Error fetching TikTok analytics:', error.message);
      return null;
    }
  }

  // Get analytics for a specific post
  async getPostAnalytics(platform, postId, forceRefresh = false) {
    const cacheKey = `${platform}_${postId}`;

    // Check cache first
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
    }

    // Load from file
    const filePath = path.join(this.analyticsDir, `${platform}_${postId}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const record = JSON.parse(content);

      // Update cache
      this.cache.set(cacheKey, {
        data: record,
        timestamp: Date.now()
      });

      return record;
    } catch (error) {
      return null;
    }
  }

  // Get summary analytics across all posts
  async getSummaryAnalytics(userId, startDate, endDate) {
    try {
      const files = await fs.readdir(this.analyticsDir);
      const records = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.analyticsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const record = JSON.parse(content);

        const publishedAt = new Date(record.publishedAt);
        if (publishedAt >= new Date(startDate) && publishedAt <= new Date(endDate)) {
          records.push(record);
        }
      }

      // Calculate summary metrics
      const summary = {
        totalPosts: records.length,
        totalViews: records.reduce((sum, r) => sum + (r.metrics.views || 0), 0),
        totalLikes: records.reduce((sum, r) => sum + (r.metrics.likes || 0), 0),
        totalComments: records.reduce((sum, r) => sum + (r.metrics.comments || 0), 0),
        totalShares: records.reduce((sum, r) => sum + (r.metrics.shares || 0), 0),
        averageEngagementRate: records.length > 0
          ? (records.reduce((sum, r) => sum + parseFloat(r.metrics.engagementRate || 0), 0) / records.length).toFixed(2)
          : 0,
        byPlatform: {},
        topPosts: [],
        milestones: []
      };

      // Group by platform
      for (const record of records) {
        if (!summary.byPlatform[record.platform]) {
          summary.byPlatform[record.platform] = {
            posts: 0,
            views: 0,
            likes: 0,
            engagementRate: 0
          };
        }

        summary.byPlatform[record.platform].posts++;
        summary.byPlatform[record.platform].views += record.metrics.views || 0;
        summary.byPlatform[record.platform].likes += record.metrics.likes || 0;
      }

      // Get top posts by views
      summary.topPosts = records
        .sort((a, b) => (b.metrics.views || 0) - (a.metrics.views || 0))
        .slice(0, 5)
        .map(r => ({
          postId: r.postId,
          platform: r.platform,
          views: r.metrics.views,
          likes: r.metrics.likes,
          engagementRate: r.metrics.engagementRate
        }));

      // Collect all milestones
      for (const record of records) {
        if (record.milestones && record.milestones.length > 0) {
          summary.milestones.push(...record.milestones);
        }
      }

      return summary;
    } catch (error) {
      console.error('Error getting summary analytics:', error);
      return null;
    }
  }

  // Get performance comparison across platforms
  async getPlatformComparison(userId, days = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const summary = await this.getSummaryAnalytics(userId, startDate, endDate);

    if (!summary) return null;

    const comparisons = [];

    for (const [platform, data] of Object.entries(summary.byPlatform)) {
      comparisons.push({
        platform,
        posts: data.posts,
        views: data.views,
        avgViewsPerPost: data.posts > 0 ? (data.views / data.posts).toFixed(0) : 0,
        likes: data.likes,
        performance: this.calculatePerformanceScore(data)
      });
    }

    comparisons.sort((a, b) => b.performance - a.performance);

    return {
      platforms: comparisons,
      bestPerforming: comparisons[0]?.platform || null,
      recommendation: this.generateRecommendation(comparisons)
    };
  }

  calculatePerformanceScore(data) {
    const avgViews = data.posts > 0 ? data.views / data.posts : 0;
    const avgLikes = data.posts > 0 ? data.likes / data.posts : 0;

    // Weighted score: views (50%), likes (30%), post count (20%)
    return (avgViews * 0.5) + (avgLikes * 0.3) + (data.posts * 10 * 0.2);
  }

  generateRecommendation(comparisons) {
    if (comparisons.length === 0) return 'No data available';

    const best = comparisons[0];
    const second = comparisons[1];

    if (!second || best.performance > second.performance * 2) {
      return `Focus more on ${best.platform} - it's significantly outperforming other platforms`;
    }

    return `Consider cross-posting to all platforms - performance is relatively balanced`;
  }

  // Export analytics report
  async exportReport(userId, format = 'json', startDate, endDate) {
    const summary = await this.getSummaryAnalytics(userId, startDate, endDate);

    if (!summary) return null;

    const report = {
      generatedAt: new Date().toISOString(),
      period: { start: startDate, end: endDate },
      summary,
      insights: this.generateInsights(summary)
    };

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    return report;
  }

  generateInsights(summary) {
    const insights = [];

    if (summary.totalPosts === 0) {
      insights.push('No posts in selected period');
      return insights;
    }

    // Views insight
    if (summary.totalViews > 10000) {
      insights.push(`Great reach! Your content has been viewed ${summary.totalViews.toLocaleString()} times`);
    }

    // Engagement insight
    const avgEngagement = parseFloat(summary.averageEngagementRate);
    if (avgEngagement > 5) {
      insights.push(`Excellent engagement rate of ${avgEngagement}% - above industry average`);
    } else if (avgEngagement < 1) {
      insights.push('Consider improving content quality or posting at optimal times');
    }

    // Platform insight
    const topPlatform = Object.entries(summary.byPlatform)
      .sort((a, b) => b[1].views - a[1].views)[0];

    if (topPlatform) {
      insights.push(`${topPlatform[0].replace('_', ' ').toUpperCase()} is your best performing platform`);
    }

    return insights;
  }
}

module.exports = AnalyticsManager;
