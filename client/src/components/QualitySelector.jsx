// client/src/components/QualitySelector.jsx
import React from 'react';
import './QualitySelector.css';

/**
 * Quality Selector Component
 * Displays available quality options as chips/buttons
 * Used for selecting video resolution before download
 */
const QualitySelector = ({
  formats,
  selectedQuality,
  onSelectQuality,
  disabled = false
}) => {
  if (!formats || formats.length === 0) {
    return null;
  }

  // Quality presets with labels
  const qualityPresets = {
    '2160': { label: '4K', description: 'Ultra HD' },
    '1440': { label: '2K', description: 'QHD' },
    '1080': { label: '1080p', description: 'Full HD' },
    '720': { label: '720p', description: 'HD' },
    '480': { label: '480p', description: 'SD' },
    '360': { label: '360p', description: 'Low' }
  };

  const getQualityLabel = (height) => {
    const preset = qualityPresets[height];
    return preset ? preset.label : `${height}p`;
  };

  const getQualityDescription = (height) => {
    const preset = qualityPresets[height];
    return preset ? preset.description : `${height}p`;
  };

  return (
    <div className="quality-selector">
      <div className="quality-header">
        <span className="quality-label">Quality</span>
        {selectedQuality && (
          <span className="quality-selected">
            Selected: {getQualityLabel(selectedQuality)}
          </span>
        )}
      </div>

      <div className="quality-options">
        {formats.map((format) => {
          const height = format.height?.toString();
          const isSelected = selectedQuality === height;
          const preset = qualityPresets[height];

          return (
            <button
              key={format.id}
              className={`quality-chip ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectQuality(height)}
              disabled={disabled}
              title={`${format.label} - ${format.ext?.toUpperCase() || 'Unknown'}`}
            >
              <span className="quality-chip-label">
                {getQualityLabel(height)}
              </span>
              {preset && (
                <span className="quality-chip-desc">
                  {preset.description}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Format info */}
      {formats.length > 0 && (
        <div className="quality-info">
          <span>
            {formats.length} quality option{formats.length !== 1 ? 's' : ''} available
          </span>
          {formats[0]?.tbr && (
            <span>
              Best: {Math.round(formats[0].tbr)} kbps
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Simple Quality Preset Selector
 * For quick selection without fetching formats
 */
const QualityPresetSelector = ({ selected, onSelect, disabled = false }) => {
  const presets = [
    { id: 'best', label: 'Best', description: 'Highest available' },
    { id: 'hd', label: 'HD', description: '720p - 1080p' },
    { id: 'sd', label: 'SD', description: '480p' },
    { id: 'audio', label: 'Audio Only', description: 'MP3 192K' }
  ];

  return (
    <div className="quality-preset-selector">
      {presets.map((preset) => (
        <button
          key={preset.id}
          className={`preset-chip ${selected === preset.id ? 'selected' : ''}`}
          onClick={() => onSelect(preset.id)}
          disabled={disabled}
          title={preset.description}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
};

export { QualitySelector, QualityPresetSelector };
export default QualitySelector;
