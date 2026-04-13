// client/src/components/BulkUrlInput.jsx
import React, { useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Check, Warning, DownloadSimple, X } from '@phosphor-icons/react';
import './BulkUrlInput.css';

/**
 * Bulk URL Input Component
 * - Accepts multiple URLs (one per line)
 * - Auto-deduplicates URLs
 * - Fetches preview info for all URLs
 * - Shows loading state with shimmer
 * - Allows individual or bulk download
 */
const BulkUrlInput = ({ onUrlsReady, onDownloadAll, format = 'video' }) => {
  const [rawInput, setRawInput] = useState('');
  const [urls, setUrls] = useState([]);
  const [urlInfo, setUrlInfo] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingUrls, setLoadingUrls] = useState(new Set());
  const [completedDownloads, setCompletedDownloads] = useState(new Set());
  const [error, setError] = useState('');

  // Parse and deduplicate URLs from textarea
  const parseAndDeduplicate = useCallback((text) => {
    if (!text.trim()) return [];

    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Deduplicate by exact URL match
    const seen = new Set();
    const uniqueUrls = [];

    for (const line of lines) {
      if (!seen.has(line)) {
        seen.add(line);
        uniqueUrls.push(line);
      }
    }

    return uniqueUrls;
  }, []);

  // Validate URL format (basic check)
  const isValidUrl = useCallback((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);

  // Handle textarea change
  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value;
    setRawInput(newValue);
    setError('');

    // Auto-parse when user types/pastes
    if (newValue.trim()) {
      const parsed = parseAndDeduplicate(newValue);
      setUrls(parsed);
    } else {
      setUrls([]);
    }
  }, [parseAndDeduplicate]);

  // Fetch info for a single URL
  const fetchUrlInfo = useCallback(async (url) => {
    setLoadingUrls(prev => new Set(prev).add(url));

    try {
      const response = await axios.post('/api/media/info', { url });

      if (response.data.success) {
        setUrlInfo(prev => ({
          ...prev,
          [url]: {
            success: true,
            data: response.data
          }
        }));
      } else {
        setUrlInfo(prev => ({
          ...prev,
          [url]: {
            success: false,
            error: response.data.error || 'Failed to fetch info'
          }
        }));
      }
    } catch (err) {
      setUrlInfo(prev => ({
        ...prev,
        [url]: {
          success: false,
          error: err.response?.data?.error || err.message || 'Network error'
        }
      }));
    } finally {
      setLoadingUrls(prev => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  }, []);

  // Fetch info for all URLs
  const handleFetchInfo = useCallback(async () => {
    if (urls.length === 0) return;

    setLoading(true);
    setError('');

    // Fetch info for each URL (could be optimized with bulk endpoint)
    const validUrls = urls.filter(isValidUrl);

    if (validUrls.length === 0) {
      setError('No valid URLs found. Please check your URLs.');
      setLoading(false);
      return;
    }

    // Fetch in parallel (limit to 5 at a time to avoid overwhelming)
    const BATCH_SIZE = 5;
    for (let i = 0; i < validUrls.length; i += BATCH_SIZE) {
      const batch = validUrls.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(url => fetchUrlInfo(url)));
    }

    setLoading(false);

    // Notify parent of ready URLs
    const readyUrls = validUrls.filter(url => urlInfo[url]?.success);
    if (onUrlsReady && readyUrls.length > 0) {
      onUrlsReady(readyUrls.map(url => ({
        url,
        info: urlInfo[url].data
      })));
    }
  }, [urls, fetchUrlInfo, isValidUrl, urlInfo, onUrlsReady]);

  // Download a single URL
  const handleDownload = useCallback(async (url) => {
    try {
      const response = await axios.post('/api/media/download', {
        url,
        format
      });

      if (response.data.success) {
        // Poll for completion
        const jobId = response.data.jobId;
        const pollInterval = setInterval(async () => {
          const statusResponse = await axios.get(`/api/media/status/${jobId}`);
          const status = statusResponse.data;

          if (status.status === 'done') {
            clearInterval(pollInterval);
            setCompletedDownloads(prev => new Set(prev).add(url));

            // Trigger download
            window.open(`/api/media/file/${jobId}`, '_blank');
          } else if (status.status === 'error') {
            clearInterval(pollInterval);
            setError(`Download failed: ${status.error}`);
          }

          // Update progress could be shown in UI
        }, 1000);
      }
    } catch (err) {
      setError(`Download failed: ${err.response?.data?.error || err.message}`);
    }
  }, [format]);

  // Download all URLs
  const handleDownloadAll = useCallback(async () => {
    const readyUrls = urls.filter(url => urlInfo[url]?.success);

    if (readyUrls.length === 0) {
      setError('No URLs ready for download. Fetch info first.');
      return;
    }

    if (onDownloadAll) {
      onDownloadAll(readyUrls);
    } else {
      // Default: download each URL individually
      for (const url of readyUrls) {
        if (!completedDownloads.has(url)) {
          await handleDownload(url);
          // Small delay between downloads
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  }, [urls, urlInfo, completedDownloads, handleDownload, onDownloadAll]);

  // Remove a URL from the list
  const handleRemoveUrl = useCallback((urlToRemove) => {
    setUrls(prev => prev.filter(url => url !== urlToRemove));
    setUrlInfo(prev => {
      const next = { ...prev };
      delete next[urlToRemove];
      return next;
    });
  }, []);

  // Clear all URLs
  const handleClearAll = useCallback(() => {
    setRawInput('');
    setUrls([]);
    setUrlInfo({});
    setCompletedDownloads(new Set());
    setError('');
  }, []);

  // Computed values
  const validUrlsCount = useMemo(() => {
    return urls.filter(isValidUrl).length;
  }, [urls, isValidUrl]);

  const readyUrlsCount = useMemo(() => {
    return urls.filter(url => urlInfo[url]?.success).length;
  }, [urls, urlInfo]);

  const downloadedCount = useMemo(() => {
    return completedDownloads.size;
  }, [completedDownloads]);

  return (
    <div className="bulk-url-input">
      <div className="bulk-input-header">
        <h3>Bulk URL Input</h3>
        <div className="bulk-stats">
          <span className="stat">{urls.length} URLs</span>
          <span className="stat">{validUrlsCount} valid</span>
          <span className="stat">{readyUrlsCount} ready</span>
          {downloadedCount > 0 && (
            <span className="stat success">{downloadedCount} downloaded</span>
          )}
        </div>
      </div>

      <textarea
        className="bulk-textarea"
        value={rawInput}
        onChange={handleInputChange}
        placeholder="Paste multiple URLs here (one per line)...&#10;&#10;Supported sites: YouTube, TikTok, Instagram, Twitter, Facebook, Vimeo, and 1000+ more"
        rows={6}
        disabled={loading}
      />

      {error && (
        <div className="bulk-error">
          <Warning size={18} />
          {error}
        </div>
      )}

      <div className="bulk-actions">
        <button
          className="btn btn-secondary"
          onClick={handleClearAll}
          disabled={!rawInput.trim()}
        >
          Clear All
        </button>

        <button
          className="btn btn-primary"
          onClick={handleFetchInfo}
          disabled={loading || urls.length === 0}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Fetching Info...
            </>
          ) : (
            <>
              Fetch Info
            </>
          )}
        </button>

        <button
          className="btn btn-success"
          onClick={handleDownloadAll}
          disabled={readyUrlsCount === 0 || loading}
        >
          <DownloadSimple size={18} />
          Download All ({readyUrlsCount})
        </button>
      </div>

      {/* URL List with Loading States */}
      {urls.length > 0 && (
        <div className="url-list">
          {urls.map((url, index) => {
            const info = urlInfo[url];
            const isLoading = loadingUrls.has(url);
            const isCompleted = completedDownloads.has(url);
            const isReady = info?.success;

            return (
              <div
                key={`${url}-${index}`}
                className={`url-item ${isLoading ? 'loading' : ''} ${isCompleted ? 'completed' : ''} ${!isReady && !isLoading ? 'pending' : ''}`}
              >
                {/* Thumbnail or Loading Placeholder */}
                <div className="url-thumbnail">
                  {isLoading ? (
                    <div className="thumbnail-placeholder shimmer" />
                  ) : info?.success ? (
                    <img
                      src={info.data.thumbnail || '/placeholder-thumbnail.png'}
                      alt={info.data.title}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      <Warning size={24} />
                    </div>
                  )}
                </div>

                {/* URL Info */}
                <div className="url-info">
                  {isLoading ? (
                    <>
                      <div className="skeleton-line medium" />
                      <div className="skeleton-line short" />
                    </>
                  ) : info?.success ? (
                    <>
                      <div className="url-title">{info.data.title}</div>
                      <div className="url-meta">
                        {info.data.duration && (
                          <span>{formatDuration(info.data.duration)}</span>
                        )}
                        {info.data.formats?.length > 0 && (
                          <span> • {info.data.formats[0].label}</span>
                        )}
                      </div>
                    </>
                  ) : info?.error ? (
                    <>
                      <div className="url-title error">{url}</div>
                      <div className="url-meta error">{info.error}</div>
                    </>
                  ) : (
                    <>
                      <div className="url-title">{url}</div>
                      <div className="url-meta pending">Pending...</div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="url-actions">
                  {isLoading ? (
                    <div className="spinner-small" />
                  ) : isCompleted ? (
                    <span className="downloaded-badge">
                      <Check size={18} weight="bold" />
                      Downloaded
                    </span>
                  ) : (
                    <>
                      <button
                        className="btn-icon"
                        onClick={() => handleRemoveUrl(url)}
                        title="Remove URL"
                      >
                        <X size={18} />
                      </button>
                      <button
                        className={`btn-download ${!isReady ? 'disabled' : ''}`}
                        onClick={() => handleDownload(url)}
                        disabled={!isReady}
                        title={isReady ? 'Download' : 'Fetch info first'}
                      >
                        <DownloadSimple size={18} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Helper: format duration in seconds to MM:SS or HH:MM:SS
function formatDuration(seconds) {
  if (!seconds || typeof seconds !== 'number') return '';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export default BulkUrlInput;
