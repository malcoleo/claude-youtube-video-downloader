# Dockerfile for claude-youtube-video-downloader
# Multi-stage build for optimized image size

# Stage 1: Build React client
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy client source
COPY client/ ./

# Build the React app
RUN npm run build

# Stage 2: Production server with client build
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    npm \
    git \
    ca-certificates \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip install --no-cache-dir yt-dlp

# Install whisper.cpp (for Q&A detection)
RUN git clone https://github.com/ggerganov/whisper.cpp.git /opt/whisper.cpp && \
    cd /opt/whisper.cpp && \
    make -j$(nproc) && \
    python3 -m pip install -r requirements.txt

# Download small whisper model (balanced speed/quality)
RUN cd /opt/whisper.cpp && \
    wget -q https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin && \
    mv ggml-small.bin /opt/whisper.cpp/models/

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy server code
COPY server/ ./server/

# Copy client build from builder stage
COPY --from=client-builder /app/client/build ./client/build

# Create necessary directories
RUN mkdir -p /app/output /app/temp /app/downloads /app/data

# Set environment variables
ENV NODE_ENV=production \
    PORT=5001 \
    HOST=0.0.0.0 \
    PYTHONUNBUFFERED=1 \
    WHISPER_BINARY=/opt/whisper.cpp/main \
    WHISPER_MODEL_PATH=/opt/whisper.cpp/models/ggml-small.bin \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

# Start the server
CMD ["node", "server/server.js"]
