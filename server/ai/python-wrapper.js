// server/ai/python-wrapper.js
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const { execSync, execFile } = require('child_process');
const { execFileSync } = require('child_process');

class PythonAIWrapper {
  constructor() {
    this.highlightDetectorPath = path.join(__dirname, 'highlight-detector.py');
    this.captionGeneratorPath = path.join(__dirname, 'caption-generator.py');
    this.qaDetectorPath = path.join(__dirname, 'qa-detector.py');
    this.whisperToQaPath = path.join(__dirname, 'whisper-to-qa.py');
    this.faceCropDetectorPath = path.join(__dirname, 'face-crop-detector.py');
    this.whisperModelPath = path.join(__dirname, 'models', 'ggml-large-v3.bin');
    this.whisperJsonPath = path.join(__dirname, 'whisper-output.json');
  }

  /**
   * Transcribe audio file using whisper.cpp with speaker diarization.
   * For stereo audio: uses --diarize flag for automatic speaker separation.
   * For mono audio: falls back to turn-based speaker assignment.
   *
   * @param {string} audioPath - Path to audio file (mp3, wav, flac, ogg)
   * @param {boolean} includeWordTimestamps - If true, includes word-level timestamps for subtitle engine
   * @returns {Promise<object>} Transcript with segments and speaker labels (and optional words array)
   */
  async transcribeWithSpeakerLabels(audioPath, includeWordTimestamps = false) {
    return new Promise((resolve, reject) => {
      // Check if model exists
      if (!fs.existsSync(this.whisperModelPath)) {
        reject(new Error(`Whisper model not found at ${this.whisperModelPath}`));
        return;
      }

      // Run whisper.cpp CLI - output JSON goes to {audioPath}.json by default
      const whisperArgs = [
        '--model', this.whisperModelPath,
        '--output-json',
      ];

      // Add word-level timestamps flag for subtitle engine
      if (includeWordTimestamps) {
        whisperArgs.push('--word-timestamps');
      }

      whisperArgs.push(audioPath);

      const jsonOutputPath = audioPath + '.json';

      try {
        console.log(`Transcribing ${audioPath} with whisper.cpp...`);
        execFileSync('whisper-cli', whisperArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 100 * 1024 * 1024 // 100MB buffer for long transcripts
        });

        // Verify JSON output was created
        if (!fs.existsSync(jsonOutputPath)) {
          throw new Error(`Whisper JSON output not created at ${jsonOutputPath}`);
        }

        // Convert whisper output to qa-detector format using execFileSync
        const wordsFlag = includeWordTimestamps ? '--words' : '';
        console.log(`Running whisper-to-qa.py on ${jsonOutputPath}...`);
        const pythonOutput = execFileSync('python3', ['-u', this.whisperToQaPath, wordsFlag, jsonOutputPath], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });

        console.log(`whisper-to-qa.py output length: ${pythonOutput.length}`);

        try {
          const transcript = JSON.parse(pythonOutput);
          resolve(transcript);
        } catch (parseErr) {
          console.error('Error parsing whisper output:', parseErr);
          console.error('Raw output:', pythonOutput.substring(0, 500));
          reject(parseErr);
        }
      } catch (execErr) {
        console.error('whisper-cli execution error:', execErr);
        reject(execErr);
      }
    });
  }

  /**
   * Detect Q&A pairs from a transcript with speaker diarization.
   *
   * @param {object} transcript - Transcript object with segments array
   * @returns {Promise<object>} Q&A pairs with scores and timestamps
   */
  async detectQAPairs(transcript) {
    // Write transcript to temp file
    const tempTranscriptPath = path.join(__dirname, 'temp-transcript.json');
    fs.writeFileSync(tempTranscriptPath, JSON.stringify(transcript, null, 2));

    try {
      console.log(`Running qa-detector.py on transcript...`);
      const pythonOutput = execFileSync('python3', ['-u', this.qaDetectorPath, tempTranscriptPath], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer
      });

      console.log(`qa-detector.py output length: ${pythonOutput.length}`);

      try {
        const qaResult = JSON.parse(pythonOutput);
        return qaResult;
      } catch (parseErr) {
        console.error('Error parsing QA detector output:', parseErr);
        console.error('Raw output:', pythonOutput.substring(0, 500));
        throw parseErr;
      }
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempTranscriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Full pipeline: transcribe audio and detect Q&A pairs.
   *
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<object>} Combined result with transcript and Q&A pairs
   */
  async transcribeAndDetectQA(audioPath) {
    try {
      // Step 1: Transcribe with speaker labels
      const transcript = await this.transcribeWithSpeakerLabels(audioPath);

      // Step 2: Detect Q&A pairs
      const qaResult = await this.detectQAPairs(transcript);

      return {
        transcript,
        qaPairs: qaResult.qa_pairs || [],
        stats: {
          totalSegments: qaResult.total_segments,
          mergedSegments: qaResult.merged_segments,
          qaPairsFound: qaResult.qa_pairs_found
        }
      };
    } catch (error) {
      throw new Error(`Q&A detection pipeline failed: ${error.message}`);
    }
  }

  /**
   * Transcribe audio file and return word-level timestamps for subtitle engine.
   * Wrapper that explicitly enables word timestamps.
   *
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<object>} Transcript with words array containing word-level timestamps
   */
  async transcribeWithWordTimestamps(audioPath) {
    return this.transcribeWithSpeakerLabels(audioPath, true);
  }

  async detectHighlights(videoPath) {
    return new Promise((resolve, reject) => {
      const options = {
        mode: 'text',
        pythonPath: 'python3',
        pythonOptions: ['-u'],
        args: [videoPath]
      };

      PythonShell.run(this.highlightDetectorPath, options, (err, results) => {
        if (err) {
          console.error('Python script error:', err);
          reject(err);
          return;
        }

        try {
          const highlights = JSON.parse(results[results.length - 1]);
          resolve(highlights);
        } catch (parseErr) {
          console.error('Error parsing Python output:', parseErr);
          reject(parseErr);
        }
      });
    });
  }

  async analyzeVideoContent(videoPath) {
    return new Promise((resolve, reject) => {
      const options = {
        mode: 'text',
        pythonPath: 'python3',
        pythonOptions: ['-u'],
        args: [videoPath]
      };

      PythonShell.run(this.captionGeneratorPath, options, (err, results) => {
        if (err) {
          console.error('Caption generator script error:', err);
          reject(err);
          return;
        }

        try {
          const analysis = JSON.parse(results[results.length - 1]);
          resolve(analysis);
        } catch (parseErr) {
          console.error('Error parsing caption generator output:', parseErr);
          reject(parseErr);
        }
      });
    });
  }

  /**
   * Detect optimal crop region for vertical video based on face position.
   * Analyzes first few seconds of video to find speaker location.
   *
   * @param {string} videoPath - Path to video file
   * @param {number} startTime - Start time in seconds (default: 0)
   * @param {number} duration - Duration to analyze in seconds (default: 5)
   * @returns {Promise<object>} Crop parameters with ffmpeg filter
   */
  async detectFaceCrop(videoPath, startTime = 0, duration = 5) {
    return new Promise((resolve, reject) => {
      execFile('python3', ['-u', this.faceCropDetectorPath, videoPath, String(startTime), String(duration)], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
      }, (err, stdout, stderr) => {
        if (err) {
          console.error('Face crop detector error:', err);
          reject(err);
          return;
        }

        try {
          const cropParams = JSON.parse(stdout.trim());
          resolve(cropParams);
        } catch (parseErr) {
          console.error('Error parsing face crop output:', parseErr);
          reject(parseErr);
        }
      });
    });
  }
}

module.exports = PythonAIWrapper;