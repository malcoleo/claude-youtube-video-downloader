#!/usr/bin/env python3
"""
Convert whisper.cpp JSON output to QA Detector input format.

Usage:
    whisper-cli --model model.bin --output-json audio.mp3
    python3 whisper-to-qa.py audio.mp3.json | python3 qa-detector.py /dev/stdin

Or combined:
    whisper-cli --model model.bin audio.mp3 && \
    python3 whisper-to-qa.py audio.mp3.json | python3 qa-detector.py /dev/stdin
"""

import json
import sys


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

        # Extract word-level timestamps for subtitle engine
        if include_words:
            words_data = segment.get('words', [])
            for word_info in words_data:
                word_text = word_info.get('word', '').strip()
                if not word_text:  # Skip empty words
                    continue

                word_offsets = word_info.get('offsets', {})
                word_start = word_offsets.get('from', 0) / 1000.0
                word_end = word_offsets.get('to', 0) / 1000.0

                all_words.append({
                    'word': word_text,
                    'start': word_start,
                    'end': word_end,
                    'confidence': word_info.get('probability', 1.0)
                })

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
