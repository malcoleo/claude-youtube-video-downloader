// client/src/hooks/useDownloadWorkflow.js
import { useState, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export default function useDownloadWorkflow() {
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');
  const [discoveredVideos, setDiscoveredVideos] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [jobId, setJobId] = useState(null);

  const clearState = useCallback(() => {
    setVideoInfo(null);
    setSource(null);
    setError('');
    setDiscoveredVideos(null);
    setProgress(null);
    setDownloadComplete(false);
    setJobId(null);
  }, []);

  const fetchVideoInfo = useCallback(async (url) => {
    setLoading(true);
    setError('');
    setVideoInfo(null);
    setSource(null);
    setDiscoveredVideos(null);

    try {
      const res = await fetch(`${API_BASE}/api/media/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        const data = await res.json();
        // If info fails, try discovery as fallback
        if (res.status === 400 && data.error) {
          await discoverVideos(url);
          return;
        }
        throw new Error(data.error || 'Failed to get video info');
      }

      const data = await res.json();
      setVideoInfo(data);
      setSource(data.source || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const discoverVideos = useCallback(async (url) => {
    setLoading(true);
    setError('');
    setDiscoveredVideos(null);

    try {
      const res = await fetch(`${API_BASE}/api/media/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to discover videos');
      }

      const data = await res.json();
      setDiscoveredVideos(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectDiscoveredVideo = useCallback(async (video) => {
    await fetchVideoInfo(video.url);
  }, [fetchVideoInfo]);

  const startDownload = useCallback(async (url, formatId, outputFormat = 'mp4') => {
    setDownloading(true);
    setProgress(null);
    setDownloadComplete(false);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/media/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format: 'video', formatId, outputFormat })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start download');
      }

      const data = await res.json();
      const id = data.jobId;
      setJobId(id);

      // Poll job status
      pollJobStatus(id);
    } catch (err) {
      setError(err.message);
      setDownloading(false);
    }
  }, []);

  const pollJobStatus = useCallback(async (id) => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/media/status/${id}`);
        if (!res.ok) {
          throw new Error('Failed to get job status');
        }

        const data = await res.json();

        if (data.error && data.error !== 'Job not found') {
          setError(data.error);
          setDownloading(false);
          return;
        }

        setProgress({
          status: data.status,
          percent: data.progress,
          eta: data.eta,
          speed: data.speed,
          filename: data.filename
        });

        if (data.status === 'done') {
          setDownloading(false);
          setDownloadComplete(true);
        } else if (data.status === 'error') {
          setError(data.error || 'Download failed');
          setDownloading(false);
        } else {
          // Continue polling
          setTimeout(poll, 1000);
        }
      } catch (err) {
        setError(err.message);
        setDownloading(false);
      }
    };

    poll();
  }, []);

  return {
    loading,
    videoInfo,
    source,
    error,
    discoveredVideos,
    downloading,
    progress,
    downloadComplete,
    jobId,
    fetchVideoInfo,
    discoverVideos,
    selectDiscoveredVideo,
    startDownload,
    clearState
  };
}
