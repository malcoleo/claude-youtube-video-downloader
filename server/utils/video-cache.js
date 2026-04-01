// server/utils/video-cache.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class VideoCache {
  constructor() {
    this.cacheDir = path.join(__dirname, '../../cache');
    this.cacheManifestPath = path.join(this.cacheDir, 'manifest.json');
    this.maxCacheSizeGB = 5; // Max cache size before cleanup
    this.manifest = this.loadManifest();
  }

  loadManifest() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      if (fs.existsSync(this.cacheManifestPath)) {
        return JSON.parse(fs.readFileSync(this.cacheManifestPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading cache manifest:', error);
    }
    return { entries: {}, lastCleanup: Date.now() };
  }

  saveManifest() {
    try {
      fs.writeFileSync(this.cacheManifestPath, JSON.stringify(this.manifest, null, 2));
    } catch (error) {
      console.error('Error saving cache manifest:', error);
    }
  }

  /**
   * Generate cache key based on video path, segment, and options
   */
  generateCacheKey(videoPath, segment, options) {
    const keyData = {
      videoPath: path.basename(videoPath),
      videoMtime: fs.existsSync(videoPath) ? fs.statSync(videoPath).mtimeMs : null,
      start: segment.start,
      duration: segment.duration,
      format: options.format,
      resolution: options.resolution,
      hasSubtitles: options.hasSubtitles,
      hasWatermark: !!options.watermarkUrl,
      hasBgMusic: !!options.bgMusicUrl,
      hasEndScreen: options.addEndScreen
    };

    return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }

  /**
   * Check if cached version exists and is still valid
   */
  getCachedVideo(videoPath, segment, options) {
    const cacheKey = this.generateCacheKey(videoPath, segment, options);
    const entry = this.manifest.entries[cacheKey];

    if (!entry) {
      return null;
    }

    // Check if file still exists
    if (!fs.existsSync(entry.path)) {
      delete this.manifest.entries[cacheKey];
      this.saveManifest();
      return null;
    }

    // Check if source video is newer than cached version
    if (fs.existsSync(videoPath)) {
      const sourceMtime = fs.statSync(videoPath).mtimeMs;
      if (sourceMtime > entry.createdAt) {
        console.log('[Cache] Source video newer than cache, skipping cache');
        return null;
      }
    }

    console.log(`[Cache] Hit for key ${cacheKey.substring(0, 8)}...`);
    return {
      path: entry.path,
      cachedAt: entry.createdAt,
      cacheKey
    };
  }

  /**
   * Store video in cache
   */
  cacheVideo(videoPath, segment, options, outputClipPath) {
    const cacheKey = this.generateCacheKey(videoPath, segment, options);

    // Copy file to cache
    const cachedFileName = `${cacheKey}.mp4`;
    const cachedPath = path.join(this.cacheDir, cachedFileName);

    try {
      fs.copyFileSync(outputClipPath, cachedPath);

      this.manifest.entries[cacheKey] = {
        path: cachedPath,
        createdAt: Date.now(),
        sourceVideo: path.basename(videoPath),
        size: fs.statSync(cachedPath).size
      };

      this.saveManifest();
      console.log(`[Cache] Stored clip with key ${cacheKey.substring(0, 8)}...`);

      // Trigger cleanup if cache is too large
      this.cleanupIfNeeded();

      return cachedPath;
    } catch (error) {
      console.error('[Cache] Error caching video:', error);
      return null;
    }
  }

  /**
   * Get total cache size in bytes
   */
  getCacheSize() {
    let totalSize = 0;
    const files = fs.readdirSync(this.cacheDir);

    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(this.cacheDir, file);
        try {
          totalSize += fs.statSync(filePath).size;
        } catch (e) {
          // Ignore errors
        }
      }
    }

    return totalSize;
  }

  /**
   * Cleanup oldest cache entries if cache exceeds max size
   */
  cleanupIfNeeded() {
    const maxSizeBytes = this.maxCacheSizeGB * 1024 * 1024 * 1024;
    const currentSize = this.getCacheSize();

    if (currentSize <= maxSizeBytes) {
      return;
    }

    console.log(`[Cache] Cache size (${(currentSize / 1024 / 1024 / 1024).toFixed(2)}GB) exceeds limit, cleaning up...`);

    // Sort entries by creation time (oldest first)
    const entries = Object.entries(this.manifest.entries);
    entries.sort((a, b) => a[1].createdAt - b[1].createdAt);

    // Remove oldest entries until under limit
    let newSize = currentSize;
    for (const [key, entry] of entries) {
      if (newSize <= maxSizeBytes) break;

      try {
        if (fs.existsSync(entry.path)) {
          fs.unlinkSync(entry.path);
        }
        newSize -= entry.size || 0;
        delete this.manifest.entries[key];
        console.log(`[Cache] Removed old entry ${key.substring(0, 8)}...`);
      } catch (error) {
        console.error(`[Cache] Error removing entry ${key}:`, error);
      }
    }

    this.manifest.lastCleanup = Date.now();
    this.saveManifest();
  }

  /**
   * Clear all cache entries
   */
  clearCache() {
    const files = fs.readdirSync(this.cacheDir);
    let removed = 0;

    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(this.cacheDir, file);
        try {
          fs.unlinkSync(filePath);
          removed++;
        } catch (e) {
          // Ignore errors
        }
      }
    }

    this.manifest.entries = {};
    this.manifest.lastCleanup = Date.now();
    this.saveManifest();

    console.log(`[Cache] Cleared ${removed} cached videos`);
    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalSize = this.getCacheSize();
    const entryCount = Object.keys(this.manifest.entries).length;

    return {
      totalSize: totalSize,
      totalSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      entryCount,
      lastCleanup: new Date(this.manifest.lastCleanup).toISOString(),
      maxSizeGB: this.maxCacheSizeGB
    };
  }
}

module.exports = VideoCache;
