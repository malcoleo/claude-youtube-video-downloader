#!/usr/bin/env python3
"""
Subtitle renderer for Hormozi-style captions.
Generates ASS (Advanced Substation Alpha) format subtitles with:
- Word-by-word karaoke-style animation
- Highlighted keywords in gold color
- Emoji overlays
- Bebas Neue font (or fallback)

Usage:
    python3 subtitle-renderer.py <words_with_timestamps.json> <output.ass>
"""

import sys
import json
import os


# ASS style configuration - Hormozi style
ASS_STYLE_CONFIG = """
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding

Style: Default,Bebas Neue,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,2.0,0,3,2.5,0,2,10,10,100,1
Style: Highlight,Bebas Neue,72,&H00FFD700,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,2.0,0,3,2.5,0,2,10,10,100,1
Style: Emoji,Noto Color Emoji,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,0,0,2,10,10,800,1
"""

# Fallback style if Bebas Neue not available
ASS_STYLE_FALLBACK = """
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding

Style: Default,Arial Black,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,2.0,0,3,2.5,0,2,10,10,100,1
Style: Highlight,Arial Black,72,&H00FFD700,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,2.0,0,3,2.5,0,2,10,10,100,1
Style: Emoji,Noto Color Emoji,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,0,0,2,10,10,800,1
"""


def format_ass_time(seconds):
    """Convert seconds to ASS time format: H:MM:SS.cc (centiseconds)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centis = int((seconds % 1) * 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"


def create_karaoke_effect(words, style='Default'):
    """
    Create ASS dialogue line with karaoke-style word-by-word animation.
    Uses \\k tags for timing.

    Format: \\k{duration_in_centiseconds}word
    """
    if not words:
        return None

    # Calculate start time
    start_time = words[0]['start']

    # Calculate end time (end of last word)
    end_time = words[-1]['end']

    # Build karaoke text
    karaoke_parts = []
    for word_data in words:
        duration_centis = int((word_data['end'] - word_data['start']) * 100)
        word = word_data['word'].replace('{', '\\{').replace('}', '\\}')  # Escape braces

        if word_data.get('highlight') == 'strong':
            # Gold highlight for strong highlights (adjectives, verbs)
            karaoke_parts.append(f"{{\\c&H00FFD700&\\k{duration_centis}}}{word}")
        elif word_data.get('highlight') == 'normal':
            # Slightly emphasized (keep white but could add slight effect)
            karaoke_parts.append(f"{{\\k{duration_centis}}}{word}")
        else:
            # Normal word
            karaoke_parts.append(f"{{\\k{duration_centis}}}{word}")

    dialogue_text = ''.join(karaoke_parts)

    return {
        'start': start_time,
        'end': end_time,
        'text': dialogue_text,
        'style': style
    }


def create_emoji_line(emoji_placement):
    """
    Create ASS dialogue line for emoji overlay.
    Position: above subtitle line (y=800 instead of y=100)
    """
    emoji = emoji_placement['emoji']
    start_time = emoji_placement['start']
    end_time = emoji_placement['end']

    # \\pos(x,y) - center horizontally, position above subtitle
    # \\fad(in_ms, out_ms) - fade in/out
    # \\t(start_t, end_t, \\fscx|fscy) - subtle pop animation

    return {
        'start': start_time,
        'end': end_time,
        'text': f"{{\\an8\\pos(960, 700)\\fad(100, 100)}}{emoji}",
        'style': 'Emoji'
    }


def generate_ass_subtitle(words_with_timestamps, emoji_placements=None, output_path=None):
    """
    Generate complete ASS subtitle file.

    Args:
        words_with_timestamps: List of {'word': str, 'start': float, 'end': float, 'highlight': str}
        emoji_placements: List of {'emoji': str, 'start': float, 'end': float}
        output_path: Path to output .ass file (or None for stdout)

    Returns:
        ASS content as string
    """
    # Check if we have highlights - use fallback style if not
    has_highlights = any(w.get('highlight') for w in words_with_timestamps)

    # Build header
    header = ASS_STYLE_CONFIG if has_highlights else ASS_STYLE_FALLBACK

    # Build events
    events = []

    # Group words into subtitle lines (max 15 seconds per line for readability)
    current_line_words = []
    current_line_start = None

    for word_data in words_with_timestamps:
        if current_line_start is None:
            current_line_start = word_data['start']
            current_line_words = [word_data]
        elif word_data['start'] - current_line_start < 15:  # 15 second max per line
            current_line_words.append(word_data)
        else:
            # Finish current line, start new one
            if current_line_words:
                dialogue = create_karaoke_effect(current_line_words)
                if dialogue:
                    events.append(dialogue)
            current_line_start = word_data['start']
            current_line_words = [word_data]

    # Don't forget the last line
    if current_line_words:
        dialogue = create_karaoke_effect(current_line_words)
        if dialogue:
            events.append(dialogue)

    # Add emoji overlays
    if emoji_placements:
        for emoji_placement in emoji_placements:
            emoji_line = create_emoji_line(emoji_placement)
            events.append(emoji_line)

    # Sort events by start time
    events.sort(key=lambda x: x['start'])

    # Build Events section
    events_section = "\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"

    for event in events:
        start_ass = format_ass_time(event['start'])
        end_ass = format_ass_time(event['end'])
        style = event.get('style', 'Default')
        text = event['text']

        events_section += f"Dialogue: 0,{start_ass},{end_ass},{style},,0,0,0,,{text}\n"

    # Combine all sections
    full_ass = header + events_section

    # Write to file or return string
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(full_ass)
        return output_path
    else:
        return full_ass


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 subtitle-renderer.py <words.json> [output.ass]")
        print("\nInput format (words.json):")
        print(json.dumps([
            {"word": "Hello", "start": 0.0, "end": 0.5, "highlight": "normal"},
            {"word": "world", "start": 0.5, "end": 1.0, "highlight": "strong"}
        ], indent=2))
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        with open(input_file, 'r') as f:
            words_data = json.load(f)

        # Load emoji placements if provided in input
        emoji_placements = None
        if isinstance(words_data, dict) and 'words' in words_data:
            emoji_placements = words_data.get('emojis')
            words_data = words_data['words']

        result = generate_ass_subtitle(words_data, emoji_placements, output_file)

        if output_file:
            print(f"ASS subtitle file created: {output_file}")
        else:
            print(result)

    except FileNotFoundError:
        print(json.dumps({'error': f'File not found: {input_file}'}))
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON: {str(e)}'}))
        sys.exit(1)
