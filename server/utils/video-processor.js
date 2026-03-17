// server/utils/video-processor.js
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const PythonAIWrapper = require('../ai/python-wrapper');

// Use system ffmpeg (installed via brew)
ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg');
ffmpeg.setFfprobePath('/opt/homebrew/bin/ffprobe');

class VideoProcessor {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.outputDir = path.join(__dirname, '../../output');
    this.aiWrapper = new PythonAIWrapper();
    this.setupDirectories();
  }

  // Create necessary directories
  async setupDirectories() {
    await fs.mkdir(this.tempDir, { recursive: true });
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  // Download YouTube video
  async downloadYouTubeVideo(youtubeUrl, outputFilename) {
    return new Promise((resolve, reject) => {
      const outputFilePath = path.join(this.tempDir, outputFilename);

      ffmpeg(youtubeUrl)
        .toFormat('mp4')
        .output(outputFilePath)
        .on('end', () => {
          resolve(outputFilePath);
        })
        .on('error', (err) => {
          reject(new Error(`FFmpeg error: ${err.message}`));
        })
        .run();
    });
  }

  // Cut video segment
  async cutVideoSegment(inputPath, outputPath, startTime, duration) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .output(outputPath)
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`FFmpeg error during cutting: ${err.message}`));
        })
        .run();
    });
  }

  // Convert video to specific platform format
  async convertToPlatformFormat(inputPath, platformSettings, outputFilename) {
    return new Promise((resolve, reject) => {
      const outputFilePath = path.join(this.outputDir, outputFilename);

      const command = ffmpeg(inputPath)
        .size(`${platformSettings.dimensions.width}x${platformSettings.dimensions.height}`)
        .fps(platformSettings.fps)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-movflags +faststart', // Optimize for streaming
          '-profile:v baseline', // Compatibility
          '-level 4.0', // Compatibility level
          '-pix_fmt yuv420p', // Pixel format for compatibility
          '-preset fast' // Faster encoding
        ])
        .output(outputFilePath);

      command.on('end', () => {
        resolve(outputFilePath);
      });

      command.on('error', (err) => {
        reject(new Error(`FFmpeg error during conversion: ${err.message}`));
      });

      command.run();
    });
  }

  // Extract video information
  async getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(new Error(`Error getting video info: ${err.message}`));
        } else {
          resolve({
            duration: metadata.format.duration,
            width: metadata.streams.find(stream => stream.codec_type === 'video')?.width,
            height: metadata.streams.find(stream => stream.codec_type === 'video')?.height,
            fps: parseFloat(metadata.streams.find(stream => stream.codec_type === 'video')?.avg_frame_rate || 0),
            size: metadata.format.size
          });
        }
      });
    });
  }

  // Apply basic video effects (stabilization, filters)
  async applyEffects(inputPath, outputPath, effects = {}) {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);

      // Apply stabilization if requested
      if (effects.stabilize) {
        command = command.videoFilters('vidstabdetect=shakiness=10:accuracy=15:result=transforms.trf')
          .videoFilters('vidstabtransform=input=transforms.trf:smoothing=30:maxangle=0.3:crop=black:zoom=1:optalgo=gauss');
      }

      // Apply brightness/contrast if specified
      if (effects.brightness !== undefined || effects.contrast !== undefined) {
        let filter = '';
        if (effects.brightness !== undefined) filter += `eq=brightness=${effects.brightness}:`;
        if (effects.contrast !== undefined) filter += `contrast=${effects.contrast}`;

        if (filter.endsWith(':')) filter = filter.slice(0, -1); // Remove trailing ':'
        command = command.videoFilters(filter);
      }

      // Apply saturation if specified
      if (effects.saturation !== undefined) {
        command = command.videoFilters(`eq=saturation=${effects.saturation}`);
      }

      command.output(outputPath)
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`FFmpeg error during effects application: ${err.message}`));
        })
        .run();
    });
  }

  // Generate thumbnail from video
  async generateThumbnail(videoPath, timestamp = 1, filename) {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir, filename);

      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timestamp],
          filename: filename,
          folder: this.tempDir,
          size: '320x240'
        })
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`FFmpeg error during thumbnail generation: ${err.message}`));
        });
    });
  }

  // Concatenate multiple video segments
  async concatenateVideos(videoPaths, outputPath) {
    return new Promise((resolve, reject) => {
      const concatList = videoPaths.map(path => `file '${path}'`).join('\n');
      const concatFilePath = path.join(this.tempDir, `concat_${Date.now()}.txt`);

      fs.writeFile(concatFilePath, concatList)
        .then(() => {
          ffmpeg()
            .input(concatFilePath)
            .inputOptions(['-f concat', '-safe 0'])
            .output(outputPath)
            .on('end', async () => {
              // Clean up temp concat file
              await fs.unlink(concatFilePath);
              resolve(outputPath);
            })
            .on('error', async (err) => {
              // Clean up temp concat file even if error occurs
              try {
                await fs.unlink(concatFilePath);
              } catch (cleanupErr) {
                console.error('Error cleaning up concat file:', cleanupErr);
              }
              reject(new Error(`FFmpeg error during concatenation: ${err.message}`));
            })
            .run();
        })
        .catch(reject);
    });
  }

  // Add watermark to video
  async addWatermark(inputPath, watermarkPath, outputPath, position = 'bottom-right') {
    return new Promise((resolve, reject) => {
      let overlayFilter;

      switch(position) {
        case 'top-left':
          overlayFilter = 'overlay=10:10';
          break;
        case 'top-right':
          overlayFilter = 'overlay=W-w-10:10';
          break;
        case 'bottom-left':
          overlayFilter = 'overlay=10:H-h-10';
          break;
        case 'bottom-right':
        default:
          overlayFilter = 'overlay=W-w-10:H-h-10';
          break;
      }

      ffmpeg(inputPath)
        .input(watermarkPath)
        .videoFilters(overlayFilter)
        .output(outputPath)
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`FFmpeg error during watermark addition: ${err.message}`));
        })
        .run();
    });
  }

  // Detect highlights in video using AI
  async detectHighlights(videoPath) {
    try {
      const highlights = await this.aiWrapper.detectHighlights(videoPath);
      return highlights;
    } catch (error) {
      console.error('Error in AI highlight detection:', error);
      throw new Error(`AI highlight detection failed: ${error.message}`);
    }
  }

  // Analyze video content for engagement
  async analyzeVideoContent(videoPath) {
    try {
      const analysis = await this.aiWrapper.analyzeVideoContent(videoPath);
      return analysis;
    } catch (error) {
      console.error('Error in AI content analysis:', error);
      throw new Error(`AI content analysis failed: ${error.message}`);
    }
  }

  // Clean up temporary files
  async cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.error(`Error deleting temp file ${filePath}:`, err);
      }
    }
  }

  // Generate unique filenames
  generateUniqueFilename(extension) {
    return `${uuidv4()}.${extension}`;
  }
}

module.exports = VideoProcessor;