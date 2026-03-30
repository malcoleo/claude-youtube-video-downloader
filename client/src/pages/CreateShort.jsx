// client/src/pages/CreateShort.jsx
import React, { useState, useRef } from 'react';
import ReactPlayer from 'react-player';
import axios from 'axios';
import {
  VideoCamera,
  UploadSimple,
  DownloadSimple,
  Target,
  Check,
  Eye,
  Timer,
  DeviceMobile,
  Camera,
  Play,
  Square,
  Monitor,
  Hourglass,
  Star,
  FileText,
  Scissors,
  Moon,
  Sun,
  Trash,
  Video
} from '@phosphor-icons/react';

// eslint-disable-next-line no-unused-vars
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
  const [videoPathForExport, setVideoPathForExport] = useState(null);

  // Processing state
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [downloadingQuality, setDownloadingQuality] = useState(null);

  // Download progress state
  const [downloadProgress, setDownloadProgress] = useState(null);

  // Q&A segments (for uploaded podcasts AND YouTube downloads)
  const [qaPairs, setQaPairs] = useState([]);
  const [selectedSegments, setSelectedSegments] = useState(new Set());
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const [stats, setStats] = useState(null);
  const [qaDetected, setQaDetected] = useState(false); // Track if Q&A detection has been run
  const [chaptersAvailable, setChaptersAvailable] = useState(null); // Track if video has YouTube chapters

  // Export state
  const [selectedFormat, setSelectedFormat] = useState('tiktok');

  // Error state
  const [error, setError] = useState('');

  // Dark mode state - default to light mode, respect system preference
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        return saved === 'true';
      }
      // Default to light mode, but can opt-in to system preference
      return false;
    }
    return false;
  });

  // Refs
  const playerRef = useRef(null);
  const fileInputRef = useRef(null);
  const urlInputRef = useRef(null);

  // Cleanup temp files and reset state on hard refresh
  React.useEffect(() => {
    const cleanupOnRefresh = () => {
      // Show warning if there's an active download or processing
      if (downloadingQuality !== null || isProcessing) {
        return 'You have active downloads or processing. Are you sure you want to leave?';
      }
      return null;
    };

    const handleBeforeUnload = (e) => {
      const message = cleanupOnRefresh();
      if (message) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [downloadingQuality, isProcessing]);

  // Apply dark mode class to document
  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  // Cleanup state and optionally clear temp downloads
  const handleCleanup = () => {
    if (window.confirm('This will clear all downloaded videos and reset your progress. This action cannot be undone. Continue?')) {
      // Reset all state
      setYoutubeUrl('');
      setUploadedFile(null);
      setVideoInfo(null);
      setVideoUrl(null);
      setVideoPathForExport(null);
      setQaPairs([]);
      setSelectedSegments(new Set());
      setStats(null);
      setQaDetected(false);
      setChaptersAvailable(null);
      setError('');
      setProcessingStage('');
      setDownloadingQuality(null);
      setDownloadProgress(null);

      // Clear localStorage for dark mode (keep it)
      // Call server to delete temp files from disk
      fetch('http://localhost:5001/api/youtube/clear-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
        .then(response => response.json())
        .then(data => {
          console.log('Server cache cleared:', data);
        })
        .catch(err => {
          console.error('Error clearing server cache:', err);
        });

      // Tell user cache is cleared
      alert('Cache and downloads cleared. You can now start fresh.');
    }
  };

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
        }
        if (response.data.videoPathForExport) {
          setVideoPathForExport(response.data.videoPathForExport);
        }
        setError('');
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
    setProcessingStage('Fetching video info...');

    try {
      const response = await axios.post('/api/youtube/info', { youtubeUrl });
      setVideoInfo(response.data);
      // Use thumbnail as preview while video downloads, update with actual video URL after download
      setVideoUrl(response.data.thumbnail || null);
      setInputMode('youtube');
      setIsLoading(false);
      setProcessingStage('');
      // Check if chapters are available
      setChaptersAvailable(response.data.chapters || null);
    } catch (err) {
      console.error('Error getting YouTube info:', err);
      setError('Failed to get YouTube video info. Please check the URL and try again.');
      setIsLoading(false);
      setProcessingStage('');
      // Clear chapters when URL changes or fails
      setChaptersAvailable(null);
    }
  };

  // Add Enter key listener for YouTube URL input (must be after handleGetYoutubeInfo)
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' && inputMode === 'youtube' && youtubeUrl.trim()) {
        handleGetYoutubeInfo();
      }
    };

    if (urlInputRef.current) {
      urlInputRef.current.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      if (urlInputRef.current) {
        urlInputRef.current.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [inputMode, youtubeUrl]);

  const handleDownloadOriginal = async (quality) => {
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    setDownloadingQuality(quality);
    setError('');
    setDownloadProgress({ percent: 0, eta: null, speed: null });
    setProcessingStage(`Downloading ${quality === '4k' ? '4K' : quality === 'hd' ? 'HD' : 'SD'}...`);

    try {
      const infoResponse = await axios.post('/api/youtube/info', { youtubeUrl });

      // Download with progress tracking - use a unique ID for progress polling
      const downloadId = 'dl-' + Date.now();

      // Poll for progress while download is happening
      let progressPolling;
      const pollProgress = async () => {
        try {
          const progressResponse = await axios.get(`/api/youtube/progress?id=${downloadId}`);
          if (progressResponse.data.percent > 0) {
            setDownloadProgress(progressResponse.data);
            setProcessingStage(`Downloading ${quality === '4k' ? '4K' : quality === 'hd' ? 'HD' : 'SD'}... ${Math.round(progressResponse.data.percent)}%`);
          }
          if (progressResponse.data.percent < 100) {
            progressPolling = setTimeout(pollProgress, 500);
          }
        } catch (err) {
          console.error('Error polling progress:', err);
        }
      };

      // Start polling
      progressPolling = setTimeout(pollProgress, 500);

      // Download the video
      const response = await axios.post('/api/youtube/download', {
        id: downloadId,
        youtubeUrl,
        start: 0,
        end: infoResponse.data.duration,
        platform: null,
        quality: quality
      }, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setDownloadProgress({ percent, eta: null, speed: null });
          setProcessingStage(`Preparing download... ${percent}%`);
        }
      });

      clearTimeout(progressPolling);

      if (response.data.success) {
        handleDownload(response.data.videoPath);
        setDownloadProgress(null);
        setProcessingStage('');
      } else {
        setError('Download failed - server returned error');
        setDownloadProgress(null);
        setProcessingStage('');
      }
      setDownloadingQuality(null);
    } catch (err) {
      console.error('Error downloading video:', err);
      setError('Failed to download video: ' + err.message);
      setDownloadProgress(null);
      setProcessingStage('');
      setDownloadingQuality(null);
    }
  };

  // ============ YOUTUBE DOWNLOAD HANDLERS ============
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
    setProcessingStage('Analyzing video... Detecting questions and answers.');
    setError('');
    setDownloadProgress({ percent: 0, eta: null, speed: null });

    try {
      // Use a unique ID for progress polling
      const downloadId = 'qa-' + Date.now();

      // Poll for progress while detection is happening
      let progressPolling;
      const pollProgress = async () => {
        try {
          const progressResponse = await axios.get(`/api/youtube/progress?id=${downloadId}`);
          if (progressResponse.data.percent > 0) {
            setDownloadProgress(progressResponse.data);
            setProcessingStage(`Analyzing... ${Math.round(progressResponse.data.percent)}%`);
          }
          if (progressResponse.data.percent < 100) {
            progressPolling = setTimeout(pollProgress, 500);
          }
        } catch (err) {
          console.error('Error polling progress:', err);
        }
      };

      // Start polling
      progressPolling = setTimeout(pollProgress, 500);

      const response = await axios.post('/api/youtube/detect-qa', {
        id: downloadId,
        youtubeUrl
      });

      clearTimeout(progressPolling);

      if (response.data.success) {
        setQaPairs(response.data.qaPairs || []);
        setStats(response.data.stats);
        setQaDetected(true);
        setError('');
        setProcessingStage('');

        // Use server-generated preview if available
        if (response.data.previewUrl) {
          setVideoUrl(response.data.previewUrl);
        }

        // Store video path for export
        if (response.data.videoPathForExport) {
          setVideoPathForExport(response.data.videoPathForExport);
        }

        setDownloadProgress(null);
      } else {
        setError('Failed to detect Q&A pairs');
        setDownloadProgress(null);
        setProcessingStage('');
      }
    } catch (err) {
      console.error('Error detecting Q&A:', err);
      setError(err.response?.data?.error || 'Failed to detect Q&A pairs. Please try again.');
      setQaPairs([]);
      setDownloadProgress(null);
      setProcessingStage('');
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
    setProcessingStage(`Preparing ${selectedSegments.size} clip(s)...`);

    try {
      const segmentsToExport = qaPairs.filter(qa => selectedSegments.has(qa.id)).map(qa => ({
        start: qa.questionStart,
        end: qa.answerEnd,
        id: qa.id
      }));

      // Use selectedFormat directly for export API
      const response = await axios.post('/api/highlights/video/export-clips', {
        videoPath: videoPathForExport,
        segments: segmentsToExport,
        format: selectedFormat
      });

      if (response.data.success) {
        window.location.href = `http://localhost:5001${response.data.downloadUrl}`;
        setProcessingStage('');
        setIsProcessing(false);
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
    if (priority === 'high') return 'var(--success)';
    if (priority === 'medium') return 'var(--warning)';
    return 'var(--error)';
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--error)';
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="create-short-page">
      <div className="page-header">
        <h1>Video Clip Generator</h1>
        <button className="cleanup-btn" onClick={handleCleanup} aria-label="Clear cache and downloads" title="Clear cache and downloads">
          <Trash weight="fill" size={20} />
        </button>
        <button className="dark-mode-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode">
          {darkMode ? <Sun weight="fill" size={20} /> : <Moon weight="fill" size={20} />}
        </button>
      </div>

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
              disabled={isLoading || downloadingQuality !== null || isProcessing}
              ref={urlInputRef}
            />
            <button
              onClick={handleGetYoutubeInfo}
              disabled={isLoading || downloadingQuality !== null || isProcessing}
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

            {/* Chapter info banner */}
            {chaptersAvailable && (
              <div className="chapter-info-banner">
                <Star size={16} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                <span>
                  <strong>{chaptersAvailable.count} Chapter{chaptersAvailable.count > 1 ? 's' : ''} Found</strong>
                  <span className="chapter-hint"> - Clips will use YouTube's curated chapter markers</span>
                </span>
              </div>
            )}

            <div className="download-quality-section">
              <label>Download Original Video:</label>
              <div className="quality-buttons">
                <button
                  onClick={() => handleDownloadOriginal('4k')}
                  disabled={downloadingQuality !== null}
                  className="quality-btn"
                >
                  {downloadingQuality === '4k' ? <Hourglass size={20} weight="fill" style={{ marginRight: 8 }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8 }} />}
                  {downloadingQuality === '4k' ? 'Downloading 4K...' : '4K Ultra HD'}
                </button>
                <button
                  onClick={() => handleDownloadOriginal('hd')}
                  disabled={downloadingQuality !== null}
                  className="quality-btn"
                >
                  {downloadingQuality === 'hd' ? <Hourglass size={20} weight="fill" style={{ marginRight: 8 }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8 }} />}
                  {downloadingQuality === 'hd' ? 'Downloading HD...' : 'HD (1080p/720p)'}
                </button>
                <button
                  onClick={() => handleDownloadOriginal('sd')}
                  disabled={downloadingQuality !== null}
                  className="quality-btn"
                >
                  {downloadingQuality === 'sd' ? <Hourglass size={20} weight="fill" style={{ marginRight: 8 }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8 }} />}
                  {downloadingQuality === 'sd' ? 'Downloading SD...' : 'Preview (480p)'}
                </button>
              </div>
              {downloadingQuality && (
                <div className="download-progress-section">
                  <div className="download-status">
                    <span className="progress-label">
                      {downloadingQuality === '4k' ? '4K' : downloadingQuality === 'hd' ? 'HD' : 'SD (480p)'}
                      {downloadProgress?.percent === 100 ? ' Complete' : ' Downloading...'}
                    </span>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ backgroundColor: 'var(--neutral-200)' }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${downloadProgress?.percent || 0}%`,
                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)'
                          }}
                        />
                      </div>
                      <span className="progress-text">{downloadProgress?.percent || 0}%</span>
                    </div>
                    {downloadProgress?.percent > 0 && (
                      <div className="progress-details">
                        {downloadProgress?.percent === 100
                          ? 'Processing video...'
                          : downloadProgress?.eta && downloadProgress?.speed
                            ? `ETA: ${downloadProgress.eta} | ${downloadProgress.speed}/s`
                            : 'Downloading...'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Q&A Detection Button - only visible after video is downloaded */}
            {!qaDetected && (
              <div className="qa-detection-section">
                <button
                  onClick={handleDetectQaForYoutube}
                  disabled={isProcessing || qaDetected}
                  className={`qa-detect-btn ${qaDetected ? 'detected' : ''}`}
                >
                  {isProcessing ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : qaDetected ? <Check size={20} weight="bold" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : <Target size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} />}
                  {isProcessing ? 'Analyzing video...' : qaDetected ? 'Analysis Complete' : 'Analyze for Q&A'}
                </button>
                {isProcessing && (
                  <p className="download-status">{processingStage}</p>
                )}
              </div>
            )}
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
          <button className="btn-outline" onClick={handleDetectQaForYoutube}>
            <Star size={16} weight="fill" style={{ marginRight: 8 }} />
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
                    {qa.source === 'youtube-chapter' && (
                      <span className="source-chip" title="YouTube chapter (creator-curated)">
                        <Star size={12} weight="fill" /> Chapter
                      </span>
                    )}
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

      {/* Video Preview with Q&A Segments (for uploads OR YouTube with Q&A detected) */}
    </div>
  );
};

export default CreateShortPage;
