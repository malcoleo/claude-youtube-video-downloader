// client/src/pages/CreateShort.jsx
import React, { useRef } from 'react';
import ReactPlayer from 'react-player';
import axios from 'axios';
import {
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
  Video,
  Keyboard,
  BookmarkSimple,
  ClockCounterClockwise,
  CaretDown,
  ShareNetwork
} from '@phosphor-icons/react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useDragAndDrop } from '../hooks/useDragAndDrop';
import { useVideoWorkflow } from '../hooks/useVideoWorkflow';
import SocialMediaManager from '../components/SocialMediaManager';
import BulkUrlInput from '../components/BulkUrlInput';
import QualitySelector from '../components/QualitySelector';

// eslint-disable-next-line no-unused-vars
import './CreateShort.css';

// Unified page component - handles both YouTube URL and file upload
const CreateShortPage = () => {
  const { state: s, handlers: h, utilities: u, refs } = useVideoWorkflow();
  const containerRef = useRef(null);

  // Keyboard shortcuts
  const keyboardShortcuts = {
    'ctrl+e': () => {
      const editor = document.querySelector('.video-editor-container');
      if (editor) {
        editor.scrollIntoView({ behavior: 'smooth' });
        editor.focus();
      }
    },
    'ctrl+p': () => {
      if (s.inputMode === 'youtube' && s.youtubeUrl) {
        h.handleGetYoutubeInfo();
      } else if (s.inputMode === 'upload' && s.uploadedFile) {
        h.handleFileUpload({ target: { files: [s.uploadedFile] } });
      }
    },
    'ctrl+shift+d': () => {
      h.handleCleanup();
    },
    'ctrl+h': () => {
      h.toggleHistoryPanel();
    }
  };

  useKeyboardShortcuts(keyboardShortcuts);

  // Drag and drop
  const handleDropFiles = (files) => {
    if (files.length > 0) {
      h.setUploadedFile(files[0]);
      h.setInputMode('upload');
      h.setError('');
      h.handleFileUpload({ target: { files } });
    }
  };

  const { isDragging, bindEvents } = useDragAndDrop(handleDropFiles);

  React.useEffect(() => {
    if (containerRef.current) {
      bindEvents(containerRef);
    }
  }, [bindEvents]);


  return (
    <div className={`create-short-page ${s.darkMode ? 'dark-mode' : ''}`} ref={containerRef}>
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-indicator">
            <UploadSimple size={64} weight="light" />
            <p>Drop your video file here</p>
          </div>
        </div>
      )}

      {s.showHistory && (
        <div className="history-panel">
          <div className="history-header">
            <h3>Activity History</h3>
            <button onClick={() => h.setShowHistory(false)} className="close-btn">×</button>
          </div>
          <div className="history-content">
            {s.history.length > 0 ? (
              <ul>
                {s.history.map((item, index) => (
                  <li key={index} className="history-item">
                    <div className="history-action">{item.action}</div>
                    <div className="history-details">{item.details}</div>
                    <div className="history-time">{new Date(item.timestamp).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No history available</p>
            )}
          </div>
        </div>
      )}

      <div className="page-header">
        <h1>Video Clip Generator</h1>
        <div className="header-actions">
          <button className="icon-btn" onClick={h.toggleHistoryPanel} title="Toggle History">
            <ClockCounterClockwise size={20} />
          </button>
          <button className="icon-btn" onClick={() => h.setShowHistory(!s.showHistory)} title="History Panel">
            <BookmarkSimple size={20} />
          </button>
          <button
            className="icon-btn"
            onClick={() => h.setShowSocialMediaManager(true)}
            title="Social Media Manager"
            disabled={!s.videoPathForExport &&  s.qaPairs.length === 0}
          >
            <ShareNetwork size={20} weight="fill" />
          </button>
          <button className="cleanup-btn" onClick={h.handleCleanup} aria-label="Clear cache and downloads" title="Clear cache and downloads">
            <Trash weight="fill" size={20} />
          </button>
          <button className="dark-mode-toggle" onClick={h.toggleDarkMode} aria-label="Toggle dark mode">
            {s.darkMode ? <Sun weight="fill" size={20} /> : <Moon weight="fill" size={20} />}
          </button>
        </div>
      </div>

      {/* Unified Input Section - Minimal Single-Focus Design */}
      <div className="input-section">
        <div className="unified-input-header">
          <h1>Create Clips from Any Video</h1>
          <p className="input-subtitle">Paste a URL from YouTube, TikTok, Instagram, Twitter, or 1000+ sites. AI detects the best moments automatically.</p>
        </div>

        {/* Main URL Input - Single Prominent Field */}
        <div className="minimal-url-input">
          <input
            type="text"
            placeholder="Paste video URL here..."
            value={s.youtubeUrl}
            onChange={(e) => h.setYoutubeUrl(e.target.value)}
            disabled={s.isLoading || s.downloadingQuality !== null || s.isProcessing}
            ref={refs.urlInputRef}
            className="minimal-input-field"
          />
          <button
            onClick={h.handleOneClickDownloadAndHighlights}
            disabled={s.isLoading || s.downloadingQuality !== null || s.isProcessing || !s.youtubeUrl.trim()}
            className="primary-action-btn"
          >
            {s.isLoading ? (
              <><Hourglass size={20} weight="fill" className="spin" /> Processing...</>
            ) : (
              <><Scissors size={20} weight="fill" /> Create Clips</>
            )}
          </button>
        </div>

        {/* Secondary Actions Row */}
        <div className="secondary-actions">
          <button
            onClick={() => h.setShowBulkUrlInput(!s.showBulkUrlInput)}
            className="secondary-action-btn"
          >
            Bulk URLs
          </button>
          <button
            onClick={() => {
              h.setInputMode('upload');
              h.handleSelectFileClick();
            }}
            className="secondary-action-btn"
          >
            <UploadSimple size={16} weight="fill" /> Upload File
          </button>
        </div>

        {/* Bulk URL Input (collapsible) */}
        {s.showBulkUrlInput && (
          <div className="bulk-url-wrapper">
            <BulkUrlInput
              format="video"
              onUrlsReady={(urls) => h.setBulkUrlData(urls)}
            />
          </div>
        )}

        {/* Hidden file input for upload mode */}
        <input
          accept="video/*,audio/*"
          style={{ display: 'none' }}
          id="podcast-upload"
          ref={refs.fileInputRef}
          type="file"
          onChange={h.handleFileUpload}
        />

        {s.error && <div className="error-message">{s.error}</div>}
      </div>

      {/* Video Preview and Actions */}
      {s.videoInfo && (
        <div className="video-preview-section">
          <div className="video-preview">
            <h3>{s.videoInfo.title}</h3>
            {s.videoInfo.thumbnail && (
              <img src={s.videoInfo.thumbnail} alt="Video thumbnail" className="thumbnail" />
            )}
            <p><strong>Duration:</strong> {Math.floor(s.videoInfo.duration / 60)}:{String(Math.floor(s.videoInfo.duration % 60)).padStart(2, '0')}</p>

            {/* Chapter info banner */}
            {s.chaptersAvailable && (
              <div className="chapter-info-banner">
                <Star size={16} weight="fill" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                <span>
                  <strong>{s.chaptersAvailable.count} Chapter{s.chaptersAvailable.count > 1 ? 's' : ''} Found</strong>
                  <span className="chapter-hint"> - Clips will use YouTube's curated chapter markers</span>
                </span>
              </div>
            )}

            {/* Quality Selector - shows when formats are available */}
            {s.availableFormats.length > 0 && (
              <div className="quality-selector-container">
                <QualitySelector
                  formats={s.availableFormats}
                  selectedQuality={s.selectedQuality}
                  onSelectQuality={h.setSelectedQuality}
                  disabled={s.s.downloadingQuality !== null || s.isProcessing}
                />
              </div>
            )}

            <div className="download-quality-section">
              <label>Download Original Video:</label>
              <div className="quality-buttons">
                <button
                  onClick={() => h.handleDownloadOriginal('4k')}
                  disabled={s.downloadingQuality !== null}
                  className="quality-btn"
                >
                  {s.downloadingQuality === '4k' ? <Hourglass size={20} weight="fill" style={{ marginRight: 8 }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8 }} />}
                  {s.downloadingQuality === '4k' ? 'Downloading 4K...' : '4K Ultra HD'}
                </button>
                <button
                  onClick={() => h.handleDownloadOriginal('hd')}
                  disabled={s.downloadingQuality !== null}
                  className="quality-btn"
                >
                  {s.downloadingQuality === 'hd' ? <Hourglass size={20} weight="fill" style={{ marginRight: 8 }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8 }} />}
                  {s.downloadingQuality === 'hd' ? 'Downloading HD...' : 'HD (1080p/720p)'}
                </button>
                <button
                  onClick={() => h.handleDownloadOriginal('sd')}
                  disabled={s.downloadingQuality !== null}
                  className="quality-btn"
                >
                  {s.downloadingQuality === 'sd' ? <Hourglass size={20} weight="fill" style={{ marginRight: 8 }} /> : <DownloadSimple size={20} weight="fill" style={{ marginRight: 8 }} />}
                  {s.downloadingQuality === 'sd' ? 'Downloading SD...' : 'Preview (480p)'}
                </button>
              </div>
              {s.downloadingQuality && (
                <div className="download-progress-section">
                  <div className="download-status">
                    <span className="progress-label">
                      {s.downloadingQuality === '4k' ? '4K' : s.downloadingQuality === 'hd' ? 'HD' : 'SD (480p)'}
                      {s.downloadProgress?.percent === 100 ? ' Complete' : ' Downloading...'}
                    </span>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ backgroundColor: 'var(--neutral-200)' }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${s.downloadProgress?.percent || 0}%`,
                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)'
                          }}
                        />
                      </div>
                      <span className="progress-text">{s.downloadProgress?.percent || 0}%</span>
                    </div>
                    {s.downloadProgress?.percent > 0 && (
                      <div className="progress-details">
                        {s.downloadProgress?.percent === 100
                          ? 'Processing video...'
                          : s.downloadProgress?.eta && s.downloadProgress?.speed
                            ? `ETA: ${s.downloadProgress.eta} | ${s.downloadProgress.speed}/s`
                            : 'Downloading...'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Q&A Detection Button - only visible after video is downloaded */}
            {!s.qaDetected && (
              <div className="qa-detection-section">
                <button
                  onClick={h.handleDetectQaForYoutube}
                  disabled={s.isProcessing || s.qaDetected}
                  className={`qa-detect-btn ${s.qaDetected ? 'detected' : ''}`}
                >
                  {s.isProcessing ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : s.qaDetected ? <Check size={20} weight="bold" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : <Target size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} />}
                  {s.isProcessing ? 'Analyzing video...' : s.qaDetected ? 'Analysis Complete' : 'Analyze for Q&A'}
                </button>
                {s.isProcessing && (
                  <p className="download-status">{s.processingStage}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video Preview with Q&A Segments (for uploads OR YouTube with Q&A detected) */}
      {(s.uploadedFile || (s.qaPairs.length > 0 && s.qaDetected)) && (
        <div className="video-preview-section">
          <div className="video-preview-card">
            <div className="preview-header-row">
              <h4>Preview: {s.uploadedFile ? s.uploadedFile.name : s.videoInfo?.title || 'Video'}</h4>
              {s.stats && (
                <div className="stats-inline">
                  <span className="stat-chip">Segments: {s.stats.totalSegments}</span>
                  <span className="stat-chip primary">Q&A: {s.stats.qaPairsFound}</span>
                </div>
              )}
            </div>
            <div className="video-player-wrapper">
              <ReactPlayer
                ref={refs.playerRef}
                url={s.videoUrl}
                width="100%"
                height="auto"
                controls={true}
                playing={s.hoveredSegment !== null}
                muted={false}
                volume={0.5}
                playbackRate={1}
                onEnded={h.handleSegmentHoverOut}
              />
              {/* Timeline markers overlay */}
              {s.qaPairs.length > 0 && (
                <div className="timeline-markers">
                  <div className="timeline-bar">
                    {s.qaPairs.map((qa, idx) => {
                      const position = (qa.questionStart / (qa.answerEnd)) * 100;
                      const duration = ((qa.answerEnd - qa.questionStart) / qa.answerEnd) * 100;
                      return (
                        <div
                          key={qa.id}
                          className={`timeline-marker ${s.selectedSegments.has(qa.id) ? 'selected' : ''}`}
                          style={{ left: `${position}%`, width: `${duration}%` }}
                          title={`Q&A ${idx + 1}: ${u.formatTime(qa.questionStart)} - ${u.formatTime(qa.answerEnd)}`}
                          onClick={() => {
                            refs.playerRef.current?.seekTo(qa.questionStart, 'seconds');
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
      {s.isProcessing && s.processingStage && (
        <div className="alert alert-warning">
          <strong><Hourglass size={16} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> {s.processingStage}</strong>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${s.downloadProgress?.percent || 0}%` }}
            />
          </div>
          <small>{s.downloadProgress?.percent || 0}% complete - This may take several minutes for AI transcription. Please don't close this page.</small>
        </div>
      )}

      {/* Q&A Segments Grid */}
      {s.qaDetected && s.qaPairs.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={64} weight="light" />
          </div>
          <h3>No Q&A Segments Found</h3>
          <p className="empty-state-hint">
            We analyzed your video but didn't detect any clear question-and-answer patterns.
            This can happen with music, monologues, or conversations without distinct Q&A structure.
          </p>
          <button className="btn-outline" onClick={h.handleDetectQaForYoutube}>
            <Star size={16} weight="fill" style={{ marginRight: 8 }} />
            Try Detecting Again
          </button>
        </div>
      )}

      {s.qaPairs.length > 0 && (
        <>
          <div className="segments-header">
            <h4>Detected Q&A Segments ({s.qaPairs.length})</h4>
            <div>
              <button onClick={h.selectAll} className="btn-outline">Select All</button>
              <button onClick={h.deselectAll} className="btn-outline">Deselect All</button>
            </div>
          </div>

          <div className="qa-grid">
            {s.qaPairs.map((qa) => (
              <div
                key={qa.id}
                className={`qa-card ${s.selectedSegments.has(qa.id) ? 'selected' : ''}`}
                onMouseEnter={() => h.handleSegmentHover(qa)}
                onMouseLeave={h.handleSegmentHoverOut}
              >
                <div className="qa-card-header">
                  <div className="qa-select">
                    <input
                      type="checkbox"
                      checked={s.selectedSegments.has(qa.id)}
                      onChange={() => h.toggleSegmentSelection(qa.id)}
                    />
                    <span className="score-chip" style={{ backgroundColor: u.getScoreColor(qa.score) }}>
                      Score: {qa.score}
                    </span>
                    {qa.source === 'youtube-chapter' && (
                      <span className="source-chip" title="YouTube chapter (creator-curated)">
                        <Star size={12} weight="fill" /> Chapter
                      </span>
                    )}
                  </div>
                  <span className="priority-chip" style={{ backgroundColor: u.getPriorityColor(qa.priority) }}>
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
                    {u.formatTime(qa.duration)} | {u.formatTime(qa.questionStart)} - {u.formatTime(qa.answerEnd)}
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
          {s.selectedSegments.size === 0 && (
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
                  value={s.selectedFormat}
                  onChange={(e) => h.setSelectedFormat(e.target.value)}
                  disabled={s.isProcessing}
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
                onClick={h.handleExportSelected}
                disabled={s.selectedSegments.size === 0 || s.isProcessing}
              >
                {s.isProcessing ? <Hourglass size={20} weight="fill" style={{ marginRight: 8, verticalAlign: 'middle' }} /> : null}
                {s.isProcessing ? 'Exporting...' : `Export Selected (${s.selectedSegments.size})`}
              </button>
            </div>
            <p className="export-hint">
              Multiple clips will be bundled into a ZIP file. Files are named: qa-01-{s.selectedFormat}.mp4, qa-02-{s.selectedFormat}.mp4, etc.
            </p>

            {/* Advanced Customization Options */}
            <details className="customization-options">
              <summary>Advanced Customization <CaretDown size={16} /></summary>
              <div className="customization-panel">
                {/* Content Type Selector */}
                <div className="content-type-section">
                  <h5>Content Optimization</h5>

                  <div className="input-group">
                    <label htmlFor="content-type-select">Content Type:</label>
                    <select
                      id="content-type-select"
                      value={s.selectedContentType}
                      onChange={h.handleContentTypeChange}
                      disabled={s.isProcessing}
                    >
                      <option value="">Select content type...</option>
                      {Array.isArray(s.availableContentTypes) && s.availableContentTypes.map(type => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {s.contentSuggestions && (
                    <div className="suggestions-panel">
                      <h6>Suggested Settings</h6>
                      <ul className="suggestions-list">
                        {s.contentSuggestions.suggestedSettings?.exportResolution && (
                          <li>Resolution: <strong>{s.contentSuggestions.suggestedSettings.exportResolution}</strong></li>
                        )}
                        {s.contentSuggestions.suggestedSettings?.exportBitrate && (
                          <li>Bitrate: <strong>{s.contentSuggestions.suggestedSettings.exportBitrate} Mbps</strong></li>
                        )}
                        <li>Subtitles: <strong>{s.contentSuggestions.suggestedSettings?.addSubtitles ? 'Yes' : 'No'}</strong></li>
                        <li>CTA: <strong>{s.contentSuggestions.suggestedSettings?.ctaText}</strong></li>
                      </ul>

                      {s.contentSuggestions.clipLengthSuggestion && (
                        <div className="clip-length-suggestion">
                          <h6>Optimal Clip Length</h6>
                          <p>Suggested: <strong>{s.contentSuggestions.clipLengthSuggestion.suggested || s.contentSuggestions.clipLengthSuggestion.ideal || s.contentSuggestions.clipLengthSuggestion.min} seconds</strong></p>
                        </div>
                      )}

                      {s.contentSuggestions.engagementTips && (
                        <div className="engagement-tips">
                          <h6>Engagement Tips</h6>
                          <ul>
                            {s.contentSuggestions.engagementTips.slice(0, 3).map((tip, idx) => (
                              <li key={idx}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Preset Management */}
                <div className="preset-section">
                  <h5>Saved Presets</h5>

                  <div className="input-group">
                    <label htmlFor="preset-select">Apply Preset:</label>
                    <select
                      id="preset-select"
                      value={s.selectedPreset}
                      onChange={h.handlePresetChange}
                      disabled={s.isProcessing}
                    >
                      <option value="">Choose a preset...</option>
                      {Object.keys(s.availablePresets).map((pname) => (
                        <option key={pname} value={pname}>
                          {pname}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="input-group">
                    <label htmlFor="new-preset">Save Current Settings:</label>
                    <div className="preset-input-wrapper">
                      <input
                        type="text"
                        id="new-preset"
                        placeholder="Enter preset name"
                        value={s.presetName}
                        onChange={(e) => h.setPresetName(e.target.value)}
                        disabled={s.isProcessing}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={h.savePreset}
                        disabled={!s.presetName.trim() || s.isProcessing}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>

                {/* Branding Options */}
                <div className="branding-section">
                  <h5>Branding & Overlays</h5>

                  <div className="input-group">
                    <label htmlFor="watermark-url">Watermark URL:</label>
                    <input
                      type="text"
                      id="watermark-url"
                      placeholder="https://example.com/logo.png"
                      value={s.watermarkUrl}
                      onChange={(e) => h.setWatermarkUrl(e.target.value)}
                      disabled={s.isProcessing}
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="watermark-position">Watermark Position:</label>
                    <select
                      id="watermark-position"
                      value={s.watermarkPosition}
                      onChange={(e) => h.setWatermarkPosition(e.target.value)}
                      disabled={s.isProcessing}
                    >
                      <option value="top-left">Top Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="bottom-right">Bottom Right</option>
                      <option value="center">Center</option>
                    </select>
                  </div>

                  <div className="input-group">
                    <label htmlFor="watermark-size">Watermark Size (%):</label>
                    <input
                      type="range"
                      id="watermark-size"
                      min="5"
                      max="30"
                      value={s.watermarkSize}
                      onChange={(e) => h.setWatermarkSize(parseInt(e.target.value))}
                      disabled={s.isProcessing}
                    />
                    <span className="range-value">{s.watermarkSize}%</span>
                  </div>
                </div>

                {/* Hormozi Subtitles */}
                <div className="subtitle-section">
                  <h5>Hormozi-Style Subtitles</h5>

                  <div className="input-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={s.hormoziSubtitles}
                        onChange={(e) => h.setHormoziSubtitles(e.target.checked)}
                        disabled={s.isProcessing}
                      />
                      Enable word-by-word animated subtitles
                    </label>
                  </div>

                  {s.hormoziSubtitles && (
                    <>
                      <div className="input-group">
                        <label htmlFor="subtitle-font-size">Font Size:</label>
                        <input
                          type="range"
                          id="subtitle-font-size"
                          min="48"
                          max="96"
                          value={s.subtitleFontSize}
                          onChange={(e) => h.setSubtitleFontSize(parseInt(e.target.value))}
                          disabled={s.isProcessing}
                        />
                        <span className="range-value">{s.subtitleFontSize}px</span>
                      </div>

                      <div className="input-group">
                        <label htmlFor="subtitle-font-color">Text Color:</label>
                        <input
                          type="color"
                          id="subtitle-font-color"
                          value={s.subtitleFontColor}
                          onChange={(e) => h.setSubtitleFontColor(e.target.value)}
                          disabled={s.isProcessing}
                        />
                      </div>

                      <div className="input-group">
                        <label htmlFor="subtitle-position">Position:</label>
                        <select
                          id="subtitle-position"
                          value={s.subtitlePosition}
                          onChange={(e) => h.setSubtitlePosition(e.target.value)}
                          disabled={s.isProcessing}
                        >
                          <option value="center">Center</option>
                          <option value="bottom">Bottom</option>
                          <option value="top">Top</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={s.enableKeywordHighlight}
                            onChange={(e) => h.setEnableKeywordHighlight(e.target.checked)}
                            disabled={s.isProcessing}
                          />
                          Gold keyword highlighting
                        </label>
                      </div>

                      <div className="input-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={s.enableEmojiOverlay}
                            onChange={(e) => h.setEnableEmojiOverlay(e.target.checked)}
                            disabled={s.isProcessing}
                          />
                          Emoji overlays (AI-suggested)
                        </label>
                      </div>
                    </>
                  )}
                </div>

                {/* Audio Enhancement */}
                <div className="audio-section">
                  <h5>Audio Enhancement</h5>

                  <div className="input-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={s.normalizeAudio}
                        onChange={(e) => h.setNormalizeAudio(e.target.checked)}
                        disabled={s.isProcessing}
                      />
                      Normalize Audio Volume
                    </label>
                  </div>

                  <div className="input-group">
                    <label htmlFor="volume-adjustment">Volume Adjustment (dB):</label>
                    <input
                      type="range"
                      id="volume-adjustment"
                      min="-10"
                      max="10"
                      value={s.volumeAdjustment}
                      onChange={(e) => h.setVolumeAdjustment(parseInt(e.target.value))}
                      disabled={s.isProcessing}
                    />
                    <span className="range-value">{s.volumeAdjustment}dB</span>
                  </div>

                  <div className="input-group">
                    <label htmlFor="bg-music-url">Background Music:</label>
                    <input
                      type="text"
                      id="bg-music-url"
                      placeholder="https://example.com/music.mp3"
                      value={s.bgMusicUrl}
                      onChange={(e) => h.setBgMusicUrl(e.target.value)}
                      disabled={s.isProcessing}
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="bg-music-volume">Background Volume (%):</label>
                    <input
                      type="range"
                      id="bg-music-volume"
                      min="0"
                      max="100"
                      value={s.bgMusicVolume}
                      onChange={(e) => h.setBgMusicVolume(parseInt(e.target.value))}
                      disabled={s.isProcessing}
                    />
                    <span className="range-value">{s.bgMusicVolume}%</span>
                  </div>
                </div>

                {/* Export Quality */}
                <div className="quality-section">
                  <h5>Export Quality</h5>

                  <div className="input-group">
                    <label htmlFor="resolution">Resolution:</label>
                    <select
                      id="resolution"
                      value={s.exportResolution}
                      onChange={(e) => h.setExportResolution(e.target.value)}
                      disabled={s.isProcessing}
                    >
                      <option value="720p">HD (720p)</option>
                      <option value="1080p">Full HD (1080p)</option>
                      <option value="1440p">2K (1440p)</option>
                      <option value="2160p">4K (2160p)</option>
                    </select>
                  </div>

                  <div className="input-group">
                    <label htmlFor="bitrate">Bitrate (Mbps):</label>
                    <input
                      type="range"
                      id="bitrate"
                      min="1"
                      max="50"
                      value={s.exportBitrate}
                      onChange={(e) => h.setExportBitrate(parseInt(e.target.value))}
                      disabled={s.isProcessing}
                    />
                    <span className="range-value">{s.exportBitrate} Mbps</span>
                  </div>
                </div>

                {/* Thumbnail Options */}
                <div className="thumbnail-section">
                  <h5>Thumbnail Options</h5>

                  <div className="input-group">
                    <label htmlFor="thumbnail-title">Title Overlay:</label>
                    <input
                      type="text"
                      id="thumbnail-title"
                      placeholder="Enter title to overlay on thumbnail"
                      value={s.thumbnailTitle}
                      onChange={(e) => h.setThumbnailTitle(e.target.value)}
                      disabled={s.isProcessing}
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="thumbnail-template">Template:</label>
                    <select
                      id="thumbnail-template"
                      value={s.thumbnailTemplate}
                      onChange={(e) => h.setThumbnailTemplate(e.target.value)}
                      disabled={s.isProcessing}
                    >
                      <option value="none">None</option>
                      <option value="overlay">Text Overlay</option>
                      <option value="split">Split Screen</option>
                      <option value="border">Border Frame</option>
                    </select>
                  </div>

                  <div className="thumbnail-controls">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={h.handleGenerateThumbnail}
                      disabled={s.isProcessing || !s.videoPathForExport}
                    >
                      Generate Thumbnail
                    </button>

                    {s.generatedThumbnail && (
                      <div className="thumbnail-preview">
                        <img src={s.generatedThumbnail} alt="Generated thumbnail" />
                      </div>
                    )}
                  </div>
                </div>

                {/* End Screen CTA */}
                <div className="cta-section">
                  <h5>End Screen & Call-to-Action</h5>

                  <div className="input-group">
                    <label htmlFor="cta-text">CTA Text:</label>
                    <input
                      type="text"
                      id="cta-text"
                      placeholder="Watch full video"
                      value={s.ctaText}
                      onChange={(e) => h.setCtaText(e.target.value)}
                      disabled={s.isProcessing}
                    />
                  </div>

                  <div className="input-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={s.addEndScreen}
                        onChange={(e) => h.setAddEndScreen(e.target.checked)}
                        disabled={s.isProcessing}
                      />
                      Add End Screen with CTA
                    </label>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </>
      )}

      {/* Video Preview with Q&A Segments (for uploads OR YouTube with Q&A detected) */}

      {/* Social Media Manager Modal */}
      {s.showSocialMediaManager && (
        <div className="social-media-manager-modal">
          <div className="social-media-manager-content">
            <SocialMediaManager
              videoPath={s.videoPathForExport}
              transcript={s.qaPairs.length > 0 ? { qaPairs: s.qaPairs } : null}
              onClose={() => h.setShowSocialMediaManager(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateShortPage;
