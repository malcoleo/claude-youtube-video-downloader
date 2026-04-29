// server/utils/yt-dlp-wrapper.js
// Wrapper for yt-dlp to support 1000+ sites (not just YouTube)
// SECURITY: Uses execFile with argument arrays to prevent command injection

const { execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

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
            like_count: info.like_count
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
   * @returns {Promise<string>} Job ID
   */
  startDownload(url, formatChoice = 'video', formatId = null, onProgress = null) {
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

        job.status = 'done';
        job.file = mainFile;
        job.filename = path.basename(mainFile);

        // Sanitize filename with title if available
        if (job.title) {
          const safeTitle = job.title.replace(/[\\/:*?"<>|]/g, '').substring(0, 30).trim();
          if (safeTitle) {
            const ext = path.extname(mainFile);
            job.filename = `${safeTitle}${ext}`;
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
