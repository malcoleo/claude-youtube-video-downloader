// client/src/utils/userUtils.js
// Simple utility functions for handling user identification in a demo environment
// In a real application, these would integrate with an authentication system

// Generate or retrieve a consistent user ID for the current browser session
export const getCurrentUserId = () => {
  // Try to get existing user ID from localStorage
  let userId = localStorage.getItem('userId');

  if (!userId) {
    // Generate a new user ID and store it
    userId = 'demo-user-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('userId', userId);
  }

  return userId;
};

// Get user preferences (would normally come from server in a real app)
export const getUserPreferences = () => {
  const preferences = localStorage.getItem('userPreferences');
  return preferences ? JSON.parse(preferences) : {};
};

// Save user preferences (would normally go to server in a real app)
export const saveUserPreferences = (preferences) => {
  localStorage.setItem('userPreferences', JSON.stringify(preferences));
};

// Get user presets (would normally come from server in a real app)
export const getUserPresets = (userId) => {
  const presets = localStorage.getItem(`userPresets-${userId}`);
  return presets ? JSON.parse(presets) : {};
};

// Save user presets (would normally go to server in a real app)
export const saveUserPresets = (userId, presets) => {
  localStorage.setItem(`userPresets-${userId}`, JSON.stringify(presets));
};

// Get user history (would normally come from server in a real app)
export const getUserHistory = (userId) => {
  const history = localStorage.getItem(`userHistory-${userId}`);
  return history ? JSON.parse(history) : [];
};

// Save user history (would normally go to server in a real app)
export const saveUserHistory = (userId, history) => {
  localStorage.setItem(`userHistory-${userId}`, JSON.stringify(history));
};