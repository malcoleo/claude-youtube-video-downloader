# Docker Deployment Guide

## Prerequisites

- Docker Desktop (Mac/Windows) or Docker Engine (Linux)
- Docker Compose (included with Docker Desktop)

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Build and run
docker-compose up --build

# Access the app
open http://localhost:5001
```

### Option 2: Docker CLI

```bash
# Build the image
npm run docker:build

# Run the container
npm run docker:run
```

### Option 3: Direct Docker commands

```bash
# Build
docker build -t youtube-shorts-app .

# Run
docker run -p 5001:5001 \
  -v $(pwd)/output:/app/output \
  -v $(pwd)/temp:/app/temp \
  youtube-shorts-app
```

## Environment Variables

Create a `.env` file in the project root:

```bash
# OAuth credentials (optional - for social media posting)
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
INSTAGRAM_CLIENT_ID=your_instagram_client_id
INSTAGRAM_CLIENT_SECRET=your_instagram_client_secret
TIKTOK_CLIENT_ID=your_tiktok_client_id
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret

# Token encryption (REQUIRED in production - generate a random 32-char string)
ENCRYPTION_KEY=your_32_character_encryption_key

# Server config
PORT=5001
NODE_ENV=production
```

## Data Persistence

The Docker setup uses named volumes to persist data:

- `output_data` - Processed video files
- `temp_data` - Temporary processing files
- `downloads_data` - Downloaded source videos
- `user_data` - User preferences, presets, history

To backup data:

```bash
docker run --rm -v youtube-shorts-app_user_data:/data -v $(pwd)/backup:/backup tar cvf /backup/user_data.tar /data
```

## Health Check

The container includes a health check endpoint:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' youtube-shorts-app

# Or via HTTP
curl http://localhost:5001/health
```

## Development

For development with hot reload:

```bash
# Run without Docker (development mode)
npm run dev

# Or with Docker (mounts source code)
docker-compose -f docker-compose.dev.yml up
```

## Troubleshooting

### Container won't start

```bash
# View logs
docker-compose logs

# Check if port is in use
lsof -i :5001
```

### Rebuild after changes

```bash
# Force rebuild
docker-compose up --build --force-recreate
```

### Clear all data

```bash
# Stop and remove everything including volumes
docker-compose down -v
```

## Supported Sites

The Docker image includes yt-dlp which supports 1000+ sites including:

- YouTube
- TikTok
- Instagram
- Twitter/X
- Facebook
- Vimeo
- SoundCloud
- And many more...

## Resource Usage

- **Image size:** ~500MB (includes ffmpeg, Python, Node.js)
- **Memory:** ~200MB idle, ~500MB under load
- **CPU:** Spikes during video processing
- **Disk:** Varies based on stored videos

## Security Notes

1. Change the `ENCRYPTION_KEY` in production
2. Use HTTPS in production (reverse proxy recommended)
3. Don't commit `.env` files to version control
4. Consider adding authentication for production use
