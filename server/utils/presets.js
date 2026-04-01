// server/utils/presets.js
const fs = require('fs').promises;
const path = require('path');

class PresetManager {
  constructor(dataDir = './data/presets') {
    this.dataDir = path.join(__dirname, '../../', dataDir);
    this.ensureDataDir();
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (err) {
      console.error('Error creating presets directory:', err);
    }
  }

  async getPresets(userId) {
    const filePath = path.join(this.dataDir, `${userId}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      return { presets: [] };
    }
  }

  async savePreset(userId, preset) {
    const filePath = path.join(this.dataDir, `${userId}.json`);
    const data = await this.getPresets(userId);
    data.presets.push({ ...preset, id: `preset_${Date.now()}` });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return data;
  }

  async deletePreset(userId, presetId) {
    const filePath = path.join(this.dataDir, `${userId}.json`);
    const data = await this.getPresets(userId);
    data.presets = data.presets.filter(p => p.id !== presetId);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return data;
  }
}

module.exports = PresetManager;
