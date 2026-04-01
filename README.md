# YouTube to Social Media Short Video Cutter

A web application that converts long YouTube videos into short, engaging clips optimized for TikTok, Instagram Reels, and YouTube Shorts.

## Features

- **AI-Powered Highlight Detection**: Automatically detects exciting moments in videos using audio, motion, and scene analysis
- **Multi-Platform Optimization**: Converts videos to platform-specific formats (TikTok, Instagram, YouTube Shorts)
- **Advanced Video Editing**: Trim, crop, adjust effects, and stabilize videos
- **Direct Social Sharing**: Post directly to social media platforms with OAuth integration
- **Post Scheduling**: Schedule posts for optimal engagement times based on platform best practices
- **AI Caption Generation**: Auto-generate engaging captions from video transcripts
- **Analytics Dashboard**: Track views, likes, comments, shares, and engagement rates
- **History Tracking**: Maintain records of user activities and exports

## Tech Stack

- **Frontend**: React, Material-UI
- **Backend**: Node.js, Express
- **Video Processing**: FFmpeg
- **AI Analysis**: Python (NumPy, SciPy, OpenCV)
- **File Storage**: Local filesystem

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install Python dependencies (for AI analysis):
   - Ensure you have Python 3 installed
   - Install required packages: `pip install numpy scipy opencv-python`
4. Start the application:
   ```bash
   npm run dev
   ```

## Usage

1. Paste a YouTube URL or upload a local video
2. Select your target platform (TikTok, Instagram Reels, YouTube Shorts)
3. Choose from AI-suggested highlights or manually trim the video
4. Apply effects and optimizations
5. Download the processed video or share directly to social media

## API Endpoints

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