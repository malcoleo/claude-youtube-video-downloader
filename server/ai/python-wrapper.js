// server/ai/python-wrapper.js
const { PythonShell } = require('python-shell');
const path = require('path');

class PythonAIWrapper {
  constructor() {
    this.highlightDetectorPath = path.join(__dirname, 'highlight-detector.py');
    this.captionGeneratorPath = path.join(__dirname, 'caption-generator.py');
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
}

module.exports = PythonAIWrapper;