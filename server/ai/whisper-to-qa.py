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


def convert_whisper_output(whisper_json_path):
    """Convert whisper.cpp JSON to qa-detector.py input format."""

    with open(whisper_json_path, 'r') as f:
        data = json.load(f)

    transcription = data.get('transcription', [])

    segments = []
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

    output = {
        'segments': segments,
        'metadata': {
            'source': 'whisper.cpp',
            'language': data.get('result', {}).get('language', 'unknown'),
            'model': data.get('params', {}).get('model', 'unknown')
        }
    }

    return output


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No input file provided'}))
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        output = convert_whisper_output(input_file)
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
