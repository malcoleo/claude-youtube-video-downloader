// client/src/components/VideoEditor.jsx
import React, { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { Slider, Button, Box, Typography, Grid, Card, CardContent, Tabs, Tab, Chip } from '@mui/material';
import axios from 'axios';
import SocialSharing from './SocialSharing';
import './VideoEditor.css';

const VideoEditor = ({ videoData, onDownload, selectedPlatform }) => {
  const playerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [progress, setProgress] = useState({ played: 0, playedSeconds: 0 });
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(15); // Default to 15 seconds
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [suggestedSegments, setSuggestedSegments] = useState([]);
  const [showSocialShare, setShowSocialShare] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);

  // Update end time when video duration is known
  useEffect(() => {
    if (videoData?.videoInfo?.duration) {
      setTotalDuration(videoData.videoInfo.duration);
      setEndTime(Math.min(15, videoData.videoInfo.duration));
    }
  }, [videoData]);

  // Fetch suggested segments when component mounts
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!videoData?.videoUrl) return;

      try {
        const response = await axios.post('/api/highlights/suggest-segments-from-path', {
          videoPath: videoData.videoUrl,
          numSegments: 5
        });

        if (response.data.success && response.data.segments) {
          setSuggestedSegments(response.data.segments);
        }
      } catch (error) {
        console.error('Error fetching suggested segments:', error);
        // Fallback: create some demo segments
        setSuggestedSegments([
          { start: 5, end: 15, duration: 10, priority: 95, reasons: ['audio', 'motion'] },
          { start: 25, end: 35, duration: 10, priority: 87, reasons: ['scene'] },
          { start: 45, end: 55, duration: 10, priority: 82, reasons: ['audio'] }
        ]);
      }
    };

    fetchSuggestions();
  }, [videoData]);

  // Handle video duration
  const handleDuration = (duration) => {
    setTotalDuration(duration);
    setVideoReady(true);
    if (endTime > duration) {
      setEndTime(duration);
    }
  };

  // Handle video progress
  const handleProgress = (state) => {
    setProgress(state);
  };

  // Handle video errors
  const handleError = (error) => {
    console.error('Video player error:', error);
    setVideoReady(false);
  };

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Handle segment selection
  const handleSelectSegment = (segment) => {
    setStartTime(Math.max(0, segment.start));
    setEndTime(Math.min(totalDuration, segment.end));

    // Seek to the start of the segment
    if (playerRef.current) {
      playerRef.current.seekTo(segment.start, 'seconds');
    }
    setPlaying(true);
  };

  // Handle start time change
  const handleStartTimeChange = (event, newValue) => {
    if (newValue < endTime - 3) { // Minimum 3 seconds duration
      setStartTime(newValue);
    }
  };

  // Handle end time change
  const handleEndTimeChange = (event, newValue) => {
    if (newValue > startTime + 3) { // Minimum 3 seconds duration
      setEndTime(newValue);
    }
  };

  // Handle trim and process
  const handleTrimAndProcess = async () => {
    if (!videoData?.originalUrl) return;

    setProcessing(true);

    try {
      const response = await axios.post('/api/youtube/download', {
        youtubeUrl: videoData.originalUrl,
        start: startTime,
        end: endTime,
        platform: selectedPlatform
      });

      if (response.data.success) {
        videoData.videoUrl = response.data.videoPath;
        videoData.thumbnailUrl = response.data.thumbnailPath;
        videoData.videoInfo = response.data.videoInfo;
        setEndTime(response.data.videoInfo.duration);
        setTotalDuration(response.data.videoInfo.duration);
      }
    } catch (error) {
      console.error('Error trimming video:', error);
      alert('Failed to process video: ' + (error.response?.data?.error || error.message));
    }

    setProcessing(false);
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    if (priority >= 80) return '#4caf50'; // Green
    if (priority >= 60) return '#ff9800'; // Orange
    return '#f44336'; // Red
  };

  // Get reason icon
  const getReasonIcon = (reason) => {
    switch (reason) {
      case 'audio': return '🔊';
      case 'motion': return '🎬';
      case 'scene': return '🎞️';
      default: return '⭐';
    }
  };

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 0: // Timeline Editor
        return (
          <div className="timeline-editor">
            <div className="video-controls">
              <Button
                variant="contained"
                onClick={() => setPlaying(!playing)}
                color={playing ? 'secondary' : 'primary'}
              >
                {playing ? 'Pause' : 'Play'}
              </Button>

              <div className="slider-container">
                <Typography variant="body2">Volume</Typography>
                <Slider
                  value={volume}
                  onChange={(e, newValue) => setVolume(newValue)}
                  min={0}
                  max={1}
                  step={0.01}
                  aria-labelledby="volume-slider"
                />
              </div>

              <div className="slider-container">
                <Typography variant="body2">Speed</Typography>
                <Slider
                  value={playbackRate}
                  onChange={(e, newValue) => setPlaybackRate(newValue)}
                  min={0.25}
                  max={2}
                  step={0.25}
                  marks={[
                    { value: 0.25, label: '0.25x' },
                    { value: 0.5, label: '0.5x' },
                    { value: 1, label: '1x' },
                    { value: 1.25, label: '1.25x' },
                    { value: 1.5, label: '1.5x' },
                    { value: 2, label: '2x' }
                  ]}
                  aria-labelledby="speed-slider"
                />
              </div>
            </div>

            <div className="video-player-container">
              {videoData?.videoUrl ? (
                <ReactPlayer
                  ref={playerRef}
                  url={videoData.videoUrl}
                  playing={playing}
                  volume={volume}
                  playbackRate={playbackRate}
                  onProgress={handleProgress}
                  onDuration={handleDuration}
                  onError={handleError}
                  onEnded={() => setPlaying(false)}
                  width="100%"
                  height="auto"
                  controls={true}
                  config={{
                    file: {
                      attributes: {
                        controlsList: 'nodownload'
                      }
                    }
                  }}
                />
              ) : (
                <div className="no-video">No video loaded</div>
              )}
            </div>

            <div className="time-display">
              <Typography variant="body2">
                {formatTime(progress.playedSeconds)} / {formatTime(totalDuration)}
                {videoReady && <Chip label="Video Ready" size="small" color="success" style={{ marginLeft: 10 }} />}
              </Typography>
            </div>

            <div className="trim-controls">
              <div className="trim-control">
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" fontWeight="bold">Start Time: {formatTime(startTime)}</Typography>
                  <Typography variant="body2" color="textSecondary">Duration: {formatTime(endTime - startTime)}</Typography>
                </Box>
                <Slider
                  value={startTime}
                  onChange={handleStartTimeChange}
                  min={0}
                  max={Math.min(endTime - 3, totalDuration || 60)}
                  step={0.1}
                  aria-labelledby="start-time-slider"
                />
              </div>

              <div className="trim-control">
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" fontWeight="bold">End Time: {formatTime(endTime)}</Typography>
                  <Typography variant="body2" color="textSecondary">Clip Length: {formatTime(endTime - startTime)}</Typography>
                </Box>
                <Slider
                  value={endTime}
                  onChange={handleEndTimeChange}
                  min={Math.max(startTime + 3, 0)}
                  max={totalDuration || 60}
                  step={0.1}
                  aria-labelledby="end-time-slider"
                />
              </div>

              {/* Timeline visualization */}
              <div className="timeline-visualization">
                <div className="timeline-bar">
                  <div className="timeline-total" style={{ width: '100%' }}>
                    {suggestedSegments.map((segment, idx) => (
                      <div
                        key={idx}
                        className="timeline-segment"
                        style={{
                          left: `${(segment.start / (totalDuration || 60)) * 100}%`,
                          width: `${((segment.end - segment.start) / (totalDuration || 60)) * 100}%`,
                          backgroundColor: getPriorityColor(segment.priority)
                        }}
                        title={`Segment ${idx + 1}: ${formatTime(segment.start)} - ${formatTime(segment.end)}`}
                        onClick={() => handleSelectSegment(segment)}
                      />
                    ))}
                  </div>
                  <div
                    className="timeline-selection"
                    style={{
                      left: `${(startTime / (totalDuration || 60)) * 100}%`,
                      width: `${((endTime - startTime) / (totalDuration || 60)) * 100}%`
                    }}
                  />
                </div>
                <div className="timeline-labels">
                  <span>0:00</span>
                  <span>{formatTime(totalDuration / 2)}</span>
                  <span>{formatTime(totalDuration)}</span>
                </div>
              </div>
            </div>

            <div className="editor-actions">
              <Button
                variant="contained"
                color="primary"
                onClick={handleTrimAndProcess}
                disabled={processing || !videoReady}
              >
                {processing ? 'Processing...' : 'Apply Trim & Effects'}
              </Button>
              <Button
                variant="outlined"
                onClick={() => onDownload(videoData.videoUrl)}
                disabled={!videoReady}
              >
                Download Video
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setShowSocialShare(true)}
                disabled={!videoReady}
              >
                Share to Social Media
              </Button>
            </div>
          </div>
        );

      case 1: // Suggested Segments
        return (
          <div className="suggested-segments">
            <Typography variant="h6" gutterBottom>
              AI-Suggested Highlights
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Click on any clip to preview it in the timeline editor
            </Typography>

            {suggestedSegments.length > 0 ? (
              <Grid container spacing={2}>
                {suggestedSegments.map((segment, index) => (
                  <Grid item xs={12} sm={6} md={4} key={index}>
                    <Card
                      className="segment-card"
                      onClick={() => handleSelectSegment(segment)}
                    >
                      <CardContent>
                        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                          <Typography variant="h6" component="span">
                            {getReasonIcon(segment.reasons?.[0])} Clip {index + 1}
                          </Typography>
                          <Chip
                            label={`Priority: ${segment.priority}`}
                            size="small"
                            style={{
                              backgroundColor: getPriorityColor(segment.priority),
                              color: 'white',
                              fontSize: '0.75rem'
                            }}
                          />
                        </Box>

                        <div className="segment-preview">
                          <Typography variant="body2" color="textSecondary">
                            <strong>Duration:</strong> {formatTime(segment.start)} - {formatTime(segment.end)}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            <strong>Length:</strong> {formatTime(segment.duration || (segment.end - segment.start))}
                          </Typography>
                        </div>

                        <Box mt={1}>
                          {segment.reasons?.map((reason, idx) => (
                            <Chip
                              key={idx}
                              label={`${getReasonIcon(reason)} ${reason}`}
                              size="small"
                              style={{ marginRight: 4, marginBottom: 4 }}
                            />
                          ))}
                        </Box>

                        <Button
                          variant="outlined"
                          size="small"
                          style={{ marginTop: 8 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectSegment(segment);
                          }}
                        >
                          ▶ Preview Clip
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Box textAlign="center" py={4}>
                <Typography variant="body1">Analyzing video for highlights...</Typography>
                <Typography variant="body2" color="textSecondary">
                  Our AI is detecting audio patterns, motion, and scene changes
                </Typography>
              </Box>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="video-editor">
      <Typography variant="h4" gutterBottom>
        Video Editor
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          aria-label="video editor tabs"
        >
          <Tab label="Timeline Editor" />
          <Tab label={`AI Suggestions (${suggestedSegments.length})`} />
        </Tabs>
      </Box>

      <div className="tab-content">
        {renderTabContent()}
      </div>

      {showSocialShare && (
        <div className="modal-overlay" onClick={() => setShowSocialShare(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <SocialSharing
              videoUrl={videoData.videoUrl}
              onClose={() => setShowSocialShare(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoEditor;