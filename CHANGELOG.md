# Changelog

## [0.1.0.3] - 2026-04-07

### Security
- **Critical**: Patched npm dependency vulnerabilities
  - Updated lodash 4.17.23 → 4.18.1 (CVSS 8.1 code injection fix)
  - Updated picomatch 2.3.1 → 2.3.2 (method injection fix)
  - Updated brace-expansion 5.0.4 → 5.0.5 (DoS fix)
  - Affected file: `package-lock.json`

### Fixed
- **Subtitle sync**: Fixed overlapping subtitles appearing simultaneously
  - ASS timestamp format corrected from milliseconds to centiseconds (H:MM:SS.cc)
  - FFmpeg was misparsing 3-digit timestamps, causing all subtitles to appear at 0:00:00.00
  - Affected files: `server/ai/subtitle-renderer.py`, `server/ai/whisper-to-qa.py`
- **Clip-specific subtitles**: Each exported clip now gets unique subtitles matching its segment
  - Added `startTime` and `endTime` parameters to `generateSubtitlesForClip()`
  - FFmpeg extracts audio from specific segment using `-ss` and `-t` flags
  - Previously: all clips shared the same transcription from the full video
  - Affected file: `server/api/highlight-detection.js`
- **Font sizing**: Increased subtitle font size and improved dynamic scaling
  - Base font size: 28px → 42px (50% larger)
  - Dynamic sizing: 52px for short words, 28px for long words
  - Affected file: `server/ai/subtitle-renderer.py`

## [0.1.0.2] - 2026-03-31

### Security
- **Critical**: Fixed command injection vulnerabilities in AI wrapper and highlight detection
  - Replaced `execSync`/`exec` with `execFileSync`/`execFile` to prevent shell interpolation attacks
  - Added secure argument passing via arrays instead of shell-joined strings
  - Affected files: `server/ai/python-wrapper.js`, `server/api/highlight-detection.js`
- **Critical**: Added prototype pollution protection in user preferences API
  - Sanitizes input objects to remove `__proto__`, `constructor`, and `prototype` keys
  - Prevents Object.prototype pollution attacks via malicious preference updates
- **High**: Added server-side file type validation for video uploads
  - Validates both MIME types and file extensions against allowlists
  - Rejects uploads with mismatched or invalid file types
  - Affected file: `server/api/video-processor.js`
- **Medium**: Added path traversal protection in highlight detection
  - Normalizes paths and validates against allowed base directories
  - Prevents accessing files outside temp/output directories
- **Medium**: Added rate limiting to user preferences and presets APIs
  - Limits requests to 100 per minute per user
  - Prevents abuse and resource exhaustion attacks
  - Affected files: `server/api/user-preferences.js`, `server/api/presets.js`
- **Low**: Reduced maxBuffer limits to prevent resource exhaustion
  - Reduced from 100MB to 50MB/10MB in highlight detection
- **Low**: Added unique UUID generation for temp files
  - Prevents race conditions and symlink attacks
  - Affected files: `server/ai/python-wrapper.js`
- **Low**: Enhanced error logging with structured output
  - Truncates sensitive data in error messages
  - Better diagnostics for face detection fallbacks

## [0.1.0.1] - 2026-03-31

### Fixed
- Fixed infinite loop in qa-detector.py
- Fixed UI compilation errors
- Fixed duplicate function declarations in unified page

### Changed 
- Enhanced caption generator with support for multiple formats and translations
- Improved YouTube Q&A detection
- Enhanced UI/UX Design System

### Added
- Smart speaker cropping for vertical video formats
- Word timestamp approximation in caption-generator
- Hormozi-style subtitle engine

## [0.1.0.0] - Earlier Date

### Added
- Quality of Life Improvements: keyboard shortcuts, drag-and-drop, presets, and history tracking
- Comprehensive user preferences system
- Activity history tracking
- Presets management for configuration reuse
- Keyboard shortcuts for enhanced productivity
- Drag-and-drop functionality for file uploads
