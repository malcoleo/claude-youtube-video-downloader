// client/src/pages/CreateShort.jsx
import React, { useState, useRef } from 'react';
import ReactPlayer from 'react-player';
import axios from 'axios';
import './CreateShort.css';

// Podcast Q&A Section Component (defined first to avoid forward reference issues)
const PodcastQaSection = () => {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [qaPairs, setQaPairs] = useState([]);
  const [selectedSegments, setSelectedSegments] = useState(new Set());
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('tiktok');
  const [videoPathForExport, setVideoPathForExport] = useState(null);
  const playerRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleSelectFileClick = () => {
    // Programmatically trigger the file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'audio/mpeg', 'audio/wav', 'audio/webm'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|mov|mkv|mp3|wav|webm)$/i)) {
      setError('Please upload a valid video or audio file (MP4, MOV, MKV, MP3, WAV)');
      return;
    }

    setUploadedFile(file);
    setError('');
    setIsProcessing(true);
    setProcessingStage('Uploading and processing...');

    // Create local preview URL for immediate feedback (will be replaced with server preview if available)
    const localPreviewUrl = URL.createObjectURL(file);
    setVideoUrl(localPreviewUrl);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const response = await axios.post('/api/podcast/detect', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProcessingStage(`Uploading... ${percent}%`);
        }
      });

      if (response.data.success) {
        setQaPairs(response.data.qaPairs || []);
        setStats(response.data.stats);
        // Use server-generated preview if available, otherwise keep local preview
        if (response.data.previewUrl) {
          setVideoUrl(response.data.previewUrl);
          setPreviewUrl(response.data.previewUrl);
        }
        // Store video path for export
        if (response.data.videoPathForExport) {
          setVideoPathForExport(response.data.videoPathForExport);
        }
        setProcessingStage('');
      } else {
        setError('Failed to detect Q&A pairs');
      }
    } catch (err) {
      console.error('Error processing podcast:', err);
      setError(err.response?.data?.error || 'Failed to process podcast. Please try again.');
      setQaPairs([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSegmentSelection = (segmentId) => {
    const newSelected = new Set(selectedSegments);
    if (newSelected.has(segmentId)) {
      newSelected.delete(segmentId);
    } else {
      newSelected.add(segmentId);
    }
    setSelectedSegments(newSelected);
  };

  const selectAll = () => {
    const allIds = new Set(qaPairs.map(qa => qa.id));
    setSelectedSegments(allIds);
  };

  const deselectAll = () => {
    setSelectedSegments(new Set());
  };

  const handleSegmentHover = (segment) => {
    setHoveredSegment(segment);
    if (playerRef.current && segment) {
      // Seek to question start time
      playerRef.current.seekTo(segment.questionStart, 'seconds');
      // Force the video to play from the correct position
      const internalPlayer = playerRef.current.getInternalPlayer();
      if (internalPlayer && internalPlayer.currentTime) {
        internalPlayer.currentTime = segment.questionStart;
      }
    }
  };

  const handleSegmentHoverOut = () => {
    setHoveredSegment(null);
  };

  const handleExportSelected = async () => {
    if (selectedSegments.size === 0) {
      setError('Please select at least one segment to export');
      return;
    }

    if (!videoPathForExport) {
      setError('Video file not available for export. Please re-upload the podcast.');
      return;
    }

    setIsProcessing(true);
    setProcessingStage(`Exporting ${selectedSegments.size} clip(s) in ${selectedFormat.toUpperCase()} format...`);

    try {
      const segmentsToExport = qaPairs.filter(qa => selectedSegments.has(qa.id)).map(qa => ({
        start: qa.questionStart,
        end: qa.answerEnd,
        id: qa.id
      }));

      const response = await axios.post('/api/highlights/video/export-clips', {
        videoPath: videoPathForExport,
        segments: segmentsToExport,
        format: selectedFormat
      });

      if (response.data.success) {
        // Trigger download
        window.location.href = `http://localhost:5001${response.data.downloadUrl}`;
        setProcessingStage('');
        setIsProcessing(false);
        alert(response.data.isZip
          ? `${response.data.clipCount} clips exported as ZIP. Download should start automatically.`
          : 'Clip exported. Download should start automatically.'
        );
      } else {
        setError('Failed to export clips');
        setProcessingStage('');
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('Error exporting clips:', err);
      setError('Failed to export clips: ' + (err.response?.data?.error || err.message));
      setProcessingStage('');
      setIsProcessing(false);
    }
  };

  const getPriorityColor = (priority) => {
    if (priority === 'high') return '#4caf50';
    if (priority === 'medium') return '#ff9800';
    return '#f44336';
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#4caf50';
    if (score >= 60) return '#ff9800';
    return '#f44336';
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="podcast-section">
      {!uploadedFile ? (
        <div className="upload-card">
          <h3>Upload Your Podcast</h3>
          <p>Upload a podcast video or audio file. Our AI will detect Q&A segments and create shareable clips.</p>
          <input
            key={uploadedFile ? 'with-file' : 'no-file'}
            accept="video/*,audio/*"
            style={{ display: 'none' }}
            id="podcast-upload"
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
          />
          <button className="upload-btn-primary" onClick={handleSelectFileClick}>
            Select File
          </button>
          <p className="file-hint">Supported: MP4, MOV, MKV, MP3, WAV (Max 2GB, Max 2 hours)</p>
          <div className="processing-info">
            <strong>Processing time:</strong> ~10-15 minutes for a 1-hour podcast
          </div>
        </div>
      ) : (
        <div className="podcast-review-section">
          {isProcessing && (
            <div className="alert alert-warning">
              <strong>⏳ {processingStage}</strong>
              <div className="progress-bar"><div className="progress-fill"></div></div>
              <small>This may take several minutes for large files. Please don't close this page.</small>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          {!isProcessing && qaPairs.length === 0 && !error && (
            <div className="alert alert-warning">
              <strong>No Q&A segments detected.</strong> This might be a monologue or single-speaker content.
            </div>
          )}

          {qaPairs.length > 0 && (
            <>
              <div className="video-preview-card">
                <div className="preview-header-row">
                  <h4>Preview: {uploadedFile.name}</h4>
                  {stats && (
                    <div className="stats-inline">
                      <span className="stat-chip">Segments: {stats.totalSegments}</span>
                      <span className="stat-chip primary">Q&A: {stats.qaPairsFound}</span>
                    </div>
                  )}
                </div>
                <div className="video-player-wrapper">
                  <ReactPlayer
                    ref={playerRef}
                    url={videoUrl}
                    width="100%"
                    height="auto"
                    controls={true}
                    playing={hoveredSegment !== null}
                    muted={false}
                    volume={0.5}
                    playbackRate={1}
                    onEnded={handleSegmentHoverOut}
                  />
                  {/* Timeline markers overlay */}
                  {qaPairs.length > 0 && (
                    <div className="timeline-markers">
                      <div className="timeline-bar">
                        {qaPairs.map((qa, idx) => {
                          const position = (qa.questionStart / (qa.answerEnd)) * 100;
                          const duration = ((qa.answerEnd - qa.questionStart) / qa.answerEnd) * 100;
                          return (
                            <div
                              key={qa.id}
                              className={`timeline-marker ${selectedSegments.has(qa.id) ? 'selected' : ''}`}
                              style={{ left: `${position}%`, width: `${duration}%` }}
                              title={`Q&A ${idx + 1}: ${formatTime(qa.questionStart)} - ${formatTime(qa.answerEnd)}`}
                              onClick={() => {
                                playerRef.current?.seekTo(qa.questionStart, 'seconds');
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="content-preview-area">
                  <h5>Detected Q&A Segments</h5>
                  <p className="content-hint">Hover over any card below to preview that segment with audio</p>
                </div>
              </div>

              <div className="segments-header">
                <h4>Detected Q&A Segments ({qaPairs.length})</h4>
                <div>
                  <button onClick={selectAll} className="btn-outline">Select All</button>
                  <button onClick={deselectAll} className="btn-outline">Deselect All</button>
                </div>
              </div>

              <div className="qa-grid">
                {qaPairs.map((qa) => (
                  <div
                    key={qa.id}
                    className={`qa-card ${selectedSegments.has(qa.id) ? 'selected' : ''}`}
                    onMouseEnter={() => handleSegmentHover(qa)}
                    onMouseLeave={handleSegmentHoverOut}
                  >
                    <div className="qa-card-header">
                      <div className="qa-select">
                        <input
                          type="checkbox"
                          checked={selectedSegments.has(qa.id)}
                          onChange={() => toggleSegmentSelection(qa.id)}
                        />
                        <span className="score-chip" style={{ backgroundColor: getScoreColor(qa.score) }}>
                          Score: {qa.score}
                        </span>
                      </div>
                      <span className="priority-chip" style={{ backgroundColor: getPriorityColor(qa.priority) }}>
                        {qa.priority.toUpperCase()}
                      </span>
                    </div>

                    <div className="qa-content">
                      <div className="qa-item">
                        <strong>Q ({qa.labels.question}):</strong>
                        <p className="qa-text">{qa.questionText}</p>
                      </div>
                      <div className="qa-item">
                        <strong>A ({qa.labels.answer}):</strong>
                        <p className="qa-text">{qa.answerText}</p>
                      </div>
                    </div>

                    <div className="qa-card-footer">
                      <span className="qa-time">
                        ⏱️ {formatTime(qa.duration)} | {formatTime(qa.questionStart)} - {formatTime(qa.answerEnd)}
                      </span>
                      <span className="qa-preview-label">👁️ Hover to preview</span>
                    </div>

                    {qa.reasons && qa.reasons.length > 0 && (
                      <div className="qa-reasons">
                        {qa.reasons.slice(0, 3).map((reason, idx) => (
                          <span key={idx} className="reason-tag">{reason.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="export-section">
                <div className="export-controls">
                  <div className="format-selector">
                    <label htmlFor="export-format">Output Format:</label>
                    <select
                      id="export-format"
                      value={selectedFormat}
                      onChange={(e) => setSelectedFormat(e.target.value)}
                      disabled={isProcessing}
                    >
                      <option value="tiktok">📱 TikTok / Reels / Shorts (9:16 Vertical)</option>
                      <option value="reels">📸 Instagram Reels (9:16 Vertical)</option>
                      <option value="shorts">▶️ YouTube Shorts (9:16 Vertical)</option>
                      <option value="square">⬜ Instagram Square (1:1)</option>
                      <option value="landscape">🖥️ Landscape / YouTube (16:9)</option>
                      <option value="original">📹 Original Format</option>
                    </select>
                  </div>
                  <button
                    className="export-btn-primary"
                    onClick={handleExportSelected}
                    disabled={selectedSegments.size === 0 || isProcessing}
                  >
                    {isProcessing ? '⏳ Exporting...' : `Export Selected (${selectedSegments.size})`}
                  </button>
                </div>
                <p className="export-hint">
                  Multiple clips will be bundled into a ZIP file. Files are named: qa-01-{selectedFormat}.mp4, qa-02-{selectedFormat}.mp4, etc.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Main Create Short Page Component
const CreateShortPage = () => {
  const [activeTab, setActiveTab] = useState('youtube'); // 'youtube' or 'podcast'
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const [platforms, setPlatforms] = useState([]);
  const [downloadingQuality, setDownloadingQuality] = useState(null);
  const [processingForPlatform, setProcessingForPlatform] = useState(null);

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

  return (
    <div className="create-short-page">
      <h1>Video Clip Generator</h1>

      {/* Tab Selector */}
      <div className="tab-selector">
        <button
          className={`tab-btn ${activeTab === 'youtube' ? 'active' : ''}`}
          onClick={() => setActiveTab('youtube')}
        >
          📺 YouTube Video Downloader
        </button>
        <button
          className={`tab-btn ${activeTab === 'podcast' ? 'active' : ''}`}
          onClick={() => setActiveTab('podcast')}
        >
          🎙️ Podcast Q&A Clip Generator
        </button>
      </div>

      {activeTab === 'youtube' ? (
        // YouTube Downloader Section
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
                onClick={() => handleDownloadForPlatform(videoInfo.duration)}
                disabled={processingForPlatform !== null}
                className="process-btn full-video-btn"
              >
                {processingForPlatform === videoInfo.duration ? '⏳ Processing...' : `📥 Download Full Video (${Math.floor(videoInfo.duration / 60)}:${String(Math.floor(videoInfo.duration % 60)).padStart(2, '0')})`}
              </button>
              <button
                onClick={() => handleDownloadForPlatform(60)}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 60 ? '⏳ Processing...' : 'Download 60s Clip'}
              </button>
              <button
                onClick={() => handleDownloadForPlatform(30)}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 30 ? '⏳ Processing...' : 'Download 30s Clip'}
              </button>
              <button
                onClick={() => handleDownloadForPlatform(15)}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 15 ? '⏳ Processing...' : 'Download 15s Clip'}
              </button>
            </div>
          </div>
        )}

        <div className="instructions">
          <h3>How to use:</h3>
          <ol>
            <li>Enter a YouTube URL and click "Get Video Info"</li>
            <li>Click "4K Ultra HD" or "HD" to download the original video</li>
            <li>Or click "Download Full Video" to get the entire video converted for selected platform</li>
            <li>Or select a duration (60s, 30s, 15s) to download a short clip</li>
          </ol>
        </div>
        </div>
      ) : (
        // Podcast Q&A Section
        <PodcastQaSection />
      )}
    </div>
  );
};

export default CreateShortPage;
