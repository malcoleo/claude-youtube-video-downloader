// client/src/pages/CreateShort.jsx
import React, { useState, useRef } from 'react';
import ReactPlayer from 'react-player';
import axios from 'axios';
import {
  VideoCamera,
  UploadSimple,
  DownloadSimple,
  Clock,
  Target,
  Check,
  Eye,
  Timer,
  DeviceMobile,
  Camera,
  Play,
  Video,
  Square,
  Monitor,
  Hourglass,
  Sparkles,
  FileText,
  Scissors
} from '@phosphor-icons/react';
import './CreateShort.css';

// Unified page component - handles both YouTube URL and file upload
const CreateShortPage = () => {
  // Input state
  const [inputMode, setInputMode] = useState('youtube'); // 'youtube' or 'upload'
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);

  // Video info and preview state
  const [videoInfo, setVideoInfo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [videoPathForExport, setVideoPathForExport] = useState(null);

  // Processing state
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [downloadingQuality, setDownloadingQuality] = useState(null);
  const [processingForPlatform, setProcessingForPlatform] = useState(null);

  // Q&A segments (for uploaded podcasts AND YouTube downloads)
  const [qaPairs, setQaPairs] = useState([]);
  const [selectedSegments, setSelectedSegments] = useState(new Set());
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const [stats, setStats] = useState(null);
  const [qaDetected, setQaDetected] = useState(false); // Track if Q&A detection has been run

  // Export state
  const [selectedFormat, setSelectedFormat] = useState('tiktok');
  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const [platforms, setPlatforms] = useState([]);

  // Error state
  const [error, setError] = useState('');

  // Refs
  const playerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch available platforms on component mount
  React.useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const response = await axios.get('/api/youtube/platforms');
        setPlatforms(response.data.platforms);
      } catch (err) {
        console.error('Error fetching platforms:', err);
      }
    };
    fetchPlatforms();
  }, []);

  // ============ FILE UPLOAD HANDLERS ============
  const handleSelectFileClick = () => {
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
    setInputMode('upload');
    setError('');
    setIsProcessing(true);
    setProcessingStage('Uploading and processing...');

    // Create local preview URL for immediate feedback
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
        if (response.data.previewUrl) {
          setVideoUrl(response.data.previewUrl);
          setPreviewUrl(response.data.previewUrl);
        }
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

  // ============ YOUTUBE HANDLERS ============
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
      setVideoUrl(response.data.url); // Use downloaded video URL for preview
      setInputMode('youtube');
      setIsLoading(false);
    } catch (err) {
      console.error('Error getting YouTube info:', err);
      setError('Failed to get YouTube video info. Please check the URL and try again.');
      setIsLoading(false);
    }
  };

  const handleDownloadOriginal = async (quality) => {
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    setDownloadingQuality(quality);
    setError('');

    try {
      const infoResponse = await axios.post('/api/youtube/info', { youtubeUrl });
      const response = await axios.post('/api/youtube/download', {
        youtubeUrl,
        start: 0,
        end: infoResponse.data.duration,
        platform: null,
        quality: quality
      });

      if (response.data.success) {
        handleDownload(response.data.videoPath);
      } else {
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
        handleDownload(response.data.videoPath);
      }
      setProcessingForPlatform(null);
    } catch (err) {
      console.error('Error processing video:', err);
      setError('Failed to process video. Please try again.');
      setProcessingForPlatform(null);
    }
  };

  const handleDownload = (videoUrl) => {
    const filename = videoUrl.split('/').pop();
    const downloadUrl = `http://localhost:5001/download/${filename}?t=${Date.now()}`;
    window.location.href = downloadUrl;
  };

  // ============ YOUTUBE Q&A DETECTION HANDLER ============
  const handleDetectQaForYoutube = async () => {
    if (!videoInfo) {
      setError('Please get YouTube video info first');
      return;
    }

    setIsProcessing(true);
    setProcessingStage('Downloading and analyzing Q&A segments...');
    setError('');

    try {
      const response = await axios.post('/api/youtube/detect-qa', {
        youtubeUrl
      }, {
        onUploadProgress: () => {
          setProcessingStage('Downloading video from YouTube...');
        }
      });

      if (response.data.success) {
        setQaPairs(response.data.qaPairs || []);
        setStats(response.data.stats);
        setQaDetected(true);

        // Use server-generated preview if available
        if (response.data.previewUrl) {
          setVideoUrl(response.data.previewUrl);
          setPreviewUrl(response.data.previewUrl);
        }

        // Store video path for export
        if (response.data.videoPathForExport) {
          setVideoPathForExport(response.data.videoPathForExport);
        }

        setProcessingStage('');
        alert(`Found ${response.data.qaPairs.length} Q&A segments! Scroll down to review and export clips.`);
      } else {
        setError('Failed to detect Q&A pairs');
      }
    } catch (err) {
      console.error('Error detecting Q&A:', err);
      setError(err.response?.data?.error || 'Failed to detect Q&A pairs. Please try again.');
      setQaPairs([]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============ SEGMENT HANDLERS (for uploaded podcasts AND YouTube) ============
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
      playerRef.current.seekTo(segment.questionStart, 'seconds');
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

  // ============ UTILITY FUNCTIONS ============
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
    <div className="create-short-page">
      <h1>Video Clip Generator</h1>

      {/* Unified Input Section */}
      <div className="input-section">
        <div className="unified-input-header">
          <h2>Choose Your Source</h2>
          <div className="input-mode-selector">
            <button
              className={`mode-btn ${inputMode === 'youtube' ? 'active' : ''}`}
              onClick={() => setInputMode('youtube')}
            >
              <VideoCamera weight="fill" size={20} style={{ marginRight: 8 }} /> YouTube URL
            </button>
            <button
              className={`mode-btn ${inputMode === 'upload' ? 'active' : ''}`}
              onClick={() => {
                setInputMode('upload');
                handleSelectFileClick();
              }}
            >
              <UploadSimple weight="fill" size={20} style={{ marginRight: 8 }} /> Upload File
            </button>
          </div>
        </div>

        {/* YouTube URL Input */}
        {inputMode === 'youtube' && (
          <div className="url-input-container">
            <input
              type="text"
              placeholder="Paste YouTube URL here..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              disabled={isLoading || processingForPlatform !== null || downloadingQuality !== null || isProcessing}
            />
            <button
              onClick={handleGetYoutubeInfo}
              disabled={isLoading || processingForPlatform !== null || downloadingQuality !== null || isProcessing}
            >
              {isLoading ? 'Loading...' : 'Get Video Info'}
            </button>
          </div>
        )}

        {/* Hidden file input for upload mode */}
        <input
          accept="video/*,audio/*"
          style={{ display: 'none' }}
          id="podcast-upload"
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
        />

        {error && <div className="error-message">{error}</div>}
      </div>

      {/* Video Preview and Actions */}
      {videoInfo && (
        <div className="video-preview-section">
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
                  {downloadingQuality === '4k' ? <Hourglass size={20} weight="fill" style={{ marginRight: 8 }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8 }} />}
                  {downloadingQuality === '4k' ? 'Downloading 4K...' : '4K Ultra HD'}
                </button>
                <button
                  onClick={() => handleDownloadOriginal('hd')}
                  disabled={downloadingQuality !== null || processingForPlatform !== null}
                  className="quality-btn"
                >
                  {downloadingQuality === 'hd' ? <Hourglass size={20} weight="fill" style={{ marginRight: 8 }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8 }} />}
                  {downloadingQuality === 'hd' ? 'Downloading HD...' : 'HD (1080p/720p)'}
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
                {processingForPlatform === videoInfo.duration ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} />}
                {processingForPlatform === videoInfo.duration ? 'Processing...' : `Download Full Video (${Math.floor(videoInfo.duration / 60)}:${String(Math.floor(videoInfo.duration % 60)).padStart(2, '0')})`}
              </button>
              <button
                onClick={() => handleDownloadForPlatform(60)}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 60 ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : null}
                {processingForPlatform === 60 ? 'Processing...' : 'Download 60s Clip'}
              </button>
              <button
                onClick={() => handleDownloadForPlatform(30)}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 30 ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : null}
                {processingForPlatform === 30 ? 'Processing...' : 'Download 30s Clip'}
              </button>
              <button
                onClick={() => handleDownloadForPlatform(15)}
                disabled={processingForPlatform !== null}
                className="process-btn"
              >
                {processingForPlatform === 15 ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : null}
                {processingForPlatform === 15 ? 'Processing...' : 'Download 15s Clip'}
              </button>
            </div>

            {/* Q&A Detection Button */}
            <div className="qa-detection-section">
              <label>AI-Powered Q&A Detection:</label>
              <p className="qa-detection-hint">
                Automatically detect questions and answers in this video. Perfect for podcasts, interviews, and educational content.
              </p>
              <button
                onClick={handleDetectQaForYoutube}
                disabled={isProcessing || qaDetected}
                className={`qa-detect-btn ${qaDetected ? 'detected' : ''}`}
              >
                {isProcessing ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : qaDetected ? <Check size={20} weight="bold" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : <Target size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} />}
                {isProcessing ? 'Detecting Q&A...' : qaDetected ? 'Q&A Detected' : 'Detect Q&A Segments'}
              </button>
              {isProcessing && (
                <p className="download-status">{processingStage}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Video Preview with Q&A Segments (for uploads OR YouTube with Q&A detected) */}
      {(uploadedFile || (qaPairs.length > 0 && qaDetected)) && (
        <div className="video-preview-section">
          <div className="video-preview-card">
            <div className="preview-header-row">
              <h4>Preview: {uploadedFile ? uploadedFile.name : videoInfo?.title || 'Video'}</h4>
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
        </div>
      )}

      {/* Processing Status */}
      {isProcessing && processingStage && (
        <div className="alert alert-warning">
          <strong><Hourglass size={16} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> {processingStage}</strong>
          <div className="progress-bar"><div className="progress-fill"></div></div>
          <small>This may take several minutes for large files. Please don't close this page.</small>
        </div>
      )}

      {/* Q&A Segments Grid */}
      {qaDetected && qaPairs.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={64} weight="light" />
          </div>
          <h3>No Q&A Segments Found</h3>
          <p className="empty-state-hint">
            We analyzed your video but didn't detect any clear question-and-answer patterns.
            This can happen with music, monologues, or conversations without distinct Q&A structure.
          </p>
          <button className="btn-outline" onClick={handleDetectQaClick}>
            <Sparkles size={16} weight="fill" style={{ marginRight: 8 }} />
            Try Detecting Again
          </button>
        </div>
      )}

      {qaPairs.length > 0 && (
        <>
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
                    <Timer size={14} weight="fill" style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    {formatTime(qa.duration)} | {formatTime(qa.questionStart)} - {formatTime(qa.answerEnd)}
                  </span>
                  <span className="qa-preview-label"><Eye size={14} weight="fill" style={{ marginRight: 4, verticalAlign: 'middle' }} /> Hover to preview</span>
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

          {/* No Selection Empty State */}
          {selectedSegments.size === 0 && (
            <div className="empty-state-no-selection">
              <h4><Scissors size={16} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> No Segments Selected</h4>
              <p>Select Q&A cards above to create your clips, then click export</p>
            </div>
          )}

          {/* Export Section */}
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
                  <option value="tiktok"><DeviceMobile size={18} weight="fill" style={{ marginRight: 8 }} /> TikTok / Reels / Shorts (9:16 Vertical)</option>
                  <option value="reels"><Camera size={18} weight="fill" style={{ marginRight: 8 }} /> Instagram Reels (9:16 Vertical)</option>
                  <option value="shorts"><Play size={18} weight="fill" style={{ marginRight: 8 }} /> YouTube Shorts (9:16 Vertical)</option>
                  <option value="square"><Square size={18} weight="fill" style={{ marginRight: 8 }} /> Instagram Square (1:1)</option>
                  <option value="landscape"><Monitor size={18} weight="fill" style={{ marginRight: 8 }} /> Landscape / YouTube (16:9)</option>
                  <option value="original"><Video size={18} weight="fill" style={{ marginRight: 8 }} /> Original Format</option>
                </select>
              </div>
              <button
                className="export-btn-primary"
                onClick={handleExportSelected}
                disabled={selectedSegments.size === 0 || isProcessing}
              >
                {isProcessing ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : null}
                {isProcessing ? 'Exporting...' : `Export Selected (${selectedSegments.size})`}
              </button>
            </div>
            <p className="export-hint">
              Multiple clips will be bundled into a ZIP file. Files are named: qa-01-{selectedFormat}.mp4, qa-02-{selectedFormat}.mp4, etc.
            </p>
          </div>
        </>
      )}

      {/* Instructions */}
      <div className="instructions">
        <h3>How to use:</h3>
        <ol>
          <li><strong>YouTube URL:</strong> Paste a YouTube URL and click "Get Video Info" to download</li>
          <li><strong>Upload File:</strong> Upload your own video/audio file (MP4, MOV, MKV, MP3, WAV)</li>
          <li><strong>For YouTube:</strong> Download in 4K/HD or convert for specific platforms</li>
          <li><strong>For Uploads:</strong> AI detects Q&A segments, select clips and export in your desired format</li>
        </ol>
      </div>
    </div>
  );
};

export default CreateShortPage;
