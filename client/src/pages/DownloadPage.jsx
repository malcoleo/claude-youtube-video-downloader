// client/src/pages/DownloadPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useDownloadWorkflow from '../hooks/useDownloadWorkflow';
import SourceBadge from '../components/SourceBadge';
import FormatSelector from '../components/FormatSelector';
import { QualitySelector } from '../components/QualitySelector';
import './DownloadPage.css';

const DownloadPage = () => {
  const [url, setUrl] = useState('');
  const [selectedQuality, setSelectedQuality] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const inputRef = useRef(null);

  const {
    loading,
    videoInfo,
    source,
    error,
    discoveredVideos,
    downloading,
    progress,
    downloadComplete,
    fetchVideoInfo,
    discoverVideos,
    selectDiscoveredVideo,
    startDownload,
    clearState
  } = useDownloadWorkflow();

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handlePasteAndFetch = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        await fetchVideoInfo(text);
      }
    } catch {
      // Clipboard access denied — user will paste manually
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    await fetchVideoInfo(url.trim());
  };

  const handleFormatChange = (fmt) => {
    setSelectedFormat(fmt);
  };

  const handleQualityChange = (height) => {
    setSelectedQuality(selectedQuality === height ? null : height);
  };

  const handleDownload = () => {
    if (!videoInfo) return;
    const formatId = selectedQuality
      ? videoInfo.formats?.find(f => f.height?.toString() === selectedQuality)?.id
      : null;
    startDownload(videoInfo.url, formatId, selectedFormat);
  };

  const handleDownloadFile = () => {
    window.location.href = `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/media/file/${downloadComplete}`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="download-page">
      {/* Header */}
      <div className="page-header">
        <h1>Download Video</h1>
        <p>Paste any video link — YouTube, TikTok, Instagram, X, Facebook, and 1000+ sites</p>
      </div>

      {/* URL Input */}
      <form className="url-input-section" onSubmit={handleSubmit}>
        <div className="url-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="url-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste video URL here..."
            disabled={loading || downloading}
          />
          <button
            type="button"
            className="paste-btn"
            onClick={handlePasteAndFetch}
            disabled={loading || downloading}
            title="Paste from clipboard"
          >
            Paste
          </button>
          <button
            type="submit"
            className="primary-action-btn"
            disabled={loading || downloading || !url.trim()}
          >
            {loading ? 'Loading...' : 'Get Video'}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="error-banner">
          <span className="error-icon">!</span>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !videoInfo && !discoveredVideos && (
        <div className="loading-skeleton">
          <div className="skeleton-card">
            <div className="skeleton-thumbnail" />
            <div className="skeleton-body">
              <div className="skeleton-line medium" />
              <div className="skeleton-line short" />
            </div>
          </div>
        </div>
      )}

      {/* Video Discovery List (multiple videos found) */}
      {discoveredVideos && !videoInfo && (
        <div className="video-discovery-list">
          <h3>
            Found {discoveredVideos.videos.length} video{discoveredVideos.videos.length !== 1 ? 's' : ''}
            {discoveredVideos.type === 'playlist' ? ' on this page' : ''}
          </h3>
          <p className="discovery-subtitle">Select a video to download</p>
          <div className="discovery-grid">
            {discoveredVideos.videos.map((video, idx) => (
              <button
                key={idx}
                className="discovery-card"
                onClick={() => selectDiscoveredVideo(video)}
                disabled={loading}
              >
                {video.thumbnail && (
                  <img src={video.thumbnail} alt={video.title} className="discovery-thumb" />
                )}
                <div className="discovery-info">
                  <span className="discovery-title">{video.title}</span>
                  {video.duration && (
                    <span className="discovery-duration">{formatDuration(video.duration)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Info Card */}
      {videoInfo && !downloading && !downloadComplete && (
        <div className="video-info-card card-enter">
          <div className="video-info-row">
            <img src={videoInfo.thumbnail} alt={videoInfo.title} className="video-thumb" />
            <div className="video-meta">
              <div className="video-title-row">
                <h3>{videoInfo.title}</h3>
                <SourceBadge source={source} />
              </div>
              <p className="video-uploader">{videoInfo.uploader}</p>
              <div className="video-stats">
                {videoInfo.duration > 0 && (
                  <span className="video-stat">{formatDuration(videoInfo.duration)}</span>
                )}
                {videoInfo.view_count && (
                  <span className="video-stat">{videoInfo.view_count.toLocaleString()} views</span>
                )}
              </div>
            </div>
          </div>

          {/* Format Selector */}
          <FormatSelector
            selectedFormat={selectedFormat}
            onSelectFormat={handleFormatChange}
            disabled={downloading}
          />

          {/* Quality Selector */}
          {videoInfo.formats && videoInfo.formats.length > 0 && (
            <QualitySelector
              formats={videoInfo.formats}
              selectedQuality={selectedQuality}
              onSelectQuality={handleQualityChange}
              disabled={downloading}
            />
          )}

          {/* Download Button */}
          <button
            className="primary-action-btn download-btn"
            onClick={handleDownload}
            disabled={downloading}
          >
            Download as {selectedFormat.toUpperCase()}
          </button>
        </div>
      )}

      {/* Download Progress */}
      {downloading && progress && (
        <div className="download-progress-section card-enter">
          <h3>Downloading...</h3>
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress.percent || 0}%` }}
              />
            </div>
            <span className="progress-text tabular-nums">
              {Math.round(progress.percent || 0)}%
            </span>
          </div>
          {progress.speed && (
            <p className="progress-detail">Speed: {progress.speed}</p>
          )}
          {progress.eta && (
            <p className="progress-detail">ETA: {progress.eta}</p>
          )}
        </div>
      )}

      {/* Download Complete */}
      {downloadComplete && progress && (
        <div className="download-complete card-enter">
          <span className="complete-icon">&#10003;</span>
          <h3>Download Complete!</h3>
          <p className="complete-filename">{progress.filename}</p>
          <div className="complete-actions">
            <button
              className="primary-action-btn"
              onClick={() => window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/media/file/${downloadComplete}`, '_blank')}
            >
              Download File
            </button>
            <Link to="/create-short" className="secondary-action-btn">
              Create Clips from This
            </Link>
          </div>
          <button className="reset-btn" onClick={() => { clearState(); setUrl(''); setSelectedQuality(null); }}>
            Download Another Video
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="page-footer">
        <p>
          Supports 1000+ sites via yt-dlp. Also try{' '}
          <Link to="/create-short">Create Short Clips</Link> to extract highlights.
        </p>
      </div>
    </div>
  );
};

export default DownloadPage;
