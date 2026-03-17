// server/analytics/tracking.js
const fs = require('fs').promises;
const path = require('path');

class AnalyticsTracker {
  constructor(dataDir = './analytics') {
    this.dataDir = dataDir;
    this.init();
  }

  async init() {
    // Create analytics directory if it doesn't exist
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (err) {
      console.error('Error creating analytics directory:', err);
    }
  }

  // Track video creation event
  async trackVideoCreation(userId, videoInfo, platform) {
    const event = {
      userId,
      eventType: 'video_created',
      timestamp: new Date().toISOString(),
      videoInfo,
      platform,
      id: this.generateId()
    };

    await this.saveEvent(event);
    return event.id;
  }

  // Track social media post event
  async trackSocialPost(userId, videoId, platform, postId) {
    const event = {
      userId,
      eventType: 'social_posted',
      timestamp: new Date().toISOString(),
      videoId,
      platform,
      postId,
      id: this.generateId()
    };

    await this.saveEvent(event);
    return event.id;
  }

  // Track user engagement (likes, shares, comments)
  async trackEngagement(postId, engagementType, value = 1) {
    const event = {
      postId,
      eventType: 'engagement',
      engagementType,
      value,
      timestamp: new Date().toISOString(),
      id: this.generateId()
    };

    await this.saveEvent(event);
    return event.id;
  }

  // Save event to file
  async saveEvent(event) {
    const date = new Date(event.timestamp);
    const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.json`;
    const filePath = path.join(this.dataDir, fileName);

    let events = [];
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      events = JSON.parse(fileContent);
    } catch (err) {
      // File doesn't exist yet, start with empty array
    }

    events.push(event);

    try {
      await fs.writeFile(filePath, JSON.stringify(events, null, 2));
    } catch (err) {
      console.error('Error saving event:', err);
    }
  }

  // Get analytics for a specific user
  async getUserAnalytics(userId, days = 30) {
    const events = await this.getRecentEvents(days);
    return this.processUserAnalytics(userId, events);
  }

  // Get overall analytics
  async getOverallAnalytics(days = 30) {
    const events = await this.getRecentEvents(days);
    return this.processOverallAnalytics(events);
  }

  // Get recent events
  async getRecentEvents(days = 30) {
    const events = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Read files for the date range
    for (let d = new Date(startDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const fileName = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
      const filePath = path.join(this.dataDir, fileName);

      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const dayEvents = JSON.parse(fileContent);
        events.push(...dayEvents);
      } catch (err) {
        // File doesn't exist for this date, continue
      }
    }

    return events;
  }

  // Process user analytics
  processUserAnalytics(userId, events) {
    const userEvents = events.filter(event => event.userId === userId);

    const analytics = {
      totalVideosCreated: userEvents.filter(e => e.eventType === 'video_created').length,
      totalPosts: userEvents.filter(e => e.eventType === 'social_posted').length,
      platformBreakdown: {},
      videoCreationsOverTime: [],
      postSuccessRates: {}
    };

    // Count platform usage
    userEvents.forEach(event => {
      if (event.eventType === 'video_created' && event.platform) {
        analytics.platformBreakdown[event.platform] = (analytics.platformBreakdown[event.platform] || 0) + 1;
      }

      if (event.eventType === 'social_posted' && event.platform) {
        analytics.postSuccessRates[event.platform] = (analytics.postSuccessRates[event.platform] || 0) + 1;
      }
    });

    // Calculate video creations over time (daily)
    const dailyCreations = {};
    userEvents
      .filter(e => e.eventType === 'video_created')
      .forEach(event => {
        const date = event.timestamp.split('T')[0]; // Extract YYYY-MM-DD
        dailyCreations[date] = (dailyCreations[date] || 0) + 1;
      });

    analytics.videoCreationsOverTime = Object.entries(dailyCreations)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return analytics;
  }

  // Process overall analytics
  processOverallAnalytics(events) {
    const analytics = {
      totalUsers: [...new Set(events.map(e => e.userId || 'unknown'))].length,
      totalVideosCreated: events.filter(e => e.eventType === 'video_created').length,
      totalPosts: events.filter(e => e.eventType === 'social_posted').length,
      platformDistribution: {},
      mostActiveUsers: [],
      trends: []
    };

    // Platform distribution
    events.forEach(event => {
      if ((event.eventType === 'video_created' || event.eventType === 'social_posted') && event.platform) {
        analytics.platformDistribution[event.platform] = (analytics.platformDistribution[event.platform] || 0) + 1;
      }
    });

    // Most active users
    const userActivity = {};
    events.forEach(event => {
      if (event.userId) {
        userActivity[event.userId] = (userActivity[event.userId] || 0) + 1;
      }
    });

    analytics.mostActiveUsers = Object.entries(userActivity)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, activityCount: count }));

    return analytics;
  }

  // Generate unique ID for events
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
}

module.exports = AnalyticsTracker;