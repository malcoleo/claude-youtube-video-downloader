# Phase 0 Backend Implementation Summary

## Overview
AI-powered podcast clip generator with Q&A detection and multi-format export.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Unified Input: YouTube URL | File Upload                │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Video Preview with Timeline Markers                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Q&A Segment Cards (hover to preview)                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Format Selector + Export Button                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXPRESS SERVER (Port 5001)                 │
│  /api/podcast/detect  →  Upload + Q&A Detection                 │
│  /api/youtube/*       →  YouTube Download                       │
│  /api/highlights/video/export-clips → Multi-format Export      │
│  /api/highlights/video/download/:filename → File Download      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI PROCESSING PIPELINE                     │
│  1. FFmpeg → Extract audio from video                           │
│  2. whisper.cpp → Transcribe with speaker diarization          │
│  3. qa-detector.py → Detect Q&A pairs with scores              │
│  4. Preview generator → 480p compressed for smooth hover       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXPORT ENGINE                              │
│  Input: Selected segments + format choice                       │
│  FFmpeg filters: crop + scale for aspect ratio                  │
│  Output: qa-01-{format}.mp4, qa-02-{format}.mp4, etc.          │
│  ZIP bundling for multiple clips                                │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

### Backend
- `server/api/highlight-detection.js` - Main API endpoints (podcast upload, export)
- `server/api/youtube-processing.js` - YouTube download and conversion
- `server/ai/python-wrapper.js` - Python script execution (whisper, qa-detector)
- `server/ai/qa-detector.py` - Q&A pair detection algorithm
- `server/ai/whisper-to-qa.py` - Convert whisper output to QA format
- `server/server.js` - Express app configuration

### Frontend
- `client/src/pages/CreateShort.jsx` - Unified page component
- `client/src/pages/CreateShort.css` - Styling

## Features Implemented

### Phase 0: Core Backend ✓
- [x] Podcast file upload with MIME type detection
- [x] Audio extraction from video (FFmpeg)
- [x] Audio stream detection (ffprobe) - handles video-only files
- [x] Whisper transcription with speaker diarization
- [x] Q&A pair detection with scoring
- [x] Preview video generation (480p compressed)
- [x] Persistent temp storage (1-hour cleanup)

### Phase 1: Export Engine ✓
- [x] Multi-format support (TikTok, Reels, Shorts, Square, Landscape, Original)
- [x] FFmpeg crop + scale filters for aspect ratios
- [x] ZIP bundling for multiple clips
- [x] Naming convention: qa-01-{format}.mp4
- [x] Download endpoint with cache-busting

### Phase 2: UI/UX ✓
- [x] Unified input (YouTube URL + File upload)
- [x] Video preview with timeline markers
- [x] Hover-to-preview Q&A segments
- [x] Format selector dropdown
- [x] Select All / Deselect All buttons
- [x] Processing status with progress bar
- [x] Error handling with user-friendly messages

## Data Flow

### Podcast Upload Flow
```
User uploads file
    → POST /api/podcast/detect
    → Validate MIME type
    → Save to temp storage
    → Extract audio (FFmpeg)
    → Check for audio stream (ffprobe)
    → Transcribe (whisper.cpp)
    → Detect Q&A pairs (qa-detector.py)
    → Generate preview (480p)
    → Return: qaPairs, previewUrl, videoPathForExport
```

### Clip Export Flow
```
User selects segments + format
    → POST /api/highlights/video/export-clips
    → Apply FFmpeg filter (crop + scale)
    → Generate clips with naming: qa-01-{format}.mp4
    → Bundle into ZIP (if multiple)
    → Return: downloadUrl
    → GET /api/highlights/video/download/:filename
    → Browser downloads file
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/podcast/detect | Upload + Q&A detection |
| POST | /api/highlights/video/export-clips | Export clips in format |
| GET | /api/highlights/video/download/:filename | Download file |
| GET | /api/youtube/platforms | Get platform options |
| POST | /api/youtube/info | Get YouTube video info |
| POST | /api/youtube/download | Download/convert YouTube |

## Testing Notes

- Tested with 392MB MP4 (no audio stream) → Graceful error message
- Tested with valid podcast files → Q&A detection working
- Export functionality implemented, needs E2E testing

## Next Steps

1. **Test export end-to-end** - Verify download triggers correctly
2. **Add YouTube preview** - Show downloaded video in unified preview area
3. **Implement YouTube highlight detection** - Same Q&A detection for YouTube downloads
