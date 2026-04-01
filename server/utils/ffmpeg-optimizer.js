// server/utils/ffmpeg-optimizer.js
const { execFile } = require('child_process');
const os = require('os');

class FFmpegOptimizer {
  constructor() {
    this.hardwareEncoder = this.detectHardwareEncoder();
    this.cpuCores = os.cpus().length;
    this.threadCount = Math.max(2, Math.min(4, this.cpuCores - 1)); // Use 2-4 threads, leaving 1 free
  }

  /**
   * Detect available hardware acceleration
   */
  detectHardwareEncoder() {
    const platform = os.platform();

    // macOS - VideoToolbox (always available on macOS 10.8+)
    if (platform === 'darwin') {
      return 'h264_videotoolbox';
    }

    // Windows - NVENC (NVIDIA) or QSV (Intel Quick Sync) or AMF (AMD)
    if (platform === 'win32') {
      // Could check for NVIDIA/Intel/AMD, default to NVENC
      return 'h264_nvenc';
    }

    // Linux - VAAPI or NVENC
    if (platform === 'linux') {
      return 'h264_vaapi';
    }

    // Fallback to software encoding
    return null;
  }

  /**
   * Get optimized FFmpeg arguments for clip export
   * Uses hardware acceleration when available, faster presets, and multi-threading
   *
   * @param {Object} options - Export options
   * @returns {string[]} - FFmpeg argument array
   */
  getClipExportArgs(options) {
    const {
      inputPath,
      outputPath,
      startTime,
      duration,
      width,
      height,
      videoFilters = [],
      audioFilters = [],
      watermarkUrl = null,
      watermarkPosition = 'bottom-right',
      bgMusicUrl = null,
      bgMusicVolume = 30,
      volumeAdjustment = 0,
      useHardwareEncoding = true,
      bitrate = '5M'
    } = options;

    const args = [];

    // Input seeking (-ss before -i for fast seeking)
    args.push('-ss', String(startTime));
    args.push('-t', String(duration));
    args.push('-i', inputPath);

    // Add watermark input if provided
    if (watermarkUrl) {
      args.push('-i', watermarkUrl);
    }

    // Add background music input if provided
    if (bgMusicUrl) {
      args.push('-i', bgMusicUrl);
    }

    // Build filter complex
    const filterComplex = this.buildFilterComplex({
      videoFilters,
      audioFilters,
      watermarkUrl,
      watermarkPosition,
      bgMusicUrl,
      bgMusicVolume,
      volumeAdjustment,
      width,
      height
    });

    if (filterComplex) {
      args.push('-filter_complex', filterComplex);
    }

    // Video codec settings
    if (useHardwareEncoding && this.hardwareEncoder) {
      // Hardware acceleration
      args.push('-c:v', this.hardwareEncoder);

      // Hardware encoder specific options
      if (this.hardwareEncoder === 'h264_videotoolbox') {
        args.push(
          '-b:v', bitrate,
          '-profile:v', 'high',
          '-level', '4.0',
          '-threads', String(this.threadCount)
        );
      } else if (this.hardwareEncoder === 'h264_nvenc') {
        args.push(
          '-b:v', bitrate,
          '-preset', 'p1', // Fastest preset for NVENC
          '-tune', 'hq',
          '-rc', 'vbr_h264',
          '-profile:v', 'high',
          '-level', 'auto'
        );
      } else if (this.hardwareEncoder === 'h264_vaapi') {
        args.push(
          '-b:v', bitrate,
          '-compression_level', '1' // Fastest compression
        );
      }
    } else {
      // Software encoding with fast preset
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast', // Much faster than default 'medium'
        '-crf', '23', // Constant quality (18-28 range, higher = lower quality)
        '-threads', String(this.threadCount),
        '-b:v', bitrate
      );
    }

    // Audio codec settings
    if (bgMusicUrl || watermarkUrl) {
      // Multiple audio inputs - use filter output
      args.push('-map', '[aout]');
    } else {
      // Single audio input with volume adjustment
      const volumeFactor = 1 + (volumeAdjustment / 20);
      args.push(
        '-c:a', 'aac',
        '-b:a', '128k',
        '-af', `volume=${volumeFactor}`
      );
    }

    // Output settings
    args.push(
      '-movflags', '+faststart', // Enable fast start for web streaming
      '-y' // Overwrite output
    );

    args.push(outputPath);

    return args;
  }

  /**
   * Build filter complex string for video and audio processing
   */
  buildFilterComplex(options) {
    const {
      videoFilters = [],
      audioFilters = [],
      watermarkUrl,
      watermarkPosition,
      bgMusicUrl,
      bgMusicVolume,
      volumeAdjustment,
      width,
      height
    } = options;

    const videoFilterParts = [];
    const audioFilterParts = [];
    const filterInputs = [];
    const filterOutputs = [];

    // Start with video filters
    let currentVideoOutput = '0:v'; // First input video

    // Add scaling if dimensions specified
    if (width && height) {
      videoFilterParts.push(`[${currentVideoOutput}]scale=${width}:${height}[scaled]`);
      currentVideoOutput = 'scaled';
    }

    // Add custom video filters
    videoFilters.forEach((filter, index) => {
      const input = index === 0 ? currentVideoOutput : `filtered${index - 1}`;
      const output = `filtered${index}`;
      videoFilterParts.push(`[${input}]${filter}[${output}]`);
      currentVideoOutput = output;
    });

    // Add watermark overlay
    if (watermarkUrl) {
      const positionMap = {
        'top-left': 'x=10:y=10',
        'top-right': `x=main_w-overlay_w-10:y=10`,
        'bottom-left': `x=10:y=main_h-overlay_h-10`,
        'bottom-right': `x=main_w-overlay_w-10:y=main_h-overlay_h-10`,
        'center': '(main_w-overlay_w)/2:(main_h-overlay_h)/2'
      };

      const overlayArgs = positionMap[watermarkPosition] || positionMap['bottom-right'];
      videoFilterParts.push(`[${currentVideoOutput}][1:v]overlay=${overlayArgs}[vout]`);
      currentVideoOutput = 'vout';
    } else if (videoFilterParts.length === 0 && width && height) {
      // If only scaling, output as vout
      videoFilterParts.push(`[${currentVideoOutput}][vout]`);
    }

    // Audio processing
    const mainVolume = 1 + (volumeAdjustment / 20);

    if (bgMusicUrl) {
      // Mix main audio with background music
      const volumeRatio = bgMusicVolume / 100;
      const adjustedMainVolume = 1 - (volumeRatio / 2);

      // Main audio volume adjustment
      audioFilterParts.push(`[0:a]volume=${adjustedMainVolume}[main_a]`);

      // Background music volume and fade out
      audioFilterParts.push(`[1:a]volume=${volumeRatio},afade=t=out:st=${Math.max(3, options.duration - 2)}:d=2[bg_a]`);

      // Mix audio streams
      const audioInputIndex = watermarkUrl ? 2 : 1;
      audioFilterParts.push(`[main_a][bg_a]amix=inputs=2:duration=first[aout]`);
    } else if (watermarkUrl) {
      // Just adjust main audio volume
      audioFilterParts.push(`[0:a]volume=${mainVolume}[aout]`);
    }

    // Combine filter parts
    const allFilters = [...videoFilterParts, ...audioFilterParts];

    if (allFilters.length === 0) {
      return null;
    }

    return allFilters.join(';');
  }

  /**
   * Execute FFmpeg with optimized settings
   */
  async exportClip(options, onProgress) {
    const args = this.getClipExportArgs(options);

    return new Promise((resolve, reject) => {
      const ffmpeg = execFile('ffmpeg', args, {
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf8'
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      });

      // Capture progress if callback provided
      if (onProgress && ffmpeg.stderr) {
        ffmpeg.stderr.on('data', (data) => {
          const match = data.match(/time=(\d+):(\d+):(\d+)/);
          if (match) {
            const elapsed = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
            const progress = (elapsed / options.duration) * 100;
            onProgress(Math.min(progress, 100));
          }
        });
      }
    });
  }

  /**
   * Get encoding info for logging
   */
  getEncodingInfo() {
    return {
      hardwareEncoder: this.hardwareEncoder || 'software (libx264)',
      threads: this.threadCount,
      cpuCores: this.cpuCores,
      platform: os.platform()
    };
  }
}

module.exports = FFmpegOptimizer;
