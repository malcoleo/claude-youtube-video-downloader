// server/social/post-scheduler.js
const fs = require('fs').promises;
const path = require('path');
const SocialPoster = require('./social-poster');

class PostScheduler {
  constructor(options = {}) {
    this.schedulesDir = path.join(__dirname, '../../data/schedules');
    this.postsDir = path.join(__dirname, '../../data/posts');
    this.socialPoster = new SocialPoster();
    this.scheduledPosts = new Map();
    this.schedulerInterval = null;
    this.autoStart = options.autoStart !== false; // Default to true for backward compatibility

    this.ensureDirs();

    // Start the scheduler tick only if autoStart is enabled
    if (this.autoStart) {
      this.startScheduler();
    }
  }

  async ensureDirs() {
    try {
      await fs.mkdir(this.schedulesDir, { recursive: true });
      await fs.mkdir(this.postsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating scheduler directories:', error);
    }
  }

  startScheduler() {
    // Check every 30 seconds for posts to publish
    this.schedulerInterval = setInterval(() => this.tick(), 30000);
    console.log('[Scheduler] Started - checking every 30 seconds');
  }

  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      console.log('[Scheduler] Stopped');
    }
  }

  async tick() {
    const now = new Date();

    for (const [id, post] of this.scheduledPosts.entries()) {
      if (post.status !== 'scheduled') continue;

      const scheduledTime = new Date(post.scheduledAt);

      if (scheduledTime <= now) {
        console.log(`[Scheduler] Publishing post: ${id}`);
        await this.publishPost(id, post);
      }
    }
  }

  async createSchedule(scheduleData) {
    const {
      userId,
      videoPath,
      platforms,
      caption,
      title,
      description,
      scheduledAt,
      timezone = 'UTC',
      hashtags,
      options = {}
    } = scheduleData;

    // Validate scheduled time
    const scheduleTime = new Date(scheduledAt);
    if (isNaN(scheduleTime.getTime())) {
      throw new Error('Invalid scheduledAt date');
    }

    if (scheduleTime < new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    // Create schedule ID
    const scheduleId = `schedule_${Date.now()}_${userId}`;

    // Create schedule object
    const schedule = {
      id: scheduleId,
      userId,
      videoPath,
      platforms: platforms.map(p => ({
        id: p,
        status: 'pending',
        postId: null,
        error: null
      })),
      caption,
      title,
      description,
      hashtags,
      options,
      scheduledAt: scheduleTime.toISOString(),
      timezone,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      publishedAt: null,
      results: []
    };

    // Save schedule to file
    const schedulePath = path.join(this.schedulesDir, `${scheduleId}.json`);
    await fs.writeFile(schedulePath, JSON.stringify(schedule, null, 2));

    // Add to in-memory map
    this.scheduledPosts.set(scheduleId, schedule);

    return {
      success: true,
      scheduleId,
      scheduledAt: schedule.scheduledAt,
      platforms: schedule.platforms.map(p => p.id)
    };
  }

  async publishPost(scheduleId, schedule) {
    try {
      const results = [];

      for (const platformConfig of schedule.platforms) {
        if (platformConfig.status === 'published') continue;

        try {
          console.log(`Publishing to ${platformConfig.id}...`);

          const postData = {
            caption: schedule.caption,
            title: schedule.title,
            description: schedule.description,
            hashtags: schedule.hashtags,
            ...schedule.options[platformConfig.id]
          };

          const result = await this.socialPoster.postToPlatform(
            platformConfig.id,
            schedule.videoPath,
            postData,
            null, // accessToken - will use stored token
            schedule.userId
          );

          platformConfig.status = 'published';
          platformConfig.postId = result.postId;
          platformConfig.url = result.url;

          results.push({
            platform: platformConfig.id,
            success: true,
            postId: result.postId,
            url: result.url,
            publishedAt: new Date().toISOString()
          });

          console.log(`Published to ${platformConfig.id}: ${result.url}`);
        } catch (error) {
          console.error(`Failed to publish to ${platformConfig.id}:`, error.message);

          platformConfig.status = 'failed';
          platformConfig.error = error.message;

          results.push({
            platform: platformConfig.id,
            success: false,
            error: error.message
          });
        }
      }

      // Update schedule status
      schedule.status = schedule.platforms.every(p => p.status === 'published')
        ? 'completed'
        : 'partially_completed';

      schedule.publishedAt = new Date().toISOString();
      schedule.results = results;

      // Save updated schedule
      await this.saveSchedule(schedule);

      return {
        success: true,
        scheduleId,
        status: schedule.status,
        results
      };
    } catch (error) {
      console.error(`Error publishing schedule ${scheduleId}:`, error);

      schedule.status = 'failed';
      schedule.error = error.message;
      await this.saveSchedule(schedule);

      throw error;
    }
  }

  async saveSchedule(schedule) {
    const schedulePath = path.join(this.schedulesDir, `${schedule.id}.json`);
    await fs.writeFile(schedulePath, JSON.stringify(schedule, null, 2));
  }

  async getSchedules(userId, status) {
    try {
      const files = await fs.readdir(this.schedulesDir);
      const schedules = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const schedulePath = path.join(this.schedulesDir, file);
        const content = await fs.readFile(schedulePath, 'utf8');
        const schedule = JSON.parse(content);

        if (userId && schedule.userId !== userId) continue;
        if (status && schedule.status !== status) continue;

        schedules.push(schedule);
      }

      // Sort by scheduled date
      schedules.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

      return schedules;
    } catch (error) {
      console.error('Error getting schedules:', error);
      return [];
    }
  }

  async getSchedule(scheduleId) {
    try {
      const schedulePath = path.join(this.schedulesDir, `${scheduleId}.json`);
      const content = await fs.readFile(schedulePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async cancelSchedule(scheduleId) {
    const schedule = await this.getSchedule(scheduleId);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.status === 'published' || schedule.status === 'completed') {
      throw new Error('Cannot cancel already published schedule');
    }

    schedule.status = 'cancelled';
    await this.saveSchedule(schedule);

    this.scheduledPosts.delete(scheduleId);

    return { success: true, message: 'Schedule cancelled' };
  }

  async updateSchedule(scheduleId, updates) {
    const schedule = await this.getSchedule(scheduleId);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.status === 'published' || schedule.status === 'completed') {
      throw new Error('Cannot update already published schedule');
    }

    // Apply updates
    if (updates.scheduledAt) {
      schedule.scheduledAt = new Date(updates.scheduledAt).toISOString();
    }
    if (updates.caption !== undefined) {
      schedule.caption = updates.caption;
    }
    if (updates.title !== undefined) {
      schedule.title = updates.title;
    }
    if (updates.hashtags) {
      schedule.hashtags = updates.hashtags;
    }

    await this.saveSchedule(schedule);

    // Update in-memory map
    this.scheduledPosts.set(scheduleId, schedule);

    return { success: true, schedule };
  }

  async loadSchedules() {
    const schedules = await this.getSchedules();

    for (const schedule of schedules) {
      if (schedule.status === 'scheduled') {
        this.scheduledPosts.set(schedule.id, schedule);
      }
    }

    console.log(`[Scheduler] Loaded ${this.scheduledPosts.size} pending schedules`);
  }

  // Get optimal posting times based on platform best practices
  getOptimalPostingTimes(platform, timezone = 'UTC') {
    const optimalTimes = {
      youtube_shorts: [
        { day: 'weekday', hours: [12, 15, 18], reason: 'Lunch and evening peaks' },
        { day: 'weekend', hours: [10, 14, 19], reason: 'Weekend browsing' }
      ],
      instagram_reels: [
        { day: 'weekday', hours: [9, 12, 17], reason: 'Commute and lunch breaks' },
        { day: 'weekend', hours: [11, 15, 20], reason: 'Leisure time' }
      ],
      tiktok: [
        { day: 'weekday', hours: [7, 16, 19], reason: 'Morning and after school/work' },
        { day: 'weekend', hours: [10, 16, 21], reason: 'All day engagement' }
      ],
      facebook_reels: [
        { day: 'weekday', hours: [13, 15, 17], reason: 'Afternoon breaks' },
        { day: 'weekend', hours: [12, 16], reason: 'Weekend activity' }
      ],
      linkedin_video: [
        { day: 'weekday', hours: [8, 12, 17], reason: 'Professional hours' },
        { day: 'weekend', hours: [], reason: 'Low weekend engagement' }
      ]
    };

    return optimalTimes[platform] || [];
  }

  // Suggest best time to post in next 48 hours
  suggestBestTimeToPost(platforms, timezone = 'UTC') {
    const now = new Date();
    const bestTimes = [];

    for (const platform of platforms) {
      const optimalTimes = this.getOptimalPostingTimes(platform, timezone);

      // Find next optimal window
      for (let daysAhead = 0; daysAhead < 2; daysAhead++) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + daysAhead);

        const isWeekend = checkDate.getDay() === 0 || checkDate.getDay() === 6;
        const dayType = isWeekend ? 'weekend' : 'weekday';

        const dayOptimal = optimalTimes.find(ot => ot.day === dayType);

        if (dayOptimal && dayOptimal.hours.length > 0) {
          for (const hour of dayOptimal.hours) {
            const suggestedTime = new Date(checkDate);
            suggestedTime.setHours(hour, 0, 0, 0);

            if (suggestedTime > now) {
              bestTimes.push({
                platform,
                time: suggestedTime.toISOString(),
                reason: dayOptimal.reason,
                score: this.calculatePostingScore(suggestedTime, platform)
              });
            }
          }
        }

        if (bestTimes.length > 0) break;
      }
    }

    // Sort by score
    bestTimes.sort((a, b) => b.score - a.score);

    return bestTimes.slice(0, 5); // Return top 5
  }

  calculatePostingScore(time, platform) {
    const hour = time.getHours();
    const day = time.getDay();
    let score = 50;

    // Bonus for optimal hours
    if (hour >= 12 && hour <= 14) score += 20; // Lunch time
    if (hour >= 18 && hour <= 20) score += 15; // Evening
    if (hour >= 7 && hour <= 9) score += 10;   // Morning commute

    // Weekend adjustment
    if (day === 0 || day === 6) {
      score += 10; // Slightly better weekend engagement
    }

    // Platform-specific adjustments
    if (platform === 'linkedin_video' && (day === 0 || day === 6)) {
      score -= 30; // LinkedIn performs poorly on weekends
    }

    if (platform === 'tiktok' && hour >= 19) {
      score += 15; // TikTok performs well in evening
    }

    return score;
  }
}

module.exports = PostScheduler;
