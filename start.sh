#!/bin/bash
# Startup script for YouTube to Social Media Short Video Cutter

echo "Starting YouTube to Social Media Short Video Cutter..."

# Create necessary directories
mkdir -p temp output analytics

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js before proceeding."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3 before proceeding."
    exit 1
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install numpy scipy opencv-python

if [ $? -ne 0 ]; then
    echo "Failed to install Python dependencies. Please install them manually:"
    echo "pip3 install numpy scipy opencv-python"
    exit 1
fi

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "Failed to install Node.js dependencies."
    exit 1
fi

# Start the application
echo "Starting the application..."
npm run dev