// server/utils/state-manager.js
const fs = require('fs').promises;
const path = require('path');

/**
 * State Manager for pipeline resume capability.
 * Tracks completion status of each pipeline stage per video/session.
 * Inspired by rushindrasinha/youtube-shorts-pipeline state.py
 */
class StateManager {
  constructor(stateDir = null) {
    this.stateDir = stateDir || path.join(__dirname, '../../data/pipeline-state');
    this.ensureStateDir();
  }

  async ensureStateDir() {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
    } catch (error) {
      console.error('[StateManager] Error creating state directory:', error);
    }
  }

  /**
   * Generate a unique state ID from video URL or path
   */
  generateStateId(identifier) {
    const crypto = require('crypto');
    // Create hash from identifier (URL, file path, etc.)
    return crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  }

  /**
   * Load state for a given ID
   * @param {string} stateId - Unique state identifier
   * @returns {Promise<object>} State object with stage completion status
   */
  async loadState(stateId) {
    const statePath = path.join(this.stateDir, `${stateId}.json`);

    try {
      const stateData = await fs.readFile(statePath, 'utf8');
      return JSON.parse(stateData);
    } catch (error) {
      // State file doesn't exist or is invalid - return fresh state
      if (error.code === 'ENOENT') {
        return this._createFreshState(stateId);
      }
      console.error('[StateManager] Error loading state:', error);
      return this._createFreshState(stateId);
    }
  }

  /**
   * Save state for a given ID
   * @param {string} stateId - Unique state identifier
   * @param {object} state - State object to save
   */
  async saveState(stateId, state) {
    const statePath = path.join(this.stateDir, `${stateId}.json`);
    state.lastUpdated = new Date().toISOString();

    try {
      await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      console.error('[StateManager] Error saving state:', error);
    }
  }

  /**
   * Mark a stage as completed
   * @param {string} stateId - Unique state identifier
   * @param {string} stageName - Name of the stage (e.g., 'download', 'transcribe', 'detect_qa', 'export')
   * @param {object} metadata - Optional metadata (timestamps, file paths, etc.)
   */
  async markStageComplete(stateId, stageName, metadata = {}) {
    const state = await this.loadState(stateId);
    state.stages[stageName] = {
      completed: true,
      completedAt: new Date().toISOString(),
      ...metadata
    };
    await this.saveState(stateId, state);
    console.log(`[StateManager] Stage "${stageName}" marked complete`);
  }

  /**
   * Check if a stage is completed
   * @param {string} stateId - Unique state identifier
   * @param {string} stageName - Name of the stage
   * @returns {Promise<boolean>} True if stage is completed
   */
  async isStageComplete(stateId, stageName) {
    const state = await this.loadState(stateId);
    return !!(state.stages[stageName] && state.stages[stageName].completed);
  }

  /**
   * Reset state for a given ID (for --force re-run)
   * @param {string} stateId - Unique state identifier
   */
  async resetState(stateId) {
    const statePath = path.join(this.stateDir, `${stateId}.json`);
    try {
      await fs.unlink(statePath);
      console.log(`[StateManager] State reset for "${stateId}"`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[StateManager] Error resetting state:', error);
      }
    }
  }

  /**
   * Get all stages and their completion status
   * @param {string} stateId - Unique state identifier
   * @returns {Promise<object>} Stages status object
   */
  async getStageStatus(stateId) {
    const state = await this.loadState(stateId);
    return {
      stateId,
      createdAt: state.createdAt,
      lastUpdated: state.lastUpdated,
      stages: state.stages
    };
  }

  /**
   * Create a fresh state object
   * @private
   */
  _createFreshState(stateId) {
    const now = new Date().toISOString();
    return {
      stateId,
      createdAt: now,
      lastUpdated: now,
      stages: {
        // Pipeline stages for video processing
        download: { completed: false },
        extract_audio: { completed: false },
        transcribe: { completed: false },
        detect_qa: { completed: false },
        generate_preview: { completed: false },
        export_clip: { completed: false }
      }
    };
  }
}

module.exports = StateManager;
