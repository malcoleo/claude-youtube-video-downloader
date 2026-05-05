// client/src/components/SourceBadge.jsx
import React from 'react';
import './SourceBadge.css';

const LABEL_MAP = {
  youtube: 'YouTube',
  youtubeshorts: 'YT Shorts',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitter: 'X',
  facebook: 'Facebook',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  reddit: 'Reddit',
  twitch: 'Twitch',
  bilibili: 'Bilibili',
  unknown: 'Unknown'
};

const SourceBadge = ({ source }) => {
  if (!source) return null;
  const label = LABEL_MAP[source.type] || source.label || 'Video';
  return (
    <span className="source-badge" title={source.type}>
      <span className="source-badge-dot" />
      {label}
    </span>
  );
};

export default SourceBadge;
