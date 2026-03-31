// server/api/presets.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Directory for storing presets
const DATA_DIR = path.join(__dirname, '../../data');
const PRESETS_DIR = path.join(DATA_DIR, 'presets');

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PRESETS_DIR, { recursive: true });
}

ensureDirectories();

// Get all presets for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userPresetsDir = path.join(PRESETS_DIR, userId);

    try {
      await fs.access(userPresetsDir);
    } catch (error) {
      // If user directory doesn't exist, return empty object
      return res.json({ success: true, presets: {} });
    }

    const presetFiles = await fs.readdir(userPresetsDir);
    const presets = {};

    for (const file of presetFiles) {
      if (file.endsWith('.json')) {
        const presetPath = path.join(userPresetsDir, file);
        const presetName = path.basename(file, '.json');
        const presetData = await fs.readFile(presetPath, 'utf8');

        presets[presetName] = JSON.parse(presetData);
      }
    }

    res.json({ success: true, presets });
  } catch (error) {
    console.error('Error getting presets:', error);
    res.status(500).json({ success: false, error: 'Failed to get presets' });
  }
});

// Get a specific preset
router.get('/:userId/:presetId', async (req, res) => {
  try {
    const { userId, presetId } = req.params;
    const presetPath = path.join(PRESETS_DIR, userId, `${presetId}.json`);

    const presetData = await fs.readFile(presetPath, 'utf8');
    const preset = JSON.parse(presetData);

    res.json({ success: true, settings: preset });
  } catch (error) {
    console.error('Error getting preset:', error);
    res.status(500).json({ success: false, error: 'Failed to get preset' });
  }
});

// Save a new preset
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { presetName, settings } = req.body;

    if (!presetName || !settings) {
      return res.status(400).json({ success: false, error: 'Preset name and settings are required' });
    }

    const userPresetsDir = path.join(PRESETS_DIR, userId);
    await fs.mkdir(userPresetsDir, { recursive: true });

    const presetPath = path.join(userPresetsDir, `${presetName}.json`);

    // Add metadata
    const presetWithMetadata = {
      ...settings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(presetPath, JSON.stringify(presetWithMetadata, null, 2));

    res.json({ success: true, message: 'Preset saved successfully' });
  } catch (error) {
    console.error('Error saving preset:', error);
    res.status(500).json({ success: false, error: 'Failed to save preset' });
  }
});

// Delete a preset
router.delete('/:userId/:presetId', async (req, res) => {
  try {
    const { userId, presetId } = req.params;
    const presetPath = path.join(PRESETS_DIR, userId, `${presetId}.json`);

    await fs.unlink(presetPath);

    res.json({ success: true, message: 'Preset deleted successfully' });
  } catch (error) {
    console.error('Error deleting preset:', error);
    res.status(500).json({ success: false, error: 'Failed to delete preset' });
  }
});

module.exports = router;