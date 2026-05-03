// client/src/hooks/useSocialMedia.js
import { useState, useEffect } from 'react';
import axios from 'axios';
import { getCurrentUserId } from '../utils/userUtils';

export function useSocialMedia(videoPath, transcript) {
  const [activeTab, setActiveTab] = useState(0);
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [captionOptions, setCaptionOptions] = useState({
    style: 'engaging', tone: 'friendly', platform: 'multi',
    includeHashtags: true, includeCTA: true
  });
  const [generatedCaptions, setGeneratedCaptions] = useState(null);
  const [selectedCaption, setSelectedCaption] = useState('');
  const [scheduleData, setScheduleData] = useState({
    platforms: [], scheduledAt: '', caption: ''
  });
  const [postingTimes, setPostingTimes] = useState([]);
  const [showCaptionDialog, setShowCaptionDialog] = useState(false);

  const userId = getCurrentUserId();

  useEffect(() => { fetchConnectedPlatforms(); }, []);

  useEffect(() => {
    if (activeTab === 1) fetchSchedules();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 2) fetchAnalytics();
  }, [activeTab]);

  useEffect(() => {
    if (transcript && showCaptionDialog) generateCaptions();
  }, [transcript, showCaptionDialog, captionOptions]);

  const fetchConnectedPlatforms = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/auth/platforms/connected?userId=${userId}`);
      if (response.data.success) setConnectedPlatforms(response.data.platforms);
    } catch (error) { console.error('Error fetching connected platforms:', error); }
    finally { setLoading(false); }
  };

  const connectPlatform = async (platform) => {
    try {
      const response = await axios.get(`/api/auth/${platform}/connect?userId=${userId}`);
      if (response.data.success) {
        window.open(response.data.authUrl, '_blank');
        pollConnectionStatus(platform);
      }
    } catch (error) { console.error('Error connecting platform:', error); }
  };

  const pollConnectionStatus = async (platform) => {
    let attempts = 0;
    const maxAttempts = 20;
    const poll = async () => {
      attempts++;
      try {
        const response = await axios.get(`/api/auth/platforms/connected?userId=${userId}`);
        if (response.data.success) {
          const platformData = response.data.platforms.find(p => p.platform === platform);
          if (platformData && platformData.connected) { fetchConnectedPlatforms(); return; }
        }
        if (attempts < maxAttempts) setTimeout(poll, 2000);
      } catch (error) {
        console.error('Error polling connection status:', error);
        if (attempts < maxAttempts) setTimeout(poll, 2000);
      }
    };
    poll();
  };

  const disconnectPlatform = async (platform) => {
    try {
      await axios.post(`/api/auth/${platform}/disconnect`, { userId });
      fetchConnectedPlatforms();
    } catch (error) { console.error('Error disconnecting platform:', error); }
  };

  const fetchSchedules = async () => {
    try {
      const response = await axios.get(`/api/scheduler/schedules?userId=${userId}`);
      if (response.data.success) setSchedules(response.data.schedules);
    } catch (error) { console.error('Error fetching schedules:', error); }
  };

  const fetchAnalytics = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const response = await axios.get(
        `/api/scheduler/analytics/summary?userId=${userId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      if (response.data.success) setAnalytics(response.data.summary);
    } catch (error) { console.error('Error fetching analytics:', error); }
  };

  const generateCaptions = async () => {
    try {
      const response = await axios.post('/api/scheduler/captions/generate', {
        transcript, options: captionOptions
      });
      if (response.data.success) {
        setGeneratedCaptions(response.data.captions);
        if (response.data.captions.recommendedVariant) {
          setSelectedCaption(response.data.captions.recommendedVariant.text);
        }
      }
    } catch (error) { console.error('Error generating captions:', error); }
  };

  const fetchPostingTimeSuggestions = async (platforms) => {
    try {
      const response = await axios.post('/api/scheduler/suggest-time', {
        platforms, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      if (response.data.success) setPostingTimes(response.data.suggestions);
    } catch (error) { console.error('Error fetching posting times:', error); }
  };

  const handleSchedule = async () => {
    try {
      const data = {
        userId, videoPath,
        platforms: scheduleData.platforms,
        caption: selectedCaption || scheduleData.caption,
        scheduledAt: scheduleData.scheduledAt,
        options: {
          includeHashtags: captionOptions.includeHashtags,
          includeCTA: captionOptions.includeCTA
        }
      };
      const response = await axios.post('/api/scheduler/schedule', data);
      if (response.data.success) {
        alert('Post scheduled successfully!');
        setShowCaptionDialog(false);
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
    } catch (error) { console.error('Error cancelling schedule:', error); }
  };

  return {
    state: {
      activeTab, connectedPlatforms, loading, schedules, analytics,
      captionOptions, generatedCaptions, selectedCaption,
      scheduleData, postingTimes, showCaptionDialog
    },
    handlers: {
      setActiveTab,
      setCaptionOptions,
      setSelectedCaption,
      setGeneratedCaptions,
      setScheduleData,
      setShowCaptionDialog,
      connectPlatform, disconnectPlatform,
      fetchSchedules,
      generateCaptions,
      fetchPostingTimeSuggestions,
      handleSchedule,
      cancelSchedule
    }
  };
}
