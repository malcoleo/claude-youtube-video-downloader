# Phase 0: Podcast Q&A Detection - Backend Implementation

## Overview
Phase 0 validates the core Q&A detection pipeline before building the full UI. This backend-only implementation transcribes podcast audio and automatically detects Question→Answer pairs.

## Files Created/Modified

### New Files
- `server/ai/qa-detector.py` - Q&A pair detection algorithm
- `server/ai/whisper-to-qa.py` - Whisper.cpp output format converter
- `server/ai/models/ggml-large-v3.bin` - Whisper large-v3 model (2.9GB)

### Modified Files
- `server/ai/python-wrapper.js` - Added Whisper + Q&A detection methods
- `server/api/highlight-detection.js` - Added `/api/podcast/detect` endpoint

## Installation

### Prerequisites
```bash
# Install whisper.cpp
brew install whisper-cpp

# Verify installation
whisper-cli --version
```

### Model Download
The Whisper large-v3 model is included at `server/ai/models/ggml-large-v3.bin`.

If you need to re-download:
```bash
cd server/ai/models
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
```

## API Usage

### Endpoint: POST /api/podcast/detect

**Request:**
```
POST /api/podcast/detect
Content-Type: multipart/form-data

video: <file> (MP4, MOV, MKV, WAV, MP3)
maxDuration: 7200 (optional, seconds, default 2 hours)
```

**Response:**
```json
{
  "success": true,
  "qaPairs": [
    {
      "id": "qa-0",
      "questionStart": 0.0,
      "questionEnd": 4.2,
      "answerStart": 4.5,
      "answerEnd": 18.3,
      "duration": 18.3,
      "questionText": "Can you explain how your company works?",
      "answerText": "Sure! We help podcasters...",
      "questionSpeaker": "SPEAKER_00",
      "answerSpeaker": "SPEAKER_01",
      "score": 100,
      "priority": "high",
      "reasons": ["question_pattern", "speaker_change", "short_but_usable"],
      "labels": {
        "question": "Speaker A",
        "answer": "Speaker B"
      }
    }
  ],
  "stats": {
    "totalSegments": 46,
    "mergedSegments": 46,
    "qaPairsFound": 3
  },
  "message": "Found 3 Q&A pairs"
}
```

## Testing

### Test with sample audio
```bash
# Transcribe audio with whisper.cpp
whisper-cli --model server/ai/models/ggml-large-v3.bin \
            --output-json \
            path/to/podcast.mp3

# Convert to QA detector format
python3 server/ai/whisper-to-qa.py path/to/podcast.mp3.json

# Run Q&A detection
python3 server/ai/whisper-to-qa.py path/to/podcast.mp3.json | \
python3 server/ai/qa-detector.py /dev/stdin
```

### Test API endpoint (curl)
```bash
curl -X POST http://localhost:3000/api/podcast/detect \
  -F "video=@/path/to/podcast.mp4" \
  -F "maxDuration=3600"
```

### Test API endpoint (Node.js)
```javascript
const PythonAIWrapper = require('./server/ai/python-wrapper');
const pythonAI = new PythonAIWrapper();

async function test() {
  const result = await pythonAI.transcribeAndDetectQA('/path/to/podcast.mp3');
  console.log(`Found ${result.qaPairs.length} Q&A pairs`);
  console.log('Top pair:', result.qaPairs[0]);
}

test();
```

## Q&A Detection Algorithm

### Question Detection
- **Question patterns**: WH- questions, yes/no questions, invitations ("Tell me...", "Can you...")
- **Ends with question mark**: Explicit question indicator
- **Minimum length**: 10 characters (filters out "Really?", "Yeah?", etc.)

### Scoring System (0-100)
| Factor | Points | Description |
|--------|--------|-------------|
| Question pattern | +20 | Text matches question regex |
| Speaker change | +15 | Different speakers for Q&A |
| Good duration (30-90s) | +20 | Ideal clip length |
| Short but usable (15-30s) | +10 | Acceptable clip length |
| Substantive answer (20+ words) | +15 | Answer has content |
| Clear question (5+ words) | +10 | Question is specific |

### Priority Classification
- **High**: score >= 70
- **Medium**: score 50-69
- **Low**: score < 50 (filtered out)

### Fallback: Mono Audio
When speaker diarization fails (mono audio, whisper.cpp `--diarize` requires stereo):
- Segments are assigned alternating speakers (SPEAKER_00, SPEAKER_01, ...)
- Q&A detection still works based on question patterns and pauses

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    POST /api/podcast/detect                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Extract audio from video (FFmpeg, 16kHz mono WAV)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Transcribe with whisper.cpp (speaker diarization)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Convert whisper output → qa-detector format                │
│     (whisper-to-qa.py)                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Detect Q&A pairs (qa-detector.py)                          │
│     - Assign speakers by turn (if mono)                         │
│     - Merge nearby segments                                     │
│     - Find questions + answers                                  │
│     - Score each pair                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Return JSON with scored Q&A pairs                          │
└─────────────────────────────────────────────────────────────────┘
```

## Known Limitations

1. **Stereo diarization**: whisper.cpp `--diarize` only works with true stereo audio (different speakers in left/right channels). Most podcast audio is mono or mixed stereo.

2. **Turn-based fallback**: The alternating speaker assignment works for clear Q&A conversations but may mislabel overlapping speech or monologues.

3. **Processing time**: ~10-15 minutes for 1-hour audio on M1 Max. GPU acceleration is enabled but large files take time.

4. **Language**: Currently English-only. The model supports multiple languages but the question patterns are English-focused.

## Next Steps (Phase 1)

1. **Frontend UI** - Q&A segment review interface
2. **Clip export** - FFmpeg segment cutting
3. **Hormozi subtitles** - Word-by-word animated captions
4. **End frame CTA** - "Watch full video" link overlay

## Troubleshooting

### "whisper-cli: command not found"
```bash
brew install whisper-cpp
```

### "Model not found"
```bash
ls -la server/ai/models/ggml-large-v3.bin
# If missing, download from HuggingFace
```

### "No Q&A pairs found"
- Check that audio has actual questions (ending with `?`)
- Verify audio quality (clear speech, minimal background noise)
- Try with a shorter test file first

### "Memory error during transcription"
- The large-v3 model requires ~4GB RAM
- Close other applications or use a smaller model (see whisper.cpp docs)
