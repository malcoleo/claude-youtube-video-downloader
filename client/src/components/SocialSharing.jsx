// client/src/components/SocialSharing.jsx
import React, { useState, useEffect } from 'react';
import { Button, Checkbox, FormControlLabel, FormGroup, TextField, Typography, Box, Chip, Alert } from '@mui/material';
import { CheckCircle, XCircle } from '@phosphor-icons/react';
import axios from 'axios';

const SocialSharing = ({ videoUrl, onClose }) => {
  const [supportedPlatforms, setSupportedPlatforms] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState({});
  const [caption, setCaption] = useState('Check out this amazing short!');
  const [posting, setPosting] = useState(false);
  const [postResults, setPostResults] = useState(null);
  const [validationResults, setValidationResults] = useState({});
  const [accessToken, setAccessToken] = useState('');

  // Fetch supported platforms
  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const response = await axios.get('/api/social/platforms');
        if (response.data.success) {
          setSupportedPlatforms(response.data.platforms);

          // Initialize selected platforms to false
          const initialSelection = {};
          response.data.platforms.forEach(platform => {
            initialSelection[platform.id] = false;
          });
          setSelectedPlatforms(initialSelection);
        }
      } catch (error) {
        console.error('Error fetching platforms:', error);
      }
    };

    fetchPlatforms();
  }, []);

  // Validate video for each platform
  useEffect(() => {
    const validateVideo = async () => {
      if (!videoUrl || supportedPlatforms.length === 0) return;

      const results = {};

      for (const platform of supportedPlatforms) {
        try {
          const response = await axios.post('/api/social/validate', {
            videoPath: videoUrl,
            platformId: platform.id
          });

          if (response.data.success) {
            results[platform.id] = response.data;
          } else {
            results[platform.id] = { isValid: false, errors: [response.data.error] };
          }
        } catch (error) {
          results[platform.id] = { isValid: false, errors: [error.message] };
        }
      }

      setValidationResults(results);
    };

    validateVideo();
  }, [videoUrl, supportedPlatforms]);

  // Toggle platform selection
  const togglePlatform = (platformId) => {
    setSelectedPlatforms(prev => ({
      ...prev,
      [platformId]: !prev[platformId]
    }));
  };

  // Handle posting to social media
  const handlePost = async () => {
    if (!videoUrl) {
      alert('No video to post');
      return;
    }

    const selected = Object.keys(selectedPlatforms).filter(id => selectedPlatforms[id]);
    if (selected.length === 0) {
      alert('Please select at least one platform');
      return;
    }

    setPosting(true);
    setPostResults(null);

    try {
      const response = await axios.post('/api/social/batch-post', {
        platforms: selected,
        videoPath: videoUrl,
        caption,
        accessToken
      });

      if (response.data.success) {
        setPostResults(response.data.results);
      } else {
        setPostResults([{ success: false, error: response.data.error }]);
      }
    } catch (error) {
      setPostResults([{ success: false, error: error.message }]);
    }

    setPosting(false);
  };

  // Check if all selected platforms are valid
  const allSelectedValid = () => {
    const selected = Object.keys(selectedPlatforms).filter(id => selectedPlatforms[id]);
    return selected.every(platformId => validationResults[platformId]?.isValid);
  };

  return (
    <div className="social-sharing">
      <Typography variant="h5" gutterBottom>
        Share to Social Media
      </Typography>

      <TextField
        fullWidth
        label="Caption"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        margin="normal"
        multiline
        rows={3}
      />

      <TextField
        fullWidth
        label="Access Token (Optional)"
        value={accessToken}
        onChange={(e) => setAccessToken(e.target.value)}
        margin="normal"
        helperText="Required for posting to social media (not stored on our servers)"
      />

      <Typography variant="h6" gutterBottom style={{ marginTop: '20px' }}>
        Select Platforms
      </Typography>

      <FormGroup>
        {supportedPlatforms.map((platform) => {
          const validationResult = validationResults[platform.id] || {};
          const isSelected = selectedPlatforms[platform.id] || false;

          return (
            <Box key={platform.id} mb={2} p={2} border={1} borderRadius={2} borderColor="grey.300">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isSelected}
                    onChange={() => togglePlatform(platform.id)}
                  />
                }
                label={
                  <div>
                    <Typography variant="subtitle1" component="span">
                      {platform.name}
                    </Typography>
                    {validationResult.isValid ? (
                      <Chip icon={<CheckCircle weight="fill" />} label="Valid" size="small" color="success" style={{ marginLeft: 10 }} />
                    ) : (
                      <Chip icon={<XCircle weight="fill" />} label="Invalid" size="small" color="error" style={{ marginLeft: 10 }} />
                    )}
                  </div>
                }
              />

              {validationResult.errors && validationResult.errors.length > 0 && (
                <Alert severity="warning" style={{ marginTop: 10 }}>
                  {validationResult.errors.map((error, idx) => (
                    <div key={idx}>{error}</div>
                  ))}
                </Alert>
              )}

              {!validationResult.isValid && (
                <Typography variant="body2" color="textSecondary" style={{ marginTop: 5 }}>
                  Requirements: Max {platform.maxDuration}s, Max {(platform.maxFileSize / 1024 / 1024).toFixed(0)}MB,
                  Aspect ratios: {platform.aspectRatios.join(', ')}
                </Typography>
              )}
            </Box>
          );
        })}
      </FormGroup>

      <Box mt={3}>
        <Button
          variant="contained"
          color="primary"
          onClick={handlePost}
          disabled={posting || !allSelectedValid()}
          size="large"
        >
          {posting ? 'Posting...' : 'Post to Selected Platforms'}
        </Button>

        <Button
          variant="outlined"
          onClick={onClose}
          style={{ marginLeft: 10 }}
        >
          Cancel
        </Button>
      </Box>

      {postResults && (
        <Box mt={3}>
          <Typography variant="h6">Post Results:</Typography>
          {postResults.map((result, index) => (
            <Alert
              key={index}
              severity={result.success ? 'success' : 'error'}
              style={{ marginTop: 10 }}
            >
              <strong>{result.platform || 'Result'}:</strong> {result.message || result.error}
              {result.url && <div><a href={result.url} target="_blank" rel="noopener noreferrer">View Post</a></div>}
            </Alert>
          ))}
        </Box>
      )}
    </div>
  );
};

export default SocialSharing;