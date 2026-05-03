#!/usr/bin/env python3
"""
Script generator module - wraps whisper.cpp for audio transcription.

Usage:
    result = generate_script_from_audio(audio_path, output_format="json")
"""

import json
import os
import subprocess
import tempfile
from typing import Dict, Any


def generate_script_from_audio(audio_path: str, output_format: str = "json") -> Dict[str, Any]:
    """
    Generate transcription from audio file using whisper.cpp.

    Args:
        audio_path: Path to audio file
        output_format: "json" for whisper.cpp JSON output

    Returns:
        Dict with success, transcript, and metadata
    """
    try:
        # Find whisper-cli binary
        whisper_binary = os.environ.get(
            'WHISPER_BINARY',
            '/opt/whisper.cpp/main'
        )

        if not os.path.exists(whisper_binary):
            # Try homebrew location
            whisper_binary = '/opt/homebrew/bin/whisper-cli'

        if not os.path.exists(whisper_binary):
            return {
                "success": False,
                "error": f"whisper.cpp binary not found at {whisper_binary}"
            }

        # Create temp file for JSON output
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_json = f.name

        try:
            # Run whisper.cpp
            cmd = [
                whisper_binary,
                '--model', os.environ.get('WHISPER_MODEL', '/opt/whisper.cpp/models/ggml-small.bin'),
                '--output-json',
                '--word-timestamps',
                '-f', audio_path,
                '-ojf', temp_json
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode != 0:
                return {
                    "success": False,
                    "error": f"whisper.cpp failed: {result.stderr}"
                }

            # Load JSON output
            with open(temp_json, 'r') as f:
                transcript_data = json.load(f)

            return {
                "success": True,
                "transcript": {
                    "text": transcript_data.get('text', ''),
                    "language": transcript_data.get('language', 'unknown'),
                    "segments": transcript_data.get('segments', []),
                    "words": transcript_data.get('words', [])
                },
                "metadata": {
                    "audio_path": audio_path,
                    "model": os.environ.get('WHISPER_MODEL', 'ggml-small.bin')
                }
            }

        finally:
            # Cleanup temp file
            if os.path.exists(temp_json):
                os.unlink(temp_json)

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": "Transcription timed out (audio may be too long)"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 script-generator.py <audio_file> [output_format]")
        sys.exit(1)

    audio_file = sys.argv[1]
    output_format = sys.argv[2] if len(sys.argv) > 2 else "json"

    result = generate_script_from_audio(audio_file, output_format)
    print(json.dumps(result, indent=2))
