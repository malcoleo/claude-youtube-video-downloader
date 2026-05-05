// client/src/components/FormatSelector.jsx
import React from 'react';
import './FormatSelector.css';

const formats = [
  { value: 'mp4', label: 'MP4', description: 'Universal compatibility' },
  { value: 'mov', label: 'MOV', description: 'Apple / QuickTime' },
  { value: 'avi', label: 'AVI', description: 'Windows / Legacy' }
];

const FormatSelector = ({ selectedFormat, onSelectFormat, disabled = false }) => (
  <div className="format-selector">
    <label className="format-label">Output Format</label>
    <div className="format-options">
      {formats.map((f) => {
        const isSelected = selectedFormat === f.value;
        return (
          <button
            key={f.value}
            className={`format-chip ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectFormat(f.value)}
            disabled={disabled}
            title={f.description}
          >
            <span className="format-chip-label">{f.label}</span>
            <span className="format-chip-desc">{f.description}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export default FormatSelector;
