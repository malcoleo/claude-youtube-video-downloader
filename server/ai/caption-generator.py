#!/usr/bin/env python3
"""
Enhanced caption generator with support for multiple formats, translations, and smart captioning.
Also includes Hormozi-style caption generation as a specialized option.

Orchestrates the complete subtitle pipeline:
1. Load words with timestamps from whisper.cpp or audio file
2. Generate captions in various formats (SRT, VTT, ASS)
3. Highlight keywords using POS tagging
4. Suggest emoji placements
5. Generate ASS subtitle file
6. Support for translations
7. Render subtitles onto video with FFmpeg

Usage:
    # Full pipeline - generate subtitles and burn into video
    python3 caption-generator.py <whisper-output.json> <output.ass> [video.mp4] [output.mp4]

    # Generate ASS only (no video rendering)
    python3 caption-generator.py <whisper-output.json> <output.ass>

    # Generate from audio file directly
    python3 caption-generator.py --audio <audio.mp3> --format srt --output captions.srt

    # Generate translated captions
    python3 caption-generator.py --audio <audio.mp3> --translate es --output captions-es.srt

    # Input must be whisper.cpp JSON with --word-timestamps flag or audio file for automatic transcription
"""

import sys
import json
import os
import subprocess
import tempfile
import importlib.util
import argparse
from typing import Dict, List, Tuple

# Import sibling modules (handle hyphenated filenames)
def load_module_from_file(module_name, file_path):
    """Load a Python module from a file path."""
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

# Load modules with hyphenated filenames
keyword_highlighter = load_module_from_file(
    'keyword_highlighter',
    os.path.join(os.path.dirname(__file__), 'keyword-highlighter.py')
)
emoji_suggester = load_module_from_file(
    'emoji_suggester',
    os.path.join(os.path.dirname(__file__), 'emoji-suggester.py')
)
subtitle_renderer = load_module_from_file(
    'subtitle_renderer',
    os.path.join(os.path.dirname(__file__), 'subtitle-renderer.py')
)


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
        highlighted_words = keyword_highlighter.highlight_keywords(words_with_timestamps)
    except Exception as e:
        print(f"spaCy highlighting failed, using rule-based: {e}", file=sys.stderr)
        highlighted_words = keyword_highlighter.highlight_keywords_rulebased(words_with_timestamps)

    # Step 2: Suggest emoji placements
    print(f"Suggesting emojis...", file=sys.stderr)
    emoji_placements = emoji_suggester.suggest_emojis(highlighted_words, max_emojis=max_emojis)

    # Step 3: Generate ASS subtitle file
    print(f"Generating ASS subtitles...", file=sys.stderr)
    ass_result = subtitle_renderer.generate_ass_subtitle(
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


def generate_basic_captions(transcript_segments: List[Dict], max_chars_per_caption: int = 42) -> List[Dict]:
    """
    Generate basic captions from transcript segments
    """
    captions = []

    for segment in transcript_segments:
        text = segment["text"].strip()
        start_time = segment["start"]
        end_time = segment["end"]

        # Split long segments into smaller chunks if needed
        text_chunks = split_text_for_captions(text, max_chars_per_caption)

        # Calculate time intervals for each chunk
        num_chunks = len(text_chunks)
        time_per_chunk = (end_time - start_time) / num_chunks if num_chunks > 0 else 0

        for i, chunk in enumerate(text_chunks):
            chunk_start = start_time + (i * time_per_chunk)
            chunk_end = start_time + ((i + 1) * time_per_chunk)

            captions.append({
                "start": chunk_start,
                "end": chunk_end,
                "text": chunk.strip(),
                "confidence": segment.get("confidence", 0.8)
            })

    return captions


def split_text_for_captions(text: str, max_chars: int = 42) -> List[str]:
    """
    Split text into chunks that fit well in captions
    """
    if len(text) <= max_chars:
        return [text]

    # Split by sentences first
    sentences = re.split(r'[.!?]+', text)
    chunks = []
    current_chunk = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        # Add sentence to current chunk
        test_chunk = current_chunk + ". " + sentence if current_chunk else sentence

        if len(test_chunk) <= max_chars:
            current_chunk = test_chunk
        else:
            # If current chunk has content, save it and start a new one
            if current_chunk:
                chunks.append(current_chunk)

            # If the sentence is still too long, split by words
            if len(sentence) > max_chars:
                words = sentence.split()
                temp_chunk = ""

                for word in words:
                    test_temp = temp_chunk + " " + word if temp_chunk else word

                    if len(test_temp) <= max_chars:
                        temp_chunk = test_temp
                    else:
                        if temp_chunk:
                            chunks.append(temp_chunk)
                        temp_chunk = word

                if temp_chunk:
                    current_chunk = temp_chunk
            else:
                current_chunk = sentence

    # Add the last chunk if it exists
    if current_chunk:
        chunks.append(current_chunk)

    # Final cleanup to remove leading ". "
    for i in range(len(chunks)):
        chunks[i] = chunks[i].strip().lstrip(". ")

    return chunks


def generate_word_level_captions(transcript_segments: List[Dict], max_chars_per_caption: int = 20) -> List[Dict]:
    """
    Generate word-level captions for smoother reading experience
    """
    word_captions = []

    for segment in transcript_segments:
        text = segment["text"].strip()
        start_time = segment["start"]
        end_time = segment["end"]

        # Split text into words
        words = text.split()
        if not words:
            continue

        # Calculate approximate time per word
        total_duration = end_time - start_time
        time_per_word = total_duration / len(words) if len(words) > 0 else 0

        i = 0
        while i < len(words):
            # Start with a single word
            current_phrase = words[i]
            phrase_start_time = start_time + (i * time_per_word)

            # Add more words while staying under the character limit
            j = i + 1
            while j < len(words) and len(current_phrase + " " + words[j]) <= max_chars_per_caption:
                current_phrase += " " + words[j]
                j += 1

            phrase_end_time = start_time + (j * time_per_word)

            word_captions.append({
                "start": phrase_start_time,
                "end": phrase_end_time,
                "text": current_phrase.strip(),
                "confidence": segment.get("confidence", 0.8)
            })

            i = j

    return word_captions


def format_captions_srt(captions: List[Dict]) -> str:
    """
    Format captions as SRT subtitles
    """
    srt_content = ""
    for i, caption in enumerate(captions, 1):
        start_time = format_time_srt(caption["start"])
        end_time = format_time_srt(caption["end"])
        text = caption["text"].strip()

        srt_content += f"{i}\n"
        srt_content += f"{start_time} --> {end_time}\n"
        srt_content += f"{text}\n\n"

    return srt_content


def format_time_srt(seconds: float) -> str:
    """
    Format seconds to SRT time format (HH:MM:SS,mmm)
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millisecs = int((seconds - int(seconds)) * 1000)

    return f"{hours:02}:{minutes:02}:{secs:02},{millisecs:03}"


def format_captions_vtt(captions: List[Dict]) -> str:
    """
    Format captions as WebVTT subtitles
    """
    vtt_content = "WEBVTT FILE\n\n"  # WebVTT header

    for caption in captions:
        start_time = format_time_vtt(caption["start"])
        end_time = format_time_vtt(caption["end"])
        text = caption["text"].strip()

        vtt_content += f"{start_time} --> {end_time}\n"
        vtt_content += f"{text}\n\n"

    return vtt_content


def format_time_vtt(seconds: float) -> str:
    """
    Format seconds to WebVTT time format (HH:MM:SS.mmm)
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millisecs = int((seconds - int(seconds)) * 1000)

    if hours > 0:
        return f"{hours:02}:{minutes:02}:{secs:02}.{millisecs:03}"
    else:
        return f"{minutes:02}:{secs:02}.{millisecs:03}"


def translate_captions(captions: List[Dict], target_language: str = "es") -> List[Dict]:
    """
    Translate captions to target language (placeholder implementation)
    In a real implementation, this would use a translation API
    """
    # For now, we'll just return the original captions
    # In a full implementation, we would use a translation API
    translated_captions = []

    for caption in captions:
        # Placeholder for actual translation
        translated_text = caption["text"]  # Would be replaced with actual translation
        translated_captions.append({
            "start": caption["start"],
            "end": caption["end"],
            "text": translated_text,
            "original_text": caption["text"],
            "confidence": caption.get("confidence", 0.8),
            "translation_confidence": 0.9  # Placeholder
        })

    return translated_captions


def generate_captions_from_audio(audio_path: str, caption_type: str = "basic", target_language: str = None) -> Dict:
    """
    Generate captions from audio file
    """
    try:
        # Import the script-generator module
        from script-generator import generate_script_from_audio

        # Generate the transcript
        transcript_result = generate_script_from_audio(audio_path, "json")

        if not transcript_result["success"]:
            return transcript_result

        transcript = transcript_result["transcript"]

        # Generate captions based on type
        if caption_type == "word":
            captions = generate_word_level_captions(transcript["segments"])
        else:  # basic
            captions = generate_basic_captions(transcript["segments"])

        result = {
            "success": True,
            "captions": captions,
            "caption_count": len(captions),
            "source_language": transcript["language"]
        }

        # Add translation if requested
        if target_language:
            result["translated_captions"] = translate_captions(captions, target_language)
            result["target_language"] = target_language

        # Add formatted versions
        result["srt_captions"] = format_captions_srt(captions)
        result["vtt_captions"] = format_captions_vtt(captions)

        return result

    except ImportError:
        return {"success": False, "error": "script-generator module not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description='Enhanced caption generator with multiple modes.')
    parser.add_argument('input', nargs='?', help='Input file (whisper JSON or audio file)')
    parser.add_argument('output', nargs='?', help='Output ASS file (for whisper JSON mode)')
    parser.add_argument('--audio', help='Audio file to generate captions from')
    parser.add_argument('--format', choices=['srt', 'vtt', 'ass', 'json'], default='srt',
                        help='Output format for audio mode')
    parser.add_argument('--output', '-o', help='Output file for audio mode')
    parser.add_argument('--translate', help='Target language for translation')
    parser.add_argument('--caption-type', choices=['basic', 'word'], default='basic',
                        help='Caption segmentation type')
    parser.add_argument('--video', help='Video file to render subtitles into')
    parser.add_argument('--video-output', help='Output video file with subtitles')

    args = parser.parse_args()

    # Determine mode based on arguments
    if args.audio:
        # Audio mode - generate captions from audio file
        result = generate_captions_from_audio(
            args.audio,
            caption_type=args.caption_type,
            target_language=args.translate
        )

        if result['success']:
            # Output in requested format
            if args.format == 'srt':
                output_content = result['srt_captions']
            elif args.format == 'vtt':
                output_content = result['vtt_captions']
            elif args.format == 'json':
                output_content = json.dumps(result, indent=2)
            else:  # ass format
                # For ASS, we need to use the Hormozi-style generator with word timestamps
                from script-generator import generate_script_from_audio
                transcript_result = generate_script_from_audio(args.audio, "json")
                if transcript_result['success']:
                    # Convert segments to word-level timestamps
                    words_with_timestamps = []
                    for seg in transcript_result['transcript']['segments']:
                        # Approximate word timing if needed
                        text = seg['text'].strip()
                        start = seg['start']
                        end = seg['end']
                        words = text.split()

                        if len(words) > 0:
                            dur_per_word = (end - start) / len(words)
                            for i, word in enumerate(words):
                                w_start = start + (i * dur_per_word)
                                w_end = start + ((i + 1) * dur_per_word)
                                words_with_timestamps.append({
                                    'word': word,
                                    'start': w_start,
                                    'end': w_end,
                                    'confidence': seg.get('confidence', 0.8)
                                })

                    # Generate ASS subtitles using Hormozi-style
                    output_ass = args.output.replace('.srt', '.ass').replace('.vtt', '.ass') if args.output else 'output.ass'
                    result = generate_hormozi_captions(
                        words_with_timestamps,
                        output_ass_path=output_ass,
                        video_path=args.video,
                        output_video_path=args.video_output
                    )
                    output_content = json.dumps(result, indent=2)
                else:
                    print(json.dumps({'error': 'Could not generate transcript from audio'}))
                    sys.exit(1)

            # Write to output file or stdout
            if args.output:
                with open(args.output, 'w', encoding='utf-8') as f:
                    f.write(output_content)
                print(f"Captions saved to {args.output}")
            else:
                print(output_content)
        else:
            print(json.dumps({'error': result['error']}))
            sys.exit(1)

    elif args.input and args.output:
        # Traditional mode - process whisper JSON to ASS
        whisper_json = args.input
        output_ass = args.output
        video_path = args.video
        output_video = args.video_output

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

    else:
        # Show help
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
