// client/src/components/ScheduleManager.jsx
import React, { useState } from 'react';
import {
  Box, Button, Card, CardContent, Typography, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Alert, CircularProgress
} from '@mui/material';
import { Clock } from '@phosphor-icons/react';

const SCHEDULED_PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'linkedin'];

const platformIcons = {
  youtube: <Clock weight="fill" />, instagram: <Clock weight="fill" />,
  tiktok: <Clock weight="fill" />, facebook: <Clock weight="fill" />, linkedin: <Clock weight="fill" />
};

const platformNames = {
  youtube: 'YouTube Shorts', instagram: 'Instagram Reels',
  tiktok: 'TikTok', facebook: 'Facebook Reels', linkedin: 'LinkedIn Video'
};

const ScheduleManager = ({
  schedules, connectedPlatforms, videoPath,
  onNewSchedule, onCancelSchedule, onSuggestBestTime, postingTimes,
  scheduleData, onScheduleDataChange, selectedCaption, onCaptionChange,
  onSchedulePost
}) => {
  const [showDialog, setShowDialog] = useState(false);

  const openDialog = () => {
    if (!videoPath) {
      alert('Please process a video first');
      return;
    }
    setShowDialog(true);
  };

  const handleSchedule = () => {
    onSchedulePost(selectedCaption);
    setShowDialog(false);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">Scheduled Posts</Typography>
        <Button variant="contained" startIcon={<Clock />} onClick={openDialog}>
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
                          key={p.id} icon={platformIcons[p.id]}
                          label={platformNames[p.id]} size="small"
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
                      <Button size="small" color="error" onClick={() => onCancelSchedule(schedule.id)}>
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

      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule Post</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Select Platforms</Typography>
            <Box display="flex" gap={1} mb={3} flexWrap="wrap">
              {SCHEDULED_PLATFORMS.map((platform) => {
                const isConnected = connectedPlatforms.some(p => p.platform === platform);
                const isSelected = scheduleData.platforms.includes(platform);
                return (
                  <Chip
                    key={platform} icon={platformIcons[platform]}
                    label={platformNames[platform]}
                    onClick={() => {
                      if (isConnected) {
                        onScheduleDataChange(prev => ({
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
              fullWidth label="Scheduled Date & Time" type="datetime-local"
              value={scheduleData.scheduledAt}
              onChange={(e) => onScheduleDataChange(prev => ({ ...prev, scheduledAt: e.target.value }))}
              InputLabelProps={{ shrink: true }} sx={{ mb: 3 }}
            />

            <Button variant="outlined"
              onClick={() => onSuggestBestTime(scheduleData.platforms)}
              fullWidth sx={{ mb: 2 }}
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
                    <Button size="small"
                      onClick={() => onScheduleDataChange(prev => ({ ...prev, scheduledAt: time.time }))}
                    >
                      Use This
                    </Button>
                  </Box>
                ))}
              </Alert>
            )}

            <TextField
              fullWidth label="Caption" multiline rows={4}
              value={selectedCaption || scheduleData.caption}
              onChange={(e) => {
                onCaptionChange(e.target.value);
                onScheduleDataChange(prev => ({ ...prev, caption: e.target.value }));
              }}
              helperText="Leave empty to auto-generate from transcript"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSchedule}
            disabled={scheduleData.platforms.length === 0 || !scheduleData.scheduledAt}
          >
            Schedule Post
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ScheduleManager;
