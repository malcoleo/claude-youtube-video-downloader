// client/src/components/AnalyticsDashboard.jsx
import React from 'react';
import { Box, Card, CardContent, Typography, Grid, Alert } from '@mui/material';
import {
  InstagramLogo, TiktokLogo, YoutubeLogo, FacebookLogo, LinkedinLogo
} from '@phosphor-icons/react';

const platformIcons = {
  youtube: <YoutubeLogo weight="fill" />, instagram: <InstagramLogo weight="fill" />,
  tiktok: <TiktokLogo weight="fill" />, facebook: <FacebookLogo weight="fill" />, linkedin: <LinkedinLogo weight="fill" />
};

const platformNames = {
  youtube: 'YouTube Shorts', instagram: 'Instagram Reels',
  tiktok: 'TikTok', facebook: 'Facebook Reels', linkedin: 'LinkedIn Video'
};

const AnalyticsDashboard = ({ analytics }) => {
  if (!analytics) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>Analytics Dashboard</Typography>
        <Alert severity="info">No analytics data available yet. Posts will appear here after publishing.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Analytics Dashboard</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Total Posts</Typography>
              <Typography variant="h4">{analytics.totalPosts}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Total Views</Typography>
              <Typography variant="h4">{analytics.totalViews?.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Total Likes</Typography>
              <Typography variant="h4">{analytics.totalLikes?.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Avg Engagement</Typography>
              <Typography variant="h4">{analytics.averageEngagementRate}%</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {analytics.topPosts && analytics.topPosts.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Top Performing Posts</Typography>
            {analytics.topPosts.map((post, idx) => (
              <Box
                key={post.postId}
                display="flex" justifyContent="space-between" alignItems="center"
                py={1} borderBottom={idx < analytics.topPosts.length - 1 ? 1 : 0}
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

export default AnalyticsDashboard;
