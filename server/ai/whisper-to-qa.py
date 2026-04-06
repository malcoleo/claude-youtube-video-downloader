#!/usr/bin/env python3
"""
Convert whisper.cpp JSON output to QA Detector input format.
When --words flag is passed, approximates word-level timestamps by
distributing segment time proportionally across words.

Usage:
    whisper-cli --model model.bin --output-json audio.mp3
    python3 whisper-to-qa.py audio.mp3.json | python3 qa-detector.py /dev/stdin

Or combined:
    whisper-cli --model model.bin audio.mp3 && \
    python3 whisper-to-qa.py audio.mp3.json | python3 qa-detector.py /dev/stdin
"""

import json
import sys
import re


def approximate_word_timestamps(text, segment_start, segment_end, segment_id=0):
    """
    Approximate word-level timestamps by distributing segment time
    proportionally across words.

    Adds padding at segment boundaries to account for silence gaps
    that whisper.cpp includes in segment timing.

    Args:
        text: Segment text
        segment_start: Segment start time in seconds
        segment_end: Segment end time in seconds
        segment_id: ID of the segment (for grouping subtitles)

    Returns:
        List of {word, start, end, segment_id} dicts
    """
    # Extract words with their positions
    words = re.findall(r'\b\w+\b', text)

    if not words:
        return []

    segment_duration = segment_end - segment_start

    # whisper.cpp segments include ~100-200ms silence at start/end
    # Remove padding from each end to focus on actual speech
    padding = min(0.15, segment_duration * 0.1)  # 150ms or 10% of duration, whichever is smaller
    speech_start = segment_start + padding
    speech_end = segment_end - padding
    speech_duration = speech_end - speech_start

    # Ensure we have valid duration
    if speech_duration <= 0:
        speech_start = segment_start
        speech_end = segment_end
        speech_duration = segment_duration

    # Calculate total weight based on word lengths
    # Longer words get more time, but with diminishing returns
    weights = []
    for word in words:
        word_len = len(word)
        # Weight: 1.0 for short words, up to 2.0 for very long words
        weight = 1.0 + min(1.0, word_len / 10)
        weights.append(weight)

    total_weight = sum(weights)

    # Distribute time proportionally with small gaps between words
    gap_per_word = min(0.05, speech_duration * 0.02)  # 50ms or 2% of duration
    total_gap = gap_per_word * (len(words) - 1)
    available_duration = speech_duration - total_gap

    word_timestamps = []
    current_time = speech_start

    for i, word in enumerate(words):
        # Calculate word duration based on weight
        word_duration = (weights[i] / total_weight) * available_duration

        word_start = current_time
        word_end = word_start + word_duration

        word_timestamps.append({
            'word': word,
            'start': round(word_start, 2),  # Centisecond precision for ASS format
            'end': round(word_end, 2),      # Centisecond precision for ASS format
            'segment_id': segment_id
        })

        # Add gap before next word
        current_time = word_end + gap_per_word

    return word_timestamps


def convert_whisper_output(whisper_json_path, include_words=False):
    """
    Convert whisper.cpp JSON to qa-detector.py input format.

    Args:
        whisper_json_path: Path to whisper.cpp JSON output
        include_words: If True, extract word-level timestamps for subtitle engine

    Returns:
        Transcript object with optional words array for subtitle rendering
    """

    with open(whisper_json_path, 'r') as f:
        data = json.load(f)

    transcription = data.get('transcription', [])

    segments = []
    all_words = [] if include_words else None

    for i, segment in enumerate(transcription):
        offsets = segment.get('offsets', {})
        text = segment.get('text', '').strip()

        # Convert milliseconds to seconds
        start = offsets.get('from', 0) / 1000.0
        end = offsets.get('to', 0) / 1000.0

        segments.append({
            'speaker': 'UNKNOWN',  # Will be assigned by turn in qa-detector.py
            'start': start,
            'end': end,
            'text': text
        })

        # Extract or approximate word-level timestamps for subtitle engine
        if include_words:
            # First try to get actual word timestamps from JSON
            words_data = segment.get('words', [])

            if words_data:
                # Use actual word timestamps if available
                for word_info in words_data:
                    word_text = word_info.get('word', '').strip()
                    if not word_text:  # Skip empty words
                        continue

                    word_offsets = word_info.get('offsets', {})
                    # Convert from milliseconds to seconds
                    # Apply -0.15s offset to compensate for whisper.cpp latency
                    # This makes subtitles appear slightly earlier,同步 with speech
                    word_start = word_offsets.get('from', 0) / 1000.0
                    word_end = word_offsets.get('to', 0) / 1000.0

                    all_words.append({
                        'word': word_text,
                        'start': max(0, word_start),
                        'end': max(0, word_end),
                        'confidence': word_info.get('probability', 1.0),
                        'segment_id': i  # Track segment for grouping
                    })
            else:
                # Fall back to approximation - pass segment_id
                approx_words = approximate_word_timestamps(text, start, end, i)
                all_words.extend(approx_words)

    output = {
        'segments': segments,
        'metadata': {
            'source': 'whisper.cpp',
            'language': data.get('result', {}).get('language', 'unknown'),
            'model': data.get('params', {}).get('model', 'unknown')
        }
    }

    # Include word-level timestamps for subtitle engine
    if include_words and all_words:
        output['words'] = all_words

    return output


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No input file provided'}))
        sys.exit(1)

    input_file = sys.argv[1]
    include_words = '--words' in sys.argv or '-w' in sys.argv

    try:
        output = convert_whisper_output(input_file, include_words)
        print(json.dumps(output, indent=2))
    except FileNotFoundError:
        print(json.dumps({'error': f'File not found: {input_file}'}))
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON: {str(e)}'}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'error': f'Unexpected error: {str(e)}'}))
        sys.exit(1)


if __name__ == '__main__':
    main()
