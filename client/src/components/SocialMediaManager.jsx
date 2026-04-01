// client/src/components/SocialMediaManager.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Chip,
  Grid,
  TextField,
  MenuItem,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Divider,
  CircularProgress,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  InstagramLogo,
  TiktokLogo,
  YoutubeLogo,
  FacebookLogo,
  LinkedinLogo,
  Plus,
  Clock,
  ChartBar,
  PenNib,
  Trash,
  ArrowRight,
  Check,
  Warning
} from '@phosphor-icons/react';
import axios from 'axios';
import { getCurrentUserId } from '../utils/userUtils';

const SocialMediaManager = ({ videoPath, transcript, onClose }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [captionOptions, setCaptionOptions] = useState({
    style: 'engaging',
    tone: 'friendly',
    platform: 'multi',
    includeHashtags: true,
    includeCTA: true
  });
  const [generatedCaptions, setGeneratedCaptions] = useState(null);
  const [selectedCaption, setSelectedCaption] = useState('');
  const [scheduleData, setScheduleData] = useState({
    platforms: [],
    scheduledAt: '',
    caption: ''
  });
  const [postingTimes, setPostingTimes] = useState([]);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showCaptionDialog, setShowCaptionDialog] = useState(false);

  const userId = getCurrentUserId();

  // Platform icons mapping
  const platformIcons = {
    youtube: <YoutubeLogo weight="fill" />,
    instagram: <InstagramLogo weight="fill" />,
    tiktok: <TiktokLogo weight="fill" />,
    facebook: <FacebookLogo weight="fill" />,
    linkedin: <LinkedinLogo weight="fill" />
  };

  const platformNames = {
    youtube: 'YouTube Shorts',
    instagram: 'Instagram Reels',
    tiktok: 'TikTok',
    facebook: 'Facebook Reels',
    linkedin: 'LinkedIn Video'
  };

  // Fetch connected platforms
  useEffect(() => {
    fetchConnectedPlatforms();
  }, []);

  // Fetch schedules when tab changes
  useEffect(() => {
    if (activeTab === 1) {
      fetchSchedules();
    }
  }, [activeTab]);

  // Fetch analytics when tab changes
  useEffect(() => {
    if (activeTab === 2) {
      fetchAnalytics();
    }
  }, [activeTab]);

  // Generate caption suggestions when transcript changes
  useEffect(() => {
    if (transcript && showCaptionDialog) {
      generateCaptions();
    }
  }, [transcript, showCaptionDialog, captionOptions]);

  const fetchConnectedPlatforms = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/auth/platforms/connected?userId=${userId}`);
      if (response.data.success) {
        setConnectedPlatforms(response.data.platforms);
      }
    } catch (error) {
      console.error('Error fetching connected platforms:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectPlatform = async (platform) => {
    try {
      const response = await axios.get(`/api/auth/${platform}/connect?userId=${userId}`);
      if (response.data.success) {
        // Open OAuth URL in new window
        window.open(response.data.authUrl, '_blank');
        // Poll for connection status
        pollConnectionStatus(platform);
      }
    } catch (error) {
      console.error('Error connecting platform:', error);
    }
  };

  const pollConnectionStatus = async (platform) => {
    const maxAttempts = 20;
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const response = await axios.get(`/api/auth/platforms/connected?userId=${userId}`);
        if (response.data.success) {
          const platformData = response.data.platforms.find(p => p.platform === platform);
          if (platformData && platformData.connected) {
            fetchConnectedPlatforms();
            return;
          }
        }
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error('Error polling connection status:', error);
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        }
      }
    };

    poll();
  };

  const disconnectPlatform = async (platform) => {
    try {
      await axios.post(`/api/auth/${platform}/disconnect`, { userId });
      fetchConnectedPlatforms();
    } catch (error) {
      console.error('Error disconnecting platform:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await axios.get(`/api/scheduler/schedules?userId=${userId}`);
      if (response.data.success) {
        setSchedules(response.data.schedules);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const response = await axios.get(
        `/api/scheduler/analytics/summary?userId=${userId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      if (response.data.success) {
        setAnalytics(response.data.summary);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const generateCaptions = async () => {
    try {
      const response = await axios.post('/api/scheduler/captions/generate', {
        transcript,
        options: captionOptions
      });
      if (response.data.success) {
        setGeneratedCaptions(response.data.captions);
        if (response.data.captions.recommendedVariant) {
          setSelectedCaption(response.data.captions.recommendedVariant.text);
        }
      }
    } catch (error) {
      console.error('Error generating captions:', error);
    }
  };

  const fetchPostingTimeSuggestions = async (platforms) => {
    try {
      const response = await axios.post('/api/scheduler/suggest-time', {
        platforms,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      if (response.data.success) {
        setPostingTimes(response.data.suggestions);
      }
    } catch (error) {
      console.error('Error fetching posting times:', error);
    }
  };

  const handleSchedule = async () => {
    try {
      const scheduleData = {
        userId,
        videoPath,
        platforms: scheduleData.platforms,
        caption: selectedCaption || scheduleData.caption,
        scheduledAt: scheduleData.scheduledAt,
        options: {
          includeHashtags: captionOptions.includeHashtags,
          includeCTA: captionOptions.includeCTA
        }
      };

      const response = await axios.post('/api/scheduler/schedule', scheduleData);
      if (response.data.success) {
        alert('Post scheduled successfully!');
        setShowScheduleDialog(false);
        fetchSchedules();
      }
    } catch (error) {
      console.error('Error scheduling post:', error);
      alert('Failed to schedule post: ' + error.message);
    }
  };

  const cancelSchedule = async (scheduleId) => {
    try {
      await axios.post(`/api/scheduler/schedule/${scheduleId}/cancel`);
      fetchSchedules();
    } catch (error) {
      console.error('Error cancelling schedule:', error);
    }
  };

  const renderConnectPlatform = (platform) => {
    const isConnected = connectedPlatforms.some(p => p.platform === platform);

    return (
      <Card key={platform} sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={2}>
              <Box
                sx={{
                  fontSize: 32,
                  color: isConnected ? 'success.main' : 'text.secondary'
                }}
              >
                {platformIcons[platform]}
              </Box>
              <Box>
                <Typography variant="subtitle1">{platformNames[platform]}</Typography>
                {isConnected ? (
                  <Chip label="Connected" size="small" color="success" icon={<Check />} />
                ) : (
                  <Chip label="Not Connected" size="small" color="default" />
                )}
              </Box>
            </Box>
            {isConnected ? (
              <Button
                variant="outlined"
                color="error"
                onClick={() => disconnectPlatform(platform)}
                startIcon={<Trash />}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="contained"
                color="primary"
                onClick={() => connectPlatform(platform)}
                startIcon={<Plus />}
              >
                Connect
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  };

  const renderConnectionsTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Connect Social Media Platforms
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        Connect your social media accounts to enable posting and scheduling.
      </Typography>

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {renderConnectPlatform('youtube')}
          {renderConnectPlatform('instagram')}
          {renderConnectPlatform('tiktok')}
          {renderConnectPlatform('facebook')}
          {renderConnectPlatform('linkedin')}
        </Box>
      )}
    </Box>
  );

  const renderScheduleDialog = () => (
    <Dialog
      open={showScheduleDialog}
      onClose={() => setShowScheduleDialog(false)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Schedule Post</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Select Platforms
          </Typography>
          <Box display="flex" gap={1} mb={3} flexWrap="wrap">
            {['youtube', 'instagram', 'tiktok', 'facebook', 'linkedin'].map((platform) => {
              const isConnected = connectedPlatforms.some(p => p.platform === platform);
              const isSelected = scheduleData.platforms.includes(platform);

              return (
                <Chip
                  key={platform}
                  icon={platformIcons[platform]}
                  label={platformNames[platform]}
                  onClick={() => {
                    if (isConnected) {
                      setScheduleData(prev => ({
                        ...prev,
                        platforms: isSelected
                          ? prev.platforms.filter(p => p !== platform)
                          : [...prev.platforms, platform]
                      }));
                    }
                  }}
                  color={isSelected ? 'primary' : 'default'}
                  disabled={!isConnected}
                  sx={{ mb: 1 }}
                />
              );
            })}
          </Box>

          <TextField
            fullWidth
            label="Scheduled Date & Time"
            type="datetime-local"
            value={scheduleData.scheduledAt}
            onChange={(e) => setScheduleData(prev => ({ ...prev, scheduledAt: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 3 }}
          />

          <Button
            variant="outlined"
            onClick={() => fetchPostingTimeSuggestions(scheduleData.platforms)}
            fullWidth
            sx={{ mb: 2 }}
          >
            Suggest Best Time
          </Button>

          {postingTimes.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="subtitle2">Recommended Times:</Typography>
              {postingTimes.slice(0, 3).map((time, idx) => (
                <Box key={idx} display="flex" justifyContent="space-between" mt={1}>
                  <Typography variant="body2">
                    {platformNames[time.platform]}: {new Date(time.time).toLocaleString()}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setScheduleData(prev => ({ ...prev, scheduledAt: time.time }))}
                  >
                    Use This
                  </Button>
                </Box>
              ))}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Caption"
            multiline
            rows={4}
            value={selectedCaption || scheduleData.caption}
            onChange={(e) => {
              setSelectedCaption(e.target.value);
              setScheduleData(prev => ({ ...prev, caption: e.target.value }));
            }}
            helperText="Leave empty to auto-generate from transcript"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSchedule}
          disabled={scheduleData.platforms.length === 0 || !scheduleData.scheduledAt}
        >
          Schedule Post
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderSchedulesTab = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">Scheduled Posts</Typography>
        <Button
          variant="contained"
          startIcon={<Clock />}
          onClick={() => {
            if (!videoPath) {
              alert('Please process a video first');
              return;
            }
            setShowScheduleDialog(true);
          }}
        >
          Schedule New Post
        </Button>
      </Box>

      {schedules.length === 0 ? (
        <Alert severity="info">No scheduled posts yet. Create one to get started!</Alert>
      ) : (
        <Box>
          {schedules.map((schedule) => (
            <Card key={schedule.id} sx={{ mb: 2 }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="subtitle1">
                      {new Date(schedule.scheduledAt).toLocaleString()}
                    </Typography>
                    <Box display="flex" gap={1} mt={1}>
                      {schedule.platforms.map((p) => (
                        <Chip
                          key={p.id}
                          icon={platformIcons[p.id]}
                          label={platformNames[p.id]}
                          size="small"
                          color={p.status === 'published' ? 'success' : p.status === 'failed' ? 'error' : 'default'}
                        />
                      ))}
                    </Box>
                  </Box>
                  <Box>
                    <Chip
                      label={schedule.status}
                      color={
                        schedule.status === 'completed' ? 'success' :
                        schedule.status === 'failed' ? 'error' :
                        schedule.status === 'cancelled' ? 'default' : 'info'
                      }
                      sx={{ mr: 1 }}
                    />
                    {schedule.status === 'scheduled' && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => cancelSchedule(schedule.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {renderScheduleDialog()}
    </Box>
  );

  const renderAnalyticsTab = () => {
    if (!analytics) {
      return (
        <Box>
          <Typography variant="h6" gutterBottom>
            Analytics Dashboard
          </Typography>
          <Alert severity="info">No analytics data available yet. Posts will appear here after publishing.</Alert>
        </Box>
      );
    }

    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Analytics Dashboard
        </Typography>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  Total Posts
                </Typography>
                <Typography variant="h4">{analytics.totalPosts}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  Total Views
                </Typography>
                <Typography variant="h4">{analytics.totalViews?.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  Total Likes
                </Typography>
                <Typography variant="h4">{analytics.totalLikes?.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  Avg Engagement
                </Typography>
                <Typography variant="h4">{analytics.averageEngagementRate}%</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {analytics.topPosts && analytics.topPosts.length > 0 && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Top Performing Posts
              </Typography>
              {analytics.topPosts.map((post, idx) => (
                <Box
                  key={post.postId}
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  py={1}
                  borderBottom={idx < analytics.topPosts.length - 1 ? 1 : 0}
                  borderColor="divider"
                >
                  <Box display="flex" alignItems="center" gap={2}>
                    {platformIcons[post.platform]}
                    <Typography variant="body2">{platformNames[post.platform]}</Typography>
                  </Box>
                  <Box display="flex" gap={3}>
                    <Typography variant="body2">{post.views?.toLocaleString()} views</Typography>
                    <Typography variant="body2">{post.likes?.toLocaleString()} likes</Typography>
                    <Typography variant="body2">{post.engagementRate}% engagement</Typography>
                  </Box>
                </Box>
              ))}
            </CardContent>
          </Card>
        )}
      </Box>
    );
  };

  const renderCaptionGenerator = () => (
    <Dialog
      open={showCaptionDialog}
      onClose={() => setShowCaptionDialog(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>AI Caption Generator</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Style</InputLabel>
                <Select
                  value={captionOptions.style}
                  label="Style"
                  onChange={(e) => setCaptionOptions(prev => ({ ...prev, style: e.target.value }))}
                >
                  <MenuItem value="engaging">Engaging</MenuItem>
                  <MenuItem value="professional">Professional</MenuItem>
                  <MenuItem value="casual">Casual</MenuItem>
                  <MenuItem value="educational">Educational</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Tone</InputLabel>
                <Select
                  value={captionOptions.tone}
                  label="Tone"
                  onChange={(e) => setCaptionOptions(prev => ({ ...prev, tone: e.target.value }))}
                >
                  <MenuItem value="friendly">Friendly</MenuItem>
                  <MenuItem value="authoritative">Authoritative</MenuItem>
                  <MenuItem value="witty">Witty</MenuItem>
                  <MenuItem value="inspirational">Inspirational</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Platform</InputLabel>
                <Select
                  value={captionOptions.platform}
                  label="Platform"
                  onChange={(e) => setCaptionOptions(prev => ({ ...prev, platform: e.target.value }))}
                >
                  <MenuItem value="multi">Multi-Platform</MenuItem>
                  <MenuItem value="youtube">YouTube Shorts</MenuItem>
                  <MenuItem value="instagram">Instagram Reels</MenuItem>
                  <MenuItem value="tiktok">TikTok</MenuItem>
                  <MenuItem value="linkedin">LinkedIn</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={captionOptions.includeHashtags}
                    onChange={(e) => setCaptionOptions(prev => ({ ...prev, includeHashtags: e.target.checked }))}
                  />
                }
                label="Include Hashtags"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={captionOptions.includeCTA}
                    onChange={(e) => setCaptionOptions(prev => ({ ...prev, includeCTA: e.target.checked }))}
                  />
                }
                label="Include CTA"
              />
            </Grid>
          </Grid>

          {generatedCaptions && generatedCaptions.variants && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Generated Captions
              </Typography>
              {generatedCaptions.variants.map((variant, idx) => (
                <Card
                  key={idx}
                  sx={{
                    mb: 2,
                    cursor: 'pointer',
                    border: selectedCaption === variant.text ? 2 : 1,
                    borderColor: selectedCaption === variant.text ? 'primary.main' : 'divider'
                  }}
                  onClick={() => setSelectedCaption(variant.text)}
                >
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2" color="text.secondary">
                        {variant.characterCount} characters
                      </Typography>
                      <Chip
                        label={`Score: ${variant.estimatedEngagement.score}`}
                        color={
                          variant.estimatedEngagement.score >= 70 ? 'success' :
                          variant.estimatedEngagement.score >= 50 ? 'info' : 'default'
                        }
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2">{variant.text}</Typography>
                  </CardContent>
                </Card>
              ))}

              {generatedCaptions.hashtags && generatedCaptions.hashtags.length > 0 && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    Suggested Hashtags
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {generatedCaptions.hashtags.map((tag, idx) => (
                      <Chip key={idx} label={tag} size="small" />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowCaptionDialog(false)}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => {
            if (selectedCaption) {
              setScheduleData(prev => ({ ...prev, caption: selectedCaption }));
            }
            setShowCaptionDialog(false);
          }}
          disabled={!selectedCaption}
        >
          Use This Caption
        </Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <Box sx={{ width: '100%' }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Social Media Manager</Typography>
        {onClose && (
          <Button onClick={onClose} size="small">
            Close
          </Button>
        )}
      </Box>

      <Tabs value={activeTab} onChange={(e, val) => setActiveTab(val)} sx={{ mb: 3 }}>
        <Tab icon={<PenNib />} label="Connect" iconPosition="start" />
        <Tab icon={<Clock />} label="Schedule" iconPosition="start" />
        <Tab icon={<ChartBar />} label="Analytics" iconPosition="start" />
        <Tab icon={<PenNib />} label="Captions" iconPosition="start" onClick={() => {
          if (!transcript) {
            alert('No transcript available. Please process a video with Q&A detection first.');
          } else {
            setShowCaptionDialog(true);
          }
        }} />
      </Tabs>

      {activeTab === 0 && renderConnectionsTab()}
      {activeTab === 1 && renderSchedulesTab()}
      {activeTab === 2 && renderAnalyticsTab()}
      {activeTab === 3 && transcript && (() => {
        setShowCaptionDialog(true);
        return null;
      })()}

      {renderCaptionGenerator()}
    </Box>
  );
};

export default SocialMediaManager;
