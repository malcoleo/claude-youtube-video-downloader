// client/src/components/SocialMediaManager.jsx
import React from 'react';
import {
  Box, Button, Card, CardContent, Typography, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, FormControl, InputLabel, Select, MenuItem,
  FormControlLabel, Switch, Tabs, Tab
} from '@mui/material';
import { Clock, ChartBar, PenNib } from '@phosphor-icons/react';
import axios from 'axios';
import { useSocialMedia } from '../hooks/useSocialMedia';
import ConnectedPlatforms from './ConnectedPlatforms';
import ScheduleManager from './ScheduleManager';
import AnalyticsDashboard from './AnalyticsDashboard';

const SocialMediaManager = ({ videoPath, transcript, onClose }) => {
  const { state: s, handlers: h } = useSocialMedia(videoPath, transcript);

  const generateCaptions = async () => {
    try {
      const response = await axios.post('/api/scheduler/captions/generate', {
        transcript, options: s.captionOptions
      });
      if (response.data.success) {
        h.setGeneratedCaptions(response.data.captions);
        if (response.data.captions.recommendedVariant) {
          h.setSelectedCaption(response.data.captions.recommendedVariant.text);
        }
      }
    } catch (error) { console.error('Error generating captions:', error); }
  };

  const renderCaptionGenerator = () => (
    <Dialog open={s.showCaptionDialog} onClose={() => h.setShowCaptionDialog(false)} maxWidth="md" fullWidth>
      <DialogTitle>AI Caption Generator</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Style</InputLabel>
                <Select value={s.captionOptions.style} label="Style"
                  onChange={(e) => h.setCaptionOptions(prev => ({ ...prev, style: e.target.value }))}
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
                <Select value={s.captionOptions.tone} label="Tone"
                  onChange={(e) => h.setCaptionOptions(prev => ({ ...prev, tone: e.target.value }))}
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
                <Select value={s.captionOptions.platform} label="Platform"
                  onChange={(e) => h.setCaptionOptions(prev => ({ ...prev, platform: e.target.value }))}
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
                control={<Switch checked={s.captionOptions.includeHashtags}
                  onChange={(e) => h.setCaptionOptions(prev => ({ ...prev, includeHashtags: e.target.checked }))} />}
                label="Include Hashtags"
              />
              <FormControlLabel
                control={<Switch checked={s.captionOptions.includeCTA}
                  onChange={(e) => h.setCaptionOptions(prev => ({ ...prev, includeCTA: e.target.checked }))} />}
                label="Include CTA"
              />
            </Grid>
          </Grid>

          {s.generatedCaptions && s.generatedCaptions.variants && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" gutterBottom>Generated Captions</Typography>
              {s.generatedCaptions.variants.map((variant, idx) => (
                <Card key={idx} sx={{
                    mb: 2, cursor: 'pointer',
                    border: s.selectedCaption === variant.text ? 2 : 1,
                    borderColor: s.selectedCaption === variant.text ? 'primary.main' : 'divider'
                  }}
                  onClick={() => h.setSelectedCaption(variant.text)}
                >
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2" color="text.secondary">
                        {variant.characterCount} characters
                      </Typography>
                      <Chip label={`Score: ${variant.estimatedEngagement.score}`}
                        color={variant.estimatedEngagement.score >= 70 ? 'success' :
                          variant.estimatedEngagement.score >= 50 ? 'info' : 'default'}
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2">{variant.text}</Typography>
                  </CardContent>
                </Card>
              ))}

              {s.generatedCaptions.hashtags && s.generatedCaptions.hashtags.length > 0 && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>Suggested Hashtags</Typography>
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {s.generatedCaptions.hashtags.map((tag, idx) => (
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
        <Button onClick={() => h.setShowCaptionDialog(false)}>Cancel</Button>
        <Button variant="contained" onClick={() => {
            if (s.selectedCaption) {
              h.setScheduleData(prev => ({ ...prev, caption: s.selectedCaption }));
            }
            h.setShowCaptionDialog(false);
          }}
          disabled={!s.selectedCaption}
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
        {onClose && <Button onClick={onClose} size="small">Close</Button>}
      </Box>

      <Tabs value={s.activeTab} onChange={(e, val) => h.setActiveTab(val)} sx={{ mb: 3 }}>
        <Tab icon={<PenNib />} label="Connect" iconPosition="start" />
        <Tab icon={<Clock />} label="Schedule" iconPosition="start" />
        <Tab icon={<ChartBar />} label="Analytics" iconPosition="start" />
        <Tab icon={<PenNib />} label="Captions" iconPosition="start" onClick={() => {
            if (!transcript) {
              alert('No transcript available. Please process a video with Q&A detection first.');
            } else {
              h.setShowCaptionDialog(true);
            }
          }} />
      </Tabs>

      {s.activeTab === 0 && (
        <ConnectedPlatforms
          connectedPlatforms={s.connectedPlatforms}
          loading={s.loading}
          onConnect={h.connectPlatform}
          onDisconnect={h.disconnectPlatform}
        />
      )}
      {s.activeTab === 1 && (
        <ScheduleManager
          schedules={s.schedules}
          connectedPlatforms={s.connectedPlatforms}
          videoPath={videoPath}
          onNewSchedule={() => h.setShowScheduleDialog(true)}
          onCancelSchedule={h.cancelSchedule}
          onSuggestBestTime={h.fetchPostingTimeSuggestions}
          postingTimes={s.postingTimes}
          scheduleData={s.scheduleData}
          onScheduleDataChange={h.setScheduleData}
          selectedCaption={s.selectedCaption}
          onCaptionChange={h.setSelectedCaption}
          onSchedulePost={h.handleSchedule}
        />
      )}
      {s.activeTab === 2 && <AnalyticsDashboard analytics={s.analytics} />}

      {renderCaptionGenerator()}
    </Box>
  );
};

export default SocialMediaManager;
