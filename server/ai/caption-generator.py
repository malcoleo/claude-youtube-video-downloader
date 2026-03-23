#!/usr/bin/env python3
"""
Hormozi-style caption generator.
Orchestrates the complete subtitle pipeline:
1. Load words with timestamps from whisper.cpp
2. Highlight keywords using POS tagging
3. Suggest emoji placements
4. Generate ASS subtitle file
5. Render subtitles onto video with FFmpeg

Usage:
    # Full pipeline - generate subtitles and burn into video
    python3 caption-generator.py <whisper-output.json> <output.ass> [video.mp4] [output.mp4]

    # Generate ASS only (no video rendering)
    python3 caption-generator.py <whisper-output.json> <output.ass>

    # Input must be whisper.cpp JSON with --word-timestamps flag
"""

import sys
import json
import os
import subprocess
import tempfile

# Import sibling modules
from keyword_highlighter import highlight_keywords, highlight_keywords_rulebased
from emoji_suggester import suggest_emojis
from subtitle_renderer import generate_ass_subtitle


def load_whisper_output(whisper_json_path):
    """Load whisper.cpp JSON output and extract words with timestamps."""
    with open(whisper_json_path, 'r') as f:
        data = json.load(f)

    # Check for word-level timestamps
    if 'words' not in data:
        raise ValueError(
            "No word-level timestamps found. "
            "Re-run whisper.cpp with --word-timestamps flag."
        )

    return data['words']


def render_subtitles_to_video(video_path, ass_path, output_path):
    """
    Burn ASS subtitles into video using FFmpeg.

    Args:
        video_path: Path to input video (can be cropped vertical video)
        ass_path: Path to ASS subtitle file
        output_path: Path to output video with burned-in subtitles

    Returns:
        True if successful, raises exception otherwise
    """
    # FFmpeg command with ass filter
    # The ass filter requires absolute paths on some systems
    ass_path_abs = os.path.abspath(ass_path)

    ffmpeg_cmd = [
        'ffmpeg', '-i', video_path,
        '-vf', f"ass='{ass_path_abs}'",
        '-c:a', 'copy',  # Copy audio without re-encoding
        '-y',  # Overwrite output
        output_path
    ]

    print(f"Rendering subtitles into video: {video_path} -> {output_path}", file=sys.stderr)

    try:
        result = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout for video rendering
        )

        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr}")

        print(f"Successfully rendered subtitles into {output_path}", file=sys.stderr)
        return True

    except subprocess.TimeoutExpired:
        raise RuntimeError("FFmpeg timed out rendering subtitles")
    except FileNotFoundError:
        raise RuntimeError("FFmpeg not found - please install FFmpeg")


def generate_hormozi_captions(
    words_with_timestamps,
    output_ass_path=None,
    video_path=None,
    output_video_path=None,
    max_emojis=5
):
    """
    Complete Hormozi-style caption generation pipeline.

    Args:
        words_with_timestamps: List of {word, start, end, confidence} from whisper.cpp
        output_ass_path: Path to output .ass file (or None for stdout)
        video_path: Path to video file for rendering (optional)
        output_video_path: Path to output video (optional, requires video_path)
        max_emojis: Maximum number of emojis to add (default: 5)

    Returns:
        dict with {
            'ass_path': path to generated ASS file (if saved),
            'video_path': path to rendered video (if rendered),
            'words': word count,
            'emojis': emoji count
        }
    """
    # Step 1: Highlight keywords using POS tagging
    print(f"Highlighting keywords...", file=sys.stderr)
    try:
        highlighted_words = highlight_keywords(words_with_timestamps)
    except Exception as e:
        print(f"spaCy highlighting failed, using rule-based: {e}", file=sys.stderr)
        highlighted_words = highlight_keywords_rulebased(words_with_timestamps)

    # Step 2: Suggest emoji placements
    print(f"Suggesting emojis...", file=sys.stderr)
    emoji_placements = suggest_emojis(highlighted_words, max_emojis=max_emojis)

    # Step 3: Generate ASS subtitle file
    print(f"Generating ASS subtitles...", file=sys.stderr)
    ass_result = generate_ass_subtitle(
        highlighted_words,
        emoji_placements,
        output_ass_path
    )

    result = {
        'words': len(highlighted_words),
        'emojis': len(emoji_placements),
        'ass_path': output_ass_path if output_ass_path else None,
        'video_path': None
    }

    # Step 4: Render to video (if requested)
    if video_path and output_video_path:
        print(f"Rendering subtitles to video...", file=sys.stderr)
        render_subtitles_to_video(video_path, output_ass_path, output_video_path)
        result['video_path'] = output_video_path

    return result


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 caption-generator.py <whisper.json> <output.ass> [video.mp4] [output.mp4]")
        print("\nGenerates Hormozi-style subtitles with:")
        print("  - Word-by-word karaoke animation")
        print("  - Gold keyword highlighting (verbs, adjectives)")
        print("  - Auto-suggested emoji overlays")
        print("  - Bebas Neue font (or Arial Black fallback)")
        print("\nIf video and output paths provided, burns subtitles into video.")
        sys.exit(1)

    whisper_json = sys.argv[1]
    output_ass = sys.argv[2]
    video_path = sys.argv[3] if len(sys.argv) > 3 else None
    output_video = sys.argv[4] if len(sys.argv) > 4 else None

    try:
        # Load words from whisper output
        words = load_whisper_output(whisper_json)
        print(f"Loaded {len(words)} words from {whisper_json}", file=sys.stderr)

        # Generate captions
        result = generate_hormozi_captions(
            words,
            output_ass,
            video_path,
            output_video
        )

        # Output result as JSON
        print(json.dumps(result, indent=2))

    except FileNotFoundError as e:
        print(json.dumps({'error': f'File not found: {str(e)}'}))
        sys.exit(1)
    except ValueError as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'error': f'Caption generation failed: {str(e)}'}))
        sys.exit(1)


if __name__ == '__main__':
    main()
