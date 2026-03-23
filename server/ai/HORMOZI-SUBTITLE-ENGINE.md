# Hormozi-Style Subtitle Engine - Implementation Summary

**Created:** 2026-03-23
**Status:** Complete - Ready for Testing

## Overview

Complete implementation of Alex Hormozi-style dynamic caption engine with:
- Word-by-word karaoke-style animation
- Gold keyword highlighting (#FFD700)
- Auto-suggested emoji overlays
- Bebas Neue font (with Arial Black fallback)
- End frame CTA composer

## Components Created/Modified

### 1. Core Python Modules (`/Users/ml/server/ai/`)

#### `keyword-highlighter.py` (180 lines)
- Uses spaCy POS tagging to identify content words
- Highlights: NOUN, VERB, ADJ, ADV, PROPN
- Strong highlight (gold): ADJ, VERB
- Falls back to rule-based highlighting if spaCy unavailable
- Uses Python 3.11 venv for spaCy compatibility

#### `emoji-suggester.py` (180 lines)
- 40+ keyword-to-emoji mappings
- Sentiment-based emoji placement
- Max 5 emojis per clip (configurable)
- Places emojis after key phrases every 3-5 words

#### `subtitle-renderer.py` (240 lines)
- Generates ASS (Advanced Substation Alpha) format
- Karaoke-style `\k` timing tags for word animation
- Gold color `&H00FFD700&` for strong highlights
- 72pt Bebas Neue font (Arial Black fallback)
- Emoji overlay at y=700 (above subtitle)
- 15-second max per subtitle line

#### `caption-generator.py` (190 lines)
- Main orchestrator script
- Chains: keywords → emojis → ASS generation → FFmpeg render
- Input: whisper.cpp JSON with `--word-timestamps`
- Output: ASS file + optional video with burned subtitles

#### `end-frame-cta.py` (120 lines)
- Adds 3-second gradient overlay at end of clips
- "Watch full video" text (customizable)
- Fade-in animation (0.5s)
- Matches clip resolution

### 2. Modified Files

#### `whisper-to-qa.py`
- Added `--words` flag for word-level timestamp extraction
- Returns `words` array when flag is passed
- Each word: `{word, start, end, confidence}`

#### `python-wrapper.js`
- `transcribeWithSpeakerLabels(audioPath, includeWordTimestamps)` - now accepts word timestamp flag
- `transcribeWithWordTimestamps(audioPath)` - convenience wrapper
- Adds `--word-timestamps` flag to whisper-cli command

#### `highlight-detection.js` (`/Users/ml/server/api/`)
- `/video/export-clips` endpoint updated with:
  - `addSubtitles` option - generates and burns Hormozi subtitles
  - `addEndFrame` option - adds 3-second CTA overlay
- `generateSubtitlesForClip()` - extracts audio, transcribes, generates ASS
- `addEndFrameToClip()` - calls end-frame-cta.py

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXPORT CLIP REQUEST                          │
│  { videoPath, segments, format, addSubtitles, addEndFrame }     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Extract audio from clip (if addSubtitles=true)         │
│  ffmpeg -i clip.mp4 -vn -acodec pcm_s16le -ar 16000 audio.wav   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Transcribe with word timestamps                        │
│  whisper-cli --model model.bin --word-timestamps audio.wav      │
│  → audio.wav.json with words[] array                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Highlight keywords (keyword-highlighter.py)            │
│  - Run spaCy POS tagging via Python 3.11 venv                   │
│  - Tag words: NOUN→normal, VERB→strong, ADJ→strong, etc.        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: Suggest emojis (emoji-suggester.py)                    │
│  - Keyword-based: 'money'→💰, 'fire'→🔥, 'think'→🤔             │
│  - Sentiment-based: positive→😊, negative→😢, neutral→🤔       │
│  - Max 5 emojis, placed every 3-5 words                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Generate ASS subtitles (subtitle-renderer.py)          │
│  - Karaoke \k tags for word-by-word animation                   │
│  - Gold color for strong highlights (#FFD700)                   │
│  - Bebas Neue 72pt font, positioned at bottom third             │
│  - Emoji overlays at y=700                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: Burn subtitles into video                              │
│  ffmpeg -i clip.mp4 -vf "ass='subtitles.ass'" -c:a copy out.mp4 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 7: Add end frame CTA (if addEndFrame=true)                │
│  - 3-second gradient overlay                                    │
│  - "Watch full video" text with fade-in                         │
│  - Concatenate to end of clip                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FINAL CLIP OUTPUT                            │
│  /temp/exports/qa-01-tiktok-{timestamp}.mp4                     │
│  (with Hormozi subtitles + optional CTA)                        │
└─────────────────────────────────────────────────────────────────┘
```

## API Usage

### Export Clip with Subtitles

```javascript
POST /api/podcast/video/export-clips
Content-Type: application/json

{
  "videoPath": "/path/to/video.mp4",
  "segments": [
    { "start": 10.5, "end": 40.5 }
  ],
  "format": "tiktok",
  "addSubtitles": true,
  "addEndFrame": true
}
```

### Response

```json
{
  "success": true,
  "downloadUrl": "/temp/exports/qa-01-tiktok-1711234567890.mp4",
  "message": "Clip exported successfully",
  "clipCount": 1,
  "hasSubtitles": true,
  "hasEndFrame": true
}
```

## Technical Specifications

### ASS Subtitle Format
- **ScriptType:** v4.00+
- **Resolution:** 1920x1080
- **Font:** Bebas Neue 72pt (or Arial Black fallback)
- **Colors:** White (#FFFFFF), Gold (#FFD700) for highlights
- **Outline:** 2.5px black
- **Alignment:** Bottom center (Alignment=2)
- **Margins:** 10px left/right, 100px bottom

### Karaoke Effect
```ass
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\k50}Hello {\k30}world
```
- `\k50` = 50 centiseconds (0.5 seconds)
- Words animate in sequentially

### Emoji Placement
- **Position:** Above subtitle (y=700)
- **Font:** Noto Color Emoji 48pt
- **Duration:** 2.0 seconds
- **Animation:** Fade in/out (100ms)

### End Frame CTA
- **Duration:** 3 seconds
- **Gradient:** #1a1a2e → #16213e
- **Text:** "Watch full video" (customizable)
- **Font:** Arial 48pt
- **Fade-in:** 0.5 seconds

## Testing Checklist

- [ ] Whisper.cpp outputs word-level timestamps with `--word-timestamps`
- [ ] `whisper-to-qa.py --words` extracts words array
- [ ] `keyword-highlighter.py` correctly tags POS categories
- [ ] `emoji-suggester.py` places relevant emojis
- [ ] `subtitle-renderer.py` generates valid ASS with karaoke effects
- [ ] FFmpeg burns ASS subtitles into video correctly
- [ ] `end-frame-cta.py` adds 3-second CTA overlay
- [ ] Export endpoint handles `addSubtitles` and `addEndFrame` options
- [ ] Full pipeline works end-to-end on test video

## Files Created

1. `/Users/ml/server/ai/keyword-highlighter.py`
2. `/Users/ml/server/ai/emoji-suggester.py`
3. `/Users/ml/server/ai/subtitle-renderer.py`
4. `/Users/ml/server/ai/caption-generator.py` (replaced stub)
5. `/Users/ml/server/ai/end-frame-cta.py`

## Files Modified

1. `/Users/ml/server/ai/whisper-to-qa.py` - Word-level extraction
2. `/Users/ml/server/ai/python-wrapper.js` - Word timestamp support
3. `/Users/ml/server/api/highlight-detection.js` - Export integration

## Dependencies

### Python (Python 3.11 venv)
- spaCy 3.7.5
- en_core_web_sm 3.7.1
- opencv-python (for face detection)
- numpy

### System
- whisper-cli (whisper.cpp)
- FFmpeg with ass filter support
- Bebas Neue font (or Arial Black fallback)
- Noto Color Emoji font

## Next Steps

1. **Test the pipeline end-to-end** with a real video file
2. **Verify subtitle timing** matches word audio
3. **Adjust font/positioning** based on visual output
4. **Test emoji placement** for relevance and frequency
5. **Verify end frame CTA** appearance and timing
6. **Performance optimization** if rendering is slow

## Known Limitations

- Requires Python 3.11 venv for spaCy (Python 3.14 incompatible)
- ASS filter requires absolute paths on some systems
- Face detection for smart crop may fail in low light
- Emoji suggestions are keyword-based (no context understanding)

## Future Enhancements

- [ ] Custom font/color configuration per user preference
- [ ] Multiple subtitle style presets
- [ ] Manual emoji override/editing in UI
- [ ] Alternative word highlighting strategies (ML-based)
- [ ] Multi-language subtitle support
- [ ] Animated emoji effects (bounce, scale, rotate)
