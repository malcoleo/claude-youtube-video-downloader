// server/utils/video-processor.js
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
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
  async convertToPlatformFormat(inputPath, platformSettings, outputFilename, withHormoziEffects = true) {
    return new Promise((resolve, reject) => {
      const outputFilePath = path.join(this.outputDir, outputFilename);

      let command = ffmpeg(inputPath)
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
        ]);

      // Apply Hormozi-style effects
      if (withHormoziEffects) {
        // Color grading: boost contrast, saturation, warm tones
        command = command.videoFilters('eq=contrast=1.15:saturation=1.25:gamma=1.1:gamma_r=1.1:gamma_g=1.1:gamma_b=1.1');
        console.log('Applied Hormozi color grading');

        // Subtle bounce effect
        command = command.videoFilters('zoompan=z=if(lte(z,1.1),1.05+0.05*sin(n/30),1.05):d=150:x=(iw-iw/zoom)/2:y=(ih-ih/zoom)/2');
        console.log('Applied Hormozi bounce effect');
      }

      command = command.output(outputFilePath);

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

  // Detect face position in video for cropping
  async detectFacePosition(videoPath, startTime = 0, duration = 5) {
    return new Promise((resolve, reject) => {
      const faceDetectorPath = path.join(__dirname, '../ai/face-crop-detector.py');

      execFile('python3', ['-u', faceDetectorPath, videoPath, String(startTime), String(duration)], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
      }, (err, stdout, stderr) => {
        if (err) {
          console.error('[FaceCrop] Detection failed:', {
            videoPath: videoPath.substring(0, 100),
            startTime,
            duration,
            error: err.message,
            stderr: stderr?.substring(0, 200)
          });
          console.warn('[FaceCrop] Falling back to center crop');
          // Fallback to center crop if face detection fails
          resolve({
            cropX: null, // null = center crop
            cropY: null,
            speakerPosition: 'center',
            ffmpegFilter: null,
            fallbackReason: 'detection_error'
          });
          return;
        }

        try {
          const cropParams = JSON.parse(stdout.trim());
          resolve(cropParams);
        } catch (parseErr) {
          console.error('[FaceCrop] Parse error:', {
            parseError: parseErr.message,
            stdout: stdout?.substring(0, 200),
            stderr: stderr?.substring(0, 200)
          });
          console.warn('[FaceCrop] Falling back to center crop');
          resolve({
            cropX: null,
            cropY: null,
            speakerPosition: 'center',
            ffmpegFilter: null,
            fallbackReason: 'parse_error'
          });
        }
      });
    });
  }

  // Apply Hormozi-style effects to video
  async applyHormoziEffects(inputPath, outputPath, effects = {}) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);

      // Generate subtitle file if text provided
      if (effects.text) {
        const subtitlePath = path.join(this.tempDir, `subtitle_${Date.now()}.ass`);
        this._generateAssSubtitle(subtitlePath, effects.text, effects.fontPath);
        command.subtitles(subtitlePath);
      }

      // Apply face tracking crop if speaker detected (for 9:16 vertical)
      if (effects.faceTrack && effects.facePosition) {
        const pos = effects.facePosition;
        if (pos.ffmpeg_crop_filter) {
          command.videoFilters(pos.ffmpeg_crop_filter);
          console.log(`Applied face crop: ${pos.speaker_position} speaker detected`);
        }
      }

      // Apply zoom effects on key phrases using zoompan filter
      if (effects.zoomOnKeyPhrases && effects.subtitleSegments) {
        // Create a zoom effect that moves between key moments
        // This simulates Hormozi's dynamic zooming
        const zoomFilter = this._createZoomFilter(effects.subtitleSegments);
        if (zoomFilter) {
          command.videoFilters(zoomFilter);
          console.log('Applied zoom filter for key phrases');
        }
      }

      // Apply color grading (Hormozi style - high contrast, warm tones)
      if (effects.colorGrading !== false) {
        // Hormozi style: boost contrast, saturation, warm temperature
        command.videoFilters('eq=contrast=1.15:saturation=1.25:gamma=1.1:gamma_r=1.1:gamma_g=1.1:gamma_b=1.1');
        console.log('Applied Hormozi color grading');
      }

      // Add text overlay for keywords (subtitle burn-in)
      if (effects.keywordHighlights) {
        const highlightPath = path.join(this.tempDir, `highlight_${Date.now()}.ass`);
        this._generateKeywordHighlights(highlightPath, effects.keywordHighlights);
        command.subtitles(highlightPath);
      }

      // Add subtle bounce effect for engaging clips using voltaic filter
      if (effects.bounceEffect) {
        // Simulate bounce with periodic zoom slightly
        command.videoFilters('zoompan=z=if(lt(z,1.1),1.05+0.05*sin(n/30),1.05):d=150:x=(iw-iw/zoom)/2:y=(ih-ih/zoom)/2');
        console.log('Applied bounce effect');
      }

      // Add subtle motion effect with minterpolate for smoother video
      if (effects.motionEffect) {
        command.videoFilters('minterpolate=fps=60:mi_mode=mci:me_mode=bidir');
      }

      // Add grain texture for film look (optional)
      if (effects.grain) {
        command.videoFilters('noise=all=lambda=2.0:allf=u+type+rand');
      }

      command.output(outputPath)
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg error during effects application:', err);
          reject(new Error(`FFmpeg error during effects application: ${err.message}`));
        })
        .run();
    });
  }

  // Create zoom filter for Hormozi-style dynamic zooming
  _createZoomFilter(subtitleSegments, durationSeconds) {
    if (!subtitleSegments || subtitleSegments.length < 2) {
      return null;
    }

    // Sort segments by start time
    const sortedSegments = [...subtitleSegments].sort((a, b) => a.start - b.start);

    // Find the most emphasized segments (longest duration or high intensity)
    // These are where we want zoom effects
    const zoomSegments = sortedSegments.slice(0, Math.min(5, sortedSegments.length));

    // Create a zoompan filter that creates subtle zoom effects
    // Hormozi often uses subtle zoom-in on key statements
    // Use longer duration for smoother zoom transitions
    const zoomDuration = Math.max(60, Math.floor(durationSeconds * 30)); // frames based on video duration

    // Create a multi-stage zoompan for better effect
    // Start with small zoom, increase on key phrases, then settle
    return `zoompan=z='if(lte(z,1.0),1.08,z)'):d=${zoomDuration}:x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':fps=30`;
  }

  // Generate ASS subtitle file for Hormozi-style captions
  _generateAssSubtitle(outputPath, textSegments, fontPath = 'Bebas Neue') {
    const header = `[$Header]\n[Stream]\nStreamName: Text\nStreamType: 0\n_NAME: ${fontPath}\nORIGIN: 0:0\nSIZE: 1920x1080\nLAYER: 0\nSTART: 0\nEND: 9999999\n`;

    let styles = `[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`;
    styles += `Style: Hormozi,${fontPath},72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n`;

    let events = `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    textSegments.forEach((segment, idx) => {
      // Format time as HH:MM:SS.cc
      const formatTime = (ms) => {
        const mins = Math.floor(ms / 6000);
        const secs = Math.floor((ms % 6000) / 100);
        const csec = Math.floor(ms % 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${csec.toString().padStart(2, '0')}`;
      };

      events += `Dialogue: 0,${formatTime(segment.start)},${formatTime(segment.end)},Hormozi,,0,0,0,,{\\k${segment.duration}}${segment.text}\n`;
    });

    fs.writeFile(outputPath, header + styles + events);
  }

  // Generate keyword highlights subtitle
  _generateKeywordHighlights(outputPath, keywords, fontPath = 'Bebas Neue') {
    const header = `[$Header]\n[Stream]\nStreamName: Highlights\nStreamType: 0\n_NAME: ${fontPath}\nORIGIN: 0:0\nSIZE: 1920x1080\nLAYER: 0\nSTART: 0\nEND: 9999999\n`;

    let styles = `[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`;
    styles += `Style: Keyword,${fontPath},96,&H00FFD700,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,3,2,10,10,10,1\n`;

    let events = `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    keywords.forEach((kw, idx) => {
      const formatTime = (ms) => {
        const mins = Math.floor(ms / 6000);
        const secs = Math.floor((ms % 6000) / 100);
        const csec = Math.floor(ms % 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${csec.toString().padStart(2, '0')}`;
      };

      events += `Dialogue: 0,${formatTime(kw.start)},${formatTime(kw.end)},Keyword,,0,0,0,,{\\pos(960,900)\\fscx120\\fscy120}${kw.text}\n`;
    });

    fs.writeFile(outputPath, header + styles + events);
  }
}

module.exports = VideoProcessor;