// client/src/pages/CreateShort.jsx
import React, { useState, useRef } from 'react';
import axios from 'axios';
import './CreateShort.css';

const CreateShortPage = () => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const [platforms, setPlatforms] = useState([]);
  const [downloadingQuality, setDownloadingQuality] = useState(null);
  const [processingForPlatform, setProcessingForPlatform] = useState(null);

  const fileInputRef = useRef(null);

  // Fetch available platforms on component mount
  React.useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const response = await axios.get('/api/youtube/platforms');
        setPlatforms(response.data.platforms);
      } catch (err) {
        console.error('Error fetching platforms:', err);
        setError('Failed to load platform options');
      }
    };

    fetchPlatforms();
  }, []);

  const handleGetYoutubeInfo = async () => {
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/youtube/info', { youtubeUrl });
      setVideoInfo(response.data);
      setIsLoading(false);
    } catch (err) {
      console.error('Error getting YouTube info:', err);
      setError('Failed to get YouTube video info. Please check the URL and try again.');
      setIsLoading(false);
    }
  };

  const handleDownload = (videoUrl) => {
    console.log('Triggering download for:', videoUrl);
    // Extract filename from path and use download endpoint
    const filename = videoUrl.split('/').pop();
    // Use full backend URL with cache-busting timestamp to prevent Chrome caching
    const downloadUrl = `http://localhost:5001/download/${filename}?t=${Date.now()}`;
    console.log('Download URL:', downloadUrl);

    // Force download by setting window location
    window.location.href = downloadUrl;
  };

  const handleDownloadOriginal = async (quality) => {
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    console.log('Starting download for quality:', quality, 'URL:', youtubeUrl);
    setDownloadingQuality(quality);
    setError('');

    try {
      // Get video info first to determine available formats
      console.log('Fetching video info...');
      const infoResponse = await axios.post('/api/youtube/info', { youtubeUrl });
      console.log('Video info received:', infoResponse.data.title);
      const formats = infoResponse.data.formats || [];

      // Find best format matching selected quality
      let selectedFormat = formats[0];
      if (quality === '4k') {
        selectedFormat = formats.find(f => f.quality?.includes('2160') || f.quality?.includes('4K')) || formats[0];
      } else if (quality === 'hd') {
        selectedFormat = formats.find(f => f.quality?.includes('1080') || f.quality?.includes('720') || f.quality?.includes('HD')) || formats[0];
      }

      // Download with original quality (no processing)
      console.log('Calling download API...');
      const response = await axios.post('/api/youtube/download', {
        youtubeUrl,
        start: 0,
        end: infoResponse.data.duration,
        platform: null, // No platform conversion
        quality: quality
      });

      console.log('Download API response:', response.data);
      if (response.data.success) {
        console.log('Success! Video path:', response.data.videoPath);
        // Trigger download
        handleDownload(response.data.videoPath);
      } else {
        console.error('API returned success:false');
        setError('Download failed - server returned error');
      }
      setDownloadingQuality(null);
    } catch (err) {
      console.error('Error downloading video:', err);
      setError('Failed to download video: ' + err.message);
      setDownloadingQuality(null);
    }
  };

  const handleDownloadForPlatform = async (duration) => {
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    setProcessingForPlatform(duration);
    setError('');

    try {
      const response = await axios.post('/api/youtube/download', {
        youtubeUrl,
        start: 0,
        end: duration,
        platform: selectedPlatform
      });

      if (response.data.success) {
        // Trigger download
        handleDownload(response.data.videoPath);
      }
      setProcessingForPlatform(null);
    } catch (err) {
      console.error('Error processing video:', err);
      setError('Failed to process video. Please try again.');
      setProcessingForPlatform(null);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('video', file);
    formData.append('platform', selectedPlatform);

    setProcessingForPlatform('upload');
    setError('');

    try {
      const response = await axios.post('/api/video/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        handleDownload(response.data.videoPath);
      }
      setProcessingForPlatform(null);
    } catch (err) {
      console.error('Error uploading video:', err);
      setError('Failed to upload video. Please try again.');
      setProcessingForPlatform(null);
    }
  };

  return (
    <div className="create-short-page">
      <h1>YouTube Video Downloader</h1>

      <div className="input-section">
        <div className="url-input-container">
          <input
            type="text"
            placeholder="Paste YouTube URL here..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            disabled={isLoading || processingForPlatform !== null || downloadingQuality !== null}
          />
          <button
            onClick={handleGetYoutubeInfo}
            disabled={isLoading || processingForPlatform !== null || downloadingQuality !== null}
          >
            {isLoading ? 'Loading...' : 'Get Video Info'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {videoInfo && (
          <div className="video-preview">
            <h3>{videoInfo.title}</h3>
            {videoInfo.thumbnail && (
              <img src={videoInfo.thumbnail} alt="Video thumbnail" className="thumbnail" />
            )}
            <p><strong>Duration:</strong> {Math.floor(videoInfo.duration / 60)}:{String(Math.floor(videoInfo.duration % 60)).padStart(2, '0')}</p>

            <div className="download-quality-section">
              <label>Download Original Video:</label>
              <div className="quality-buttons">
                <button
                  onClick={() => handleDownloadOriginal('4k')}
                  disabled={downloadingQuality !== null || processingForPlatform !== null}
                  className="quality-btn"
                >
                  {downloadingQuality === '4k' ? '⏳ Downloading 4K...' : '📥 4K Ultra HD'}
                </button>
                <button
                  onClick={() => handleDownloadOriginal('hd')}
                  disabled={downloadingQuality !== null || processingForPlatform !== null}
                  className="quality-btn"
                >
                  {downloadingQuality === 'hd' ? '⏳ Downloading HD...' : '📥 HD (1080p/720p)'}
                </button>
              </div>
              {downloadingQuality && (
                <p className="download-status">
                  Downloading in {downloadingQuality === '4k' ? '4K' : 'HD'} quality... This may take a minute.
                </p>
              )}
            </div>

            <div className="platform-selector">
              <label>Convert for Platform (optional):</label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                disabled={isLoading || processingForPlatform !== null}
              >
                {platforms.map(platform => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name} ({platform.dimensions.aspectRatio})
                  </option>
                ))}
              </select>
            </div>

            <div className="action-buttons">
              <button
                onClick={() => handleDownloadForPlatform(Math.min(60, videoInfo.duration))}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 60 ? '⏳ Processing...' : `Download Full (max 60s)`}
              </button>
              <button
                onClick={() => handleDownloadForPlatform(15)}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 15 ? '⏳ Processing...' : 'Download 15s'}
              </button>
              <button
                onClick={() => handleDownloadForPlatform(30)}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 30 ? '⏳ Processing...' : 'Download 30s'}
              </button>
            </div>
          </div>
        )}

        <div className="instructions">
          <h3>How to use:</h3>
          <ol>
            <li>Enter a YouTube URL and click "Get Video Info"</li>
            <li>Click "4K Ultra HD" or "HD" to download the original video</li>
            <li>Or select a platform and click a duration button to download a converted clip</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default CreateShortPage;
