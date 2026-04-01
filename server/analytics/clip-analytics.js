// server/analytics/clip-analytics.js
const fs = require('fs').promises;
const path = require('path');

class ClipAnalytics {
  constructor(dataDir = './data/clip-analytics') {
    this.dataDir = path.join(__dirname, '../../', dataDir);
    this.ensureDataDir();
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (err) {
      console.error('Error creating clip analytics directory:', err);
    }
  }

  async recordClipCreation(clipData) {
    // clipData: { clipId, videoId, duration, platform, timestamp, userId }
    const record = {
      clipId: clipData.clipId || `clip_${Date.now()}`,
      videoId: clipData.videoId,
      duration: clipData.duration,
      platform: clipData.platform,
      timestamp: clipData.timestamp || new Date().toISOString(),
      userId: clipData.userId,
      views: 0,
      shares: 0,
      engagement: []
    };

    const filePath = path.join(this.dataDir, `${record.clipId}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2));
    return record;
  }

  async recordClipEngagement(clipId, action) {
    // action: 'view', 'like', 'download', etc.
    const filePath = path.join(this.dataDir, `${clipId}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const record = JSON.parse(content);

      if (action === 'view') {
        record.views = (record.views || 0) + 1;
      }

      record.engagement = record.engagement || [];
      record.engagement.push({
        action,
        timestamp: new Date().toISOString()
      });

      await fs.writeFile(filePath, JSON.stringify(record, null, 2));
      return record;
    } catch (err) {
      console.error('Error recording clip engagement:', err);
      return null;
    }
  }

  async recordClipShare(clipId, platform) {
    const filePath = path.join(this.dataDir, `${clipId}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const record = JSON.parse(content);

      record.shares = (record.shares || 0) + 1;
      record.sharesByPlatform = record.sharesByPlatform || {};
      record.sharesByPlatform[platform] = (record.sharesByPlatform[platform] || 0) + 1;

      await fs.writeFile(filePath, JSON.stringify(record, null, 2));
      return record;
    } catch (err) {
      console.error('Error recording clip share:', err);
      return null;
    }
  }

  async getClipAnalytics(clipId) {
    const filePath = path.join(this.dataDir, `${clipId}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error('Error reading clip analytics:', err);
      return null;
    }
  }

  async getAnalyticsSummary(days = 30) {
    try {
      const files = await fs.readdir(this.dataDir);
      const records = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.dataDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const record = JSON.parse(content);

        if (new Date(record.timestamp) >= cutoffDate) {
          records.push(record);
        }
      }

      return {
        totalClips: records.length,
        totalViews: records.reduce((sum, r) => sum + (r.views || 0), 0),
        totalShares: records.reduce((sum, r) => sum + (r.shares || 0), 0),
        byPlatform: this.groupByPlatform(records),
        topClips: records.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5)
      };
    } catch (err) {
      console.error('Error getting analytics summary:', err);
      return null;
    }
  }

  groupByPlatform(records) {
    const platformStats = {};
    for (const record of records) {
      const platform = record.platform || 'unknown';
      if (!platformStats[platform]) {
        platformStats[platform] = { clips: 0, views: 0, shares: 0 };
      }
      platformStats[platform].clips++;
      platformStats[platform].views += record.views || 0;
      platformStats[platform].shares += record.shares || 0;
    }
    return platformStats;
  }
}

module.exports = ClipAnalytics;
