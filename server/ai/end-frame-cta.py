#!/usr/bin/env python3
"""
End frame CTA composer for social media clips.
Adds a 3-second gradient overlay with "Watch full video" text at the end.

Usage:
    python3 end-frame-cta.py <input_video.mp4> <output_video.mp4> [cta_text]

Features:
    - Gradient background (customizable colors)
    - "Watch full video" or custom CTA text
    - Smooth fade-in animation
    - Matches clip resolution (9:16 vertical or 16:9 landscape)
"""

import sys
import json
import subprocess
import os


def compose_end_frame_cta(
    input_video_path,
    output_video_path,
    cta_text="Watch full video",
    duration=3,
    gradient_start="#1a1a2e",
    gradient_end="#16213e",
    text_color="#FFFFFF",
    fade_in_duration=0.5
):
    """
    Add end frame CTA to video.

    Args:
        input_video_path: Path to input video
        output_video_path: Path to output video with CTA
        cta_text: Text to display (default: "Watch full video")
        duration: Duration of CTA in seconds (default: 3)
        gradient_start: Start color of gradient (hex)
        gradient_end: End color of gradient (hex)
        text_color: Text color (hex)
        fade_in_duration: Fade-in animation duration (default: 0.5s)

    Returns:
        True if successful, raises exception otherwise
    """
    # Get video info
    probe_cmd = [
        'ffprobe', '-v', 'quiet',
        '-print_format', 'json',
        '-show_format', '-show_streams',
        input_video_path
    ]

    result = subprocess.run(probe_cmd, capture_output=True, text=True)
    probe_data = json.loads(result.stdout)

    # Find video stream
    video_stream = next((s for s in probe_data.get('streams', []) if s.get('codec_type') == 'video'), None)
    if not video_stream:
        raise ValueError("No video stream found")

    width = int(video_stream.get('width', 1080))
    height = int(video_stream.get('height', 1920))
    duration_input = float(probe_data['format'].get('duration', 0))

    print(f"Video dimensions: {width}x{height}, Duration: {duration_input}s", file=sys.stderr)

    # Build FFmpeg filter for gradient background with text
    # Using color gradient and text overlay
    cta_filter = (
        f"color=c={gradient_start}:s={width}x{height}:d={duration}, "
        f"gradient0=color={gradient_end}:point=1:direction=vertical, "
        f"drawtext=text='{cta_text}':fontfile=/Library/Fonts/Arial.ttf:"
        f"fontsize=48:fontcolor={text_color}:x=(w-text_w)/2:y=(h-text_h)/2:"
        f"fade=in:st=0:d={fade_in_duration}"
    )

    # Create CTA video
    temp_cta_path = input_video_path.replace('.mp4', '-cta-temp.mp4')

    cta_cmd = [
        'ffmpeg',
        '-f', 'lavfi',
        '-i', f"color=c={gradient_start}:s={width}x{height}:d={duration}",
        '-vf', cta_filter,
        '-f', 'lavfi',
        '-i', f"anullsrc=channel_layout=stereo:sample_rate=44100",
        '-t', str(duration),
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-y',
        temp_cta_path
    ]

    print(f"Creating CTA overlay...", file=sys.stderr)

    result = subprocess.run(cta_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Fallback: simpler CTA generation
        print(f"CTA filter failed, using fallback: {result.stderr}", file=sys.stderr)
        cta_cmd = [
            'ffmpeg',
            '-f', 'lavfi',
            '-i', f"color=c={gradient_start}:s={width}x{height}:d={duration}",
            '-vf', f"drawtext=text='{cta_text}':fontfile=/Library/Fonts/Arial.ttf:fontsize=48:fontcolor={text_color}:x=(w-text_w)/2:y=(h-text_h)/2",
            '-f', 'lavfi',
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-t', str(duration),
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-y',
            temp_cta_path
        ]
        result = subprocess.run(cta_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"CTA generation failed: {result.stderr}")

    # Concatenate original video with CTA
    concat_list_path = input_video_path.replace('.mp4', '-concat-list.txt')
    with open(concat_list_path, 'w') as f:
        f.write(f"file '{os.path.abspath(input_video_path)}'\n")
        f.write(f"file '{os.path.abspath(temp_cta_path)}'\n")

    concat_cmd = [
        'ffmpeg',
        '-f', 'concat',
        '-safe', '0',
        '-i', concat_list_path,
        '-c', 'copy',
        '-y',
        output_video_path
    ]

    print(f"Concatenating video with CTA...", file=sys.stderr)

    result = subprocess.run(concat_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Fallback: re-encode concat
        print(f"Direct concat failed, using re-encode: {result.stderr}", file=sys.stderr)
        concat_cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_list_path,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-y',
            output_video_path
        ]
        result = subprocess.run(concat_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Video concatenation failed: {result.stderr}")

    # Clean up temp files
    try:
        os.remove(temp_cta_path)
        os.remove(concat_list_path)
    except OSError:
        pass

    print(f"End frame CTA added: {output_video_path}", file=sys.stderr)
    return True


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 end-frame-cta.py <input_video.mp4> <output_video.mp4> [cta_text]")
        print("\nAdds a 3-second gradient overlay with CTA text at the end of the video.")
        print("\nOptions:")
        print("  cta_text: Text to display (default: 'Watch full video')")
        sys.exit(1)

    input_video = sys.argv[1]
    output_video = sys.argv[2]
    cta_text = sys.argv[3] if len(sys.argv) > 3 else "Watch full video"

    try:
        compose_end_frame_cta(input_video, output_video, cta_text)
        print(json.dumps({
            'success': True,
            'output': output_video,
            'cta_text': cta_text
        }))
    except Exception as e:
        print(json.dumps({
            'error': str(e)
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
