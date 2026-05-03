// client/src/components/ConnectedPlatforms.jsx
import React from 'react';
import {
  Box, Button, Card, CardContent, Typography, Chip, CircularProgress
} from '@mui/material';
import {
  InstagramLogo, TiktokLogo, YoutubeLogo, FacebookLogo, LinkedinLogo,
  Plus, Check, Trash
} from '@phosphor-icons/react';

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

const ConnectedPlatforms = ({ connectedPlatforms, loading, onConnect, onDisconnect }) => {
  const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'linkedin'];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Connect Social Media Platforms
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        Connect your social media accounts to enable posting and scheduling.
      </Typography>
      {PLATFORMS.map((platform) => {
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
                    variant="outlined" color="error"
                    onClick={() => onDisconnect(platform)}
                    startIcon={<Trash />}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="contained" color="primary"
                    onClick={() => onConnect(platform)}
                    startIcon={<Plus />}
                  >
                    Connect
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
};

export default ConnectedPlatforms;
