// client/src/hooks/useVideoWorkflow.js
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { getCurrentUserId } from '../utils/userUtils';

export function useVideoWorkflow() {
  // Input state
  const [inputMode, setInputMode] = useState('youtube');
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

  // Q&A segments
  const [qaPairs, setQaPairs] = useState([]);
  const [selectedSegments, setSelectedSegments] = useState(new Set());
  const [hoveredSegment, setHoveredSegment] = useState(null);
  const [stats, setStats] = useState(null);
  const [qaDetected, setQaDetected] = useState(false);
  const [chaptersAvailable, setChaptersAvailable] = useState(null);
  // Per-segment time adjustments (seconds, relative to original times)
  const [segmentTrims, setSegmentTrims] = useState({});

  // Export state
  const [selectedFormat, setSelectedFormat] = useState('tiktok');
  // Export progress tracking
  const [exportProgress, setExportProgress] = useState(null); // { current, total, stage }

  // Hormozi subtitle state
  const [hormoziSubtitles, setHormoziSubtitles] = useState(true);
  const [subtitleFontSize, setSubtitleFontSize] = useState(72);
  const [subtitleFontColor, setSubtitleFontColor] = useState('#FFFFFF');
  const [subtitlePosition, setSubtitlePosition] = useState('center');
  const [enableKeywordHighlight, setEnableKeywordHighlight] = useState(true);
  const [enableEmojiOverlay, setEnableEmojiOverlay] = useState(false);

  // Customization state
  const [watermarkUrl, setWatermarkUrl] = useState('');
  const [watermarkPosition, setWatermarkPosition] = useState('bottom-right');
  const [watermarkSize, setWatermarkSize] = useState(15);
  const [normalizeAudio, setNormalizeAudio] = useState(false);
  const [volumeAdjustment, setVolumeAdjustment] = useState(0);
  const [bgMusicUrl, setBgMusicUrl] = useState('');
  const [bgMusicVolume, setBgMusicVolume] = useState(30);
  const [exportResolution, setExportResolution] = useState('1080p');
  const [exportBitrate, setExportBitrate] = useState(10);
  const [thumbnailTitle, setThumbnailTitle] = useState('');
  const [thumbnailTemplate, setThumbnailTemplate] = useState('none');
  const [ctaText, setCtaText] = useState('Watch full video');
  const [addEndScreen, setAddEndScreen] = useState(true);

  // Presets state
  const [availablePresets, setAvailablePresets] = useState({});
  const [selectedPreset, setSelectedPreset] = useState('');
  const [presetName, setPresetName] = useState('');

  // History state
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Social media manager state
  const [showSocialMediaManager, setShowSocialMediaManager] = useState(false);

  // Bulk URL input state
  const [showBulkUrlInput, setShowBulkUrlInput] = useState(false);
  const [bulkUrlData, setBulkUrlData] = useState(null);

  // Quality selector state
  const [selectedQuality, setSelectedQuality] = useState(null);
  const [availableFormats, setAvailableFormats] = useState([]);

  // Content suggestions state
  const [availableContentTypes, setAvailableContentTypes] = useState([]);
  const [selectedContentType, setSelectedContentType] = useState('');
  const [contentSuggestions, setContentSuggestions] = useState(null);

  // Error state
  const [error, setError] = useState('');

  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) return saved === 'true';
      return false;
    }
    return false;
  });

  // Refs
  const playerRef = useRef(null);
  const fileInputRef = useRef(null);
  const urlInputRef = useRef(null);

  // Generated thumbnail state
  const [generatedThumbnail, setGeneratedThumbnail] = useState(null);

  // Cleanup on refresh
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (downloadingQuality !== null || isProcessing) {
        const message = 'You have active downloads or processing. Are you sure you want to leave?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [downloadingQuality, isProcessing]);

  // Apply dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  // Load presets and content types on mount
  useEffect(() => {
    loadPresets();
    loadContentTypes();
  }, []);

  // Enter key for URL input
  useEffect(() => {
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

  // ---- Cleanup ----
  const handleCleanup = () => {
    if (window.confirm('This will clear all downloaded videos and reset your progress. This action cannot be undone. Continue?')) {
      setYoutubeUrl('');
      setUploadedFile(null);
      setVideoInfo(null);
      setVideoUrl(null);
      setVideoPathForExport(null);
      setQaPairs([]);
      setSelectedSegments(new Set());
      setSegmentTrims({});
      setExportProgress(null);
      setStats(null);
      setQaDetected(false);
      setChaptersAvailable(null);
      setError('');
      setProcessingStage('');
      setDownloadingQuality(null);
      setDownloadProgress(null);

      fetch('http://localhost:5001/api/youtube/clear-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).then(r => r.json()).then(d => console.log('Server cache cleared:', d)).catch(e => console.error('Error clearing server cache:', e));

      alert('Cache and downloads cleared. You can now start fresh.');
    }
  };

  // ---- File upload ----
  const handleSelectFileClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
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
        if (response.data.previewUrl) setVideoUrl(response.data.previewUrl);
        if (response.data.videoPathForExport) setVideoPathForExport(response.data.videoPathForExport);
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

  // ---- YouTube handlers ----
  const handleGetYoutubeInfo = async () => {
    if (!youtubeUrl) {
      setError('Please enter a video URL');
      return;
    }

    setIsLoading(true);
    setError('');
    setProcessingStage('Fetching video info...');

    try {
      const response = await axios.post('/api/media/info', { url: youtubeUrl }, { timeout: 45000 });
      setVideoInfo(response.data);
      setVideoUrl(response.data.thumbnail || null);
      setInputMode('youtube');
      setIsLoading(false);
      setProcessingStage('');
      setChaptersAvailable(response.data.chapters || null);
      if (response.data.formats && response.data.formats.length > 0) {
        setAvailableFormats(response.data.formats);
      }
    } catch (err) {
      console.error('Error getting media info:', err);
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        setError('Request timed out. Processing took too long. Please try again with a shorter video or check your internet connection.');
      } else if (err.response && err.response.data) {
        if (typeof err.response.data === 'object' && err.response.data.suggestions) {
          const suggestionsText = Array.isArray(err.response.data.suggestions)
            ? err.response.data.suggestions.join('\n• ')
            : String(err.response.data.suggestions);
          setError(`Invalid URL. Suggestions:\n• ${suggestionsText}`);
        } else if (typeof err.response.data === 'object' && err.response.data.error) {
          const hint = err.response.data.hint ? `\n\n${err.response.data.hint}` : '';
          setError(String(err.response.data.error) + hint);
        } else if (typeof err.response.data === 'string') {
          setError(err.response.data);
        } else {
          setError('Failed to get video info. Server returned an error. Please check the URL and try again.');
        }
      } else if (err.request) {
        setError('Network error: Could not connect to server. Please check your internet connection and ensure the server is running.');
      } else {
        setError('Failed to get video info: ' + err.message);
      }
      setIsLoading(false);
      setProcessingStage('');
      setChaptersAvailable(null);
    }
  };

  const handleDownloadOriginal = async (quality) => {
    if (!youtubeUrl) {
      setError('Please enter a video URL');
      return;
    }

    setDownloadingQuality(quality);
    setError('');
    setDownloadProgress({ percent: 0, eta: null, speed: null });
    setProcessingStage(`Downloading ${quality === '4k' ? '4K' : quality === 'hd' ? 'HD' : 'SD'}...`);

    try {
      const infoResponse = await axios.post('/api/youtube/info', { youtubeUrl }, { timeout: 45000 });
      const downloadId = 'dl-' + Date.now();

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

      progressPolling = setTimeout(pollProgress, 500);

      const response = await axios.post('/api/youtube/download', {
        id: downloadId, youtubeUrl, start: 0, end: infoResponse.data.duration, platform: null, quality
      }, {
        timeout: 300000,
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setDownloadProgress({ percent, eta: null, speed: null });
          setProcessingStage(`Preparing download... ${percent}%`);
        }
      });

      clearTimeout(progressPolling);

      if (response.data.success) {
        setVideoPathForExport(response.data.videoPath);
        if (response.data.thumbnailPath) {
          setVideoInfo(prev => ({ ...prev, thumbnail: response.data.thumbnailPath }));
        }
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
      if (err.response && err.response.data) {
        if (typeof err.response.data === 'object' && err.response.data.suggestions) {
          const suggestionsText = Array.isArray(err.response.data.suggestions)
            ? err.response.data.suggestions.join('\n• ')
            : String(err.response.data.suggestions);
          setError(`Invalid URL. Suggestions:\n• ${suggestionsText}`);
        } else if (typeof err.response.data === 'object' && err.response.data.error) {
          const hint = err.response.data.hint ? `\n\n${err.response.data.hint}` : '';
          setError(String(err.response.data.error) + hint);
        } else if (typeof err.response.data === 'string') {
          setError(err.response.data);
        } else {
          setError('Failed to download video: ' + err.message);
        }
      } else if (err.request) {
        setError('Network error: Could not connect to server. Please check your internet connection.');
      } else {
        setError('Failed to download video: ' + err.message);
      }
      setDownloadProgress(null);
      setProcessingStage('');
      setDownloadingQuality(null);
    }
  };

  const handleDownload = (videoUrl) => {
    const filename = videoUrl.split('/').pop();
    const downloadUrl = `http://localhost:5001/download/${filename}?t=${Date.now()}`;
    window.location.href = downloadUrl;
  };

  // ---- Q&A detection ----
  const handleDetectQaForYoutube = async () => {
    if (!videoInfo) {
      setError('Please get video info first');
      return;
    }

    setIsProcessing(true);
    setProcessingStage('Analyzing video... Detecting questions and answers.');
    setError('');
    setDownloadProgress({ percent: 0, eta: null, speed: null });

    try {
      const downloadId = 'qa-' + Date.now();

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

      progressPolling = setTimeout(pollProgress, 500);

      const response = await axios.post('/api/youtube/detect-qa', {
        id: downloadId, youtubeUrl
      }, { timeout: 300000 });

      clearTimeout(progressPolling);

      if (response.data.success) {
        setQaPairs(response.data.qaPairs || []);
        setStats(response.data.stats);
        setQaDetected(true);
        setError('');
        setProcessingStage('');
        if (response.data.previewUrl) setVideoUrl(response.data.previewUrl);
        if (response.data.videoPathForExport) setVideoPathForExport(response.data.videoPathForExport);
        setDownloadProgress(null);
      } else {
        setError('Failed to detect Q&A pairs');
        setDownloadProgress(null);
        setProcessingStage('');
      }
    } catch (err) {
      console.error('Error detecting Q&A:', err);
      if (err.response && err.response.data) {
        if (typeof err.response.data === 'object' && err.response.data.suggestions) {
          const suggestionsText = Array.isArray(err.response.data.suggestions)
            ? err.response.data.suggestions.join('\n• ')
            : String(err.response.data.suggestions);
          setError(`Invalid URL. Suggestions:\n• ${suggestionsText}`);
        } else if (typeof err.response.data === 'object' && err.response.data.error) {
          const hint = err.response.data.hint ? `\n\n${err.response.data.hint}` : '';
          setError(String(err.response.data.error) + hint);
        } else if (typeof err.response.data === 'string') {
          setError(err.response.data);
        } else {
          setError('Failed to detect Q&A pairs. Please try again.');
        }
      } else if (err.request) {
        setError('Network error: Could not connect to server. Please check your internet connection.');
      } else {
        setError('Failed to detect Q&A pairs. Please try again.');
      }
      setQaPairs([]);
      setDownloadProgress(null);
      setProcessingStage('');
    } finally {
      setIsProcessing(false);
    }
  };

  // ---- One-click download + highlights ----
  const handleOneClickDownloadAndHighlights = async () => {
    if (!youtubeUrl) {
      setError('Please enter a video URL');
      return;
    }

    setIsLoading(true);
    setError('');
    setProcessingStage('Fetching video info...');

    try {
      const infoResponse = await axios.post('/api/youtube/info', { youtubeUrl }, { timeout: 45000 });
      setVideoInfo(infoResponse.data);
      setVideoUrl(infoResponse.data.thumbnail || null);
      setInputMode('youtube');
      setChaptersAvailable(infoResponse.data.chapters || null);
      setProcessingStage('Downloading video...');

      const downloadId = 'oneclick-' + Date.now();
      let progressPolling;
      const pollProgress = async () => {
        try {
          const progressResponse = await axios.get(`/api/youtube/progress?id=${downloadId}`);
          if (progressResponse.data.percent > 0) {
            setDownloadProgress(progressResponse.data);
            setProcessingStage(`Downloading... ${Math.round(progressResponse.data.percent)}%`);
          }
          if (progressResponse.data.percent < 100) {
            progressPolling = setTimeout(pollProgress, 500);
          }
        } catch (err) {
          console.error('Error polling progress:', err);
        }
      };

      progressPolling = setTimeout(pollProgress, 500);

      const downloadResponse = await axios.post('/api/youtube/download', {
        id: downloadId, youtubeUrl, start: 0, end: infoResponse.data.duration, platform: null, quality: 'hd'
      }, {
        timeout: 600000,
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setDownloadProgress({ percent, eta: null, speed: null });
          setProcessingStage(`Preparing download... ${percent}%`);
        }
      });

      clearTimeout(progressPolling);

      if (!downloadResponse.data.success) throw new Error('Download failed');

      setVideoPathForExport(downloadResponse.data.videoPath);
      if (downloadResponse.data.thumbnailPath) {
        setVideoInfo(prev => ({ ...prev, thumbnail: downloadResponse.data.thumbnailPath }));
      }

      setProcessingStage('Analyzing for highlights...');
      setDownloadProgress({ percent: 0, eta: null, speed: null, stage: 'Starting analysis...' });

      const qaDownloadId = 'qa-' + Date.now();

      const pollQaProgress = async () => {
        try {
          const progressResponse = await axios.get(`/api/youtube/progress?id=${qaDownloadId}`);
          const data = progressResponse.data;
          if (data.percent > 0 || data.stage) {
            setDownloadProgress({ percent: data.percent || 0, eta: data.eta, speed: data.speed, stage: data.stage || '' });
            setProcessingStage(data.stage ? `${data.stage} (${data.percent}%)` : `Analyzing... ${Math.round(data.percent)}%`);
          }
          if (data.percent < 100) setTimeout(pollQaProgress, 500);
        } catch (err) {
          if (process.env.NODE_ENV === 'development') console.error('Error polling QA progress:', err);
          setTimeout(pollQaProgress, 500);
        }
      };

      setTimeout(pollQaProgress, 500);

      const qaResponse = await axios.post('/api/youtube/detect-qa', {
        id: qaDownloadId, youtubeUrl
      }, { timeout: 600000 });

      if (qaResponse.data.success) {
        setQaPairs(qaResponse.data.qaPairs || []);
        setStats(qaResponse.data.stats);
        setQaDetected(true);
        if (qaResponse.data.previewUrl) setVideoUrl(qaResponse.data.previewUrl);
        if (qaResponse.data.videoPathForExport) setVideoPathForExport(qaResponse.data.videoPathForExport);
      }

      setDownloadProgress(null);
      setProcessingStage('');
      setIsLoading(false);
    } catch (err) {
      console.error('Error in one-click download:', err);
      setError('One-click failed: ' + (err.response?.data?.error || err.message));
      setIsLoading(false);
      setProcessingStage('');
      setDownloadProgress(null);
    }
  };

  // ---- Segment handlers ----
  const toggleSegmentSelection = (segmentId) => {
    const newSelected = new Set(selectedSegments);
    if (newSelected.has(segmentId)) newSelected.delete(segmentId);
    else newSelected.add(segmentId);
    setSelectedSegments(newSelected);
  };

  const selectAll = () => setSelectedSegments(new Set(qaPairs.map(qa => qa.id)));
  const deselectAll = () => setSelectedSegments(new Set());

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

  const handleSegmentHoverOut = () => setHoveredSegment(null);

  // ---- Segment trim ----
  const adjustSegmentTime = (segmentId, field, delta) => {
    setSegmentTrims(prev => {
      const current = prev[segmentId] || { startTrim: 0, endTrim: 0 };
      const updated = { ...current };
      if (field === 'start') {
        updated.startTrim = (current.startTrim || 0) + delta;
      } else {
        updated.endTrim = (current.endTrim || 0) + delta;
      }
      // Clamp: don't let trim make segment shorter than 2 seconds
      const qa = qaPairs.find(q => q.id === segmentId);
      if (qa) {
        const effectiveStart = qa.questionStart + updated.startTrim;
        const effectiveEnd = qa.answerEnd + updated.endTrim;
        if (effectiveEnd - effectiveStart < 2) {
          updated.endTrim = current.endTrim; // revert
        }
      }
      return { ...prev, [segmentId]: updated };
    });
  };

  const resetSegmentTrim = (segmentId) => {
    setSegmentTrims(prev => {
      const copy = { ...prev };
      delete copy[segmentId];
      return copy;
    });
  };

  const getEffectiveTimes = (qa) => {
    const trim = segmentTrims[qa.id] || { startTrim: 0, endTrim: 0 };
    return {
      start: qa.questionStart + (trim.startTrim || 0),
      end: qa.answerEnd + (trim.endTrim || 0),
    };
  };

  const clearAllTrims = () => setSegmentTrims({});

  // ---- Export ----
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
    setExportProgress({ current: 0, total: selectedSegments.size, stage: 'Initializing...' });

    try {
      const segmentsToExport = qaPairs.filter(qa => selectedSegments.has(qa.id)).map(qa => {
        const times = getEffectiveTimes(qa);
        return { start: times.start, end: times.end, id: qa.id };
      });

      // Poll for export progress while the server processes
      const exportId = `export-${Date.now()}`;
      let pollTimer;
      const pollExportProgress = () => {
        pollTimer = setTimeout(async () => {
          try {
            const res = await axios.get(`/api/highlights/video/export-progress?id=${exportId}`);
            if (res.data.progress) {
              setExportProgress(res.data.progress);
              setProcessingStage(res.data.progress.stage);
            }
            if (!res.data.complete) pollExportProgress();
          } catch { /* polling may fail silently */ }
        }, 1000);
      };
      pollExportProgress();

      const response = await axios.post('/api/highlights/video/export-clips', {
        videoPath: videoPathForExport,
        segments: segmentsToExport,
        format: selectedFormat,
        addSubtitles: hormoziSubtitles,
        subtitleStyle: hormoziSubtitles ? {
          type: 'hormozi', animation: 'word-by-word',
          textColor: subtitleFontColor, backgroundColor: 'rgba(128, 128, 128, 0.8)',
          backgroundPerWord: true, position: subtitlePosition,
          fontSize: subtitleFontSize, fontFamily: 'Bebas Neue, Arial Black',
          keywordHighlight: enableKeywordHighlight,
          emojiOverlay: enableEmojiOverlay
        } : null,
        watermarkUrl, watermarkPosition, watermarkSize,
        normalizeAudio, volumeAdjustment, bgMusicUrl, bgMusicVolume,
        resolution: exportResolution, bitrate: exportBitrate,
        ctaText, addEndScreen,
        exportId
      }, { timeout: 600000 });

      clearTimeout(pollTimer);
      setExportProgress({ current: selectedSegments.size, total: selectedSegments.size, stage: 'Complete!' });

      if (response.data.success) {
        window.location.href = `http://localhost:5001${response.data.downloadUrl}`;
      } else {
        setError('Failed to export clips');
      }
    } catch (err) {
      console.error('Error exporting clips:', err);
      setError('Failed to export clips: ' + (err.response?.data?.error || err.message));
    } finally {
      setProcessingStage('');
      setExportProgress(null);
      setIsProcessing(false);
    }
  };

  // ---- Thumbnail ----
  const handleGenerateThumbnail = async () => {
    if (!videoPathForExport) {
      setError('No video available to generate thumbnail from');
      return;
    }

    setIsProcessing(true);
    setProcessingStage('Generating thumbnail...');

    try {
      const response = await axios.post('/api/highlights/video/generate-thumbnail', {
        videoPath: videoPathForExport,
        title: thumbnailTitle, template: thumbnailTemplate,
        watermarkUrl, watermarkPosition, timestamp: 10
      });

      if (response.data.success) {
        const thumbnailUrlWithTimestamp = `${response.data.thumbnailUrl}?t=${Date.now()}`;
        setGeneratedThumbnail(thumbnailUrlWithTimestamp);
        setProcessingStage('Thumbnail generated successfully!');
      } else {
        setError('Failed to generate thumbnail: ' + response.data.error);
      }
    } catch (err) {
      console.error('Error generating thumbnail:', err);
      setError('Failed to generate thumbnail: ' + (err.response?.data?.error || err.message));
    } finally {
      setProcessingStage('');
      setIsProcessing(false);
    }
  };

  // ---- Presets ----
  const loadPresets = async () => {
    try {
      const userId = getCurrentUserId();
      const response = await axios.get(`/api/presets/${userId}`);
      if (response.data.success) setAvailablePresets(response.data.presets);
    } catch (err) {
      console.error('Error loading presets:', err);
    }
  };

  const applyPreset = async (presetId) => {
    if (!presetId) return;
    try {
      const userId = getCurrentUserId();
      const response = await axios.get(`/api/presets/${userId}/${presetId}`);
      if (response.data.success) {
        const settings = response.data.settings;
        setWatermarkUrl(settings.watermarkUrl || '');
        setWatermarkPosition(settings.watermarkPosition || 'bottom-right');
        setWatermarkSize(settings.watermarkSize || 15);
        setNormalizeAudio(settings.normalizeAudio || false);
        setVolumeAdjustment(settings.volumeAdjustment || 0);
        setBgMusicUrl(settings.bgMusicUrl || '');
        setBgMusicVolume(settings.bgMusicVolume || 30);
        setExportResolution(settings.exportResolution || '1080p');
        setExportBitrate(settings.exportBitrate || 10);
        setThumbnailTitle(settings.thumbnailTitle || '');
        setThumbnailTemplate(settings.thumbnailTemplate || 'none');
        setCtaText(settings.ctaText || 'Watch full video');
        setAddEndScreen(settings.addEndScreen !== undefined ? settings.addEndScreen : true);
        setHormoziSubtitles(settings.hormoziSubtitles !== undefined ? settings.hormoziSubtitles : true);
        setSubtitleFontSize(settings.subtitleFontSize || 72);
        setSubtitleFontColor(settings.subtitleFontColor || '#FFFFFF');
        setSubtitlePosition(settings.subtitlePosition || 'center');
        setEnableKeywordHighlight(settings.enableKeywordHighlight !== undefined ? settings.enableKeywordHighlight : true);
        setEnableEmojiOverlay(settings.enableEmojiOverlay || false);
        alert(`Preset "${presetId}" applied successfully!`);
      }
    } catch (err) {
      console.error('Error applying preset:', err);
      setError('Failed to apply preset: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePresetChange = (e) => {
    const presetId = e.target.value;
    setSelectedPreset(presetId);
    if (presetId) applyPreset(presetId);
  };

  const savePreset = async () => {
    if (!presetName.trim()) {
      setError('Please enter a name for the preset');
      return;
    }

    try {
      const settingsToSave = {
        watermarkUrl, watermarkPosition, watermarkSize,
        normalizeAudio, volumeAdjustment,
        bgMusicUrl, bgMusicVolume,
        exportResolution, exportBitrate,
        thumbnailTitle, thumbnailTemplate,
        ctaText, addEndScreen,
        hormoziSubtitles, subtitleFontSize, subtitleFontColor, subtitlePosition,
        enableKeywordHighlight, enableEmojiOverlay
      };
      const userId = getCurrentUserId();
      const response = await axios.post(`/api/presets/${userId}`, {
        presetName: presetName.trim(), settings: settingsToSave
      });

      if (response.data.success) {
        const newPreset = { [presetName.trim()]: settingsToSave };
        setAvailablePresets(prev => ({ ...prev, ...newPreset }));
        setPresetName('');
        alert(`Preset "${presetName.trim()}" saved successfully!`);
      }
    } catch (err) {
      console.error('Error saving preset:', err);
      setError('Failed to save preset: ' + (err.response?.data?.error || err.message));
    }
  };

  // ---- Content suggestions ----
  const loadContentTypes = async () => {
    try {
      const response = await axios.get('/api/highlights/suggestions/content-types');
      if (response.data.success && Array.isArray(response.data.contentTypes)) {
        setAvailableContentTypes(response.data.contentTypes);
      }
    } catch (err) {
      console.error('Error loading content types:', err);
    }
  };

  const getSuggestions = async () => {
    if (!selectedContentType) return;
    try {
      const response = await axios.post('/api/highlights/suggestions/optimize-content', {
        contentType: selectedContentType,
        videoDuration: videoInfo?.duration
      });
      if (response.data.success) setContentSuggestions(response.data.suggestions);
    } catch (err) {
      console.error('Error getting content suggestions:', err);
      setError('Failed to get content suggestions: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleContentTypeChange = (e) => {
    const contentType = e.target.value;
    setSelectedContentType(contentType);
    if (contentType) getSuggestions();
    else setContentSuggestions(null);
  };

  // ---- History ----
  const fetchHistory = async () => {
    try {
      const userId = getCurrentUserId();
      const response = await axios.get(`/api/preferences/history/${userId}`);
      if (response.data.success) setHistory(response.data.history || []);
      else setHistory([]);
    } catch (err) {
      console.error('Error fetching history:', err);
      setHistory([]);
    }
  };

  const toggleHistoryPanel = () => {
    setShowHistory(!showHistory);
    if (!showHistory) fetchHistory();
  };

  // ---- Utilities ----
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

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  return {
    // State
    state: {
      inputMode, youtubeUrl, uploadedFile,
      videoInfo, videoUrl, videoPathForExport,
      isLoading, isProcessing, processingStage, downloadingQuality,
      downloadProgress,
      qaPairs, selectedSegments, hoveredSegment, stats, qaDetected, chaptersAvailable,
      segmentTrims,
      exportProgress,
      selectedFormat,
      watermarkUrl, watermarkPosition, watermarkSize,
      normalizeAudio, volumeAdjustment, bgMusicUrl, bgMusicVolume,
      exportResolution, exportBitrate,
      thumbnailTitle, thumbnailTemplate, ctaText, addEndScreen,
      hormoziSubtitles, subtitleFontSize, subtitleFontColor, subtitlePosition,
      enableKeywordHighlight, enableEmojiOverlay,
      availablePresets, selectedPreset, presetName,
      history, showHistory,
      showSocialMediaManager,
      showBulkUrlInput, bulkUrlData,
      selectedQuality, availableFormats,
      availableContentTypes, selectedContentType, contentSuggestions,
      error, darkMode,
      generatedThumbnail
    },
    // Refs
    refs: { playerRef, fileInputRef, urlInputRef },
    // Handlers
    handlers: {
      handleCleanup,
      handleSelectFileClick, handleFileUpload,
      handleGetYoutubeInfo, handleDownloadOriginal, handleDownload,
      handleDetectQaForYoutube,
      handleOneClickDownloadAndHighlights,
      toggleSegmentSelection, selectAll, deselectAll,
      handleSegmentHover, handleSegmentHoverOut,
      adjustSegmentTime, resetSegmentTrim, getEffectiveTimes, clearAllTrims,
      handleExportSelected,
      handleGenerateThumbnail,
      loadPresets, applyPreset, handlePresetChange, savePreset,
      loadContentTypes, getSuggestions, handleContentTypeChange,
      fetchHistory, toggleHistoryPanel,
      toggleDarkMode,
      setYoutubeUrl, setInputMode, setError,
      setUploadedFile,
      setShowSocialMediaManager, setShowBulkUrlInput, setBulkUrlData,
      setSelectedQuality, setSelectedFormat,
      setShowHistory,
      setHormoziSubtitles, setSubtitleFontSize, setSubtitleFontColor, setSubtitlePosition,
      setEnableKeywordHighlight, setEnableEmojiOverlay,
      setWatermarkUrl, setWatermarkPosition, setWatermarkSize,
      setNormalizeAudio, setVolumeAdjustment, setBgMusicUrl, setBgMusicVolume,
      setExportResolution, setExportBitrate,
      setThumbnailTitle, setThumbnailTemplate,
      setCtaText, setAddEndScreen,
      setPresetName,
    },
    // Utilities
    utilities: { getPriorityColor, getScoreColor, formatTime }
  };
}
