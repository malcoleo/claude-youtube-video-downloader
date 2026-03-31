// server/analytics/tracking.js
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class AnalyticsTracker {
  constructor(dataDir = './analytics') {
    this.dataDir = dataDir;
    this.ga4 = null;
    this.mixpanel = null;
    this.segment = null;

    // External service configs
    this.externalServices = {
      ga4: {
        measurementId: process.env.GA4_MEASUREMENT_ID,
        apiSecret: process.env.GA4_API_SECRET,
        enabled: !!process.env.GA4_MEASUREMENT_ID && !!process.env.GA4_API_SECRET
      },
      mixpanel: {
        token: process.env.MIXPANEL_TOKEN,
        enabled: !!process.env.MIXPANEL_TOKEN
      },
      segment: {
        writeKey: process.env.SEGMENT_WRITE_KEY,
        enabled: !!process.env.SEGMENT_WRITE_KEY
      }
    };

    this.init();
  }

  async init() {
    // Create analytics directory if it doesn't exist
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (err) {
      console.error('Error creating analytics directory:', err);
    }

    // Initialize external services if configured
    if (this.externalServices.ga4.enabled) {
      this.ga4 = {
        endpoint: `https://www.google-analytics.com/mp/collect?measurement_id=${this.externalServices.ga4.measurementId}&api_secret=${this.externalServices.ga4.apiSecret}`,
        sendEvent: async (event) => {
          try {
            const payload = {
              client_id: event.userId || 'anonymous',
              events: [{
                name: event.eventType,
                params: {
                  platform: event.platform || event.source,
                  ...(event.videoInfo && { video_duration: event.videoInfo.duration }),
                  ...(event.engagementType && { engagement_type: event.engagementType }),
                  ...(event.value && { value: event.value })
                }
              }]
            };

            await axios.post(this.ga4.endpoint, payload);
            console.log('GA4 event sent:', event.eventType);
          } catch (err) {
            console.error('Error sending GA4 event:', err);
          }
        }
      };
    }

    if (this.externalServices.mixpanel.enabled) {
      this.mixpanel = {
        endpoint: 'https://api.mixpanel.com/track',
        token: this.externalServices.mixpanel.token,
        sendEvent: async (event) => {
          try {
            const payload = [{
              event: event.eventType,
              properties: {
                distinct_id: event.userId || 'anonymous',
                token: this.mixpanel.token,
                platform: event.platform || event.source,
                ...(event.videoInfo && { video_duration: event.videoInfo.duration }),
                ...(event.engagementType && { engagement_type: event.engagementType }),
                ...(event.value && { value: event.value })
              }
            }];

            await axios.post(this.mixpanel.endpoint, JSON.stringify(payload), {
              headers: {
                'Content-Type': 'application/json'
              }
            });
            console.log('Mixpanel event sent:', event.eventType);
          } catch (err) {
            console.error('Error sending Mixpanel event:', err);
          }
        }
      };
    }

    if (this.externalServices.segment.enabled) {
      this.segment = {
        endpoint: 'https://api.segment.io/v1/track',
        writeKey: this.externalServices.segment.writeKey,
        sendEvent: async (event) => {
          try {
            const payload = {
              userId: event.userId || 'anonymous',
              event: event.eventType,
              properties: {
                platform: event.platform || event.source,
                ...(event.videoInfo && { video_duration: event.videoInfo.duration }),
                ...(event.engagementType && { engagement_type: event.engagementType }),
                ...(event.value && { value: event.value })
              },
              timestamp: event.timestamp
            };

            await axios.post(this.segment.endpoint, payload, {
              headers: {
                'Authorization': `Basic ${Buffer.from(this.segment.writeKey + ':').toString('base64')}`,
                'Content-Type': 'application/json'
              }
            });
            console.log('Segment event sent:', event.eventType);
          } catch (err) {
            console.error('Error sending Segment event:', err);
          }
        }
      };
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

    // Send to external analytics if enabled
    await this.sendToExternalServices(event);

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

    // Send to external analytics if enabled
    await this.sendToExternalServices(event);

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

    // Send to external analytics if enabled
    await this.sendToExternalServices(event);

    return event.id;
  }

  // Track CMS upload event
  async trackCMSUpload(userId, videoId, cmsPlatform, cmsItemId) {
    const event = {
      userId,
      eventType: 'cms_uploaded',
      timestamp: new Date().toISOString(),
      videoId,
      cmsPlatform,
      cmsItemId,
      id: this.generateId()
    };

    await this.saveEvent(event);

    // Send to external analytics if enabled
    await this.sendToExternalServices(event);

    return event.id;
  }

  // Track content published event
  async trackContentPublished(userId, cmsPlatform, cmsItemId, contentUrl) {
    const event = {
      userId,
      eventType: 'content_published',
      timestamp: new Date().toISOString(),
      cmsPlatform,
      cmsItemId,
      contentUrl,
      id: this.generateId()
    };

    await this.saveEvent(event);

    // Send to external analytics if enabled
    await this.sendToExternalServices(event);

    return event.id;
  }

  // Send event to external analytics services
  async sendToExternalServices(event) {
    if (this.ga4) {
      await this.ga4.sendEvent(event);
    }

    if (this.mixpanel) {
      await this.mixpanel.sendEvent(event);
    }

    if (this.segment) {
      await this.segment.sendEvent(event);
    }
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

  // Get CMS-specific analytics
  async getCMSAnalytics(cmsPlatform, days = 30) {
    const events = await this.getRecentEvents(days);
    return this.processCMSAnalytics(cmsPlatform, events);
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
      totalCmsUploads: userEvents.filter(e => e.eventType === 'cms_uploaded').length,
      platformBreakdown: {},
      cmsBreakdown: {},
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

      if (event.eventType === 'cms_uploaded' && event.cmsPlatform) {
        analytics.cmsBreakdown[event.cmsPlatform] = (analytics.cmsBreakdown[event.cmsPlatform] || 0) + 1;
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
      totalCmsUploads: events.filter(e => e.eventType === 'cms_uploaded').length,
      platformDistribution: {},
      cmsDistribution: {},
      mostActiveUsers: [],
      trends: []
    };

    // Platform distribution
    events.forEach(event => {
      if ((event.eventType === 'video_created' || event.eventType === 'social_posted') && event.platform) {
        analytics.platformDistribution[event.platform] = (analytics.platformDistribution[event.platform] || 0) + 1;
      }

      if (event.eventType === 'cms_uploaded' && event.cmsPlatform) {
        analytics.cmsDistribution[event.cmsPlatform] = (analytics.cmsDistribution[event.cmsPlatform] || 0) + 1;
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

  // Process CMS analytics
  processCMSAnalytics(cmsPlatform, events) {
    const cmsEvents = events.filter(event => event.cmsPlatform === cmsPlatform);

    return {
      platform: cmsPlatform,
      totalUploads: cmsEvents.filter(e => e.eventType === 'cms_uploaded').length,
      totalPublications: cmsEvents.filter(e => e.eventType === 'content_published').length,
      uploadSuccessRate: cmsEvents.filter(e => e.eventType === 'cms_uploaded').length / cmsEvents.length * 100,
      publicationsOverTime: this.calculatePublicationsOverTime(cmsEvents)
    };
  }

  // Calculate publications over time
  calculatePublicationsOverTime(events) {
    const dailyCounts = {};
    events
      .filter(e => e.eventType === 'content_published')
      .forEach(event => {
        const date = event.timestamp.split('T')[0]; // Extract YYYY-MM-DD
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      });

    return Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }

  // Generate unique ID for events
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  // Get configured external services
  getExternalServiceStatus() {
    return {
      ga4: this.externalServices.ga4.enabled,
      mixpanel: this.externalServices.mixpanel.enabled,
      segment: this.externalServices.segment.enabled
    };
  }

  // Send batch events to external services
  async sendBatchToExternalServices(events) {
    for (const event of events) {
      await this.sendToExternalServices(event);
    }
  }
}

module.exports = AnalyticsTracker;