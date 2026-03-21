# YouTube to Social Media Short Video Cutter

A web application that converts long YouTube videos into short, engaging clips optimized for TikTok, Instagram Reels, and YouTube Shorts.

## Features

- **AI-Powered Highlight Detection**: Automatically detects exciting moments in videos using audio, motion, and scene analysis
- **Multi-Platform Optimization**: Converts videos to platform-specific formats (TikTok, Instagram, YouTube Shorts)
- **Advanced Video Editing**: Trim, crop, adjust effects, and stabilize videos
- **Direct Social Sharing**: Post directly to social media platforms
- **Analytics Tracking**: Monitor engagement and performance across platforms

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

- `POST /api/youtube/info` - Get YouTube video information
- `POST /api/youtube/download` - Download and process YouTube video
- `POST /api/video/upload` - Upload and process local video
- `POST /api/highlights/detect` - Detect highlights in video
- `POST /api/highlights/suggest-segments` - Get AI-suggested segments
- `POST /api/social/post` - Post video to social media
- `GET /api/analytics/user/:userId` - Get user analytics

## Architecture

The application consists of three main components:

1. **Frontend UI** - React-based interface for video editing and sharing
2. **Backend API** - Express server handling video processing and social media integration
3. **AI Module** - Python-based analysis for highlight detection and content suggestions

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