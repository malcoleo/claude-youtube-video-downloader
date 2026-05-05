// server/utils/yt-dlp-wrapper.js
// Wrapper for yt-dlp to support 1000+ sites (not just YouTube)
// SECURITY: Uses execFile with argument arrays to prevent command injection

const { execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Map yt-dlp extractor names to display labels
const EXTRACTOR_LABELS = {
  youtube: 'YouTube',
  youtubeshorts: 'YouTube Shorts',
  'youtube Tab': 'YouTube Tab',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitter: 'X (Twitter)',
  'twitter Card': 'X (Twitter)',
  twitterbroadcast: 'X (Twitter)',
  facebook: 'Facebook',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  rumble: 'Rumble',
  reddit: 'Reddit',
  'twitch Clipping': 'Twitch',
  'twitch Video': 'Twitch',
  soundcloud: 'SoundCloud',
  'spotify Show': 'Spotify',
  bilibili: 'Bilibili',
  'baidu SearchVideo': 'Baidu',
  'weibo Media': 'Weibo',
  hulu: 'Hulu',
  netflix: 'Netflix',
  peacock: 'Peacock',
  crunchyroll: 'Crunchyroll'
};

// Map extractor names to Phosphor icon names
const EXTRACTOR_ICONS = {
  youtube: 'YoutubeLogo',
  youtubeshorts: 'YoutubeLogo',
  'youtube Tab': 'YoutubeLogo',
  tiktok: 'TiktokLogo',
  instagram: 'InstagramLogo',
  twitter: 'XLogo',
  'twitter Card': 'XLogo',
  twitterbroadcast: 'XLogo',
  facebook: 'FacebookLogo',
  vimeo: 'VimeoLogo',
  dailymotion: 'FilmStripLogo',
  rumble: 'PlayCircleLogo',
  reddit: 'RedditLogo',
  'twitch Clipping': 'TwitchLogo',
  'twitch Video': 'TwitchLogo',
  soundcloud: 'SpeakerSimpleHighLogo',
  'spotify Show': 'SpotifyLogo',
  bilibili: 'GlobeLogo',
  'baidu SearchVideo': 'GlobeLogo',
  'weibo Media': 'GlobeLogo',
  hulu: 'TelevisionLogo',
  netflix: 'FilmStripLogo',
  peacock: 'TelevisionLogo',
  crunchyroll: 'FilmStripLogo'
};

function mapExtractorToLabel(extractor) {
  if (!extractor) return 'Unknown';
  return EXTRACTOR_LABELS[extractor] || extractor.charAt(0).toUpperCase() + extractor.slice(1);
}

function mapExtractorToIcon(extractor) {
  if (!extractor) return 'Globe';
  return EXTRACTOR_ICONS[extractor] || 'Globe';
}

class YtDlpWrapper {
  constructor(options = {}) {
    this.downloadDir = options.downloadDir || path.join(__dirname, '../../downloads');
    this.tempDir = options.tempDir || path.join(__dirname, '../../temp');
    this.outputDir = options.outputDir || path.join(__dirname, '../../output');

    // Job tracking for async downloads
    this.jobs = new Map();

    // Ensure directories exist
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (err) {
      console.error('Error creating directories:', err);
    }
  }

  /**
   * Validate URL to prevent SSRF and local file access
   * @param {string} url - URL to validate
   * @returns {Object} - { valid: boolean, error?: string }
   */
  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL is required' };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }

    // Block file:// protocol to prevent local file access
    if (parsedUrl.protocol === 'file:') {
      return { valid: false, error: 'file:// protocol is not supported' };
    }

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are supported' };
    }

    // Block private/internal IP ranges to prevent SSRF
    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^fc00:/i,  // IPv6 unique local
      /^fe80:/i,  // IPv6 link-local
      /^fd00:/i,  // IPv6 unique local
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return { valid: false, error: 'Access to internal network addresses is not allowed' };
      }
    }

    return { valid: true };
  }

  /**
   * Get video info from any supported URL
   * @param {string} url - Video URL
   * @returns {Promise<Object>} Video metadata including title, thumbnail, duration, formats
   */
  async getVideoInfo(url) {
    // Validate URL first
    const validation = this.validateUrl(url);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return new Promise((resolve, reject) => {
      // SECURITY: Use execFile with argument array instead of shell string
      const args = [
        '--no-playlist',
        '-J',
        '--no-warnings',
        url  // Passed as argument, not interpolated into shell command
      ];

      execFile('yt-dlp', args, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 60000,
        shell: false  // SECURITY: Disable shell
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        try {
          const info = JSON.parse(stdout);

          // Build quality options - keep best format per resolution (like reclip)
          const bestByHeight = {};
          if (info.formats && Array.isArray(info.formats)) {
            for (const f of info.formats) {
              const height = f.height;
              if (height && f.vcodec && f.vcodec !== 'none') {
                const tbr = f.tbr || 0;
                if (!bestByHeight[height] || tbr > (bestByHeight[height].tbr || 0)) {
                  bestByHeight[height] = f;
                }
              }
            }
          }

          // Format options for UI
          const formats = Object.values(bestByHeight)
            .map(f => ({
              id: f.format_id,
              label: `${f.height}p`,
              height: f.height,
              tbr: f.tbr,
              ext: f.ext
            }))
            .sort((a, b) => b.height - a.height);

          resolve({
            title: info.title || 'Unknown',
            thumbnail: info.thumbnail || '',
            duration: info.duration || 0,
            uploader: info.uploader || '',
            url: url,
            formats: formats,
            description: info.description || '',
            upload_date: info.upload_date,
            view_count: info.view_count,
            like_count: info.like_count,
            // Source detection — auto-identified from the URL
            source: {
              type: info.extractor || 'unknown',
              label: mapExtractorToLabel(info.extractor),
              icon: mapExtractorToIcon(info.extractor)
            }
          });
        } catch (e) {
          reject(new Error('Failed to parse video info: ' + e.message));
        }
      });
    });
  }

  /**
   * Start a download job
   * @param {string} url - Video URL
   * @param {string} formatChoice - 'video' or 'audio'
   * @param {string} formatId - Optional specific format ID
   * @param {Function} onProgress - Optional progress callback
   * @param {string} outputFormat - Optional output format: 'mp4', 'mov', 'avi'
   * @returns {Promise<string>} Job ID
   */
  startDownload(url, formatChoice = 'video', formatId = null, onProgress = null, outputFormat = 'mp4') {
    // Validate URL
    const validation = this.validateUrl(url);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const jobId = this.generateJobId();

    this.jobs.set(jobId, {
      status: 'downloading',
      url,
      formatChoice,
      formatId,
      outputFormat,
      startTime: Date.now(),
      progress: 0
    });

    this.runDownload(jobId, url, formatChoice, formatId, onProgress);

    return jobId;
  }

  /**
   * Run download in background
   */
  async runDownload(jobId, url, formatChoice, formatId, onProgress) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const jobDir = this.downloadDir;
    const baseFilename = path.join(jobDir, `${jobId}`);

    // Build yt-dlp arguments as array (SECURITY: no shell interpolation)
    let args = ['--no-playlist'];

    if (formatChoice === 'audio') {
      args = args.concat([
        '-x',           // Extract audio
        '--audio-format', 'mp3',
        '--audio-quality', '192K'
      ]);
    } else if (formatId) {
      args = args.concat([
        '-f', `${formatId}+bestaudio/best`,
        '--merge-output-format', 'mp4'
      ]);
    } else {
      args = args.concat([
        '-f', 'bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4'
      ]);
    }

    args = args.concat([
      '-o', `${baseFilename}.%(ext)s`,
      '--no-warnings',
      '--progress',
      '--newline'      // Each progress update on new line
    ]);

    args.push(url);  // SECURITY: URL passed as argument, not interpolated

    const child = execFile('yt-dlp', args, {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
      timeout: 1800000,  // 30 minute timeout for long videos
      shell: false  // SECURITY: Disable shell
    }, (error, stdout, stderr) => {
      if (error) {
        job.status = 'error';
        job.error = stderr?.trim().split('\n').pop() || error.message;
        return;
      }

      // Find the downloaded file
      this.findDownloadedFiles(baseFilename).then(files => {
        if (files.length === 0) {
          job.status = 'error';
          job.error = 'Download completed but no file found';
          return;
        }

        // Keep only the main file, delete others
        const mainFile = formatChoice === 'audio'
          ? files.find(f => f.endsWith('.mp3')) || files[0]
          : files.find(f => f.endsWith('.mp4')) || files[0];

        const otherFiles = files.filter(f => f !== mainFile);

        // Delete other files
        otherFiles.forEach(f => {
          fs.unlink(f).catch(() => {});
        });

        // Convert to target format if not MP4
        const targetFormat = job.outputFormat || 'mp4';
        if (targetFormat !== 'mp4' && formatChoice !== 'audio') {
          this.convertFormat(mainFile, targetFormat)
            .then(convertedPath => {
              job.status = 'done';
              job.file = convertedPath;
              job.filename = path.basename(convertedPath);
            })
            .catch(err => {
              // Fall back to the original MP4 if conversion fails
              job.status = 'done';
              job.file = mainFile;
              job.filename = path.basename(mainFile);
              job.conversionError = err.message;
              console.error('Format conversion failed, using MP4:', err.message);
            });
        } else {
          job.status = 'done';
          job.file = mainFile;
          job.filename = path.basename(mainFile);
        }

        // Sanitize filename with title if available
        if (job.title) {
          const safeTitle = job.title.replace(/[\\/:*?"<>|]/g, '').substring(0, 30).trim();
          if (safeTitle) {
            const currentExt = path.extname(job.filename || '');
            job.filename = `${safeTitle}${currentExt}`;
          }
        }

      }).catch(err => {
        job.status = 'error';
        job.error = err.message;
      });
    });

    // Parse progress from stderr
    child.stderr?.on('data', (data) => {
      const percentMatch = data.toString().match(/(\d+\.?\d*)%/);
      if (percentMatch) {
        const percent = parseFloat(percentMatch[1]);
        job.progress = Math.min(percent, 100);

        // Also capture ETA and speed
        const etaMatch = data.toString().match(/ETA\s+([0-9:]+)/);
        const speedMatch = data.toString().match(/(\d+\.?\d*)\s*(MB|KB|GB|KiB)/i);

        job.eta = etaMatch ? etaMatch[1] : null;
        job.speed = speedMatch ? `${speedMatch[1]} ${speedMatch[2]}` : null;

        if (onProgress) {
          onProgress({
            percent: job.progress,
            eta: job.eta,
            speed: job.speed
          });
        }
      }

      // Capture 100% completion
      if (data.toString().includes('100%')) {
        job.progress = 100;
        if (onProgress) {
          onProgress({ percent: 100, eta: '00:00', speed: null });
        }
      }
    });

    // Handle timeout
    child.on('error', (err) => {
      if (job.status !== 'done') {
        job.status = 'error';
        job.error = err.message;
      }
    });
  }

  /**
   * Find files downloaded for a job
   */
  async findDownloadedFiles(baseFilename) {
    const dir = path.dirname(baseFilename);
    const base = path.basename(baseFilename);

    try {
      const files = await fs.readdir(dir);
      return files
        .filter(f => f.startsWith(base) && f !== `${base}.part`)
        .map(f => path.join(dir, f));
    } catch {
      return [];
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { error: 'Job not found' };
    }

    return {
      status: job.status,
      progress: job.progress,
      eta: job.eta,
      speed: job.speed,
      error: job.error,
      filename: job.filename,
      url: job.url,
      title: job.title
    };
  }

  /**
   * Get job file for download
   */
  async getJobFile(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'done') {
      return null;
    }
    return {
      path: job.file,
      filename: job.filename
    };
  }

  /**
   * Get job file and remove from tracking (for cleanup after download)
   */
  async getJobFileAndCleanup(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'done') {
      return null;
    }

    const result = {
      path: job.file,
      filename: job.filename
    };

    // Remove job from tracking but keep the file
    this.jobs.delete(jobId);

    return result;
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  /**
   * Bulk fetch info for multiple URLs
   */
  async getBulkVideoInfo(urls, maxConcurrent = 5) {
    const results = [];

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (url) => {
          try {
            const info = await this.getVideoInfo(url);
            return { success: true, url, info };
          } catch (err) {
            return { success: false, url, error: err.message };
          }
        })
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Convert downloaded video to target format via FFmpeg
   * @param {string} inputPath - Path to downloaded MP4
   * @param {string} targetFormat - 'mov' or 'avi'
   * @returns {Promise<string>} Path to converted file
   */
  convertFormat(inputPath, targetFormat) {
    const outputPath = inputPath.replace(/\.mp4$/, `.${targetFormat}`);

    return new Promise((resolve, reject) => {
      let args;

      if (targetFormat === 'mov') {
        // MOV: stream copy (no re-encoding, near-instant)
        args = ['-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath];
      } else if (targetFormat === 'avi') {
        // AVI: H.264 not universally supported, use mpeg4 codec
        args = ['-i', inputPath, '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame', '-b:a', '192k', outputPath];
      } else {
        return reject(new Error(`Unsupported target format: ${targetFormat}`));
      }

      execFile('ffmpeg', args, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000,  // 5 min timeout for conversion
        shell: false
      }, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(`FFmpeg conversion failed: ${stderr || error.message}`));
        }

        // Clean up original MP4 after successful conversion
        fs.unlink(inputPath).catch(() => {});
        resolve(outputPath);
      });
    });
  }

  /**
   * Discover all videos on a webpage (playlist, channel page, embedded videos)
   * @param {string} url - Webpage URL
   * @returns {Promise<Object>} { type: 'playlist'|'single', videos: [...] }
   */
  async discoverVideosOnPage(url) {
    const validation = this.validateUrl(url);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return new Promise((resolve, reject) => {
      const args = [
        '--flat-playlist',
        '--dump-single-json',
        '--no-warnings',
        url
      ];

      execFile('yt-dlp', args, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 60000,
        shell: false
      }, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message));
        }

        try {
          const data = JSON.parse(stdout);

          if (data.entries && Array.isArray(data.entries)) {
            resolve({
              type: 'playlist',
              title: data.title || data.fulltitle || 'Playlist',
              videos: data.entries.map(e => ({
                url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
                title: e.title || 'Untitled',
                duration: e.duration,
                thumbnail: e.thumbnail
              }))
            });
          } else if (data.title) {
            // Single video — treat as list of 1
            resolve({
              type: 'single',
              title: data.title,
              videos: [{
                url: url,
                title: data.title,
                duration: data.duration,
                thumbnail: data.thumbnail
              }]
            });
          } else {
            reject(new Error('No videos found on this page'));
          }
        } catch (e) {
          reject(new Error('Failed to parse page content: ' + e.message));
        }
      });
    });
  }

  /**
   * Cleanup old jobs (without deleting downloaded files)
   * Only cleans up job tracking entries, not the actual files
   * Files should be managed separately based on user needs
   */
  cleanup(maxAge = 86400000) {  // Default 24 hours
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      // Only clean up jobs that are done/error and older than maxAge
      if ((job.status === 'done' || job.status === 'error') &&
          now - job.startTime > maxAge) {
        this.jobs.delete(jobId);
        // NOTE: We no longer delete the files here
        // Files should be managed by a separate cleanup process
        // or kept for user downloads
      }
    }
  }
}

module.exports = YtDlpWrapper;
