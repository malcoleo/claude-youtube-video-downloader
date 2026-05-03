# YouTube to Social Media Short Video Cutter

A web application that converts long YouTube videos into short, engaging clips optimized for TikTok, Instagram Reels, and YouTube Shorts.

**Now with 1000+ site support via yt-dlp!** Download from YouTube, TikTok, Instagram, Twitter, Facebook, Vimeo, and many more.

## Why This Exists

Content creators waste hours finding the best moments in long videos, manually trimming clips, and reformatting for each platform. This tool automates the entire pipeline — from URL to ready-to-post vertical clips with AI-generated captions, Hormozi-style subtitles, and platform-optimized exports.

Built as a full-stack application with a React frontend, Express API backend, and Python-based AI analysis, it demonstrates end-to-end product development: video processing, machine learning integration, Docker deployment, and social media platform integrations via OAuth.

## Features

### Core Features
- **1000+ Site Support**: Download from YouTube, TikTok, Instagram, Twitter, Facebook, Vimeo, and 1000+ more via yt-dlp
- **AI-Powered Highlight Detection**: Automatically detects exciting moments in videos using audio, motion, and scene analysis
- **Multi-Platform Optimization**: Converts videos to platform-specific formats (TikTok, Instagram, YouTube Shorts)
- **Advanced Video Editing**: Trim, crop, adjust effects, and stabilize videos
- **Direct Social Sharing**: Post directly to social media platforms with OAuth integration
- **Post Scheduling**: Schedule posts for optimal engagement times based on platform best practices
- **AI Caption Generation**: Auto-generate engaging captions from video transcripts
- **Analytics Dashboard**: Track views, likes, comments, shares, and engagement rates
- **History Tracking**: Maintain records of user activities and exports

### New Features (Latest)
- **Bulk URL Processing**: Paste multiple URLs at once with auto-deduplication
- **Job-Based Downloads**: Async downloads with progress tracking and retry logic
- **Quality Selector**: Choose resolution (4K, 1080p, 720p, 480p) before download
- **Docker Support**: One-command deployment with Docker Compose
- **Shimmer Loading**: Smooth loading states for better UX

## Tech Stack

- **Frontend**: React, Material-UI, Phosphor Icons
- **Backend**: Node.js, Express
- **Video Download**: yt-dlp (supports 1000+ sites)
- **Video Processing**: FFmpeg, fluent-ffmpeg
- **AI Analysis**: Python (NumPy, SciPy, OpenCV, Whisper)
- **File Storage**: Local filesystem
- **Deployment**: Docker, Docker Compose

## Installation

### Option 1: Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install system dependencies:
   ```bash
   # macOS
   brew install yt-dlp ffmpeg

   # Linux (Ubuntu/Debian)
   sudo apt install yt-dlp ffmpeg

   # Windows
   winget install yt-dlp && winget install ffmpeg
   ```
4. Install Python dependencies (for AI analysis):
   ```bash
   pip install -r requirements.txt
   ```
5. Start the application:
   ```bash
   npm run dev
   ```

### Option 2: Docker (Recommended)

```bash
# Quick start with Docker Compose
docker-compose up --build

# Access at http://localhost:5001
```

See [DOCKER.md](DOCKER.md) for detailed Docker deployment instructions.

## Usage

### Basic Usage

1. Paste a URL (YouTube, TikTok, Instagram, Twitter, etc.) or upload a local video
2. Select your target platform (TikTok, Instagram Reels, YouTube Shorts)
3. Choose quality/resolution or use default
4. Select from AI-suggested highlights or manually trim the video
5. Apply effects and optimizations
6. Download the processed video or share directly to social media

### Bulk Download

1. Click "Bulk URL Input" to expand the bulk uploader
2. Paste multiple URLs (one per line) - duplicates are automatically removed
3. Click "Fetch Info" to load previews for all URLs
4. Download individual videos or use "Download All" for batch processing

### Quality Selection

When downloading, you can choose:
- **4K (2160p)** - Ultra HD for highest quality
- **1080p** - Full HD for most platforms
- **720p** - HD for faster processing
- **480p** - SD for quick previews
- **Audio Only** - Extract MP3 audio

## API Endpoints

### Media Downloader (yt-dlp - 1000+ sites)
- `POST /api/media/info` - Get video info from any supported URL
- `POST /api/media/info/bulk` - Get info for multiple URLs at once
- `POST /api/media/download` - Start a download job (returns jobId)
- `POST /api/media/download/bulk` - Start downloads for multiple URLs
- `GET /api/media/status/:jobId` - Check download job status
- `GET /api/media/file/:jobId` - Download the completed file
- `GET /api/media/stream/:jobId` - Stream the completed file
- `GET /api/media/supported-sites` - Get list of supported sites

### Video Processing
- `POST /api/youtube/info` - Get YouTube video information
- `POST /api/youtube/download` - Download and process YouTube video
- `POST /api/video/upload` - Upload and process local video
- `POST /api/highlights/detect` - Detect highlights in video
- `POST /api/highlights/suggest-segments` - Get AI-suggested segments
- `POST /api/highlights/video/export-clips` - Export selected clips

### Social Media Integration
- `GET /api/auth/:platform/connect` - Initiate OAuth connection for platform
- `GET /api/auth/:platform/callback` - Handle OAuth callback
- `GET /api/auth/platforms/connected` - Get connected platforms
- `POST /api/auth/:platform/disconnect` - Disconnect platform
- `POST /api/scheduler/schedule` - Create scheduled post
- `GET /api/scheduler/schedules` - Get all schedules
- `GET /api/scheduler/schedule/:id` - Get specific schedule
- `POST /api/scheduler/schedule/:id/cancel` - Cancel schedule
- `PUT /api/scheduler/schedule/:id` - Update schedule
- `GET /api/scheduler/optimal-times/:platform` - Get optimal posting times
- `POST /api/scheduler/suggest-time` - Suggest best time to post
- `POST /api/scheduler/captions/generate` - Generate AI captions from transcript
- `POST /api/scheduler/captions/quick` - Quick caption generation

### Analytics
- `GET /api/scheduler/analytics/:platform/:postId` - Get post analytics
- `GET /api/scheduler/analytics/summary` - Get summary analytics
- `GET /api/scheduler/analytics/platform-comparison` - Compare platform performance
- `POST /api/scheduler/analytics/export` - Export analytics report

### User Preferences
- `GET /api/preferences/:userId` - Get user preferences
- `PUT /api/preferences/:userId` - Update user preferences
- `GET /api/presets/:userId` - Get user presets
- `POST /api/presets/:userId` - Save a preset
- `DELETE /api/presets/:userId/:presetId` - Delete a preset

## Security

This application implements multiple security layers to protect against common attacks:

### Command Injection Prevention
- All subprocess calls use `execFile`/`execFileSync` with argument arrays instead of shell-interpolated strings
- Prevents attackers from injecting malicious commands via user input
- Applied in: AI wrapper, highlight detection, face detection

### File Upload Security
- Server-side validation of MIME types and file extensions
- Allowlist-based approach (only known-safe video/audio formats accepted)
- Path traversal protection via normalization and base directory validation
- Unique UUID generation for temp files prevents race conditions

### API Protection
- Rate limiting: 100 requests per minute per user on all user-facing APIs
- Prototype pollution protection via input sanitization
- Resource exhaustion prevention via reduced buffer limits

### Error Handling
- Structured error logging that truncates sensitive data
- Safe fallbacks for AI detection failures
- Graceful degradation on unexpected inputs

## Architecture

The application consists of three main components:

1. **Frontend UI** - React-based interface for video editing and sharing
2. **Backend API** - Express server handling video processing and social media integration
3. **AI Module** - Python-based analysis for highlight detection and content suggestions

## Social Media Integration Setup

To enable posting to social media platforms, you need to configure OAuth credentials for each platform:

### Environment Variables

Add these to your `.env` file:

```bash
# YouTube OAuth (Google Cloud Console)
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:5001/api/auth/youtube/callback

# Instagram/Facebook OAuth (Meta Developer Console)
INSTAGRAM_CLIENT_ID=your_instagram_client_id
INSTAGRAM_CLIENT_SECRET=your_instagram_client_secret
INSTAGRAM_REDIRECT_URI=http://localhost:5001/api/auth/instagram/callback

# TikTok OAuth (TikTok Developer Portal)
TIKTOK_CLIENT_ID=your_tiktok_client_id
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
TIKTOK_REDIRECT_URI=http://localhost:5001/api/auth/tiktok/callback

# Token Encryption (generate a random 32-character string)
ENCRYPTION_KEY=your_32_character_encryption_key

# LinkedIn OAuth (LinkedIn Developer)
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:5001/api/auth/linkedin/callback
```

### Getting OAuth Credentials

1. **YouTube**: Visit [Google Cloud Console](https://console.cloud.google.com/), create a project, enable YouTube Data API v3, and create OAuth 2.0 credentials
2. **Instagram/Facebook**: Visit [Meta Developer Console](https://developers.facebook.com/), create an app, and configure Instagram Basic Display and Graph API
3. **TikTok**: Visit [TikTok Developer Portal](https://developers.tiktok.com/), create an app, and configure OAuth 2.0
4. **LinkedIn**: Visit [LinkedIn Developer](https://developer.linkedin.com/), create an app, and configure OAuth 2.0

### Supported Platforms

- **YouTube Shorts** - 9:16 vertical, max 60 seconds
- **Instagram Reels** - 9:16 vertical, max 90 seconds
- **TikTok** - 9:16 vertical, max 60 seconds
- **Facebook Reels** - 9:16 vertical, max 60 seconds
- **LinkedIn Video** - Various aspect ratios, max 10 minutes

## Changelog

### v0.2.0 (May 2026)
- AI-powered Q&A detection using whisper.cpp for speaker diarization
- One-click "Create Clips" workflow (URL → download → transcribe → detect → export)
- Hormozi-style animated subtitles with face-tracking crop
- Docker multi-stage build for Railway deployment
- Split 1974-line CreateShort.jsx monolith into maintainable hooks and components
- Split 811-line SocialMediaManager into focused sub-components
- Fixed: export segment field mismatch, hardcoded Docker paths, persistent file storage

### v0.1.0 (Apr 2026)
- Initial release: 1000+ site download, quality selection, bulk URL processing
- Multi-platform video optimization (TikTok, Reels, Shorts)
- Social media manager with OAuth, scheduling, and analytics
- Docker Compose support

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## Development Tools

### gstack (AI Development Workflow)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted development. To install gstack:

```bash
# Install bun (required by gstack)
curl -fsSL https://bun.sh/install | bash

# Clone gstack skills
git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack

# Run gstack setup
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/.claude/skills/gstack && ./setup
```

After installation, you'll have access to gstack skills like `/browse`, `/qa`, `/ship`, `/review`, and more. See CLAUDE.md for the full list.